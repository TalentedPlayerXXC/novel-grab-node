/**
 * 测试 SPA 章节分页自动拼接功能
 * 
 * 用法: node test_pagination.js
 * 测试流程:
 *   1. 调用 /api/crawl 获取目录（设置 _spaDomain + _mobileBookId）
 *   2. 调用 /api/chapter 获取章节内容（应自动拼接多页）
 *   3. 检查输出中是否包含分页日志和完整内容
 */

const http = require('http');

const SERVER = 'http://localhost:3001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, SERVER);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 120000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const novelUrl = 'https://www.bqglll.cc/look/9695/';
  // 第7章是三页的
  const chapterUrl = 'https://www.bqglll.cc/look/9695/7.html';

  console.log('=== Step 1: 抓取目录 ===');
  console.log(`URL: ${novelUrl}`);
  let dir;
  try {
    dir = await post('/api/crawl', { url: novelUrl });
    console.log(`书名: ${dir.title}`);
    console.log(`章节数: ${dir.chapters.length}`);
    console.log(`SPA 域名: ${dir.spaDomain}`);
    console.log(`移动端 book ID: ${dir.mobileBookId}`);
  } catch (e) {
    console.error(`目录抓取失败: ${e.message}`);
    process.exit(1);
  }

  console.log('\n=== Step 2: 抓取第7章（预期多页） ===');
  console.log(`URL: ${chapterUrl}`);
  try {
    const ch = await post('/api/chapter', { url: chapterUrl });
    console.log(`标题: ${ch.title}`);
    console.log(`内容长度: ${ch.content ? ch.content.length : 0}`);
    if (ch.content) {
      console.log(`内容前200字: ${ch.content.substring(0, 200).replace(/\n/g, '↵')}`);
      console.log(`内容后200字: ${ch.content.slice(-200).replace(/\n/g, '↵')}`);
      
      // 检查是否有分页标记残留
      const pageMarkers = ch.content.match(/第[\(（]\d+\s*\/\s*\d+[\)）]页/g);
      if (pageMarkers) {
        console.log(`⚠️ 内容中仍有分页标记: ${pageMarkers.join(', ')}`);
      } else {
        console.log('✓ 内容中无分页标记残留');
      }
    }
  } catch (e) {
    console.error(`章节抓取失败: ${e.message}`);
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
