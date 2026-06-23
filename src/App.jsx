import { useState, useRef, useEffect, useCallback } from 'react';
import { Layout, Input, InputNumber, List, Typography, message, Alert, Modal, Button, Progress, Collapse, Avatar, Tooltip, ConfigProvider, theme } from 'antd';
import { BookOutlined, DownloadOutlined, LinkOutlined, SearchOutlined, SettingOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import Settings from './Settings';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph } = Typography;

const THEME_KEY = 'novel-grab-theme';

const api = window.api || {
  crawl: (url) =>
    fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).then((r) => r.json()),
  getChapter: (url, title) =>
    fetch('/api/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    }).then((r) => r.json()),
  search: (keyword, sources) =>
    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, sources }),
    }).then((r) => r.json()),
  searchStream: async (keyword, sources, onProgress) => {
    const r = await fetch('/api/search', {
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
};

const chapterCache = new Map();
const searchCache = new Map();
const SEARCH_CACHE_MAX_AGE = 30 * 60 * 1000;

function getSearchCacheSizeMB() {
  let total = 0;
  for (const [, v] of searchCache) {
    total += JSON.stringify(v).length;
  }
  return (total / (1024 * 1024)).toFixed(2);
}

const DOWNLOAD_CONCURRENCY = 3;

async function downloadChaptersConcurrently(chapters, getChapter, onProgress, cancelRef) {
  const results = new Array(chapters.length);
  let nextIndex = 0;

  async function worker(workerId) {
    if (workerId > 0) {
      await new Promise((r) => setTimeout(r, workerId * 500));
    }
    while (nextIndex < chapters.length) {
      if (cancelRef.current) return;
      const i = nextIndex++;
      const chapter = chapters[i];

      if (chapterCache.has(chapter.url)) {
        results[i] = { success: true, ...chapterCache.get(chapter.url) };
      } else {
        try {
          const data = await getChapter(chapter.url, chapter.title);
          if (data.error || !data.content) {
            results[i] = { success: false, error: data.error || '内容为空', fallbackTitle: chapter.title };
          } else {
            const cached = { title: data.title, content: data.content };
            chapterCache.set(chapter.url, cached);
            results[i] = { success: true, ...cached };
          }
        } catch (err) {
          results[i] = { success: false, error: err.message, fallbackTitle: chapter.title };
        }
      }
      onProgress(i + 1, chapters.length);
    }
  }

  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, chapters.length) }, (_, id) => worker(id));
  await Promise.all(workers);
  return results;
}

const STAR_SKY_CSS = `
.mode-btn {
  position: relative;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.3s ease;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.55);
  font-size: 16px;
}
.mode-btn:hover { color: #fff; background: rgba(255,255,255,0.15); }
.mode-btn.active {
  color: #fff;
  background: rgba(24,144,255,0.35);
  box-shadow: 0 0 14px rgba(24,144,255,0.35);
}
.mode-btn .star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #69b1ff;
  top: 50%;
  left: 50%;
  margin-top: -1.5px;
  margin-left: -1.5px;
  opacity: 0;
}
.mode-btn.active .star {
  animation: star-orbit var(--dur, 2s) linear infinite;
  animation-delay: var(--delay, 0s);
  opacity: var(--op, 0.7);
}
@keyframes star-orbit {
  0%   { transform: rotate(var(--start, 0deg)) translateX(var(--r, 20px)) rotate(calc(-1 * var(--start, 0deg))); }
  100% { transform: rotate(calc(var(--start, 0deg) + 360deg)) translateX(var(--r, 20px)) rotate(calc(-1 * (var(--start, 0deg) + 360deg))); }
}
.mode-btn.active .star-pulse {
  animation: star-pulse 3s ease-in-out infinite;
  animation-delay: var(--delay, 0s);
}
@keyframes star-pulse {
  0%, 100% { opacity: 0.3; transform: rotate(var(--start, 0deg)) translateX(var(--r, 20px)) rotate(calc(-1 * var(--start, 0deg))) scale(0.6); }
  50%      { opacity: 1;   transform: rotate(var(--start, 0deg)) translateX(var(--r, 20px)) rotate(calc(-1 * var(--start, 0deg))) scale(1.4); }
}
`;

