const cheerio = require('cheerio');
const engine = require('./engine');
const electronEngine = require('./engine/electron');

let sessionWarmedUp = false;

/** 预热 Electron session：访问一次 bqglll.cc 完成 Cloudflare 验证，后续请求跳过验证 */
async function warmupSessionIfNeeded(url) {
  if (sessionWarmedUp) return;
  if (!url.includes('bqglll.cc')) return;
  sessionWarmedUp = true; // 只尝试一次，失败不阻塞
  try {
    console.log('[Crawler] 开始预热 session，访问 bqglll.cc 以通过 Cloudflare 验证...');
    const ok = await electronEngine.warmup('https://www.bqglll.cc');
    console.log(`[Crawler] session 预热${ok ? '成功' : '超时，继续下载'}`);
  } catch (e) {
    console.log(`[Crawler] session 预热失败 (${e.message})，继续下载`);
  }
}

const sources = {
  'bqglll.cc': require('./sources/bqglll-render'),
  'ieso.net': require('./sources/ieso-render'),
  'biquge.club': require('./sources/biqugeclub-render'),
  'biquge.us': require('./sources/biqugeus-render'),
  'snapd.net': require('./sources/snapd-render'),
  'bqg518.xyz': require('./sources/bqg518-render'),
  'bqg971.xyz': require('./sources/bqg518-render'),
  'bqg998.cc': require('./sources/bqg518-render'),
  'bqg995.xyz': require('./sources/bqg518-render'),
  'bqg907.cc': require('./sources/bqg518-render'),
};

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

/**
 * 清理元素内部：移除隐藏广告、脚本、样式，然后提取文本。
 * 对 <br> 标签做换行处理（cheerio 的 .text() 已内置支持）。
 */
function cleanText($, el) {
  // 先克隆，避免修改原始 DOM
  const clone = el.clone();
  clone.find('script, style, noscript, iframe').remove();
  clone.find('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .ads, .ad').remove();
  return clone.text().trim();
}

/**
 * 根据 URL 选择适配器。
 */
function getSource(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('无效的URL，请检查输入是否正确');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http/https 协议');
  }

  const hostname = parsed.hostname;

  if (hostname === 'www.bqglll.cc' || hostname.endsWith('.bqglll.cc')) {
    return sources['bqglll.cc'];
  }

  for (const [domain, adapter] of Object.entries(sources)) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return adapter;
    }
  }
  return null;
}

