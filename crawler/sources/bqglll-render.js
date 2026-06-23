const cheerio = require('cheerio');
const axios = require('axios');
const engine = require('../engine');
const electronEngine = require('../engine/electron');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

// 模块级状态：crawlNovel 阶段发现后存储，crawlChapter 阶段使用
let _spaDomain = null;
let _mobileBookId = null;

// ─── 工具函数 ───────────────────────────────────────────

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hostname = 'www.bqglll.cc';
    parsed.protocol = 'https:';
    return parsed.href;
  } catch {
    return url;
  }
}

function cleanText($, el) {
  const clone = el.clone();
  clone.find('script, style, noscript, iframe').remove();
  clone.find('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .ads, .ad').remove();
  clone.find('.readinline').remove();
  clone.find('br').replaceWith('\n');
  return clone.text().trim();
}

function stripFooter(text) {
  const footerIdx = text.search(/请收藏本站[：:]/);
  if (footerIdx > 0) {
    text = text.substring(0, footerIdx);
  }
  text = text.replace(/笔趣阁.*$/s, '');
  return text.trim();
}

/**
 * 从页面 HTML 中提取内部 book ID。
 * 封面图片路径格式: /bookimg/{Math.floor(id/1000)}/{id}.jpg
 * 桌面端和移动端均适用。
 */
function extractBookId($) {
  const imgSrc = $('img').attr('src') || '';
  const match = imgSrc.match(/bookimg\/\d+\/(\d+)\.jpg/);
  if (match) return parseInt(match[1], 10);

  const html = $.html();
  const errMatch = html.match(/book_error\(['"](\d+)['"]/);
  if (errMatch) return parseInt(errMatch[1], 10);

  return null;
}

/**
 * 通过 /json_book API 获取章节标题列表（纯 HTTP，无 Cloudflare）。
 */
async function fetchChapterTitles(pathId) {
  try {
    const resp = await axios.get(
      `https://www.bqglll.cc/json_book?id=${pathId}&page=0`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        timeout: 15000,
      }
    );
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      return resp.data;
    }
  } catch (e) {
    console.log(`[bqglll-render] /json_book API 失败: ${e.message}`);
  }
  return null;
}

const PLACEHOLDER_MARKERS = [
  '大学阿拉伯语专业',
  '今年２２岁',
  '东北大汉的身材，身高１８２',
];

function isPlaceholder(text) {
  if (!text) return true;
  const matchCount = PLACEHOLDER_MARKERS.filter((m) => text.includes(m)).length;
  return matchCount >= 2;
}

// ─── 目录抓取 ───────────────────────────────────────────

async function crawlNovel(url) {
  const desktopUrl = normalizeUrl(url);
  const { html } = await engine.fetch(desktopUrl);
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim();

  const bookId = extractBookId($);
  if (bookId) {
    console.log(`[bqglll-render] 提取到内部 book ID: ${bookId}`);
  }

  const pathMatch = desktopUrl.match(/\/look\/(\d+)\//);
  const pathId = pathMatch ? pathMatch[1] : null;

  // ── 提取移动端 book ID ──
  // 移动端 book ID 可能与桌面端相同，也可能不同（双 ID 体系）
  let mobileBookId = bookId;
  if (pathId) {
    try {
      const mobileUrl = `https://m.bqglll.cc/look/${pathId}/`;
      const mobileResp = await axios.get(mobileUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        timeout: 15000,
      });
      const m$ = cheerio.load(mobileResp.data);
      const mBid = extractBookId(m$);
      if (mBid) {
        mobileBookId = mBid;
        console.log(`[bqglll-render] 移动端 book ID: ${mobileBookId}`);
      }
    } catch (e) {
      console.log(`[bqglll-render] 移动端页面获取失败 (${e.message})，使用桌面端 book ID`);
    }
  }

  // ── 发现 SPA 域名 ──
  // 加载 list.html → /userverify + hash → Cloudflare 验证 → 随机 SPA 域名
  let spaDomain = null;
  if (pathId) {
    try {
      const listUrl = `https://m.bqglll.cc/look/${pathId}/list.html`;
      console.log(`[bqglll-render] 开始发现 SPA 域名: ${listUrl}`);
      const fullSpaUrl = await electronEngine.discoverSpaDomain(listUrl);
      console.log(`[bqglll-render] SPA 完整 URL: ${fullSpaUrl}`);
      const u = new URL(fullSpaUrl);
      spaDomain = u.origin;
      console.log(`[bqglll-render] SPA 域名: ${spaDomain}`);

      // 从 SPA URL hash 中提取移动端 book ID（最可靠的来源，直接来自章节列表页）
      const hashMatch = u.hash.match(/\/book\/(\d+)\//);
      if (hashMatch) {
        const hashBookId = parseInt(hashMatch[1], 10);
        console.log(`[bqglll-render] 从 SPA hash 提取到 book ID: ${hashBookId} (之前: ${mobileBookId})`);
        mobileBookId = hashBookId;
      }
    } catch (e) {
      console.log(`[bqglll-render] SPA 域名发现失败: ${e.message}`);
    }
  }

  // 存储模块级状态，供 crawlChapter 使用
  _spaDomain = spaDomain;
  _mobileBookId = mobileBookId;

  // ── 获取章节标题 ──
  let apiTitles = null;
  if (pathId) {
    apiTitles = await fetchChapterTitles(bookId || pathId);
  }

  const CHAPTER_RE = /(第|地)[\u4e00-\u9fa5零一二三四五六七八九十百千万\d]+章/;

  const chapters = [];
  if (apiTitles && pathId) {
    apiTitles.forEach((chTitle, index) => {
      const chapterNum = index + 1;
      const baseUrl = `https://www.bqglll.cc/look/${pathId}/${chapterNum}.html`;
      chapters.push({ title: chTitle, url: baseUrl, num: chapterNum });
    });
  } else {
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && /\.html/.test(href) && CHAPTER_RE.test(text)) {
        const absUrl = new URL(href, desktopUrl).href;
        const numMatch = absUrl.match(/\/(\d+)\.html/);
        chapters.push({ title: text, url: absUrl, num: numMatch ? parseInt(numMatch[1], 10) : 0 });
      }
    });
  }

  // 去重 + 排序
  const seen = new Set();
  const unique = [];
  for (const ch of chapters) {
    if (!seen.has(ch.url)) {
      seen.add(ch.url);
      unique.push(ch);
    }
  }
  unique.sort((a, b) => (a.num || 0) - (b.num || 0));

  return { title, chapters: unique, source: url, bookId, spaDomain, mobileBookId };
}

