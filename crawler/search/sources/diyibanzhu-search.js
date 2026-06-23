const cheerio = require('cheerio');
const httpEngine = require('../../engine/http');
const engine = require('../../engine');

/**
 * 解析搜索结果 HTML 提取条目
 */
function parseResults(html, site) {
  const $ = cheerio.load(html);
  const items = [];

  $('li.column-2').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('a.name').first();
    const title = $link.text().trim();
    const href = $link.attr('href');

    if (!title || !href) return;

    const infoText = $el.find('p.info').text() || '';
    const authorMatch = infoText.match(/作者[：:]\s*(\S+)/);
    const author = authorMatch ? authorMatch[1] : '未知作者';

    const img = $el.find('img').first();
    const src = img.attr('src') || img.attr('data-src') || '';
    const cover = src.startsWith('http') ? src : (src ? `https://${site}${src}` : '');

    const fullUrl = href.startsWith('http') ? href : `https://${site}${href}`;
    const listUrl = fullUrl.replace(/action=article/, 'action=list');

    items.push({ title, author, url: listUrl, cover, description: '' });
  });

  return items;
}

/**
 * diyibanzhu 系列站点搜索适配器
 * 搜索表单: POST https://{site}/wap.php?action=search
 * form body: objectType=2&wd=ENCODED_KEYWORD
 * 适配不同站点的 accept-charset（GBK 或 UTF-8），自动降级重试
 * 适用于: m.diyibanzhu1.space, m.diyibanzhu.website, m.07banzhu.store
 */
async function search(keyword, site) {
  const url = `https://${site}/wap.php?action=search`;
  const formData = { objectType: '2', wd: keyword };

  // 按优先级尝试不同编码：GBK（大多数站点）→ UTF-8（diyibanzhu.website 等）
  const encodingAttempts = [
    { encoding: 'gbk', label: 'GBK' },
    { encoding: undefined, label: 'UTF-8' }, // undefined = 默认 URL 编码
  ];

  let html;
  let items = [];

  for (const attempt of encodingAttempts) {
    try {
      const opts = attempt.encoding ? { formEncoding: attempt.encoding } : {};
      const result = await httpEngine.fetchPost(url, formData, opts);
      if (result.html && result.html.length >= 200) {
        items = parseResults(result.html, site);
        if (items.length > 0) {
          html = result.html; // 成功的响应
          console.log(`[diyibanzhu-search] ${site} ${attempt.label} 编码成功，${items.length} 条结果`);
          break;
        }
        console.log(`[diyibanzhu-search] ${site} ${attempt.label} 编码 0 结果，尝试下一编码`);
      }
    } catch (e) {
      console.log(`[diyibanzhu-search] ${site} ${attempt.label} POST 失败: ${e.message}`);
    }
  }

  // Fallback Electron
  if (items.length === 0) {
    console.log(`[diyibanzhu-search] HTTP 未获取到结果，fallback Electron 渲染 (${site})`);
    try {
      const result = await engine.fetch(url, { engine: 'electron', waitFor: 'a.name' });
      if (result.html && result.html.length >= 200) {
        items = parseResults(result.html, site);
        html = result.html;
      }
    } catch (e) {
      console.log(`[diyibanzhu-search] Electron 也失败 (${site}): ${e.message}`);
    }
  }

  return {
    source: site,
    items,
    error: items.length === 0 ? '未找到匹配的小说' : null,
  };
}

module.exports = { search };
