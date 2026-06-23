/**
 * 调试：查看 bqglll SPA 页面原始内容中是否包含分页标记
 * 直接通过 Electron IPC 获取 HTML，不做 cheerio 处理
 */

const http = require('http');

// 读取 ELECTRON_IPC_PORT
const cp = require('child_process');
const port = cp.execSync('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep node | grep -v Vite | head -1 | awk \'{print $9}\' | cut -d: -f2').toString().trim();

if (!port) {
  console.error('找不到 Electron IPC 端口。请确保 Electron 应用正在运行。');
  process.exit(1);
}

// 先用 API 获取目录
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
  // Step 1: 获取目录
  console.log('获取目录...');
  const dir = await post('/api/crawl', { url: 'https://www.bqglll.cc/look/9695/' });
  console.log(`SPA: ${dir.spaDomain}, bookId: ${dir.mobileBookId}`);

  // Step 2: 直接用 Electron IPC 获取第7章的原始 HTML
  const spaUrl = `${dir.spaDomain}/#/book/${dir.mobileBookId}/7.html`;
  console.log(`\n获取 SPA 页面原始 HTML: ${spaUrl}`);

  const body = JSON.stringify({
    url: spaUrl,
    waitFor: null,
    timeout: 60000,
    minTextLength: 100,
  });

  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: parseInt(port),
        path: '/crawl',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 95000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid IPC response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('IPC timeout'));
    });
    req.write(body);
    req.end();
  });

  if (result.error) {
    console.error(`错误: ${result.error}`);
    process.exit(1);
  }

  const html = result.html;
  console.log(`HTML 长度: ${html.length}`);

  // 搜索分页标记
  const pageMatch = html.match(/第[\(（]\d+\s*\/\s*\d+[\)）]页/g);
  if (pageMatch) {
    console.log(`✅ 找到分页标记: ${pageMatch.join(', ')}`);
  } else {
    console.log('❌ HTML 中未找到分页标记(第X/Y页)');
  }

  // 搜索 "readinline" class
  const readInline = html.match(/readinline[^>]*>([^<]*)</g);
  if (readInline) {
    console.log(`\nreadinline 内容: ${readInline.join('\n')}`);
  }

  // 输出 #chaptercontent 附近的内容片段
  const contentMatch = html.match(/chaptercontent[^>]*>([\s\S]*?)(?=<\/div>)/);
  if (contentMatch) {
    console.log(`\n#chaptercontent 片段 (前500字):`);
    console.log(contentMatch[1].substring(0, 500));
  }

  // 搜索任何分页相关文本
  const pageTexts = html.match(/(?:本章未完|下一页|下页|翻页|第[一二三\d]+页)/g);
  if (pageTexts) {
    console.log(`\n分页相关文本: ${pageTexts.join(', ')}`);
  }
}

main().catch(console.error);
