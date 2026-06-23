const httpEngine = require('./crawler/engine/http');

async function main() {
  const url = 'http://www.ieso.net/read/109421/';
  console.log(`=== TOC: ${url} ===`);
  const result = await httpEngine.fetch(url);
  console.log(`result keys:`, Object.keys(result));
  console.log(`encoding: ${result.encoding}`);
  console.log(`HTML length: ${result.html.length}`);
  console.log(`HTML content:`, result.html);
  console.log(`status: ${result.status}`);
}

main().catch(console.error);
