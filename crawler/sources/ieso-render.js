const cheerio = require('cheerio');
const engine = require('../engine');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

// ─── 工具函数 ───────────────────────────────────────────

function cleanText($, el) {
  const clone = el.clone();
  clone.find('script, style, noscript, iframe').remove();
  clone.find('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .ads, .ad').remove();
  clone.find('br').replaceWith('\n');
  return clone.text().trim();
}

/**
 * 从 URL 中提取 novelId 和 chapterId
 * URL 模式:
 *   小说目录: /txt/{novelId}.html
 *   小说简介: /read/{novelId}/
 *   章节:     /read/{novelId}/{chapterId}.html
 *   分页章节: /read/{novelId}/{chapterId}_{N}.html
 */
function parseUrl(url) {
  // 目录页: /txt/{novelId}.html
  const tocMatch = url.match(/\/txt\/(\d+)\.html/);
  if (tocMatch) {
    return { novelId: tocMatch[1], chapterId: null, subPage: null };
  }
  // 章节/简介页: /read/{novelId}/...
  const readMatch = url.match(/\/read\/(\d+)\/(?:(\d+)(?:_(\d+))?\.html)?/);
  if (!readMatch) return null;
  return {
    novelId: readMatch[1],
    chapterId: readMatch[2] || null,
    subPage: readMatch[3] ? parseInt(readMatch[3]) : null,
  };
}

/**
 * 去除章节内容末尾的站点宣传语
 */
function stripFooter(text) {
  const footerIdx = text.search(/请收藏本站[：:]/);
  if (footerIdx > 0) {
    text = text.substring(0, footerIdx);
  }
  // 去除 "书本网" 等站点水印
  text = text.replace(/书本网.*$/s, '');
  return text.trim();
}

/**
 * 检测是否仍是反爬/验证页面
 */
function isChallengePage(html) {
  if (!html || html.length < 500) return true;
  return false;
}

// ─── 目录抓取 ───────────────────────────────────────────

async function crawlNovel(url) {
  const parsed = parseUrl(url);
  if (!parsed || !parsed.novelId) {
    throw new Error('无法解析 ieso.net 小说 URL，预期格式: /txt/{novelId}.html 或 /read/{novelId}/');
  }

  // ieso.net 目录页在 /txt/{novelId}.html，/read/{novelId}/ 会 302 跳转并触发限流
  const tocUrl = `http://www.ieso.net/txt/${parsed.novelId}.html`;
  console.log(`[ieso-render] 抓取目录: ${tocUrl}`);

  // 尝试 HTTP → fallback Electron
  let html;
  try {
    const result = await engine.fetch(tocUrl);
    html = result.html;
    if (isChallengePage(html)) {
      console.log('[ieso-render] HTTP 返回内容不足，fallback Electron');
      html = null;
    }
  } catch (e) {
    console.log(`[ieso-render] HTTP 目录抓取失败: ${e.message}`);
  }

  if (!html) {
    console.log(`[ieso-render] 使用 Electron 渲染目录页: ${tocUrl}`);
    const electronResult = await engine.fetch(tocUrl, {
      engine: 'electron',
      waitFor: 'a',
      timeout: 30000,
    });
    html = electronResult.html;
  }

  if (!html || isChallengePage(html)) {
    throw new Error('目录页内容为空或反爬拦截');
  }

  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim() || '未知书名';

  // 提取章节列表
  const chapters = [];
  const chapterRegex = /^第[零一二三四五六七八九十百千万\d]+章/;
  const seenChapterIds = new Set();

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text) return;

    // ieso.net 章节链接格式: /read/{novelId}/{chapterId}.html
    const linkMatch = href.match(/\/read\/\d+\/(\d+)\.html/);
    if (!linkMatch) return;

    const chapterId = linkMatch[1];
    // 跳过子页链接 (_2, _3 等)
    if (href.includes('_')) return;

    if (seenChapterIds.has(chapterId)) return;
    seenChapterIds.add(chapterId);

    // 确保是章节标题（以 "第X章" 开头）
    if (!chapterRegex.test(text)) return;

    const absUrl = new URL(href, tocUrl).href;
    chapters.push({
      title: text,
      url: absUrl,
      num: chapters.length + 1,
    });
  });

  // 如果通过链接正则没找到，尝试从文本块提取
  if (chapters.length === 0) {
    console.log('[ieso-render] 链接方式未提取到章节，尝试从页面文本块提取');
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (/\/read\/\d+\/\d+\.html/.test(href) && !href.includes('_')) {
        const absUrl = new URL(href, tocUrl).href;
        const cid = href.match(/\/(\d+)\.html/)?.[1];
        if (cid && !seenChapterIds.has(cid)) {
          seenChapterIds.add(cid);
          chapters.push({
            title: text,
            url: absUrl,
            num: chapters.length + 1,
          });
        }
      }
    });
  }

  if (chapters.length === 0) {
    throw new Error('未检测到章节链接，请确认URL是否为小说目录页');
  }

  console.log(`[ieso-render] 目录抓取成功: "${title}", ${chapters.length} 章`);
  return { title, chapters, source: url, novelId: parsed.novelId };
}

