/**
 * Debug v2: Warm up session first, then crawl with longer timeout.
 */
const http = require('http');
const cheerio = require('cheerio');

const IPC_PORT = parseInt(process.env.ELECTRON_IPC_PORT, 10) || 56591;
const KEYWORD = '凡人修仙传';

function ipcRequest(path, body, timeout) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port: IPC_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON')); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`IPC port: ${IPC_PORT}`);

  // Step 1: Warm up
  console.log('\n=== Step 1: Warm up session ===');
  try {
    const warmupUrl = 'https://m.bqglll.cc/';
    console.log(`Warming up: ${warmupUrl}`);
    const warmResult = await ipcRequest('/warmup', { url: warmupUrl }, 120000);
    console.log(`Warmup result: ${JSON.stringify(warmResult)}`);
  } catch (e) {
    console.log(`Warmup failed (continuing anyway): ${e.message}`);
  }

  // Step 2: Crawl search page
  console.log('\n=== Step 2: Crawl search page ===');
  const searchUrl = `https://m.bqglll.cc/s?q=${encodeURIComponent(KEYWORD)}`;
  console.log(`URL: ${searchUrl}`);

  try {
    const result = await ipcRequest('/crawl', { url: searchUrl, waitFor: 'div.item', timeout: 60000 }, 120000);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      process.exit(1);
    }

    const html = result.html;
    console.log(`HTML length: ${html.length}`);
    console.log(`title: ${result.title || 'N/A'}`);

    const $ = cheerio.load(html);

    // Check title
    console.log(`document.title: "${$('title').text()}"`);

    // Find div.item
    const itemDivs = $('div.item');
    console.log(`\ndiv.item found: ${itemDivs.length}`);

    // Check all elements with 'item' in any attribute
    const allClassItems = $('[class*="item"]');
    console.log(`[class*="item"]: ${allClassItems.length}`);

    // Print all element tags that have item in class
    const itemClasses = new Set();
    $('[class]').each((_, el) => {
      const cls = $(el).attr('class') || '';
      cls.split(/\s+/).forEach(c => { if (/item/i.test(c)) itemClasses.add(`${el.tagName}.${c}`); });
    });
    console.log(`Item-related elements: ${[...itemClasses].join(', ')}`);

    // Check for typical book link patterns
    console.log('\n--- Link patterns ---');
    ['a[href*="/look/"]', 'a[href*="/book/"]', 'a[href*="list.html"]', 'a[href*="/novel/"]'].forEach(p => {
      console.log(`  ${p}: ${$(p).length}`);
    });

    // Dump all links with text
    const links = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({ text: text.slice(0, 60), href: href.slice(0, 80) });
      }
    });
    console.log(`\nTotal links: ${links.length}`);
    links.slice(0, 30).forEach((l, i) => {
      console.log(`  [${i}] "${l.text}" -> ${l.href}`);
    });

    // Print body text
    const bodyText = $('body').text().trim().slice(0, 3000);
    console.log(`\nbody text (first 3000 chars):\n${bodyText}`);

    // Print first 5000 chars of HTML
    console.log('\n--- Raw HTML (first 5000 chars) ---');
    console.log(html.slice(0, 5000));

  } catch (e) {
    console.log(`Exception: ${e.message}`);
    console.log(e.stack);
  }
}

main();
