const cheerio = require('cheerio');
const engine = require('../engine');

const MAX_RETRIES = 1;
const RETRY_DELAY = 2000;

function cleanText($, el) {
  const clone = el.clone();
  clone.find('script, style, noscript, iframe').remove();
  clone.find('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .ads, .ad').remove();
  return clone.text().trim();
}

function stripFooter(text) {
  const idx = text.search(/请收藏本站|笔趣阁提醒|记住本站/i);
  if (idx > 0) text = text.substring(0, idx);
  text = text.replace(/笔趣阁.*$/s, '');
  return text.trim();
}

async function crawlNovel(url) {
  const bookIdMatch = url.match(/\/(\d+)\.html/);
  const bookId = bookIdMatch ? bookIdMatch[1] : null;

  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
  } catch (e) {
    console.log(`[biqugeus-render] HTTP 目录抓取失败: ${e.message}`);
  }

  if (!html || html.length < 200) {
    console.log(`[biqugeus-render] 使用 Electron 渲染目录页: ${url}`);
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
  let title = $('h1').first().text().trim() || $('title').text().trim();

  // 去掉标题中的站点后缀
  title = title
    .replace(/最新章节.*$/i, '')
    .replace(/无弹窗.*$/i, '')
    .replace(/[ _-]*笔趣阁.*$/i, '')
    .replace(/[ _-]*全本小说.*$/i, '')
    .trim();

  const chapters = [];
  const seen = new Set();
  const myBookId = bookId || '0';

  function addChapter(href, text) {
    const match = href.match(new RegExp(`/${myBookId}/(\\d+)\\.html`));
    if (!match) return;
    const cid = match[1];
    if (seen.has(cid)) return;
    seen.add(cid);
    const absUrl = new URL(href, url).href;
    chapters.push({ title: text, url: absUrl, num: chapters.length + 1 });
  }

  // Step 1: 从书籍首页提取章节（通常是最近几条）
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && text) addChapter(href, text);
  });

  // Step 2: 从目录页获取完整章节列表
  if (bookId) {
    const indexUrl = `https://m.biquge.us/index/${bookId}/asc/1.html`;
    console.log(`[biqugeus-render] 获取完整目录: ${indexUrl}`);
    try {
      let indexHtml;
      try {
        const r = await engine.fetch(indexUrl);
        indexHtml = r.html;
      } catch (_) {}

      if (indexHtml && indexHtml.length >= 200) {
        const i$ = cheerio.load(indexHtml);
        i$('a').each((_, el) => {
          const href = i$(el).attr('href');
          const text = i$(el).text().trim();
          if (href && text) addChapter(href, text);
        });
      }
    } catch (e) {
      console.log(`[biqugeus-render] 目录页获取失败: ${e.message}`);
    }
  }

  if (chapters.length === 0) {
    throw new Error('未检测到章节链接，请确认URL是否为小说目录页');
  }

  console.log(`[biqugeus-render] 目录抓取成功: "${title}", ${chapters.length} 章`);
  return { title, chapters, source: url };
}

async function _crawlChapter(url, knownTitle) {
  let html;
  try {
    const result = await engine.fetch(url);
    html = result.html;
  } catch (e) {
    console.log(`[biqugeus-render] HTTP 章节抓取失败: ${e.message}`);
  }

  if (!html || html.length < 200) {
    console.log(`[biqugeus-render] 使用 Electron 渲染章节: ${url}`);
    try {
      const electronResult = await engine.fetch(url, {
        engine: 'electron',
        waitFor: '#YiJianZhan',
        timeout: 30000,
        minTextLength: 100,
      });
      html = electronResult.html;
    } catch (e) {
      throw new Error(`章节页加载失败: ${e.message}`);
    }
  }

  const $ = cheerio.load(html);
  let title = $('h1').first().text().trim() || $('title').text().trim();

  if (!title && knownTitle) title = knownTitle;

  let content = '';
  const el = $('#YiJianZhan');
  if (el.length) {
    content = stripFooter(cleanText($, el));
    content = content.replace(/(第[^\s]+章|<br\s*\/?>)/g, '\n$1').trim();
  }

  if (!content || content.length < 50) {
    let maxLen = 0;
    $('div, article').each((_, el) => {
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

  content = content.replace(/\n{3,}/g, '\n\n').trim();
  console.log(`[biqugeus-render] 章节抓取成功: "${title}", 内容长度: ${content.length}`);
  return { title, content, source: url };
}

async function crawlChapter(url, title) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await _crawlChapter(url, title);
      if (attempt > 0) console.log(`[biqugeus-render] 重试成功`);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[biqugeus-render] 抓取失败 (${err.message})，${delay}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { crawlNovel, crawlChapter };
