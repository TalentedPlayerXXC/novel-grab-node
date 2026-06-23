/**
 * 聚合搜索协调器
 * 注册各站搜索适配器，支持并行搜索和超时控制
 */

const searchSources = {
  'bqglll.cc': require('./sources/bqglll-search'),
  // 'm.diyibanzhu1.space': require('./sources/diyibanzhu-search'),
  // 'm.diyibanzhu.website': require('./sources/diyibanzhu-search'),
  // 'm.07banzhu.store': require('./sources/diyibanzhu-search'),
  'm.snapd.net': require('./sources/snapd-search'),
  'www.bqg518.xyz': require('./sources/bqg-search'),
  'www.bqg971.xyz': require('./sources/bqg-search'),
  'www.bqg998.cc': require('./sources/bqg-search'),
  'www.bqg995.xyz': require('./sources/bqg-search'),
  'www.bqg907.cc': require('./sources/bqg-search'),
  'www.biquge.club': require('./sources/biqugeclub-search'),
  'm.biquge.us': require('./sources/biqugeus-search'),
};

const SEARCH_TIMEOUT = 12000;
const SEARCH_DEADLINE = 12000;

/**
 * 单个源搜索，带超时保护
 */
async function searchOne(sourceName, keyword) {
  const adapter = searchSources[sourceName];
  if (!adapter) {
    return { source: sourceName, items: [], error: `未知搜索源: ${sourceName}` };
  }

  try {
    const result = await Promise.race([
      adapter.search(keyword, sourceName),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('搜索超时')), SEARCH_TIMEOUT)
      ),
    ]);
    return result;
  } catch (err) {
    console.log(`[Search] ${sourceName} 搜索失败: ${err.message}`);
    return { source: sourceName, items: [], error: err.message };
  }
}

/**
 * 按适配器引用分组域名。
 * Node 模块缓存保证同路径 require 返回同一引用，可 === 判等。
 */
function groupByAdapter(targets) {
  const groups = [];
  for (const domain of targets) {
    const adapter = searchSources[domain];
    let group = groups.find((g) => g.adapter === adapter);
    if (!group) {
      group = { adapter, domains: [] };
      groups.push(group);
    }
    group.domains.push(domain);
  }
  return groups;
}

/**
 * 同适配器域名 failover：逐个尝试，首个成功立即返回。
 */
async function searchGroup(keyword, group) {
  let lastResult = { source: group.domains[0], items: [], error: null };
  for (const domain of group.domains) {
    const result = await searchOne(domain, keyword);
    if (result.items.length > 0) {
      console.log(`[Search] ${group.domains.length > 1 ? 'failover 命中 ' : ''}${domain} → ${result.items.length} 条`);
      return result;
    }
    lastResult = result;
  }
  return lastResult;
}

/**
 * 聚合搜索：组间并行，组内串行 failover。
 * @param {string} keyword - 搜索关键词
 * @param {string[]} [sourceNames] - 可选，指定搜索哪些源，不传则搜索全部
 * @returns {{ results: Array<{ source: string, items: Array, error: string|null }> }}
 */
async function searchAll(keyword, sourceNames) {
  const targets = sourceNames && sourceNames.length > 0
    ? sourceNames.filter(s => searchSources[s])
    : Object.keys(searchSources);

  if (targets.length === 0) {
    return { results: [] };
  }

  const groups = groupByAdapter(targets);
  console.log(`[Search] 开始聚合搜索 "${keyword}"，${groups.length} 组适配器，目标域: ${targets.join(', ')}`);

  const allResults = [];
  const groupPromises = groups.map(async (g) => {
    const r = await searchGroup(keyword, g);
    allResults.push(r);
    return r;
  });

  await Promise.race([
    Promise.all(groupPromises),
    new Promise((r) => setTimeout(r, SEARCH_DEADLINE)),
  ]);

  const totalItems = allResults.reduce((sum, r) => sum + r.items.length, 0);
  console.log(`[Search] 聚合搜索完成，共 ${totalItems} 条结果 (${allResults.length}/${groups.length} 组)`);

  return { results: allResults };
}

module.exports = { searchAll, searchSources, groupByAdapter, searchGroup, searchOne };
