import { Layout, ConfigProvider, theme, Result, Button } from 'antd';
import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import AppRoutes from './routes';
import { StarryLoading } from './components/StarryLoading';
import Disclaimer from './components/Disclaimer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { healthCheck } from './services/api';
import './App.css';

const { Content } = Layout;

type ThemeMode = 'light' | 'dark' | 'auto';
type VisualStyle = 'starry' | 'cyberpunk';
type ServerState = 'checking' | 'ready' | 'error';

function App() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('novel-grab-theme') as ThemeMode) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [visualStyle, setVisualStyle] = useState<VisualStyle>(() => {
    try {
      return (localStorage.getItem('novel-grab-visual-style') as VisualStyle) || 'starry';
    } catch {
      return 'starry';
    }
  });

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  const [serverState, setServerState] = useState<ServerState>('checking');
  const [disclaimerOk, setDisclaimerOk] = useState(() => {
    try {
      return localStorage.getItem('novel-grab-disc') === 'y';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;

    async function check() {
      while (attempts < maxAttempts && !cancelled) {
        const ok = await healthCheck();
        if (ok) {
          if (!cancelled) setServerState('ready');
          return;
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!cancelled) setServerState('error');
    }

    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      try {
        const m = localStorage.getItem('novel-grab-theme') as ThemeMode;
        if (m) setMode(m);
      } catch {}
    };
    window.addEventListener('storage', syncTheme);
    window.addEventListener('theme-change', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('theme-change', syncTheme);
    };
  }, []);

  useEffect(() => {
    const syncStyle = () => {
      try {
        const s = localStorage.getItem('novel-grab-visual-style') as VisualStyle;
        if (s) setVisualStyle(s);
      } catch {}
    };
    window.addEventListener('visual-style-change', syncStyle);
    return () => window.removeEventListener('visual-style-change', syncStyle);
  }, []);

  const isDark = mode === 'dark' || (mode === 'auto' && systemDark);

  const themeConfig = useMemo(() => ({
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: isDark ? {
      colorBgBase: '#151d2a',
      colorTextBase: '#dce3ee',
      colorPrimary: '#4d8cf5',
    } : undefined,
    borderRadius: 6,
  }), [isDark]);

  const handleDisclaimerAgree = () => {
    try {
      localStorage.setItem('novel-grab-disc', 'y');
    } catch {}
    setDisclaimerOk(true);
  };

  const bgClass = `app-bg app-bg--${visualStyle} app-bg--${isDark ? 'dark' : 'light'}`;

  const layoutContent = (
    <ConfigProvider theme={themeConfig}>
      <div className={bgClass} />
      <Layout className="app-layout">
        <Header visualStyle={visualStyle} />
        <Content className="app-content">
          <ErrorBoundary>
          <AppRoutes />
          </ErrorBoundary>
        </Content>
      </Layout>
    </ConfigProvider>
  );

  if (serverState === 'checking') {
    return (
      <ConfigProvider theme={themeConfig}>
        <div className={bgClass} />
        <Layout style={{ height: '100vh', position: 'relative', zIndex: 1 }}>
          <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
            <StarryLoading text="正在启动 NovelGrab 服务..." variant={visualStyle} />
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }

  if (serverState === 'error') {
    return (
      <ConfigProvider theme={themeConfig}>
        <div className={bgClass} />
        <Layout style={{ height: '100vh', position: 'relative', zIndex: 1 }}>
          <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
            <Result
              status="error"
              title="服务启动失败"
              subTitle="NovelGrab API 服务未能就绪，请检查 NovelGrabServer 是否完整"
              extra={
                <Button type="primary" onClick={() => {
                  setServerState('checking');
                  window.location.reload();
                }}>
                  重试
                </Button>
              }
            />
          </Content>
        </Layout>
      </ConfigProvider>
    );
  }

  if (!disclaimerOk) {
    return (
      <>
        {layoutContent}
        <Disclaimer onAgree={handleDisclaimerAgree} />
      </>
    );
  }

  return layoutContent;
}

export default App;