async function crawlNovel(url) {
  const adapter = getSource(url);
  if (adapter) return adapter.crawlNovel(url);

  const CHAPTER_RE = /(第|地)[\u4e00-\u9fa5零一二三四五六七八九十百千万\d]+[章部]|（\d+(-\d+)?）|\(\d+(-\d+)?\)/;

  function extractChapters(html, baseUrl) {
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim() || $('title').text().trim() || '未知书名';
    const chapters = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && CHAPTER_RE.test(text)) {
        chapters.push({ title: text, url: new URL(href, baseUrl).href });
      }
    });
    return { title, chapters };
  }

  /** 对目标 URL 执行 HTTP → Electron 两级抓取，返回 html 和提取到的章节列表 */
  async function fetchAndExtract(targetUrl) {
    let html, chapters = [];
    // 尝试 HTTP
    try {
      const result = await engine.fetch(targetUrl);
      html = result.html;
      if (html && html.length >= 200) {
        chapters = extractChapters(html, targetUrl).chapters;
      }
    } catch (e) {
      console.log(`[Crawler] HTTP 失败 (${targetUrl}): ${e.message}`);
    }
    // 尝试 Electron
    if (chapters.length === 0) {
      console.log(`[Crawler] HTTP 未提取到章节，fallback Electron 渲染 ${targetUrl}`);
      try {
        const electronResult = await engine.fetch(targetUrl, { engine: 'electron', waitFor: 'a' });
        html = electronResult.html;
        if (html && html.length >= 200) {
          chapters = extractChapters(html, targetUrl).chapters;
        }
      } catch (e) {
        console.log(`[Crawler] Electron 也失败 (${targetUrl}): ${e.message}`);
      }
    }
    return { html, chapters };
  }

  // Step 1: 抓取主页面
  let { html, chapters } = await fetchAndExtract(url);
  let title = '未知书名';
  if (html && html.length >= 200) {
    title = extractChapters(html, url).title;
  }

  // Step 2: 检测主页面中是否包含"目录/更多章节"链接，跟进获取完整列表
  const LIST_LINK_RE = /更多章节|查看更多|查看全部|全部章节|章节目录|目录|list|章节列表/i;
  let listUrl = null;
  if (html && html.length >= 200) {
    const $ = cheerio.load(html);
    $('a').each((_, el) => {
      if (listUrl) return;
      const text = $(el).text().trim();
      if (LIST_LINK_RE.test(text)) {
        const href = $(el).attr('href');
        if (href && !/^javascript/i.test(href)) {
          listUrl = new URL(href, url).href;
        }
      }
    });
  }

  if (listUrl && listUrl !== url) {
    console.log(`[Crawler] 检测到目录页链接: ${listUrl}`);
    try {
      const listResult = await fetchAndExtract(listUrl);
      if (listResult.chapters.length > chapters.length) {
        console.log(`[Crawler] 目录页获取到 ${listResult.chapters.length} 章（主页面仅 ${chapters.length} 章），使用目录页结果`);
        chapters = listResult.chapters;
        if (listResult.html && listResult.html.length >= 200) {
          const listTitle = extractChapters(listResult.html, listUrl).title;
          if (listTitle !== '未知书名') title = listTitle;
        }
      }
    } catch (e) {
      console.log(`[Crawler] 目录页获取失败: ${e.message}`);
    }
  }

  // Step 3: 分页抓取 — 检测"下一页"链接，逐页获取完整章节列表
  const NEXT_PAGE_RE = /^下页$|^下一页$|^>+$|^»+$|^next$/i;
  const MAX_PAGES = 50;
  let currentPageUrl = listUrl || url;
  const seenPageUrls = new Set();
  seenPageUrls.add(url);
  if (listUrl) seenPageUrls.add(listUrl);
  const allChapters = [...chapters];

  for (let page = 1; page < MAX_PAGES; page++) {
    let nextUrl = null;
    if (html && html.length >= 200) {
      const $ = cheerio.load(html);
      $('a').each((_, el) => {
        if (nextUrl) return;
        const text = $(el).text().trim();
        if (NEXT_PAGE_RE.test(text)) {
          const href = $(el).attr('href');
          if (href && !/^javascript/i.test(href)) {
            nextUrl = new URL(href, currentPageUrl).href;
          }
        }
      });
    }
    if (!nextUrl || seenPageUrls.has(nextUrl)) break;
    seenPageUrls.add(nextUrl);
    console.log(`[Crawler] 检测到下一页（第${page + 1}页）: ${nextUrl}`);
    try {
      const result = await fetchAndExtract(nextUrl);
      html = result.html;
      currentPageUrl = nextUrl;
      if (result.chapters.length > 0) {
        allChapters.push(...result.chapters);
      } else {
        console.log(`[Crawler] 下一页无章节，分页结束`);
        break;
      }
    } catch (e) {
      console.log(`[Crawler] 分页 ${nextUrl} 获取失败: ${e.message}, 停止`);
      break;
    }
  }

  // Step 4: 去重（按章节 URL）
  const seenChapterUrls = new Set();
  chapters = allChapters.filter(c => {
    if (seenChapterUrls.has(c.url)) return false;
    seenChapterUrls.add(c.url);
    return true;
  });

  if (chapters.length === 0) {
    throw new Error('未检测到章节链接，请确认URL是否为小说目录页');
  }

  return { title, chapters, source: url };
}

