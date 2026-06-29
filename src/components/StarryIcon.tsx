import './StarryIcon.css';

const stars = [
  { x: '50%', y: '20%', s: 2.5, dur: '1.2s', d: '0s' },
  { x: '25%', y: '50%', s: 2, dur: '1.6s', d: '0.3s' },
  { x: '75%', y: '50%', s: 2.5, dur: '1.4s', d: '0.5s' },
  { x: '40%', y: '75%', s: 2, dur: '1.8s', d: '0.2s' },
  { x: '65%', y: '70%', s: 1.5, dur: '1.5s', d: '0.7s' },
];

export function StarryIcon() {
  return (
    <span className="starry-icon">
      {stars.map((s, i) => (
        <span
          key={i}
          className="starry-icon__dot"
          style={{
            '--x': s.x,
            '--y': s.y,
            '--s': s.s + 'px',
            '--dur': s.dur,
            '--d': s.d,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}
