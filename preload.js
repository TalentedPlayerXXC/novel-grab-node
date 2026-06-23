const { contextBridge } = require('electron');

const port = process.argv
  .find((arg) => arg.startsWith('--express-port='))
  ?.split('=')[1];

const API_BASE = port ? `http://localhost:${port}` : '';

contextBridge.exposeInMainWorld('api', {
  crawl: (url) =>
    fetch(`${API_BASE}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).then((r) => r.json()),
  getChapter: (url, title) =>
    fetch(`${API_BASE}/api/chapter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    }).then((r) => r.json()),
  search: (keyword, sources) =>
    fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, sources }),
    }).then((r) => r.json()),
  searchStream: async (keyword, sources, onProgress) => {
    const r = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, sources }),
    });
    const text = await r.text();
    const lines = text.trim().split('\n');
    let final;
    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.complete) { final = data; break; }
      onProgress?.(data);
    }
    return final;
  },
});