async function _crawlChapter(url, knownTitle) {
  const adapter = getSource(url);
  if (adapter) return adapter.crawlChapter(url, knownTitle);

  const COMMON_CONTENT_SELECTORS = [
    'article',
    '[id*="content" i]',
    '[id*="booktxt" i]',
    '[class*="content" i]',
    '[class*="read" i]',
    '[class*="showtxt" i]',
  ];

  function extractContent(html) {
    const $ = cheerio.load(html);
    let title = $('h1').first().text().trim() || $('title').text().trim();
    if ((!title || title === '未知书名') && knownTitle) {
      title = knownTitle;
    }

    let content = '';
    for (const sel of COMMON_CONTENT_SELECTORS) {
      const el = $(sel);
      if (el.length) {
        const text = cleanText($, el);
        if (text.length > 100) {
          content = text;
          break;
        }
      }
    }

    if (!content) {
      console.warn(`[Crawler] 未匹配到内容容器 (${url})，尝试提取最大文本块`);
      let maxLen = 0;
      $('div, section, article, main').each((_, el) => {
        const text = cleanText($, $(el));
        if (text.length > maxLen) {
          maxLen = text.length;
          content = text;
        }
      });
    }

    return { title, content };
  }

  // 尝试 1：HTTP
  let html, title, content;
  try {
    const result = await engine.fetch(url);
    html = result.html;
    if (html && html.length >= 200) {
      const extracted = extractContent(html);
      title = extracted.title;
      content = extracted.content;
    }
  } catch (e) {
    console.log(`[Crawler] HTTP _crawlChapter 失败 (${url}): ${e.message}`);
  }

  // 尝试 2：HTTP 内容不足则 fallback 到 Electron 渲染
  if (!content || content.length < 100) {
    console.log(`[Crawler] HTTP 内容不足 (${content ? content.length : 0} chars)，fallback Electron 渲染 ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: COMMON_CONTENT_SELECTORS.join(', '),
        minTextLength: 100,
      });
      html = electronResult.html;
      if (!html || html.length < 200) {
        throw new Error('Electron 渲染后内容仍不足，无法提取正文');
      }
      const extracted = extractContent(html);
      title = extracted.title;
      content = extracted.content;
    } catch (e) {
      throw new Error(`Electron 渲染失败: ${e.message}`);
    }
  }

  // 检测章节内容分页，自动拼接多页正文
  if (html && html.length >= 200) {
    const PAGE_PARAM_RE = /[?&](fenye|page|p|pn)=\d+/i;
    const $ = cheerio.load(html);
    const pageLinks = [];
    const seenPageUrls = new Set();
    seenPageUrls.add(url);

    // Strategy 1: 在分页容器中查找数字页码链接（如【1】【2】【3】）
    $('[class*="page" i], .chapterPages, .mod-page, [class*="pager" i], [class*="paginate" i]').find('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !/^javascript/i.test(href) && /^\d+$/.test(text)) {
        const fullUrl = new URL(href, url).href;
        if (!seenPageUrls.has(fullUrl)) {
          seenPageUrls.add(fullUrl);
          pageLinks.push({ url: fullUrl, page: parseInt(text) });
        }
      }
    });

    // Strategy 2: 未找到分页容器时，搜索带 page/fenye/p 参数的链接
    if (pageLinks.length === 0) {
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && PAGE_PARAM_RE.test(href) && !/^javascript/i.test(href)) {
          const fullUrl = new URL(href, url).href;
          if (!seenPageUrls.has(fullUrl)) {
            seenPageUrls.add(fullUrl);
            pageLinks.push({ url: fullUrl, page: pageLinks.length + 2 });
          }
        }
      });
    }

    if (pageLinks.length > 0) {
      pageLinks.sort((a, b) => a.page - b.page);
      console.log(`[Crawler] 检测到章节内容分页，共 ${pageLinks.length} 个额外页面`);
      for (const plink of pageLinks) {
        try {
          let pageContent = '';
          try {
            const result = await engine.fetch(plink.url);
            if (result.html && result.html.length >= 200) {
              pageContent = extractContent(result.html).content;
            }
          } catch (_) {}
          if (!pageContent || pageContent.length < 100) {
            try {
              const electronResult = await engine.fetch(plink.url, {
                engine: 'electron',
                waitFor: COMMON_CONTENT_SELECTORS.join(', '),
                minTextLength: 100,
              });
              if (electronResult.html && electronResult.html.length >= 200) {
                pageContent = extractContent(electronResult.html).content;
              }
            } catch (_) {}
          }
          if (pageContent && pageContent.length > 0) {
            content += '\n\n' + pageContent;
          }
        } catch (_) {}
      }
    }
  }

  // 最后保护：检测是否仍停留在验证/加载页面
  if (html && html.length < 2000 && /加载中|userverify|verify|challenge/i.test(html)) {
    throw new Error('页面仍在验证中，内容未加载完成');
  }

  if (!content || content.length < 50) {
    throw new Error('提取到的内容过短，可能页面未完全加载');
  }

  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  await warmupSessionIfNeeded(url);
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) {
        console.log(`[Crawler] ${url} 第${attempt + 1}次重试成功`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[Crawler] ${url} 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
