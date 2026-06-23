const httpEngine = require('./crawler/engine/http');

(async () => {
  const sites = ['m.diyibanzhu.website', 'm.diyibanzhu1.space'];
  const keywords = ['凡人', '仙逆', '斗破'];
  
  for (const site of sites) {
    for (const kw of keywords) {
      try {
        const formData = { objectType: '2', wd: kw };
        const result = await httpEngine.fetchPost('https://' + site + '/wap.php?action=search', formData, { formEncoding: 'gbk' });
        const match = result.html.match(/共\s*\d+\s*页[\/／]\s*(\d+)\s*条记录/);
        const records = match ? match[1] : '?';
        console.log(site + ' | "' + kw + '" → ' + records + ' records');
      } catch(e) {
        console.log(site + ' | "' + kw + '" → ERROR: ' + e.message);
      }
      // Small delay between requests
      await new Promise(r => setTimeout(r, 500));
    }
  }
})();
