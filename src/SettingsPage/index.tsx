import { useState, useEffect } from 'react';
import { Typography, Radio, Divider, Button, Switch, Input, Modal, message, Tooltip } from 'antd';
import { DeleteOutlined, FolderOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { clearAllCaches, getCacheSize } from '../services/cache';
import { fetchSources } from '../services/api';
import { IconStarry } from '../components/IconStarry';
import { IconCyber } from '../components/IconCyber';
import { IconWarn } from '../components/IconWarn';
import './index.css';

const { Title, Text } = Typography;

type ThemeMode = 'light' | 'dark' | 'auto';

function SettingsPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('novel-grab-theme') as ThemeMode) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [downloadPath, setDownloadPath] = useState(() => {
    try {
      return localStorage.getItem('novel-grab-download-path') || '';
    } catch {
      return '';
    }
  });

  const [defaultOutputDir, setDefaultOutputDir] = useState('');

  const [adultEnabled, setAdultEnabled] = useState(() => {
    try {
      return localStorage.getItem('novel-grab-adult') === 'true';
    } catch {
      return false;
    }
  });

  const [visualStyle, setVisualStyle] = useState(() => {
    try {
      return (localStorage.getItem('novel-grab-visual-style') as 'starry' | 'cyberpunk') || 'starry';
    } catch {
      return 'starry';
    }
  });
  const [adultModalOpen, setAdultModalOpen] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [cacheSize, setCacheSize] = useState('');
  const [versionClicks, setVersionClicks] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem('novel-grab-download-path', downloadPath);
    } catch {}
  }, [downloadPath]);

  useEffect(() => {
    try {
      localStorage.setItem('novel-grab-adult', String(adultEnabled));
    } catch {}
    window.dispatchEvent(new Event('adult-change'));
  }, [adultEnabled]);

  useEffect(() => {
    fetchSources()
      .then((d) => setDefaultOutputDir(d.default_output_dir || ''))
      .catch(() => {});
    setCacheSize(getCacheSize());
  }, []);

  const handleThemeChange = (m: ThemeMode) => {
    setThemeMode(m);
    try {
      localStorage.setItem('novel-grab-theme', m);
    } catch {}
    window.dispatchEvent(new Event('theme-change'));
    message.success('主题已更新');
  };

  const handleVisualStyleChange = (s: 'starry' | 'cyberpunk') => {
    setVisualStyle(s);
    try {
      localStorage.setItem('novel-grab-visual-style', s);
    } catch {}
    window.dispatchEvent(new Event('visual-style-change'));
  };

  const handleClearCache = () => {
    setClearModalOpen(true);
  };

  const handleClearConfirm = () => {
    clearAllCaches();
    setClearModalOpen(false);
    setCacheSize(getCacheSize());
    message.success('缓存已清除');
  };

  const handleAdultToggle = (checked: boolean) => {
    if (checked) {
      setAdultModalOpen(true);
    } else {
      setAdultEnabled(false);
    }
  };

  const handleSelectPath = async () => {
    if (window.electronAPI) {
      const dirPath = await window.electronAPI.selectDirectory();
      if (dirPath) {
        setDownloadPath(dirPath);
        message.success('下载路径已设置');
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = (e: any) => {
      const files = e.target?.files;
      if (files?.[0]) {
        const fullPath = files[0].path || '';
        if (fullPath) {
          const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
          setDownloadPath(dirPath);
          message.success('下载路径已设置');
        }
      }
    };
    input.click();
  };

  const displayPath = downloadPath || defaultOutputDir;

  return (
    <div className="settings">
      <Modal
        open={adultModalOpen}
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
            注意
          </span>
        }
        onOk={() => { setAdultEnabled(true); setAdultModalOpen(false); }}
        onCancel={() => setAdultModalOpen(false)}
        okText="仍要开启"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        centered
      >
        <Text>该选项将注入特殊书源参数，开启后书源可能不稳定、搜索结果质量下降。非必要不建议开启。</Text>
      </Modal>

      <Modal
        open={clearModalOpen}
        title="确认清除"
        onOk={handleClearConfirm}
        onCancel={() => setClearModalOpen(false)}
        okText="确认清除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        centered
      >
        <Text>将清除所有搜索记录和书籍目录缓存，确认清除？</Text>
      </Modal>

      <Title level={4}>设置</Title>

      <div className="settings__section">
        <Text strong style={{ fontSize: 14 }}>主题</Text>
        <Radio.Group
          value={themeMode}
          onChange={(e) => handleThemeChange(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          style={{ width: '100%', marginTop: 8 }}
        >
          <Radio.Button value="light" style={{ width: '33%', textAlign: 'center' }}>
            浅色
          </Radio.Button>
          <Radio.Button value="dark" style={{ width: '33%', textAlign: 'center' }}>
            深色
          </Radio.Button>
          <Radio.Button value="auto" style={{ width: '34%', textAlign: 'center' }}>
            跟随系统
          </Radio.Button>
        </Radio.Group>
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          自动匹配 macOS / Windows 浅深色设置
        </Text>
      </div>

      <Divider />

      <div className="settings__section">
        <Text strong style={{ fontSize: 14 }}>
          视觉风格（beta）
          <Tooltip title="此功能为测试阶段，频繁切换风格可能小概率导致内存占用升高">
            <span style={{ marginLeft: 6, cursor: 'help' }}><IconWarn /></span>
          </Tooltip>
        </Text>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <div
            className={`visual-btn visual-btn--starry${visualStyle === 'starry' ? ' visual-btn--active' : ''}`}
            onClick={() => handleVisualStyleChange('starry')}
          >
            <span className="visual-btn__text"><IconStarry /> 星海</span>
          </div>
          <div
            className={`visual-btn visual-btn--cyber${visualStyle === 'cyberpunk' ? ' visual-btn--active' : ''}`}
            data-text="赛博"
            onClick={() => handleVisualStyleChange('cyberpunk')}
          >
            <span className="visual-btn__text"><IconCyber /> 赛博</span>
          </div>
        </div>
      </div>

      <Divider />

      <div className="settings__section">
        <Text strong style={{ fontSize: 14 }}>下载</Text>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              value={displayPath}
              disabled
              style={{ flex: 1 }}
            />
            <Button icon={<FolderOutlined />} onClick={handleSelectPath}>
              选择
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前存储路径，修改需通过"选择"按钮
          </Text>
        </div>
      </div>

      {versionClicks >= 5 && (
        <>
          <Divider />

          <div className="settings__section">
            <Text strong style={{ fontSize: 14 }}>搜索选项</Text>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text>参数注入</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  非必要不建议开启
                </Text>
              </div>
              <Switch checked={adultEnabled} onChange={handleAdultToggle} />
            </div>
          </div>
        </>
      )}

      <Divider />

      <div className="settings__section">
        <Text strong style={{ fontSize: 14 }}>缓存管理</Text>
        <div style={{ marginTop: 8 }}>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleClearCache}
            disabled={!cacheSize || cacheSize === '0 B'}
          >
            清除本地缓存{cacheSize ? ` (${cacheSize})` : ''}
          </Button>
        </div>
      </div>

      <Divider />

      <Text
        type="secondary"
        style={{ fontSize: 12, userSelect: 'none' }}
        onClick={() => setVersionClicks((c) => c + 1)}
      >
        NovelGrab v2.0
      </Text>
    </div>
  );
}

export default SettingsPage;
