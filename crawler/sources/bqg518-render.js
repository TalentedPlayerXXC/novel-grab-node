const engine = require('../engine');
const httpEngine = require('../engine/http');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

const BQG_HOSTS = [
  'www.bqg518.xyz',
  'www.bqg971.xyz',
  'www.bqg998.cc',
  'www.bqg995.xyz',
  'www.bqg907.cc',
];

function getHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'www.bqg518.xyz';
  }
}

async function _apiFetch(host, path) {
  const result = await httpEngine.fetch(`https://${host}${path}`);
  return JSON.parse(result.html);
}

function parseBookIdFromUrl(url) {
  const match = url.match(/\/book\/(\d+)\//);
  return match ? parseInt(match[1], 10) : null;
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
  const idx = text.search(/请收藏本站|笔趣阁提醒|记住本站/i);
  if (idx > 0) text = text.substring(0, idx);
  text = text.replace(/笔趣阁.*$/s, '');
  return text.trim();
}

async function crawlNovel(url) {
  const bookId = parseBookIdFromUrl(url);
  if (!bookId) {
    throw new Error(`无法从 URL 解析 book ID: ${url}`);
  }

  const host = getHost(url);
  console.log(`[bqg518-render] 通过 API 抓取目录, host=${host}, bookId=${bookId}`);

  let title = '未知书名';
  let chapters = [];

  try {
    const book = await _apiFetch(host, `/api/book?id=${bookId}`);
    title = book.title || title;
    console.log(`[bqg518-render] 书名: "${title}", 作者: ${book.author || '未知'}`);
  } catch (e) {
    console.log(`[bqg518-render] API /api/book 失败: ${e.message}`);
  }

  try {
    const booklist = await _apiFetch(host, `/api/booklist?id=${bookId}`);
    const list = booklist.list || [];
    console.log(`[bqg518-render] 获取到 ${list.length} 章`);

    chapters = list.map((chTitle, index) => {
      const chapterNum = index + 1;
      return {
        title: chTitle,
        url: `https://${host}/#/book/${bookId}/${chapterNum}.html`,
        num: chapterNum,
      };
    });
  } catch (e) {
    console.log(`[bqg518-render] API /api/booklist 失败: ${e.message}`);
  }

  if (chapters.length === 0) {
    throw new Error('API 未返回章节数据');
  }

  console.log(`[bqg518-render] 目录抓取成功: "${title}", ${chapters.length} 章`);
  return { title, chapters, source: url, bookId: String(bookId) };
}

async function _crawlChapter(url, knownTitle) {
  const host = getHost(url);

  const chapterSelector = '#chaptercontent, .Readarea, [id*="chaptercontent" i], [class*="showtxt" i], .content';
  console.log(`[bqg518-render] 加载 SPA 章节: ${url}`);

  const { html } = await engine.fetch(url, {
    engine: 'electron',
    waitFor: chapterSelector,
    timeout: 60000,
    minTextLength: 50,
  });

  if (!html || html.length < 500) {
    throw new Error('Electron 渲染后内容不足，无法提取正文');
  }

  if (html.length < 2000 && /加载中|userverify|verify|challenge/i.test(html)) {
    throw new Error('页面仍在验证中，内容未加载完成');
  }

  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  let title = $('h1').first().text().trim() || $('title').text().trim();
  if (!title && knownTitle) title = knownTitle;

  let content = '';
  for (const sel of chapterSelector.split(', ')) {
    const el = $(sel);
    if (el.length) {
      const text = stripFooter(cleanText($, el));
      if (text.length > 50) {
        content = text;
        break;
      }
    }
  }

  if (!content) {
    let maxLen = 0;
    $('div, article, section').each((_, el) => {
      const text = stripFooter(cleanText($, $(el)));
      if (text.length > maxLen) {
        maxLen = text.length;
        content = text;
      }
    });
  }

  if (!content || content.length < 30) {
    throw new Error(`章节内容过短或为空 (${url})`);
  }

  content = content
    .replace(/本章未完[，,]\s*请[点擊点击].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log(`[bqg518-render] 章节抓取成功: "${title}", 内容长度: ${content.length}`);
  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) console.log(`[bqg518-render] 重试成功`);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[bqg518-render] 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
