/**
 * Debug: 用 HTTP 引擎抓取 ieso.net 页面
 */
const httpEngine = require('./crawler/engine/http');

const URLS = [
  'http://www.ieso.net/read/109421/60172072.html',  // chapter detail
  'http://www.ieso.net/read/109421/',                 // novel TOC
];

async function main() {
  for (const url of URLS) {
    console.log(`\n=== ${url} ===`);
    try {
      const result = await httpEngine.fetch(url);
      console.log(`编码: ${result.encoding}`);
      console.log(`HTML 长度: ${result.html.length}`);
      
      const cheerio = require('cheerio');
      const $ = cheerio.load(result.html);

      console.log(`title: "${$('title').text().trim()}"`);
      console.log(`h1: "${$('h1').first().text().trim()}"`);

      // 查找导航链接
      console.log('导航链接:');
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (text && /书首页|章节目录|上一章|下一页|上一页|目录|首页/.test(text)) {
          console.log(`  "${text}" -> ${href}`);
        }
      });

      // 查找分页指示
      const bodyText = $('body').text();
      const pageMatch = bodyText.match(/[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/g);
      if (pageMatch) {
        console.log(`分页指示: ${pageMatch.join(', ')}`);
      }

      // 内容容器
      for (const sel of ['#content', '#booktxt', '#chaptercontent', '.content', '.showtxt', '#htmlContent', '.novelcontent']) {
        const el = $(sel);
        if (el.length) {
          const text = el.text().trim();
          console.log(`${sel}: ${text.length} 字符`);
        }
      }

      // 最大文本块
      let maxLen = 0, maxText = '', maxCls = '';
      $('div, section, article').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > maxLen) {
          maxLen = text.length;
          maxText = text;
          maxCls = $(el).attr('class') || $(el).attr('id') || '(none)';
        }
      });
      console.log(`最长文本块: ${maxCls} = ${maxLen} 字符`);
      console.log(`内容预览: ${maxText.substring(0, 200)}...`);

    } catch (e) {
      console.error(`失败: ${e.message}`);
    }
  }
}

main().catch(console.error);
