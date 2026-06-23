const axios = require('axios');
const iconv = require('iconv-lite');

const TIMEOUT = 15000;

/**
 * 从 Content-Type header 或 HTML meta 标签中检测编码。
 * 返回 iconv-lite 可用的编码名称，若无法确定则返回 'utf-8'。
 */
function detectEncoding(buffer, contentType) {
  // 1. 优先从 Content-Type header 中提取 charset
  if (contentType) {
    const match = contentType.match(/charset=([^\s;]+)/i);
    if (match) {
      const enc = match[1].toLowerCase().replace(/["']/g, '');
      if (enc === 'gb2312') return 'gbk'; // iconv-lite 用 gbk 覆盖 gb2312
      return enc;
    }
  }

  // 2. 从 HTML 前 1024 字节中查找 <meta charset> 或 <meta http-equiv>
  const head = iconv.decode(buffer.slice(0, 1024), 'utf-8');
  const metaCharset = head.match(/<meta[^>]+charset=["']?\s*([^\s"';]+)/i);
  if (metaCharset) {
    const enc = metaCharset[1].toLowerCase();
    if (enc === 'gb2312') return 'gbk';
    return enc;
  }

  return 'utf-8';
}

async function fetch(url) {
  const resp = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: TIMEOUT,
    maxRedirects: 5,
    responseType: 'arraybuffer',
  });

  const buffer = Buffer.from(resp.data);
  const contentType = resp.headers['content-type'] || '';
  const encoding = detectEncoding(buffer, contentType);

  let html;
  try {
    html = iconv.decode(buffer, encoding);
  } catch {
    // 编码不支持时回退 utf-8
    html = iconv.decode(buffer, 'utf-8');
  }

  return { html, status: resp.status };
}

/**
   * 将字符串按 GBK 编码后做 URL 编码（每字节转为 %XX）
   */
  function gbkUrlEncode(str) {
    const gbkBytes = iconv.encode(str, 'gbk');
    return Array.from(gbkBytes)
      .map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0'))
      .join('');
  }

  /**
   * POST 表单（application/x-www-form-urlencoded）。
   * 支持 formEncoding: 'gbk' 将字段值按 GBK 编码后再 URL-encode。
   */
  async function fetchPost(url, formData, options = {}) {
    const { formEncoding, headers: extraHeaders } = options;

    // 构造表单 body
    const parts = [];
    for (const [key, value] of Object.entries(formData)) {
      const encodedValue =
        formEncoding === 'gbk'
          ? gbkUrlEncode(String(value))
          : encodeURIComponent(String(value));
      parts.push(encodeURIComponent(key) + '=' + encodedValue);
    }
    const body = parts.join('&');

    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(extraHeaders || {}),
      },
      timeout: TIMEOUT,
      maxRedirects: 5,
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(resp.data);
    const contentType = resp.headers['content-type'] || '';
    const encoding = detectEncoding(buffer, contentType);

    let html;
    try {
      html = iconv.decode(buffer, encoding);
    } catch {
      html = iconv.decode(buffer, 'utf-8');
    }

    return { html, status: resp.status };
  }

  module.exports = { fetch, fetchPost, gbkUrlEncode };
