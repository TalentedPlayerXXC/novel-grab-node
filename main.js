const { app, BrowserWindow, session, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { findFreePort } = require('./utils/find-free-port');

const VITE_PORT = 5173;
const MAX_CONCURRENT_WINDOWS = 3;
let activeWindows = 0;

// 所有爬虫 BrowserWindow 共享此 session（cookie 跨窗口复用）
let crawlerSession;

let mainWindow;
let serverProcess;
let expressPort = 3000;
let viteRunning = false;
let ipcServer;

function startServer(port, ipcPort) {
  expressPort = port;
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'pipe',
    env: { ...process.env, PORT: String(port), ELECTRON_IPC_PORT: String(ipcPort) },
  });
  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server] ${data}`);
  });
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server] ${data}`);
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.warn(`Warning: port ${port} not ready, loading anyway`);
}

async function detectVite() {
  for (let i = 0; i < 10; i++) {
    if (await checkPort(VITE_PORT)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function killServer() {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      // Grace period: force kill after 3s if process hasn't exited
      const proc = serverProcess;
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
      }, 3000).unref();
    } catch {}
    serverProcess = null;
  }
  if (ipcServer) {
    try { ipcServer.close(); } catch {}
    ipcServer = null;
  }
}

/**
 * 发现移动端 SPA 随机域名。
 * 加载 m.bqglll.cc/look/{pathId}/list.html，
 * 跟踪重定向链：list.html → /userverify + hash → Cloudflare 验证 → 随机 SPA 域名。
 * 返回 SPA 页面的最终 URL（如 https://a194cc83285032765f03a6.bqg518.xyz/#/book/184805/）。
 */
async function discoverSpaDomain(url) {
  await waitForWindowSlot();
  activeWindows++;

  if (!crawlerSession) {
    crawlerSession = session.fromPartition('persist:crawler');
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { session: crawlerSession },
  });

  try {
    win.loadURL(url);

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SPA 域名发现超时 (90s)'));
      }, 90000);

      function isSpaHost(navUrl) {
        try {
          const host = new URL(navUrl).hostname;
          return !/bqglll|verify|challenge|cloudflare/i.test(host);
        } catch {
          return false;
        }
      }

      win.webContents.on('did-navigate', (_, navUrl) => {
        console.log(`[Discover] navigated: ${navUrl}`);
        if (isSpaHost(navUrl)) {
          clearTimeout(timeout);
          resolve(navUrl);
        }
      });

      win.webContents.on('did-finish-load', () => {
        const currentUrl = win.webContents.getURL();
        console.log(`[Discover] page loaded: ${currentUrl}`);
        if (isSpaHost(currentUrl)) {
          clearTimeout(timeout);
          resolve(currentUrl);
        }
      });

      win.on('closed', () => {
        clearTimeout(timeout);
        reject(new Error('BrowserWindow 在 SPA 发现完成前关闭'));
      });
    });
  } finally {
    activeWindows--;
    if (!win.isDestroyed()) win.close();
  }
}

function createWindow() {
  const starIcon = nativeImage.createFromDataURL(
    'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#0a1628" rx="8"/>' +
      '<circle cx="18" cy="14" r="2.5" fill="#69b1ff" opacity="0.9"/>' +
      '<circle cx="42" cy="11" r="1.8" fill="#1677ff" opacity="0.7"/>' +
      '<circle cx="55" cy="28" r="2" fill="#4096ff" opacity="0.8"/>' +
      '<circle cx="12" cy="38" r="1.5" fill="#91caff" opacity="0.6"/>' +
      '<circle cx="48" cy="45" r="2.2" fill="#69b1ff" opacity="0.7"/>' +
      '<circle cx="30" cy="50" r="1.6" fill="#1677ff" opacity="0.8"/>' +
      '<circle cx="22" cy="27" r="1.2" fill="#4096ff" opacity="0.9"/>' +
      '<circle cx="40" cy="22" r="1.4" fill="#91caff" opacity="0.5"/>' +
      '<circle cx="8" cy="52" r="1" fill="#69b1ff" opacity="0.6"/>' +
      '<polygon points="32,4 35,14 45,14 37,20 40,30 32,24 24,30 27,20 19,14 29,14" fill="#69b1ff" opacity="0.9"/>' +
      '</svg>'
    )
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '一个简易的小说获取工具',
    icon: starIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--express-port=${expressPort}`],
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const url = viteRunning
    ? `http://localhost:${VITE_PORT}`
    : `http://localhost:${expressPort}`;
  console.log(`Loading ${url} (${viteRunning ? 'Vite dev' : 'Express'} mode)`);
  mainWindow.loadURL(url);
  mainWindow.on('close', killServer);
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.exit(0);
  });
}

