import { useLocation, useNavigate } from 'react-router';
import { Layout, Typography, theme } from 'antd';
import { useMemo } from 'react';
import { StarryIcon } from './StarryIcon';
import './Header.css';

const { Header: AntHeader } = Layout;
const { Title } = Typography;

const tabs = [
  { key: '/', label: '首页' },
  { key: '/settings', label: '设置' },
];

interface Props {
  visualStyle: 'starry' | 'cyberpunk';
}

function Header({ visualStyle }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const activeKey = pathname.startsWith('/task')
    ? '/'
    : pathname.startsWith('/settings')
      ? '/settings'
      : '/';

  const isCyber = visualStyle === 'cyberpunk';

  const starColors = useMemo(() => {
    if (isCyber) {
      return ['#ff2d95', '#00f0ff'];
    }
    return [token.colorPrimary];
  }, [isCyber, token.colorPrimary]);

  const stars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    x: `${Math.random() * 100}%`,
    y: `${Math.random() * 100}%`,
    s: `${Math.random() * 2 + 1}px`,
    dur: `${Math.random() * 2 + 1.2}s`,
    d: `${Math.random() * 3}s`,
    c: starColors[i % starColors.length],
  })), [starColors]);

  const glowColor = isCyber ? '#ff2d95, 0 0 18px #00f0ff' : token.colorPrimary;
  const titleClass = `header__title ${isCyber ? 'header__title--cyber' : ''}`;

  return (
    <AntHeader
      className="header"
      style={{
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {isCyber && <div className="header__scanlines" />}

      <div className="header__stars">
        {stars.map((s, i) => (
          <span
            key={i}
            className="header__star"
            style={{
              '--x': s.x, '--y': s.y, '--s': s.s, '--dur': s.dur, '--d': s.d,
              '--star-color': s.c,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="header__left" onClick={() => navigate('/')}>
        <StarryIcon />
        <Title
          level={4}
          className={titleClass}
          style={{
            margin: '0 0 0 8px',
            cursor: 'pointer',
            color: token.colorText,
            ['--glow-color' as string]: glowColor,
          }}
        >
          NovelGrab
        </Title>
      </div>
      <div className="header__tabs">
        {tabs.map((t) => (
          <div
            key={t.key}
            className={`header__tab${activeKey === t.key ? ' header__tab--active' : ''}${isCyber ? ' header__tab--cyber' : ''}`}
            style={{
              color: activeKey === t.key ? (isCyber ? '#ff2d95' : token.colorPrimary) : token.colorTextSecondary,
              background: activeKey === t.key ? `${isCyber ? '#ff2d95' : token.colorPrimary}14` : 'transparent',
            }}
            onClick={() => navigate(t.key)}
          >
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </AntHeader>
  );
}

export default Header;