// ─── 章节抓取 ───────────────────────────────────────────

async function crawlChapter(url, knownTitle) {
  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
    if (isChallengePage(html)) {
      html = null;
    }
  } catch (e) {
    console.log(`[ieso-render] HTTP 章节抓取失败 (${url}): ${e.message}`);
  }

  if (!html) {
    console.log(`[ieso-render] 使用 Electron 渲染章节页: ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: '.content',
        timeout: 30000,
        minTextLength: 100,
      });
      html = electronResult.html;
    } catch (e) {
      throw new Error(`Electron 渲染章节页失败: ${e.message}`);
    }
  }

  if (!html || isChallengePage(html)) {
    throw new Error(`章节页内容为空或反爬拦截 (${url})`);
  }

  const $ = cheerio.load(html);
  let title = $('h1').first().text().trim() || $('title').text().trim();

  // 从 h1 中提取分页信息: "第一章 活着（1 / 2）" → totalPages=2
  // 同时清理标题中的分页标记
  const PAGE_IN_TITLE_RE = /[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/;
  let totalPages = 0;
  const titlePageMatch = title.match(PAGE_IN_TITLE_RE);
  if (titlePageMatch) {
    totalPages = parseInt(titlePageMatch[2], 10);
    title = title.replace(PAGE_IN_TITLE_RE, '').trim();
    console.log(`[ieso-render] 从标题检测到分页: 共 ${totalPages} 页 (标题: "${title}")`);
  }

  // 如果标题仍为空或全是导航文字，使用 knownTitle
  if ((!title || /首页|目录|书本网/.test(title)) && knownTitle) {
    title = knownTitle;
  }

  // 提取正文内容
  let content = '';
  const contentSelectors = ['.content', '#content', '#booktxt', '#chaptercontent', '[class*="showtxt" i]'];

  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length) {
      const text = stripFooter(cleanText($, el));
      if (text.length > 100) {
        content = text;
        console.log(`[ieso-render] 选择器 "${sel}" 匹配，文本长度: ${text.length}`);
        break;
      }
    }
  }

  if (!content) {
    // 兜底：找最大文本块
    console.warn(`[ieso-render] 未匹配到内容容器 (${url})，尝试提取最大文本块`);
    let maxLen = 0;
    $('div, section, article').each((_, el) => {
      const text = stripFooter(cleanText($, $(el)));
      if (text.length > maxLen) {
        maxLen = text.length;
        content = text;
      }
    });
  }

  if (!content || content.length < 50) {
    throw new Error(`章节内容过短或为空 (${url})`);
  }

  // 清理内容中的分页标记
  content = content
    .replace(/[（(]\s*\d+\s*\/\s*\d+\s*[）)]/g, '')
    .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // ── 处理多页章节 ──
  // 方法1: 从 h1 标题检测到的分页信息
  // 方法2: 从页面导航"下一页"链接获取后续页面

  if (totalPages <= 1) {
    // 尝试从页面中检测分页标记（标题之外）
    const bodyText = $('body').text();
    const bodyPageMatch = bodyText.match(/[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/);
    if (bodyPageMatch) {
      totalPages = Math.max(totalPages, parseInt(bodyPageMatch[2], 10));
    }
  }

  // 查找"下一页"链接以获取分页 URL
  const nextPageLinks = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href) return;
    // 匹配 "下一页" 导航链接
    if (/^下一页$/.test(text) || /下一?页/.test(text)) {
      const absUrl = new URL(href, url).href;
      // 确保是同一章节的子页（_2, _3 等格式）
      if (/_(\d+)\.html/.test(absUrl)) {
        const pageNum = parseInt(absUrl.match(/_(\d+)\.html/)[1]);
        if (!nextPageLinks.find(p => p.page === pageNum)) {
          nextPageLinks.push({ url: absUrl, page: pageNum });
        }
      }
    }
  });

  // 如果 h1 中检测到分页，但"下一页"链接不够，构造 URL
  if (totalPages > 1 && nextPageLinks.length === 0) {
    const parsed = parseUrl(url);
    if (parsed && parsed.chapterId) {
      const currentPage = parsed.subPage || 1;
      for (let p = currentPage + 1; p <= totalPages; p++) {
        const pageUrl = `http://www.ieso.net/read/${parsed.novelId}/${parsed.chapterId}_${p}.html`;
        nextPageLinks.push({ url: pageUrl, page: p });
      }
    }
  }

  // 如果 h1 未检测到但"下一页"链接存在，按链接抓取
  if (totalPages <= 1 && nextPageLinks.length > 0) {
    totalPages = Math.max(...nextPageLinks.map(p => p.page));
    // 当前页面是第一页
    const allPages = [{ url, page: 1 }];
    allPages.push(...nextPageLinks);
    nextPageLinks.length = 0;
    nextPageLinks.push(...allPages.filter(p => p.page > 1));
  }

  // 获取后续分页内容
  if ((totalPages > 1 || nextPageLinks.length > 0) && content.length > 0) {
    // 按 page 排序
    nextPageLinks.sort((a, b) => a.page - b.page);

    console.log(`[ieso-render] 章节分页: 共 ${Math.max(totalPages, nextPageLinks.length + 1)} 页`);

    for (const plink of nextPageLinks) {
      console.log(`[ieso-render] 获取第 ${plink.page} 页: ${plink.url}`);

      try {
        let pageHtml;
        try {
          const result = await engine.fetch(plink.url);
          pageHtml = result.html;
          if (isChallengePage(result.html)) pageHtml = null;
        } catch (_) {}

        if (!pageHtml) {
          try {
            const electronResult = await engine.fetch(plink.url, {
              engine: 'electron',
              waitFor: '.content',
              timeout: 30000,
              minTextLength: 50,
            });
            pageHtml = electronResult.html;
          } catch (_) {}
        }

        if (!pageHtml || isChallengePage(pageHtml)) {
          console.warn(`[ieso-render] 第 ${plink.page} 页获取失败，跳过`);
          continue;
        }

        const p$ = cheerio.load(pageHtml);
        let pageContent = '';
        for (const sel of contentSelectors) {
          const el = p$(sel);
          if (el.length) {
            const text = stripFooter(cleanText(p$, el));
            if (text.length > 50) {
              pageContent = text;
              break;
            }
          }
        }
        if (!pageContent) {
          let maxLen = 0;
          p$('div, section, article').each((_, el) => {
            const text = stripFooter(cleanText(p$, p$(el)));
            if (text.length > maxLen) {
              maxLen = text.length;
              pageContent = text;
            }
          });
        }

        // 清理分页标记
        pageContent = pageContent
          .replace(/[（(]\s*\d+\s*\/\s*\d+\s*[）)]/g, '')
          .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
          .trim();

        if (pageContent && pageContent.length > 10) {
          content += '\n\n' + pageContent;
          console.log(`[ieso-render] 第 ${plink.page} 页获取成功，长度: ${pageContent.length}`);
        }
      } catch (e) {
        console.warn(`[ieso-render] 第 ${plink.page} 页抓取异常: ${e.message}`);
      }
    }
  }

  console.log(`[ieso-render] 章节抓取成功: "${title}", 内容长度: ${content.length}${totalPages > 1 ? ` (共 ${totalPages} 页)` : ''}`);
  return { title, content, source: url };
}

module.exports = { crawlNovel, crawlChapter };