// ─── 章节抓取：移动端 SPA 渲染 ───────────────────────────
//
// 流程：
//   1. 从章节 URL 解析出 chapterNum
//   2. 使用 crawlNovel 阶段发现的 spaDomain 和 mobileBookId
//   3. 构造 SPA URL: {spaDomain}/#/book/{mobileBookId}/{chapterNum}.html
//   4. 用 Electron 加载 SPA 页面（共享 session 已预热，无 Cloudflare）
//   5. 等待内容容器出现后提取（使用 COMMON_CONTENT_SELECTORS 覆盖主流中文小说网站）
//
// 相较于之前的桌面端点击模拟方案，移动端 SPA 页面内容渲染更完整。

async function _crawlChapter(url, knownTitle) {
  const cleanUrl = url.split('?')[0];
  const match = cleanUrl.match(/\/look\/\d+\/(\d+)\.html/);

  if (!match) {
    throw new Error(`无法解析章节 URL: ${url}`);
  }

  const chapterNum = parseInt(match[1], 10);

  if (!_spaDomain || !_mobileBookId) {
    throw new Error('缺少 SPA 域名或书籍 ID，请先抓取目录（crawlNovel）后再获取章节内容');
  }

  // 与通用爬虫保持一致的属性选择器列表，覆盖主流中文小说网站的正文容器
  const COMMON_CONTENT_SELECTORS = [
    'article',
    '[id*="content" i]',
    '[id*="booktxt" i]',
    '[class*="content" i]',
    '[class*="read" i]',
    '[class*="showtxt" i]',
  ];

  const spaChapterUrl = `${_spaDomain}/#/book/${_mobileBookId}/${chapterNum}.html`;
  console.log(`[bqglll-render] 加载 SPA 章节 (第${chapterNum}章): ${spaChapterUrl}`);
  console.log(`[bqglll-render]   使用 SPA 域名: ${_spaDomain}, book ID: ${_mobileBookId}`);

  const { html } = await engine.fetch(spaChapterUrl, {
    engine: 'electron',
    waitFor: COMMON_CONTENT_SELECTORS.join(', '),
    timeout: 60000,
    minTextLength: 100,
  });

  console.log(`[bqglll-render] HTML 长度: ${html.length}, 前200字符: ${html.substring(0, 200)}`);

  // 检测 Cloudflare 验证页面（SPA 加载失败时的兜底）
  if (html.length < 2000 && /加载中|userverify|verify|challenge/i.test(html)) {
    throw new Error('页面仍在验证中，内容未加载完成');
  }

  // ── SPA 章节分页检测（在 cheerio 清理之前，从原始 HTML 中查找） ──
  // "第(1/3)页" 标记通常在 .readinline 元素中，会被 cleanText() 移除，
  // 因此在 cheerio 处理之前先从原始 HTML 检测分页信息。
  const PAGE_INDICATOR_RE = /第[\(（]\s*(\d+)\s*\/\s*(\d+)\s*[\)）]页/g;
  let pageMatch;
  let totalPages = 0;
  while ((pageMatch = PAGE_INDICATOR_RE.exec(html)) !== null) {
    const tp = parseInt(pageMatch[2], 10);
    if (tp > totalPages) totalPages = tp;
  }

  if (totalPages > 1) {
    console.log(`[bqglll-render] 检测到章节分页: 共 ${totalPages} 页（从原始 HTML 检测）`);
  }

  const $ = cheerio.load(html);
  let title = $('h1').first().text().trim() || $('title').text().trim();
  if (!title && knownTitle) {
    title = knownTitle;
  }

  let content = '';
  for (const sel of COMMON_CONTENT_SELECTORS) {
    const el = $(sel);
    if (el.length) {
      const text = stripFooter(cleanText($, el));
      console.log(`[bqglll-render] 选择器 "${sel}" 匹配 ${el.length} 个元素，文本长度: ${text.length}`);
      if (text.length > 100) {
        content = text;
        break;
      }
    } else {
      console.log(`[bqglll-render] 选择器 "${sel}" 未匹配`);
    }
  }

  if (!content) {
    console.warn(`[bqglll-render] 未匹配到内容容器 (${url})，尝试提取最大文本块`);
    let maxLen = 0;
    $('div, section, article, main').each((_, el) => {
      const text = stripFooter(cleanText($, $(el)));
      if (text.length > maxLen) {
        maxLen = text.length;
        content = text;
      }
    });
  }

  if (!content || content.length < 50) {
    throw new Error(`章节内容过短或为空 (${url})，可能页面未完全渲染`);
  }

  if (isPlaceholder(content)) {
    throw new Error(`获取到占位文本而非真实内容 (${url})，站点可能启用了反爬保护`);
  }

  // 获取后续分页内容
  if (totalPages > 1) {
    // 清理第一页内容中的分页标记和翻页提示
    content = content
      .replace(/第[\(（]\s*\d+\s*\/\s*\d+\s*[\)）]页/g, '')
      .replace(/[\(（]本章未完[，,]\s*请[点擊点击].*?[）\)]/g, '')
      .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    for (let p = 2; p <= totalPages; p++) {
      const pageUrl = `${_spaDomain}/#/book/${_mobileBookId}/${chapterNum}_${p}.html`;
      console.log(`[bqglll-render] 获取第 ${p}/${totalPages} 页: ${pageUrl}`);

      try {
        const { html: pageHtml } = await engine.fetch(pageUrl, {
          engine: 'electron',
          waitFor: COMMON_CONTENT_SELECTORS.join(', '),
          timeout: 30000,
          minTextLength: 50,
        });

        const p$ = cheerio.load(pageHtml);
        let pageContent = '';
        for (const sel of COMMON_CONTENT_SELECTORS) {
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
          p$('div, section, article, main').each((_, el) => {
            const text = stripFooter(cleanText(p$, p$(el)));
            if (text.length > maxLen) {
              maxLen = text.length;
              pageContent = text;
            }
          });
        }

        // 清理分页标记
        pageContent = pageContent
          .replace(/第[\(（]\s*\d+\s*\/\s*\d+\s*[\)）]页/g, '')
          .replace(/[\(（]本章未完[，,]\s*请[点擊点击].*?[）\)]/g, '')
          .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
          .trim();

        if (pageContent && pageContent.length > 10) {
          content += '\n\n' + pageContent;
          console.log(`[bqglll-render] 第 ${p}/${totalPages} 页获取成功，长度: ${pageContent.length}`);
        } else {
          console.warn(`[bqglll-render] 第 ${p}/${totalPages} 页内容过短，跳过`);
        }
      } catch (err) {
        console.warn(`[bqglll-render] 第 ${p}/${totalPages} 页获取失败: ${err.message}`);
      }
    }
  }

  console.log(`[bqglll-render] 章节抓取成功: "${title}", 内容长度: ${content.length}${totalPages > 1 ? ` (共 ${totalPages} 页)` : ''}`);
  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) {
        console.log(`[bqglll-render] ${url} 第${attempt + 1}次重试成功`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[bqglll-render] ${url} 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
