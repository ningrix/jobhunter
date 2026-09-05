import { useId } from "react";
import { stageColorVar } from "./ui/stage";

/** 漏斗行：标签 + 渐变条 + 数值。color 传 CSS 颜色/var，缺省用品牌渐变类 */
export function FunnelRows({
  rows,
}: {
  rows: { key: string; label: string; value: number; color?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-[12.5px] text-t2">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full min-w-0.5 rounded-full ${r.color ? "" : "bg-gradient-bar"}`}
              style={{ width: `${Math.max((r.value / max) * 100, 1)}%`, background: r.color }}
              title={`${r.value}`}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold text-t1">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 投递漏斗行：按阶段取 token 色 */
export function StageFunnelRows({ rows }: { rows: { stage: string; label: string; count: number }[] }) {
  return (
    <FunnelRows
      rows={rows.map((r) => ({ key: r.stage, label: r.label, value: r.count, color: stageColorVar(r.stage) }))}
    />
  );
}

/** 近 N 周趋势：折线 + 渐变面积 + 末点光晕/数值 chip（概念稿画法） */
export function TrendAreaChart({ points }: { points: { label: string; value: number }[] }) {
  const gid = useId();
  const W = 560;
  const H = 190;
  const padX = 12;
  const padT = 26;
  const padB = 26;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [padX + i * step, padT + (1 - p.value / max) * (H - padT - padB)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(W - padX).toFixed(1)},${H - padB} L${padX},${H - padB} Z`;
  const last = xy[xy.length - 1] ?? [padX, H - padB];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id={`${gid}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" stopOpacity="0.32" />
          <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={W - padX}
          y1={padT + f * (H - padT - padB)}
          y2={padT + f * (H - padT - padB)}
          className="stroke-border"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      ))}
      <path d={area} fill={`url(#${gid}-area)`} />
      <path d={line} fill="none" stroke={`url(#${gid}-line)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" className="fill-surface" strokeWidth="2" stroke="#6366f1" />
      ))}
      <circle cx={last[0]} cy={last[1]} r="9" fill="#6366f1" opacity="0.18" />
      {points.length > 0 && (
        <g>
          <rect x={last[0] - 15} y={last[1] - 30} width="30" height="19" rx="9.5" fill="#6366f1" />
          <text
            x={last[0]}
            y={last[1] - 20}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            style={{ fontSize: 10.5, fontWeight: 600 }}
          >
            {points[points.length - 1].value}
          </text>
        </g>
      )}
      {points.map((p, i) => (
        <text
          key={i}
          x={xy[i][0]}
          y={H - 8}
          textAnchor="middle"
          className="fill-t3"
          style={{ fontSize: 10 }}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/** 环图：12 点起始、环形段 + 中心总数，附图例 */
export function DonutChart({
  data,
  size = 168,
  thickness = 24,
  centerLabel = "总计",
}: {
  data: { label: string; value: number; colorVar: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const visible = data.filter((d) => d.value > 0);
  const total = visible.reduce((s, d) => s + d.value, 0);
  let acc = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-surface-2" strokeWidth={thickness} />
        {total > 0 &&
          visible.map((d) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.colorVar}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(len - 2, 0.5)} ${c - Math.max(len - 2, 0.5)}`}
                strokeDashoffset={-acc}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            acc += len;
            return seg;
          })}
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="fill-t1" style={{ fontSize: 24, fontWeight: 700 }}>
          {total}
        </text>
        <text x="50%" y="61%" textAnchor="middle" dominantBaseline="central" className="fill-t3" style={{ fontSize: 10.5 }}>
          {centerLabel}
        </text>
      </svg>
      <ul className="flex min-w-[140px] flex-1 flex-col gap-2">
        {visible.length === 0 && <li className="text-xs text-t3">暂无数据</li>}
        {visible.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[11.5px] text-t2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.colorVar }} />
            <span className="flex-1">{d.label}</span>
            <span className="font-semibold text-t1">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
