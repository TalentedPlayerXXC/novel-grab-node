const cheerio = require('cheerio');
const httpEngine = require('../../engine/http');
const engine = require('../../engine');

/**
 * bqglll.cc 搜索适配器
 *
 * 搜索页: https://m.bqglll.cc/s?q=KEYWORD
 * 该页面加载后，JS 先调 /user/hm.html?q=KEYWORD 建立 session，
 * 再 AJAX 请求 /user/search.html?q=KEYWORD 获取 JSON 结果并渲染 DOM。
 * 因此需要 Electron BrowserWindow 渲染整页，等待 div.item 出现后提取 HTML。
 */
async function search(keyword) {
  const searchPageUrl = `https://m.bqglll.cc/s?q=${encodeURIComponent(keyword)}`;

  let html;
  // 主路径：Electron 渲染搜索页，等 JS 执行完结果加载
  try {
    const result = await engine.fetch(searchPageUrl, {
      engine: 'electron',
      waitFor: 'div.item',
      timeout: 30000,
    });
    if (result.html && result.html.length >= 200) {
      html = result.html;
    }
  } catch (e) {
    console.log(`[bqglll-search] Electron 渲染失败: ${e.message}`);
  }

  // Fallback：直连 HTTP API（需要 session，大概率返回 []）
  if (!html) {
    console.log(`[bqglll-search] Electron 不可用，尝试 HTTP fallback`);
    try {
      const result = await httpEngine.fetch(searchPageUrl);
      if (result.html && result.html.length >= 200) {
        html = result.html;
      }
    } catch (e) {
      console.log(`[bqglll-search] HTTP fallback 也失败: ${e.message}`);
    }
  }

  if (!html) {
    return { source: 'bqglll.cc', items: [], error: '无法获取搜索结果' };
  }

  const $ = cheerio.load(html);
  const items = [];

  // 渲染后的 DOM 结构:
  // div.item > div.image > a[href=url_list] > img[src=url_img]
  // div.item > dl > dt > span(作者) + a(书名, href=url_list)
  // div.item > dl > dd(简介)
  $('div.item').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('dt a').first();
    const title = $link.text().trim();
    const href = $link.attr('href');
    const author = $el.find('dt span').first().text().trim();
    const cover = $el.find('div.image a img').attr('src') || '';
    const description = $el.find('dd').first().text().trim();

    if (title && href) {
      items.push({
        title,
        author: author || '未知作者',
        url: href.startsWith('http') ? href : `https://m.bqglll.cc${href}`,
        cover: cover.startsWith('http') ? cover : (cover ? `https://m.bqglll.cc${cover}` : ''),
        description: description || '',
      });
    }
  });

  return {
    source: 'bqglll.cc',
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
