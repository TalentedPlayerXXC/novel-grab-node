const httpEngine = require('./crawler/engine/http');

async function main() {
  const url = 'http://www.ieso.net/read/109421/';
  console.log(`=== TOC: ${url} ===`);
  const result = await httpEngine.fetch(url);
  console.log(`encoding: ${result.encoding}`);
  console.log(`HTML length: ${result.html.length}`);

  // 查找所有链接
  const cheerio = require('cheerio');
  let $;
  try {
    $ = cheerio.load(result.html);
  } catch (e) {
    console.log(`cheerio.load 失败: ${e.message}`);
  }

  if ($) {
    console.log(`\ntitle tag: "${$('title').text().trim()}"`);
    console.log(`h1 text: "${$('h1').first().text().trim()}"`);
    console.log(`h1 html:`, $('h1').first().html());
    
    console.log(`\nTotal <a> tags: ${$('a').length}`);
    
    // 列出所有链接（前50个）
    console.log('\n所有链接 (前50):');
    $('a').each((i, el) => {
      if (i >= 50) return false;
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (text || href) {
        console.log(`  ${i}."${text}" -> ${href}`);
      }
    });

    // 搜索 /read/109421/ 模式在 raw HTML 中
    const readMatches = result.html.match(/\/read\/109421\/[^"'\s]+/g);
    if (readMatches) {
      console.log(`\n/read/109421/ matches in raw HTML: ${readMatches.length}`);
      console.log('前10个:', readMatches.slice(0, 10));
    }
  }
}

main().catch(console.error);
