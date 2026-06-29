import './StarryLoading.css';

interface Props {
  text?: string;
  variant?: 'starry' | 'cyberpunk';
  size?: 'normal' | 'small';
}

const starryOrbits = [
  { r: 110, d: '0s',   t: 4.0, c: '#002766' },
  { r: 78,  d: '0.6s', t: 3.2, c: '#003a8c' },
  { r: 50,  d: '1.2s', t: 2.5, c: '#0958d9' },
  { r: 26,  d: '0.3s', t: 1.8, c: '#1677ff' },
];

const cyberOrbits = [
  { r: 110, d: '0s',   t: 4.0, c: '#ff2d95' },
  { r: 78,  d: '0.6s', t: 3.2, c: '#00f0ff' },
  { r: 50,  d: '1.2s', t: 2.5, c: '#ff2d95' },
  { r: 26,  d: '0.3s', t: 1.8, c: '#00f0ff' },
];

const starrySmall = [
  { r: 56, d: '0s',   t: 3.0, c: '#003a8c' },
  { r: 38, d: '0.5s', t: 2.4, c: '#0958d9' },
  { r: 22, d: '1.0s', t: 1.8, c: '#1677ff' },
];

const cyberSmall = [
  { r: 56, d: '0s',   t: 3.0, c: '#ff2d95' },
  { r: 38, d: '0.5s', t: 2.4, c: '#00f0ff' },
  { r: 22, d: '1.0s', t: 1.8, c: '#ff2d95' },
];

export function StarryLoading({ text, variant = 'starry', size = 'normal' }: Props) {
  const isCyber = variant === 'cyberpunk';
  const isSmall = size === 'small';
  const orbits = isSmall
    ? (isCyber ? cyberSmall : starrySmall)
    : (isCyber ? cyberOrbits : starryOrbits);

  const cls = [
    'starry-loading',
    isCyber && 'starry-loading--cyber',
    isSmall && 'starry-loading--small',
  ].filter(Boolean).join(' ');

  const fieldCls = [
    'starry-loading__field',
    isSmall && 'starry-loading__field--small',
  ].filter(Boolean).join(' ');

  const textCls = [
    'starry-loading__text',
    isCyber && 'starry-loading__text--cyber',
    isSmall && 'starry-loading__text--small',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {isCyber && !isSmall && <div className="starry-loading__scanlines" />}
      <div className={fieldCls}>
        {orbits.map((o, i) => (
          <div
            key={i}
            className="starry-loading__orbit"
            style={{
              '--r': o.r,
              '--d': o.d,
              '--t': o.t,
            } as React.CSSProperties}
          >
            <div
              className="starry-loading__planet"
              style={{ '--c': o.c } as React.CSSProperties}
            />
          </div>
        ))}
      </div>
      <div className={textCls}>{text || '加载中...'}</div>
    </div>
  );
}