async function waitForWindowSlot() {
  while (activeWindows >= MAX_CONCURRENT_WINDOWS) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function crawlWithBrowser(url, waitFor, timeout, click, minTextLength) {
  await waitForWindowSlot();
  activeWindows++;

  if (!crawlerSession) {
    crawlerSession = session.fromPartition('persist:crawler');
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { session: crawlerSession },
  });

  // 跟踪重定向链（调试用）
  win.webContents.on('did-navigate', (_, navUrl) => {
    if (navUrl !== url) {
      console.log(`[Crawl] redirect: ${navUrl}`);
    }
  });

  try {
    const baseTime = timeout || 30000;
    let maxTime = baseTime;
    let extendedOnce = false;

    win.loadURL(url);

    // ── 模拟点击：在目录页点击章节链接，等待导航到章节页 ──
    if (click) {
      // 等待目录页加载完成
      await new Promise((resolve) => {
        const handler = () => { win.webContents.removeListener('did-finish-load', handler); resolve(); };
        win.webContents.on('did-finish-load', handler);
      });

      const beforeUrl = win.webContents.getURL();
      console.log(`[Crawl] 目录页已加载: ${beforeUrl}`);
      console.log(`[Crawl] 执行点击: ${click}`);

      const clicked = await win.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(click)});
          if (el) { el.click(); return true; }
          return false;
        })()
      `);

      if (!clicked) {
        throw new Error(`点击选择器未找到元素: ${click}`);
      }

      // 等待导航到章节页（URL 变化 + 页面加载完成）
      await new Promise((resolve, reject) => {
        const navTimeout = setTimeout(() => reject(new Error('点击后页面导航超时（30秒）')), 30000);

        const navHandler = (_, navUrl) => {
          if (navUrl !== beforeUrl) {
            clearTimeout(navTimeout);
            win.webContents.removeListener('did-navigate', navHandler);
            win.webContents.removeListener('did-finish-load', loadHandler);
            resolve();
          }
        };
        win.webContents.on('did-navigate', navHandler);

        const loadHandler = () => {
          const currentUrl = win.webContents.getURL();
          if (currentUrl !== beforeUrl) {
            clearTimeout(navTimeout);
            win.webContents.removeListener('did-navigate', navHandler);
            win.webContents.removeListener('did-finish-load', loadHandler);
            resolve();
          }
        };
        win.webContents.on('did-finish-load', loadHandler);
      });

      console.log(`[Crawl] 已导航到章节页: ${win.webContents.getURL()}`);
    }

    return await new Promise((resolve, reject) => {
      let done = false;
      const poll = setInterval(check, 500);
      let failTimer = setTimeout(onTimeout, maxTime);

      function onTimeout() {
        if (!done) { done = true; clearInterval(poll); reject(new Error('Timeout')); }
      }

      win.webContents.on('did-finish-load', check);
      win.on('closed', () => {
        if (!done) { done = true; clearInterval(poll); clearTimeout(failTimer); reject(new Error('closed')); }
      });

      async function check() {
        if (done) return;
        if (win.isDestroyed()) {
          done = true; clearInterval(poll); clearTimeout(failTimer);
          reject(new Error('BrowserWindow was destroyed'));
          return;
        }
        try {
          const result = await win.webContents.executeJavaScript(`
            (() => {
              const sel = ${JSON.stringify(waitFor)};
              const minLen = ${typeof minTextLength === 'number' ? minTextLength : 0};
              if (sel) {
                const els = document.querySelectorAll(sel);
                if (els.length === 0) return null;
                if (minLen > 0) {
                  let found = false;
                  for (const el of els) {
                    if ((el.textContent || '').trim().length >= minLen) { found = true; break; }
                  }
                  if (!found) return null;
                }
              }
              return { html: document.documentElement.outerHTML, title: document.title };
            })()
          `);
          if (result) {
            done = true;
            clearInterval(poll);
            clearTimeout(failTimer);
            resolve(result);
          } else {
            // 选择器未找到 — 检测是否在验证/挑战页面，如果是则延长超时
            if (!extendedOnce) {
              const pageUrl = win.webContents.getURL();
              if (/verify|challenge|cloudflare/i.test(pageUrl)) {
                console.log(`[Crawl] on challenge page (${pageUrl}), extending timeout`);
                clearTimeout(failTimer);
                maxTime = Math.max(baseTime, 90000);
                failTimer = setTimeout(onTimeout, maxTime - baseTime);
                extendedOnce = true;
              }
            }
          }
        } catch {}
      }
    });
  } finally {
    activeWindows--;
    if (!win.isDestroyed()) win.close();
  }
}

async function warmupBrowser(url) {
  await waitForWindowSlot();
  activeWindows++;

  if (!crawlerSession) {
    crawlerSession = session.fromPartition('persist:crawler');
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { session: crawlerSession },
  });

  try {
    win.loadURL(url);
    return await new Promise((resolve, reject) => {
      let done = false;

      const timeout = setTimeout(() => {
        if (!done) { done = true; resolve(false); }
      }, 90000);

      win.webContents.on('did-navigate', (_, navUrl) => {
        if (done) return;
        console.log(`[Warmup] navigated: ${navUrl}`);
        // Cloudflare 验证通过后，页面会从 verify/userverify 跳回目标页面
        if (!/verify|challenge|cloudflare/i.test(navUrl)) {
          console.log('[Warmup] challenge passed');
          done = true;
          clearTimeout(timeout);
          resolve(true);
        }
      });

      win.webContents.on('did-finish-load', () => {
        if (done) return;
        const currentUrl = win.webContents.getURL();
        console.log(`[Warmup] page loaded: ${currentUrl}`);
        if (!/verify|challenge|cloudflare/i.test(currentUrl)) {
          console.log('[Warmup] no challenge detected');
          done = true;
          clearTimeout(timeout);
          resolve(true);
        }
      });

      win.on('closed', () => {
        if (!done) { done = true; clearTimeout(timeout); resolve(false); }
      });
    });
  } finally {
    activeWindows--;
    if (!win.isDestroyed()) win.close();
  }
}

app.name = '一个简易的小说获取工具';

app.whenReady().then(async () => {
  ipcServer = http.createServer((req, res) => {
    // warmup 路由：预热 session，完成 Cloudflare 验证
    if (req.method === 'POST' && req.url === '/warmup') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { url } = JSON.parse(body);
          if (!url) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'url is required' }));
          }
          console.log(`[Warmup] starting warmup for ${url}`);
          const ok = await warmupBrowser(url);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ warmed: ok }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // discover-spa 路由：发现移动端 SPA 随机域名
    if (req.method === 'POST' && req.url === '/discover-spa') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const { url } = JSON.parse(body);
          if (!url) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'url is required' }));
          }
          console.log(`[Discover] starting SPA domain discovery for ${url}`);
          const spaUrl = await discoverSpaDomain(url);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ spaUrl }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/crawl') {
      res.writeHead(404);
      return res.end();
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
      try {
        const { url, waitFor, timeout, click, minTextLength } = parsed;
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'url is required' }));
        }
        const result = await crawlWithBrowser(url, waitFor, timeout, click || null, minTextLength);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  await new Promise((resolve) => ipcServer.listen(0, '127.0.0.1', resolve));
  const ipcPort = ipcServer.address().port;

  const freePort = await findFreePort(3000);
  startServer(freePort, ipcPort);
  viteRunning = await detectVite();
  const targetPort = viteRunning ? VITE_PORT : freePort;
  await waitForServer(targetPort);
  createWindow();
});

app.on('window-all-closed', () => app.exit(0));
app.on('before-quit', killServer);
