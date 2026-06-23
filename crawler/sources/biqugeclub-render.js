const cheerio = require('cheerio');
const engine = require('../engine');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

function cleanText($, el) {
  const clone = el.clone();
  clone.find('script, style, noscript, iframe').remove();
  clone.find('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .ads, .ad').remove();
  clone.find('br').replaceWith('\n');
  return clone.text().trim();
}

function stripFooter(text) {
  const idx = text.search(/请收藏本站|笔趣阁提醒|记住本站/i);
  if (idx > 0) text = text.substring(0, idx);
  text = text.replace(/笔趣阁.*$/s, '');
  return text.trim();
}

function parseBookId(url) {
  const match = url.match(/\/book\/(\d+)\//);
  return match ? match[1] : null;
}

async function crawlNovel(url) {
  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
  } catch (e) {
    console.log(`[biqugeclub-render] HTTP 目录抓取失败: ${e.message}`);
  }

  if (!html || html.length < 200) {
    console.log(`[biqugeclub-render] 使用 Electron 渲染目录页: ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: 'a',
        timeout: 30000,
      });
      html = electronResult.html;
    } catch (e) {
      throw new Error(`目录页加载失败: ${e.message}`);
    }
  }

  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim();

  const bookId = parseBookId(url);

  const chapters = [];
  const seen = new Set();
  const NAV_TEXTS = /^(开始阅读|返回目录|上一章|下一章|加入书架|作者专栏|首页|书库|排行|全本|热门|记录)$/;

  function addChapter(href, text) {
    const match = href.match(/\/read\/\d+\/(\d+)\.html/);
    if (!match) return;
    const cid = match[1];
    if (seen.has(cid)) return;
    if (href.includes('_')) return;
    if (NAV_TEXTS.test(text)) return;
    const absUrl = new URL(href, url).href;
    seen.add(cid);
    chapters.push({ title: text, url: absUrl, num: chapters.length + 1 });
  }

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && text) addChapter(href, text);
  });

  if (chapters.length === 0) {
    // broader scan without text filter
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text) {
        const fmatch = href.match(/\/read\/(\d+)\//);
        if (fmatch && fmatch[1] === bookId) {
          addChapter(href, text);
        }
      }
    });
  }

  if (chapters.length === 0) {
    throw new Error('未检测到章节链接，请确认URL是否为小说目录页');
  }

  console.log(`[biqugeclub-render] 目录抓取成功: "${title}", ${chapters.length} 章`);
  return { title, chapters, source: url, bookId };
}

async function _crawlChapter(url, knownTitle) {
  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
  } catch (e) {
    console.log(`[biqugeclub-render] HTTP 章节抓取失败: ${e.message}`);
  }

  if (!html || html.length < 200) {
    console.log(`[biqugeclub-render] 使用 Electron 渲染章节: ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: '#content',
        timeout: 30000,
        minTextLength: 100,
      });
      html = electronResult.html;
    } catch (e) {
      throw new Error(`章节页加载失败: ${e.message}`);
    }
  }

  const $ = cheerio.load(html);
  let title = $('h1.bookname').first().text().trim() || $('h1').first().text().trim() || $('title').text().trim();

  const PAGE_IN_TITLE_RE = /[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/;
  let totalPages = 0;
  const titlePageMatch = title.match(PAGE_IN_TITLE_RE);
  if (titlePageMatch) {
    totalPages = parseInt(titlePageMatch[2], 10);
    title = title.replace(PAGE_IN_TITLE_RE, '').trim();
  }

  if ((!title || /首页|目录|笔趣阁/i.test(title)) && knownTitle) {
    title = knownTitle;
  }

  let content = '';
  const selectors = ['#content', '#booktxt', '[id*="content" i]', 'article', '[class*="showtxt" i]'];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length) {
      const text = stripFooter(cleanText($, el));
      if (text.length > 100) {
        content = text;
        break;
      }
    }
  }

  if (!content) {
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

  content = content
    .replace(/[（(]\s*\d+\s*\/\s*\d+\s*[）)]/g, '')
    .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log(`[biqugeclub-render] 章节抓取成功: "${title}", 内容长度: ${content.length}`);
  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) console.log(`[biqugeclub-render] 重试成功`);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[biqugeclub-render] 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
