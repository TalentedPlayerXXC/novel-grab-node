const cheerio = require('cheerio');
const engine = require('../engine');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

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
  // 移动端只有最近章节，桌面端有完整目录
  url = url.replace(/^https:\/\/m\.snapd\.net/, 'https://www.snapd.net');

  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
  } catch (e) {
    console.log(`[snapd-render] HTTP 目录抓取失败: ${e.message}`);
  }

  if (!html || html.length < 200) {
    console.log(`[snapd-render] 使用 Electron 渲染目录页: ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: 'a',
        timeout: 60000,
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

  const chapters = [];
  const seen = new Set();
  const CHAPTER_RE = /(第|地)[\u4e00-\u9fa5零一二三四五六七八九十百千万\d]+[章回卷]|^第\d+/;

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text) return;

    const match = href.match(/\/read\/\d+\/(\d+)\.html/);
    if (!match) return;

    const chapterId = match[1];
    if (seen.has(chapterId)) return;
    if (href.includes('_')) return;
    seen.add(chapterId);

    const absUrl = new URL(href, url).href;
    chapters.push({ title: text, url: absUrl, num: chapters.length + 1 });
  });

  if (chapters.length === 0) {
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;
      if (/\/read\/\d+\/\d+\.html/.test(href) && !href.includes('_')) {
        const cid = href.match(/\/(\d+)\.html/)?.[1];
        if (cid && !seen.has(cid)) {
          seen.add(cid);
          const absUrl = new URL(href, url).href;
          chapters.push({ title: text, url: absUrl, num: chapters.length + 1 });
        }
      }
    });
  }

  if (chapters.length === 0) {
    throw new Error('未检测到章节链接，请确认URL是否为小说目录页');
  }

  console.log(`[snapd-render] 目录抓取成功: "${title}", ${chapters.length} 章`);
  return { title, chapters, source: url };
}

async function _crawlChapter(url, knownTitle) {
  const COMMON_CONTENT_SELECTORS = [
    '#chaptercontent',
    '#content',
    '#booktxt',
    '[id*="content" i]',
    '[class*="content" i]',
    '[class*="showtxt" i]',
    'article',
  ];

  const { html } = await engine.fetch(url, {
    engine: 'electron',
    waitFor: COMMON_CONTENT_SELECTORS.join(', '),
    timeout: 60000,
    minTextLength: 100,
  });

  if (html.length < 2000 && /加载中|userverify|verify|challenge/i.test(html)) {
    throw new Error('页面仍在验证中，内容未加载完成');
  }

  const $ = cheerio.load(html);
  let title = $('h1').first().text().trim() || $('title').text().trim();
  if (!title && knownTitle) title = knownTitle;

  let content = '';
  for (const sel of COMMON_CONTENT_SELECTORS) {
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

  console.log(`[snapd-render] 章节抓取成功: "${title}", 内容长度: ${content.length}`);
  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) console.log(`[snapd-render] 重试成功`);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[snapd-render] 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
