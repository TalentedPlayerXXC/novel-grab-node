const cheerio = require('cheerio');
const httpEngine = require('../../engine/http');

async function search(keyword, site) {
  const host = site || 'm.biquge.us';
  const searchUrl = `https://${host}/modules/article/search.php?searchkey=${encodeURIComponent(keyword)}`;

  let items = [];
  try {
    const result = await httpEngine.fetch(searchUrl);
    if (result.html && result.html.length >= 200) {
      const $ = cheerio.load(result.html);

      $('#sitebox dl').each((_, dl) => {
        const $dl = $(dl);
        const $titleLink = $dl.find('dd h3 a').first();
        const title = $titleLink.text().trim();
        const href = $titleLink.attr('href');

        if (!title || !href) return;

        const cover = $dl.find('dt a img').attr('src')
          || $dl.find('dt a img').attr('_src')
          || '';

        const authorText = $dl.find('dd.book_other').text().trim();
        const author = authorText.replace(/全本|连载|完本/g, '').trim() || '未知作者';

        const description = $dl.find('dd.book_des').text().trim() || '';

        const fullUrl = href.startsWith('http') ? href : `https://${host}${href}`;

        items.push({
          title,
          author,
          url: fullUrl,
          cover: cover.startsWith('http') ? cover : '',
          description,
        });
      });

      if (items.length === 0) {
        $('#sitebox a').each((_, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          if (!href || !text) return;
          const match = href.match(/\/(\d+)\.html/);
          if (!match) return;

          const $dl = $(el).closest('dl');
          if ($dl.length === 0) return;

          const $titleLink = $dl.find('dd h3 a').first();
          const title = $titleLink.text().trim() || text;
          const authorText = $dl.find('dd.book_other').text().trim();
          const author = authorText.replace(/全本|连载|完本/g, '').trim() || '未知作者';
          const cover = $dl.find('dt a img').attr('src') || '';
          const description = $dl.find('dd.book_des').text().trim() || '';
          const fullUrl = href.startsWith('http') ? href : `https://${host}${href}`;

          items.push({
            title,
            author,
            url: fullUrl,
            cover: cover.startsWith('http') ? cover : '',
            description,
          });
        });
      }
    }
  } catch (e) {
    console.log(`[biqugeus-search] 搜索失败: ${e.message}`);
  }

  return {
    source: host,
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
