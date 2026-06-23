const httpEngine = require('./crawler/engine/http');

async function main() {
  const chapterUrl = 'http://www.ieso.net/read/109421/60172072.html';
  console.log(`=== Chapter: ${chapterUrl} ===`);
  const result = await httpEngine.fetch(chapterUrl);
  console.log(`encoding: ${result.encoding}`);
  console.log(`HTML length: ${result.html.length}`);
  console.log(`status: ${result.status}`);
  if (result.html.length > 100) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(result.html);
    console.log(`h1: "${$('h1').first().text().trim()}"`);
    console.log(`.content 长度: ${$('.content').text().trim().length}`);
  }
}

main().catch(console.error);
