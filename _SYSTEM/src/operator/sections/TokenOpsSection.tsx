import React from 'react';
import { MetricCard, SectionHeader, LiveCounter } from '../components';
import { todayCost, totalCost, spendByModel } from '../data/mock-tokens';

const BudgetArcGauge: React.FC<{
  spent: number;
  cap: number;
  radius: number;
}> = ({ spent, cap, radius }) => {
  const ratio = Math.min(spent / cap, 1);
  const cx = radius + 16;
  const cy = radius + 8;
  const strokeW = 10;
  const innerR = radius - strokeW / 2;

  const toCartesian = (angleDeg: number): [number, number] => {
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + innerR * Math.cos(rad), cy + innerR * Math.sin(rad)];
  };

  const startAngle = -135;
  const endAngle = 135;
  const fillAngle = startAngle + (endAngle - startAngle) * ratio;

  const [x1, y1] = toCartesian(startAngle);
  const [x2, y2] = toCartesian(fillAngle);

  const largeArc = fillAngle - startAngle > 180 ? 1 : 0;

  const svgW = radius * 2 + 32;

  return (
    <svg width={svgW} height={cy + 16} viewBox={`0 0 ${svgW} ${cy + 16}`}>
      <path
        d={`M ${x1} ${y1} A ${innerR} ${innerR} 0 ${largeArc} 1 ${x2} ${y2}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${(endAngle - startAngle) * (Math.PI / 180) * innerR} ${(360 - (endAngle - startAngle)) * (Math.PI / 180) * innerR}`}
        strokeDashoffset={0}
        transform={`rotate(${startAngle}, ${cx}, ${cy})`}
      />
      <path
        d={`M ${x1} ${y1} A ${innerR} ${innerR} 0 ${largeArc} 1 ${x2} ${y2}`}
        fill="none"
        stroke="#7c3aed"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-zinc-900 dark:fill-zinc-100 text-xs font-mono"
        fontSize={12}
      >
        ${spent.toFixed(0)}/${cap}
      </text>
    </svg>
  );
};

const BarChart: React.FC<{ data: Map<string, number>; max: number }> = ({
  data,
  max,
}) => {
  const entries = Array.from(data.entries());
  const barW = 8;
  const gap = 18;
  const totalW = entries.length * (barW + gap) - gap;
  const chartH = 80;
  const viewBoxW = Math.max(totalW, 200);

  return (
    <svg width="100%" height={chartH + 20} viewBox={`0 0 ${viewBoxW} ${chartH + 20}`}>
      {entries.map(([model, cost], i) => {
        const h = max > 0 ? (cost / max) * chartH : 0;
        const x = i * (barW + gap);
        const y = chartH - h;
        return (
          <g key={model}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 1)}
              rx={2}
              fill={cost > 0 ? '#7c3aed' : '#e2e8f0'}
            />
            <text
              x={x + barW / 2}
              y={chartH + 14}
              textAnchor="middle"
              className="fill-zinc-500 dark:fill-zinc-400"
              fontSize={8}
            >
              {model.length > 10 ? model.slice(0, 9) + '…' : model}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const TokenOpsSection: React.FC = () => {
  const daily = todayCost();
  const total = totalCost();
  const byModel = spendByModel();

  return (
    <div>
      <SectionHeader title="Token Ops / FinOps" density="glance" />
      <div className="op-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <MetricCard label="Daily Spend">
          <LiveCounter value={daily} prefix="$" decimals={2} />
        </MetricCard>
        <MetricCard label="Spend per Model">
          <BarChart data={byModel} max={total} />
        </MetricCard>
        <MetricCard label="Budget Pacing">
          <BudgetArcGauge spent={daily} cap={10} radius={60} />
        </MetricCard>
      </div>
    </div>
  );
};

export default TokenOpsSection;
