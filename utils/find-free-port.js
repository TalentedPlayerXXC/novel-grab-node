const net = require('net');

/**
 * 从 start 端口开始扫描，返回第一个可用端口。
 * @param {number} start - 起始端口号
 * @param {number} [range=100] - 最多扫描的端口数量
 * @returns {Promise<number>} 可用端口号
 * @throws {Error} 范围内无可用端口时抛出
 */
async function findFreePort(start, range = 100) {
  for (let port = start; port < start + range; port++) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      server.on('error', () => resolve(false));
    });
    if (free) return port;
  }
  throw new Error(`No free port found in range ${start}-${start + range - 1}`);
}

module.exports = { findFreePort };
