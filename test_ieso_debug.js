/**
 * Debug: 抓取 ieso.net 章节页面 HTML 结构，用于分析 DOM 布局
 */

const engine = require('./crawler/engine');

const CHAPTER_URL = 'http://www.ieso.net/read/109421/60172072.html';

async function main() {
  console.log('=== Fetching ieso.net chapter via Electron ===');
  console.log(`URL: ${CHAPTER_URL}\n`);

  try {
    const { html } = await engine.fetch(CHAPTER_URL, {
      engine: 'electron',
      waitFor: 'body',
      timeout: 30000,
      minTextLength: 50,
    });

    console.log(`HTML 长度: ${html.length}`);
    console.log(`\n=== 原始 HTML (前 3000 字符) ===\n`);
    console.log(html.substring(0, 3000));
    
    console.log(`\n\n=== HTML (尾 2000 字符) ===\n`);
    console.log(html.substring(Math.max(0, html.length - 2000)));

    // 用 cheerio 分析关键结构
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    console.log(`\n\n=== DOM 结构分析 ===\n`);

    // 1. 标题
    const h1 = $('h1').first();
    console.log(`h1: "${h1.text().trim()}"`);

    // 2. 分页指示器 - "（1 / 2）" 模式
    const bodyText = $('body').text();
    const pageMatch = bodyText.match(/[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/);
    if (pageMatch) {
      console.log(`分页指示器: 第 ${pageMatch[1]}/${pageMatch[2]} 页`);
    }

    // 3. 导航链接
    console.log('\n导航链接:');
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (text && /书首页|章节目录|上一章|下一页|上一页|目录/.test(text)) {
        console.log(`  "${text}" -> ${href}`);
      }
    });

    // 4. 内容区域 - 列出所有可能的内容容器
    console.log('\n内容区域候选:');
    const selectors = [
      '#content', '#booktxt', '#chaptercontent', '.content', '.showtxt',
      '[id*="content" i]', '[class*="content" i]',
      '[id*="booktxt" i]', '[class*="booktxt" i]',
      '#htmlContent', '.article', '.novel',
    ];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length) {
        const text = el.text().trim();
        console.log(`  ${sel}: 匹配 ${el.length} 个, 文本长度 ${text.length}`);
        if (text.length > 50 && text.length < 500) {
          console.log(`    内容: ${text.substring(0, 200)}...`);
        }
      }
    }

    // 5. 查找所有 div 中文本最长的
    console.log('\n最大文本块 (div):');
    let maxDiv = { len: 0, text: '', cls: '' };
    $('div, section, article').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > maxDiv.len) {
        maxDiv = { len: text.length, text, cls: $(el).attr('class') || $(el).attr('id') || '' };
      }
    });
    console.log(`  最长: class/id="${maxDiv.cls}", 长度 ${maxDiv.len}`);
    console.log(`  内容预览: ${maxDiv.text.substring(0, 300)}...`);

    // 6. 检查是否有 page 参数的分页链接
    console.log('\n分页链接 (带 page= 参数):');
    $('a[href*="page="]').each((_, el) => {
      console.log(`  ${$(el).text().trim()} -> ${$(el).attr('href')}`);
    });

    // 7. 查看 head/title
    console.log(`\ntitle: "${$('title').text().trim()}"`);

  } catch (e) {
    console.error(`抓取失败: ${e.message}`);
    console.error(e.stack);
  }
}

main().catch(console.error);
