import { useEffect, useRef } from 'react';

/* ─── Animated Triquetra/Celtic knot background ─── */
/* Reveals progressively as user scrolls. Fixed position behind all content. */

export default function CelticBackground() {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const paths = svg.querySelectorAll<SVGPathElement>('[data-celtic]');
    const lengths: number[] = [];

    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      lengths.push(len);
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });

    const onScroll = () => {
      const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollMax > 0 ? Math.min(window.scrollY / scrollMax, 1) : 0;

      paths.forEach((p, i) => {
        const len = lengths[i];
        // Each path reveals at slightly different scroll rates for organic feel
        const delay = i * 0.05;
        const localProgress = Math.max(0, Math.min((progress - delay) / (1 - delay), 1));
        const eased = localProgress < 0.5
          ? 2 * localProgress * localProgress
          : 1 - Math.pow(-2 * localProgress + 2, 2) / 2;
        p.style.strokeDashoffset = `${len * (1 - eased)}`;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initial
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Triquetra: 3 overlapping vesica-piscis arcs forming the Celtic knot */
  /* SVG viewBox 0 0 800 800, centered at 400,400 */
  /* Three circles r=180, centers at 120° apart from center at r=100 */
  const cx = 400, cy = 400, r = 190, offset = 105;
  const centers = [
    { x: cx + offset * Math.cos(-Math.PI / 2), y: cy + offset * Math.sin(-Math.PI / 2) },
    { x: cx + offset * Math.cos(-Math.PI / 2 + (2 * Math.PI) / 3), y: cy + offset * Math.sin(-Math.PI / 2 + (2 * Math.PI) / 3) },
    { x: cx + offset * Math.cos(-Math.PI / 2 + (4 * Math.PI) / 3), y: cy + offset * Math.sin(-Math.PI / 2 + (4 * Math.PI) / 3) },
  ];

  /* Outer triquetra arcs — three large arcs connecting the lobes */
  const triPath = `
    M ${cx} ${cy - r * 0.7}
    C ${cx + r * 0.6} ${cy - r * 1.1}, ${cx + r * 1.0} ${cy + r * 0.1}, ${cx + r * 0.55} ${cy + r * 0.55}
    C ${cx + r * 0.1} ${cy + r * 1.0}, ${cx - r * 0.6} ${cy + r * 0.9}, ${cx - r * 0.55} ${cy + r * 0.55}
    C ${cx - r * 1.0} ${cy + r * 0.1}, ${cx - r * 0.6} ${cy - r * 1.1}, ${cx} ${cy - r * 0.7}
    Z
  `;

  /* Inner triangle nodes */
  const innerR = r * 0.38;
  const innerTriPath = centers.map((c) =>
    `M ${c.x} ${c.y - innerR} A ${innerR} ${innerR} 0 1 1 ${c.x - 0.001} ${c.y - innerR}`
  ).join(' ');

  /* Connecting lines between centers */
  const connPath = `
    M ${centers[0].x} ${centers[0].y}
    L ${centers[1].x} ${centers[1].y}
    L ${centers[2].x} ${centers[2].y}
    Z
  `;

  /* Extended knot loops */
  const loopPaths = centers.map((c, i) => {
    const next = centers[(i + 1) % 3];
    return `M ${c.x} ${c.y} Q ${cx} ${cy}, ${next.x} ${next.y}`;
  }).join(' ');

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      zIndex: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg
        ref={svgRef}
        viewBox="0 0 800 800"
        style={{
          width: 'min(90vw, 90vh)',
          height: 'min(90vw, 90vh)',
          opacity: 0.055,
          mixBlendMode: 'screen',
        }}
        fill="none"
      >
        {/* Main triquetra outline */}
        <path
          data-celtic=""
          d={triPath}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1.2"
          fill="none"
        />

        {/* Three inner circles at lobe centers */}
        {centers.map((c, i) => (
          <circle
            key={`circle-${i}`}
            data-celtic=""
            cx={c.x} cy={c.y} r={innerR}
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="0.8"
            fill="none"
          />
        ))}

        {/* Inner connecting triangle */}
        <path
          data-celtic=""
          d={connPath}
          stroke="rgba(220,38,38,0.5)"
          strokeWidth="0.6"
          fill="none"
        />

        {/* Bezier loops */}
        <path
          data-celtic=""
          d={loopPaths}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="0.7"
          fill="none"
        />

        {/* Outer sacred geometry ring */}
        <circle
          data-celtic=""
          cx={cx} cy={cy} r={r * 1.25}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
          fill="none"
          strokeDasharray="4 8"
        />
      </svg>
    </div>
  );
}
