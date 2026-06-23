const httpEngine = require('./http');
const CHALLENGE_KEYWORDS = [
  '加载中',
  'verify',
  'challenge',
  'cloudflare',
  'cf-',
  ' userverify',
  'just a moment',
];

function looksLikeChallenge(html) {
  if (!html || html.length < 1500) return true;
  const lower = html.toLowerCase();
  return CHALLENGE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function fetch(url, options = {}) {
  const { engine, waitFor, timeout, click, minTextLength } = options || {};

  if (engine === 'electron') {
    const ee = require('./electron');
    return ee.fetch(url, { waitFor, timeout, click, minTextLength });
  }

  const result = await httpEngine.fetch(url);
  if (!looksLikeChallenge(result.html)) {
    return result;
  }

  console.log(`[Engine] HTTP challenge detected for ${url}, falling back to Electron`);
  const ee = require('./electron');
  return ee.fetch(url, { waitFor, timeout, click, minTextLength });
}

module.exports = { fetch };
