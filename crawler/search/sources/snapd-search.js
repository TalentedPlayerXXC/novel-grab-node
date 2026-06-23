const cheerio = require('cheerio');
const axios = require('axios');
const iconv = require('iconv-lite');
const engine = require('../../engine');

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function _mobileFetch(url) {
  const resp = await axios.get(url, {
    headers: { 'User-Agent': MOBILE_UA },
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'arraybuffer',
  });
  const buffer = Buffer.from(resp.data);
  return { html: iconv.decode(buffer, 'utf-8'), status: resp.status };
}

async function search(keyword, site) {
  const host = site || 'm.snapd.net';
  const encodedKey = encodeURIComponent(keyword);

  let items = [];

  try {
    await _mobileFetch(`https://${host}/user/hm.html?q=${encodedKey}`);
    const result = await _mobileFetch(`https://${host}/user/search.html?q=${encodedKey}`);
    const data = JSON.parse(result.html);

    if (Array.isArray(data) && data.length > 0) {
      items = data.map((item) => ({
        title: item.articlename || item.title || '',
        author: item.author || '未知作者',
        url: item.url_list
          ? item.url_list.startsWith('http')
            ? item.url_list
            : `https://${host}${item.url_list}`
          : '',
        cover: item.url_img
          ? item.url_img.startsWith('http')
            ? item.url_img
            : `https://www.${host.replace('m.', '')}${item.url_img}`
          : '',
        description: (item.intro || item.description || '').trim(),
      }));
    }
  } catch (e) {
    console.log(`[snapd-search] HTTP API 失败: ${e.message}`);
  }

  if (items.length === 0) {
    console.log(`[snapd-search] HTTP 无结果，fallback Electron 渲染`);
    try {
      const result = await engine.fetch(
        `https://${host}/s?q=${encodedKey}`,
        { engine: 'electron', waitFor: 'div.item', timeout: 30000 }
      );
      if (result.html && result.html.length >= 200) {
        const $ = cheerio.load(result.html);
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
              url: href.startsWith('http') ? href : `https://${host}${href}`,
              cover: cover.startsWith('http') ? cover : `https://www.${host.replace('m.', '')}${cover}`,
              description: description || '',
            });
          }
        });
      }
    } catch (e) {
      console.log(`[snapd-search] Electron fallback 也失败: ${e.message}`);
    }
  }

  return {
    source: host,
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
