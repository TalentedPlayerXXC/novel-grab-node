const cheerio = require('cheerio');
const httpEngine = require('../../engine/http');

async function search(keyword, site) {
  const host = site || 'www.biquge.club';
  const searchUrl = `https://${host}/search/?searchkey=${encodeURIComponent(keyword)}`;

  let items = [];
  try {
    const result = await httpEngine.fetch(searchUrl);
    if (result.html && result.html.length >= 200) {
      const $ = cheerio.load(result.html);

      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (!href || !text) return;
        const match = href.match(/^\/book\/(\d+)\/$/);
        if (!match) return;

        const bookId = match[1];
        const $item = $(el).closest('.item, dl, .bookbox');
        const author =
          $item.find('span').first().text().trim() ||
          $item.find('.author').text().trim() ||
          '未知作者';
        const cover =
          $item.find('img').attr('src') || '';
        const description =
          $item.find('dd').first().text().trim() ||
          $item.find('.intro').text().trim() ||
          '';

        items.push({
          title: text,
          author,
          url: `https://${host}/book/${bookId}/`,
          cover: cover.startsWith('http') ? cover : `https://${host}${cover}`,
          description,
        });
      });

      if (items.length === 0) {
        $('a').each((_, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          if (!href || !text) return;
          const match = href.match(/\/book\/(\d+)\//);
          if (!match) return;
          const bookId = match[1];
          const $item = $(el).closest('.item, dl, .bookbox');
          const author = $item.find('span').first().text().trim() || '未知作者';
          const cover = $item.find('img').attr('src') || '';
          const description = $item.find('dd').first().text().trim() || '';
          items.push({
            title: text,
            author,
            url: `https://${host}/book/${bookId}/`,
            cover,
            description,
          });
        });
      }
    }
  } catch (e) {
    console.log(`[biqugeclub-search] 搜索失败: ${e.message}`);
  }

  return {
    source: host,
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
