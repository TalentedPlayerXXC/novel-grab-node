const http = require('http');

const IPC_PORT = parseInt(process.env.ELECTRON_IPC_PORT, 10);

async function _ipcRequest(path, body, timeout) {
  if (!IPC_PORT || isNaN(IPC_PORT)) {
    throw new Error('Electron IPC not available (ELECTRON_IPC_PORT not set)');
  }

  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: IPC_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout,
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
      reject(new Error('IPC request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

/** 预热 session：访问一次目标站点，完成 Cloudflare 验证 */
async function warmup(url) {
  const result = await _ipcRequest('/warmup', { url }, 95000);
  return result.warmed === true;
}

/**
 * 发现移动端 SPA 随机域名。
 * 将 list.html URL 发送给 main 进程，由 BrowserWindow 加载并跟踪重定向链，
 * 返回最终落在随机 SPA 域名上的完整 URL。
 */
async function discoverSpaDomain(listUrl, timeout = 95000) {
  const result = await _ipcRequest('/discover-spa', { url: listUrl }, timeout);
  if (result.error) throw new Error(result.error);
  return result.spaUrl;
}

async function fetch(url, options = {}) {
  if (!IPC_PORT || isNaN(IPC_PORT)) {
    throw new Error('Electron IPC not available (ELECTRON_IPC_PORT not set)');
  }

  const crawlTimeout = options.timeout || 30000;
  const body = JSON.stringify({
    url,
    waitFor: options.waitFor || null,
    timeout: crawlTimeout,
    click: options.click || null,
    minTextLength: options.minTextLength || null,
  });

  // IPC 超时 = 爬取超时 + 缓冲（challenge 页面可能动态延长到 90s）
  const ipcTimeout = crawlTimeout + 35000;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: IPC_PORT,
        path: '/crawl',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: ipcTimeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.error) reject(new Error(result.error));
            else resolve({ html: result.html, status: 200 });
          } catch (e) {
            reject(new Error('Invalid IPC response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('IPC request timeout'));
    });
    req.write(body);
    req.end();
  });
}

module.exports = { fetch, warmup, discoverSpaDomain };
