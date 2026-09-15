"use client";

import type {
  InfographicChartKind,
  InfographicChartSeries,
} from "@/types/infographic";
import { cn } from "@/lib/utils";

const COLORS = [
  "hsl(221 83% 53%)",
  "hsl(173 80% 36%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(346 77% 50%)",
  "hsl(199 89% 48%)",
  "hsl(152 60% 40%)",
  "hsl(24 95% 53%)",
];

function colorAt(i: number): string {
  return COLORS[i % COLORS.length];
}

function formatValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const formatted =
    abs >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : abs >= 10_000
        ? `${Math.round(value / 1000)}k`
        : Number.isInteger(value)
          ? String(value)
          : value.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

function PieChart({
  series,
  donut,
}: {
  series: InfographicChartSeries[];
  donut?: boolean;
}) {
  const points = (series[0]?.points ?? []).filter((p) => p.value > 0);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  if (points.length === 0 || total <= 0) return null;

  const cx = 80;
  const cy = 80;
  const r = 72;
  let angle = 0;
  const slices = points.map((point, i) => {
    const sweep = (point.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...point, start, end, i, pct: (point.value / total) * 100 };
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 160 160" className="mx-auto size-44 shrink-0 sm:mx-0">
        {slices.map((slice) =>
          slice.end - slice.start >= 359.99 ? (
            <circle
              key={slice.i}
              cx={cx}
              cy={cy}
              r={r}
              fill={colorAt(slice.i)}
            />
          ) : (
            <path
              key={slice.i}
              d={arcPath(cx, cy, r, slice.start, slice.end)}
              fill={colorAt(slice.i)}
              className="stroke-card"
              strokeWidth={1.5}
            />
          ),
        )}
        {donut ? (
          <circle cx={cx} cy={cy} r={40} className="fill-card" />
        ) : null}
      </svg>
      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice) => (
          <li key={slice.i} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: colorAt(slice.i) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {slice.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
              {slice.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({
  series,
  unit,
  horizontal,
}: {
  series: InfographicChartSeries[];
  unit?: string;
  horizontal?: boolean;
}) {
  const labels =
    series[0]?.points.map((p) => p.label) ??
    [];
  const max = Math.max(
    0.0001,
    ...series.flatMap((s) => s.points.map((p) => p.value)),
  );
  const grouped = labels.length > 0;
  if (!grouped) return null;

  if (horizontal) {
    return (
      <div className="space-y-3">
        {labels.map((label, li) => {
          const values = series.map((s) => s.points[li]?.value ?? 0);
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-medium text-foreground">
                  {label}
                </p>
                <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatValue(values[0] ?? 0, series.length === 1 ? unit : undefined)}
                </p>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {values.map((value, si) => (
                  <div
                    key={si}
                    className="h-full"
                    style={{
                      width: `${Math.max(2, (value / max) * 100)}%`,
                      background: colorAt(si),
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {series.length > 1 ? (
          <Legend series={series} />
        ) : null}
      </div>
    );
  }

  const barW = 18;
  const gap = series.length > 1 ? 6 : 10;
  const groupW = series.length * barW + gap;
  const width = Math.max(320, labels.length * groupW + 40);
  const height = 160;
  const plotH = 120;
  const baseY = 140;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = baseY - t * plotH;
          return (
            <line
              key={t}
              x1={8}
              x2={width - 8}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeDasharray="3 4"
            />
          );
        })}
        {labels.map((label, li) => {
          const gx = 20 + li * groupW;
          return (
            <g key={label}>
              {series.map((s, si) => {
                const value = s.points[li]?.value ?? 0;
                const h = (value / max) * plotH;
                return (
                  <rect
                    key={si}
                    x={gx + si * barW}
                    y={baseY - h}
                    width={barW - 2}
                    height={Math.max(h, 1)}
                    rx={2}
                    fill={colorAt(si)}
                  />
                );
              })}
              <text
                x={gx + (series.length * barW) / 2}
                y={156}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? <Legend series={series} /> : null}
    </div>
  );
}

function LineChart({
  series,
  unit,
}: {
  series: InfographicChartSeries[];
  unit?: string;
}) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  if (labels.length < 2) return null;
  const max = Math.max(
    0.0001,
    ...series.flatMap((s) => s.points.map((p) => p.value)),
  );
  const width = 420;
  const height = 170;
  const left = 36;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const xAt = (i: number) =>
    left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const yAt = (v: number) => top + plotH - (v / max) * plotH;

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = yAt(max * t);
          return (
            <g key={t}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray="3 4"
              />
              <text
                x={left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={9}
              >
                {formatValue(max * t, unit)}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const pts = s.points
            .map((p, i) => `${xAt(i)},${yAt(p.value)}`)
            .join(" ");
          return (
            <g key={s.name}>
              <polyline
                points={pts}
                fill="none"
                stroke={colorAt(si)}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(p.value)}
                  r={3}
                  fill={colorAt(si)}
                  className="stroke-card"
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}
        {labels.map((label, i) => (
          <text
            key={label}
            x={xAt(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={10}
          >
            {label.length > 10 ? `${label.slice(0, 9)}…` : label}
          </text>
        ))}
      </svg>
      {series.length > 1 ? <Legend series={series} /> : null}
    </div>
  );
}

function Legend({ series }: { series: InfographicChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s, i) => (
        <li key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2 rounded-sm"
            style={{ background: colorAt(i) }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export function InfographicChart({
  chart,
  title,
  subtitle,
  unit,
  source,
  series,
}: {
  chart: InfographicChartKind;
  title: string;
  subtitle?: string;
  unit?: string;
  source?: string;
  series: InfographicChartSeries[];
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {chart === "pie" || chart === "donut"
            ? "Composition"
            : chart === "line"
              ? "Trend"
              : "Comparison"}
        </p>
        <h4 className="mt-1 text-sm font-semibold text-foreground">{title}</h4>
        {subtitle ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {chart === "pie" ? <PieChart series={series} /> : null}
      {chart === "donut" ? <PieChart series={series} donut /> : null}
      {chart === "bar" ? <BarChart series={series} unit={unit} /> : null}
      {chart === "hbar" ? (
        <BarChart series={series} unit={unit} horizontal />
      ) : null}
      {chart === "line" ? <LineChart series={series} unit={unit} /> : null}
      {source ? (
        <p className={cn("mt-3 text-[11px] text-muted-foreground")}>
          Source: {source}
        </p>
      ) : null}
    </div>
  );
}