function StarDots() {
  const configs = [
    { r: 22, start: 0,   dur: '2.4s', delay: '0s',   op: 0.8, cls: 'star' },
    { r: 18, start: 110, dur: '3.0s', delay: '0.3s', op: 0.5, cls: 'star star-pulse' },
    { r: 26, start: 220, dur: '2.0s', delay: '0.6s', op: 0.6, cls: 'star' },
    { r: 20, start: 330, dur: '2.8s', delay: '0.9s', op: 0.4, cls: 'star star-pulse' },
  ];
  return (
    <>
      {configs.map((c, i) => (
        <span
          key={i}
          className={c.cls}
          style={{ '--r': `${c.r}px`, '--start': `${c.start}deg`, '--dur': c.dur, '--delay': c.delay, '--op': c.op }}
        />
      ))}
    </>
  );
}

const LOADING_CSS = `
.starry-wrap {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  padding: 40px 0;
}
.starry-field {
  position: relative; width: 100px; height: 100px;
}
.starry-orbit {
  position: absolute; top: 50%; left: 50%;
  width: calc(var(--r) * 1px); height: calc(var(--r) * 1px);
  margin-left: calc(var(--r) * -0.5px);
  margin-top: calc(var(--r) * -0.5px);
  border: 1px solid rgba(24,144,255,var(--alpha,0.14));
  border-radius: 50%;
  animation: orbit-spin 6s linear infinite;
  animation-delay: var(--d);
}
.starry-planet {
  position: absolute; width: 4px; height: 4px; border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c), 0 0 16px var(--c);
  animation: planet-orbit calc(var(--t) * 1s) linear infinite;
  animation-delay: var(--d);
  top: -2px; left: calc(50% - 2px);
}
@keyframes orbit-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes planet-orbit {
  0%   { transform: rotate(0deg) translateX(calc(var(--r) * 0.5px)) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(calc(var(--r) * 0.5px)) rotate(-360deg); }
}
.starry-text {
  color: var(--ant-color-text-secondary);
  font-size: 14px;
  animation: text-pulse 2s ease-in-out infinite;
}
@keyframes text-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`;

function StarryLoading({ text }) {
  const { token } = theme.useToken();
  const isDark = token.colorBgContainer !== '#ffffff';
  const borderAlpha = isDark ? '0.18' : '0.14';
  const orbits = [
    { r: 90, d: '0s', t: 3.5, c: '#0958d9' },
    { r: 64, d: '0.4s', t: 2.8, c: '#1677ff' },
    { r: 42, d: '0.8s', t: 2.2, c: '#4096ff' },
    { r: 24, d: '0.2s', t: 1.6, c: '#69b1ff' },
  ];
  return (
    <div className="starry-wrap">
      <style dangerouslySetInnerHTML={{ __html: LOADING_CSS }} />
      <div className="starry-field" style={{ '--alpha': borderAlpha }}>
        {orbits.map((o, i) => (
          <div key={i} className="starry-orbit" style={{ '--r': o.r, '--d': o.d, '--alpha': borderAlpha }}>
            <div className="starry-planet" style={{ '--r': o.r, '--d': o.d, '--t': o.t, '--c': o.c }} />
          </div>
        ))}
      </div>
      <div className="starry-text">{text || '加载中...'}</div>
    </div>
  );
}

