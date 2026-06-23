/**
 * Debug: 分析 ieso.net TOC 页面结构
 */
const httpEngine = require('./crawler/engine/http');

async function main() {
  const url = 'http://www.ieso.net/read/109421/';
  console.log(`=== TOC: ${url} ===`);
  const result = await httpEngine.fetch(url);
  const cheerio = require('cheerio');
  const $ = cheerio.load(result.html);

  console.log(`title: "${$('title').text().trim()}"`);
  console.log(`h1: "${$('h1').first().text().trim()}"`);

  // 查看章节链接的模式
  console.log('\n=== 章节链接（前30个）===');
  let count = 0;
  $('a').each((_, el) => {
    if (count >= 30) return;
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && /read\/109421\/\d+\.html/.test(href) && text) {
      count++;
      console.log(`  ${count}. "${text}" -> ${href}`);
    }
  });

  // 检查是否有分页的 TOC（"下一页" 在 TOC 页面）
  console.log('\n=== TOC 分页导航 ===');
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (text && /下一页|上一页|下页|上页/.test(text)) {
      console.log(`  "${text}" -> ${href}`);
    }
  });

  // 检查章节链接的父元素结构
  console.log('\n=== 章节列表容器结构 ===');
  const firstChapterLink = $('a[href*="/read/109421/"][href$=".html"]').first();
  if (firstChapterLink.length) {
    let parent = firstChapterLink.parent();
    for (let i = 0; i < 5 && parent.length; i++) {
      const tag = parent[0].tagName;
      const cls = parent.attr('class') || '';
      const id = parent.attr('id') || '';
      console.log(`  父级 ${i}: <${tag}> class="${cls}" id="${id}"`);
      parent = parent.parent();
    }
  }

  // 列出所有带有text可能是章节的链接
  console.log('\n=== 所有含"章"字的链接（前20个）===');
  let chCount = 0;
  $('a').each((_, el) => {
    if (chCount >= 20) return;
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (text && /第.*章/.test(text)) {
      chCount++;
      console.log(`  "${text}" -> ${href}`);
    }
  });
}

main().catch(console.error);
