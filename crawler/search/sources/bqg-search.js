const httpEngine = require('../../engine/http');

const BQG_HOSTS = [
  'www.bqg518.xyz',
  'www.bqg971.xyz',
  'www.bqg998.cc',
  'www.bqg995.xyz',
  'www.bqg907.cc',
];

async function search(keyword, site) {
  const host = BQG_HOSTS.find((h) => h === site) || site;
  const searchUrl = `https://${host}/api/search?q=${encodeURIComponent(keyword)}`;

  let items = [];
  try {
    const result = await httpEngine.fetch(searchUrl);
    const data = JSON.parse(result.html);
    const list = data.data || data || [];

    items = list.map((item) => {
      const id = Number(item.id);
      return {
        title: item.title || item.articlename || '',
        author: item.author || '未知作者',
        url: `https://${host}/#/book/${id}/`,
        cover: `https://${host}/bookimg/${Math.floor(id / 1000)}/${id}.jpg`,
        description: (item.intro || item.description || '').trim(),
      };
    });
  } catch (e) {
    console.log(`[bqg-search] ${host} API 搜索失败: ${e.message}`);
  }

  return {
    source: host,
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