function ModeSwitcher({ mode, onSwitch, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginRight: 8, opacity: disabled ? 0.4 : 1, transition: 'opacity 0.3s' }}>
      <style dangerouslySetInnerHTML={{ __html: STAR_SKY_CSS }} />
      <Tooltip title={disabled ? '搜索中，暂时不可操作' : 'URL抓取模式：粘贴小说目录页链接直接抓取章节'} placement="bottom">
        <div
          className={`mode-btn${mode === 'url' ? ' active' : ''}`}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          onClick={() => !disabled && onSwitch('url')}
        >
          <LinkOutlined />
          {mode === 'url' && !disabled && <StarDots />}
        </div>
      </Tooltip>
      <Tooltip title={disabled ? '搜索中，暂时不可操作' : '聚合搜索模式：输入小说名跨多个书源搜索'} placement="bottom">
        <div
          className={`mode-btn${mode === 'search' ? ' active' : ''}`}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          onClick={() => !disabled && onSwitch('search')}
        >
          <SearchOutlined />
          {mode === 'search' && !disabled && <StarDots />}
        </div>
      </Tooltip>
    </div>
  );
}

function DisclaimerModal({ open, onAgree, onDisagree }) {
  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      width={480}
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <ExclamationCircleOutlined style={{ fontSize: 42, color: '#1677ff' }} />
        <Title level={4} style={{ marginTop: 10, marginBottom: 0 }}>用户须知与免责声明</Title>
      </div>
      <Paragraph style={{ lineHeight: 2, fontSize: 14, marginBottom: 0 }}>
        本软件仅供<b>个人学习、测试和研究</b>使用，严禁用于任何商业用途。
      </Paragraph>
      <ul style={{ paddingLeft: 20, lineHeight: 2.2, color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
        <li>用户应遵守所在地法律法规，尊重原创作者的著作权及相关权益。</li>
        <li>本软件不存储、不传播任何小说内容，仅为用户提供网页内容检索与阅读辅助。</li>
        <li>使用本软件获取的任何内容均来自公开的网络资源，开发者不对其合法性、准确性负责。</li>
        <li>因使用本软件产生的任何法律纠纷或损失，由用户自行承担，开发者不承担任何责任。</li>
        <li>如果内容权利方认为本软件侵犯了您的权益，请联系开发者进行整改或移除。</li>
      </ul>
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button block onClick={onDisagree}>不同意，退出程序</Button>
        <Button type="primary" block onClick={onAgree}>我已阅读并同意</Button>
      </div>
    </Modal>
  );
}

function AppInner() {
  const { token } = theme.useToken();
  const isDark = token.colorBgContainer !== '#ffffff';

  const [mode, setMode] = useState('search');
  const [url, setUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const cancelRef = useRef(false);
  const [dlStart, setDlStart] = useState(1);
  const [dlEnd, setDlEnd] = useState(1);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cacheTick, setCacheTick] = useState(0);

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(() => {
    try { return localStorage.getItem('novel-grab-disclaimer') === 'true'; } catch { return false; }
  });

  const handleError = (msg) => {
    if (/超时|timeout/i.test(msg)) {
      Modal.error({
        title: '请求超时',
        content: msg + '\n\n目标网站响应超过10秒，请检查网络或更换URL',
      });
    } else {
      message.error(msg);
    }
  };

  const doCrawl = async (targetUrl) => {
    setCrawling(true);
    setError('');
    setNovel(null);
    setChapters([]);
    setContent('');
    try {
      const data = await api.crawl(targetUrl);
      if (data.error) {
        setError(data.error);
        handleError(data.error);
        return;
      }
      setNovel(data);
      setChapters(data.chapters);
      message.success(`成功抓取 ${data.chapters.length} 章`);
    } catch (err) {
      const msg = '网络请求失败: ' + err.message;
      setError(msg);
      handleError(msg);
    } finally {
      setCrawling(false);
    }
  };

  const handleCrawl = () => {
    if (!url.trim()) {
      message.warning('请输入URL');
      return;
    }
    doCrawl(url.trim());
  };

  const handleSearch = async (keyword) => {
    const kw = (keyword || searchKeyword).trim();
    if (!kw || kw.length < 2) {
      message.warning('搜索关键词至少2个字符');
      return;
    }
    setSearchKeyword(kw);

    const cached = searchCache.get(kw);
    if (cached && (Date.now() - cached.timestamp) < SEARCH_CACHE_MAX_AGE) {
      setSearchResults(cached.results);
      setSearchError('');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchResults([]);

    const accumulated = [];
    try {
      const finalData = await api.searchStream(kw, null, ({ partial }) => {
        accumulated.push(partial);
        setSearchResults([...accumulated]);
      });

      if (finalData && finalData.complete) {
        searchCache.set(kw, { results: finalData.results, timestamp: Date.now() });
      }
    } catch (err) {
      setSearchError('搜索失败: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchResultClick = (itemUrl) => {
    setMode('url');
    setUrl(itemUrl);
    doCrawl(itemUrl);
  };

  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    setSearchError('');
  };

  const handleChapterClick = async (chapterUrl, chapterTitle) => {
    if (chapterCache.has(chapterUrl)) {
      const cached = chapterCache.get(chapterUrl);
      setContent(cached.content);
      setError('');
      return;
    }

    setChapterLoading(true);
    setContent('');
    setError('');
    try {
      const data = await api.getChapter(chapterUrl, chapterTitle);
      if (data.error) {
        setError(data.error);
        handleError(data.error);
        return;
      }
      chapterCache.set(chapterUrl, { title: data.title, content: data.content });
      setContent(data.content);
    } catch (err) {
      setError('章节加载失败: ' + err.message);
      handleError('章节加载失败: ' + err.message);
    } finally {
      setChapterLoading(false);
    }
  };

  const handleDownload = async () => {
    const start = Math.max(1, Math.min(dlStart, chapters.length));
    const end = Math.max(start, Math.min(dlEnd, chapters.length));
    if (start > end) {
      message.warning('起始章节不能大于结束章节');
      return;
    }
    const sliced = chapters.slice(start - 1, end);
    const isPartial = start > 1 || end < chapters.length;

    setDownloading(true);
    cancelRef.current = false;
    setDownloadProgress({ current: 0, total: sliced.length });

    try {
      const results = await downloadChaptersConcurrently(
        sliced,
        (url, title) => api.getChapter(url, title),
        (current, total) => setDownloadProgress({ current, total }),
        cancelRef,
      );

      if (cancelRef.current) {
        message.info('下载已取消');
        return;
      }

      const failedIndices = results
        .map((r, i) => (r && r.success ? -1 : i))
        .filter((i) => i >= 0);

      if (failedIndices.length > 0 && !cancelRef.current) {
        message.warning(`${failedIndices.length} 章下载失败，正在补漏重试...`);
        for (const i of failedIndices) {
          if (cancelRef.current) break;
          try {
            await new Promise((r) => setTimeout(r, 3000));
            const data = await api.getChapter(sliced[i].url, sliced[i].title);
            if (data && !data.error && data.content) {
              chapterCache.set(sliced[i].url, { title: data.title, content: data.content });
              results[i] = { success: true, title: data.title, content: data.content };
            }
          } catch {
          }
        }
      }

      const stillFailed = results.filter((r) => !r || !r.success).length;
      if (stillFailed > 0) {
        message.warning(`补漏完成，仍有 ${stillFailed} 章无法获取`);
      }

      const parts = [`${novel.title}\n${'='.repeat(novel.title.length)}\n\n`];
      let errors = 0;

      results.forEach((r, i) => {
        const chapterTitle = sliced[i].title;
        if (r && r.success) {
          parts.push(`\n${r.title}\n${'-'.repeat(r.title.length)}\n\n${r.content}\n\n`);
        } else {
          parts.push(`\n${chapterTitle}\n${'-'.repeat(chapterTitle.length)}\n\n[${r?.error || '加载失败'}]\n\n`);
          errors++;
        }
      });

      const blob = new Blob([parts.join('')], { type: 'text/plain;charset=utf-8' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = isPartial ? `${novel.title}_第${start}-${end}章.txt` : `${novel.title}.txt`;
      a.click();
      URL.revokeObjectURL(dlUrl);

      message.success(`下载完成，${sliced.length - errors}/${sliced.length} 章成功`);
    } catch (err) {
      message.error('下载出错: ' + err.message);
    } finally {
      setDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  useEffect(() => {
    if (chapters.length > 0) {
      setDlStart(1);
      setDlEnd(chapters.length);
    }
  }, [chapters.length]);

  const lines = content ? content.split('\n').filter(Boolean) : [];

  const refreshCache = () => setCacheTick((t) => t + 1);

  return (
    <>
      {!disclaimerAccepted && (
        <DisclaimerModal
          open={true}
          onAgree={() => { localStorage.setItem('novel-grab-disclaimer', 'true'); setDisclaimerAccepted(true); }}
          onDisagree={() => window.close()}
        />
      )}
      <style>{`
        .ant-input-affix-wrapper-disabled {
          opacity: 0.5 !important;
        }
        .ant-input-disabled, .ant-input[disabled] {
          color: inherit !important;
          -webkit-text-fill-color: inherit !important;
        }
      `}</style>
      <Layout style={{ height: '100vh', background: token.colorBgLayout }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 24px',
          background: isDark ? '#141414' : '#001529',
        }}
      >
        <style>{`
          @keyframes hstar-twinkle {
            0%,100% { opacity: 0.2; transform: scale(0.6); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          .hstar-dot {
            position: absolute; border-radius: 50%;
            background: #69b1ff;
            animation: hstar-twinkle var(--dur, 1.5s) ease-in-out infinite;
            animation-delay: var(--d, 0s);
            width: var(--s, 3px); height: var(--s, 3px);
            left: var(--x, 50%); top: var(--y, 50%);
            box-shadow: 0 0 3px #69b1ff;
          }
        `}</style>
        <div style={{ width: 26, height: 26, position: 'relative', flexShrink: 0 }}>
          {[
            { x:'20%', y:'25%', s:3, dur:'1.8s', d:'0s' },
            { x:'65%', y:'15%', s:2, dur:'1.4s', d:'0.3s' },
            { x:'80%', y:'55%', s:2.5, dur:'2.0s', d:'0.6s' },
            { x:'50%', y:'70%', s:2, dur:'1.6s', d:'0.2s' },
            { x:'15%', y:'65%', s:2.5, dur:'2.2s', d:'0.8s' },
            { x:'40%', y:'35%', s:1.5, dur:'1.2s', d:'0.5s' },
          ].map((o, i) => (
            <span key={i} className="hstar-dot"
              style={{'--x':o.x,'--y':o.y,'--s':o.s+'px','--dur':o.dur,'--d':o.d}} />
          ))}
        </div>
        <Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          一个简易的小说获取工具
        </Title>

        <ModeSwitcher mode={mode} onSwitch={handleModeSwitch} disabled={searching || crawling} />

        <Tooltip title={searching || crawling || chapterLoading ? '操作中，暂时不可用' : '设置'} placement="bottom">
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => !searching && !crawling && !chapterLoading && setSettingsOpen(true)}
            disabled={searching || crawling || chapterLoading}
            style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.65)', fontSize: 18, opacity: (searching || crawling || chapterLoading) ? 0.4 : 1 }}
          />
        </Tooltip>

        {mode === 'url' ? (
          <Input.Search
            placeholder="请输入小说目录页URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onSearch={handleCrawl}
            loading={crawling}
            disabled={crawling}
            enterButton="抓取"
            size="large"
            style={{ maxWidth: 390 }}
          />
        ) : (
          <Input.Search
            placeholder="输入小说名搜索多个书源"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
            loading={searching}
            disabled={searching}
            enterButton="搜索"
            size="large"
            style={{ maxWidth: 360 }}
          />
        )}

        {mode === 'url' && chapters.length > 0 && (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ccc', fontSize: 13, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#999' }}>从</span>
              <InputNumber
                min={1}
                max={chapters.length}
                value={dlStart}
                onChange={(v) => setDlStart(v || 1)}
                size="small"
                style={{ width: 72 }}
              />
              <span style={{ color: '#999' }}>到</span>
              <InputNumber
                min={1}
                max={chapters.length}
                value={dlEnd}
                onChange={(v) => setDlEnd(v || chapters.length)}
                size="small"
                style={{ width: 72 }}
              />
              <span style={{ color: '#999' }}>章</span>
            </span>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
              loading={downloading}
            >
              下载{dlStart === 1 && dlEnd === chapters.length ? '全部' : `(${dlEnd - dlStart + 1}章)`}
            </Button>
          </>
        )}
      </Header>
      <Layout>
        {mode === 'search' && (
          <Sider width={380} style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}` }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                fontWeight: 600,
                color: token.colorText,
              }}
            >
              搜索结果
            </div>
            <div style={{ overflow: 'auto', height: 'calc(100vh - 64px - 45px)' }}>
              {searching ? (
                <StarryLoading text="正在聚合搜索..." />
              ) : searchError ? (
                <Alert
                  message="搜索失败"
                  description={searchError}
                  type="error"
                  showIcon
                  style={{ margin: 12 }}
                />
              ) : (() => {
                const hasResults = searchResults.filter(r => r.items.length > 0);
                if (hasResults.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: 40, color: token.colorTextDescription }}>
                      未找到相关小说
                    </div>
                  );
                }
                return (
                <Collapse
                  bordered={false}
                  defaultActiveKey={hasResults.map(r => r.source)}
                  items={hasResults.map((source) => ({
                    key: source.source,
                    label: (
                      <span>
                        {source.source}
                        <span style={{ color: token.colorTextDescription, marginLeft: 8, fontSize: 12 }}>
                          {source.error ? source.error : `${source.items.length} 条结果`}
                        </span>
                      </span>
                    ),
                    children: source.items.length === 0 ? (
                      <div style={{ color: token.colorTextDescription, padding: '8px 0' }}>
                        {source.error || '暂无结果'}
                      </div>
                    ) : (
                      <List
                        dataSource={source.items}
                        renderItem={(item) => (
                          <List.Item
                            onClick={() => handleSearchResultClick(item.url)}
                            style={{ cursor: 'pointer', padding: '10px 0' }}
                          >
                            <List.Item.Meta
                              avatar={
                                item.cover ? (
                                  <Avatar src={item.cover} shape="square" size={48} style={{ flexShrink: 0 }} />
                                ) : (
                                  <Avatar shape="square" size={48} icon={<BookOutlined />} style={{ flexShrink: 0 }} />
                                )
                              }
                              title={<span style={{ fontSize: 14 }}>{item.title}</span>}
                              description={
                                <span style={{ fontSize: 12, color: token.colorTextDescription }}>
                                  {item.author}
                                  {item.description ? ` · ${item.description.slice(0, 40)}${item.description.length > 40 ? '...' : ''}` : ''}
                                </span>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    ),
                  }))}
                />
              );
            })()}
            </div>
          </Sider>
        )}

        {mode === 'url' && (
          <Sider width={280} style={{ background: token.colorBgContainer }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
              }}
            >
              <div style={{ fontWeight: 600, color: token.colorText }}>
                {novel ? `${novel.title} (${novel.chapters.length}章)` : '章节列表'}
              </div>
              {downloading && (
                <div style={{ marginTop: 8 }}>
                  <Progress
                    percent={Math.round((downloadProgress.current / downloadProgress.total) * 100)}
                    size="small"
                    format={() => `${downloadProgress.current}/${downloadProgress.total}`}
                  />
                </div>
              )}
            </div>
            <div style={{ overflow: 'auto', height: 'calc(100vh - 64px - 45px)' }}>
              {crawling && chapters.length === 0 ? (
                <StarryLoading text="正在抓取目录..." />
              ) : (
                <List
                  dataSource={chapters}
                  renderItem={(ch, index) => (
                     <List.Item
                       onClick={() => !chapterLoading && handleChapterClick(ch.url, ch.title)}
                       style={{
                         cursor: chapterLoading ? 'not-allowed' : 'pointer',
                         opacity: chapterLoading ? 0.45 : 1,
                         padding: '8px 16px',
                         borderBottom: `1px solid ${token.colorBorderSecondary}`,
                         transition: 'opacity 0.2s',
                       }}
                     >
                     {index + 1}. {ch.title}
                   </List.Item>
                 )}
                 locale={{ emptyText: novel ? '暂无章节' : '输入URL开始抓取' }}
               />
              )}
            </div>
          </Sider>
        )}

        <Content style={{ padding: '32px 48px', overflow: 'auto', background: token.colorBgContainer }}>
          {mode === 'search' && !searching && searchResults.length === 0 && !searchError ? (
            <div style={{ textAlign: 'center', marginTop: 120, color: token.colorTextDescription }}>
              <SearchOutlined style={{ fontSize: 48, display: 'block', marginBottom: 16 }} />
              输入小说名，跨多个书源聚合搜索
            </div>
          ) : mode === 'search' ? (
            <div style={{ textAlign: 'center', marginTop: 120, color: token.colorTextDescription }}>
              {searching ? <StarryLoading text="正在搜索..." /> : (
                <>
                  <SearchOutlined style={{ fontSize: 36, display: 'block', marginBottom: 12, color: token.colorTextDisabled }} />
                  从左侧选择一个结果开始抓取
                </>
              )}
            </div>
          ) : chapterLoading ? (
            <StarryLoading text="正在加载章节..." />
          ) : error && !content ? (
            <Alert
              message="操作失败"
              description={error}
              type="error"
              showIcon
              style={{ maxWidth: 480, margin: '120px auto' }}
            />
          ) : content ? (
            <div
              style={{
                maxWidth: 720,
                margin: '0 auto',
                fontSize: 16,
                lineHeight: 2,
                color: token.colorText,
              }}
            >
              {lines.map((line, i) => (
                <Paragraph
                  key={i}
                  style={{ textIndent: '2em', margin: 0, whiteSpace: 'pre-wrap', color: token.colorText }}
                >
                  {line}
                </Paragraph>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', marginTop: 120, color: token.colorTextDescription }}>
              <BookOutlined style={{ fontSize: 48, display: 'block', marginBottom: 16 }} />
              输入小说目录页URL并点击"抓取"开始
            </div>
          )}
        </Content>
      </Layout>

      <Settings
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          refreshCache();
        }}
        themeMode={window.__themeMode}
        onThemeChange={(v) => window.__onThemeChange?.(v)}
        searchCacheCount={searchCache.size}
        searchCacheSizeMB={getSearchCacheSizeMB}
        chapterCacheCount={chapterCache.size}
        onClearSearchCache={() => {
          searchCache.clear();
          message.success('搜索缓存已清除');
          refreshCache();
        }}
        onClearChapterCache={() => {
          chapterCache.clear();
          message.success('章节缓存已清除');
          refreshCache();
        }}
        onClearAllCache={() => {
          searchCache.clear();
          chapterCache.clear();
          message.success('全部缓存已清除');
          refreshCache();
        }}
      />
    </Layout>
    </>
  );
}

export default function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
  });
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveDark = themeMode === 'dark' || (themeMode === 'auto' && systemDark);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, themeMode); } catch {}
  }, [themeMode]);

  const onThemeChange = useCallback((v) => setThemeMode(v), []);

  window.__themeMode = themeMode;
  window.__onThemeChange = onThemeChange;

  return (
    <ConfigProvider
      theme={{
        algorithm: effectiveDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
        },
      }}
    >
      <AppInner />
    </ConfigProvider>
  );
}
