const express = require('express');
const path = require('path');
const fs = require('fs');
const { crawlNovel, crawlChapter } = require('./crawler');
const { searchAll, searchSources, groupByAdapter, searchGroup } = require('./crawler/search');
const { findFreePort } = require('./utils/find-free-port');

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

function validateUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('URL is required');
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('无效的URL格式');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http/https 协议');
  }
  const hostname = parsed.hostname;
  if (BLOCKED_HOSTS.includes(hostname)) {
    throw new Error('不允许访问本地地址');
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
    throw new Error('不允许访问内网地址');
  }
  return urlStr;
}

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.post('/api/crawl', async (req, res) => {
  try {
    const { url } = req.body;
    const validUrl = validateUrl(url);
    const result = await crawlNovel(validUrl);
    res.json(result);
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: '请求超时，目标网站10秒内未响应，请检查网络或更换URL' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapter', async (req, res) => {
  try {
    const { url, title } = req.body;
    const validUrl = validateUrl(url);
    const result = await crawlChapter(validUrl, title);
    res.json(result);
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: '请求超时，目标网站10秒内未响应' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const { keyword, sources } = req.body;
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length < 2) {
      return res.status(400).json({ error: '搜索关键词至少2个字符' });
    }

    const kw = keyword.trim();
    const targets = sources && sources.length > 0
      ? sources.filter(s => searchSources[s])
      : Object.keys(searchSources);

    if (targets.length === 0) {
      return res.json({ results: [] });
    }

    const groups = groupByAdapter(targets);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const allResults = [];
    await Promise.all(groups.map(async (g) => {
      const r = await searchGroup(kw, g);
      allResults.push(r);
      res.write(JSON.stringify({ partial: r, done: allResults.length, total: groups.length }) + '\n');
    }));

    res.write(JSON.stringify({ complete: true, results: allResults }) + '\n');
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function start() {
  const preferred = parseInt(process.env.PORT, 10) || 3000;
  const port = await findFreePort(preferred);
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

start();
