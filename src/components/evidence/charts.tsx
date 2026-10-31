"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { color, numeric, tokens } from "@/theme/tokens";

/**
 * Small, dependency-free SVG charts following the dataviz rules: one axis, thin marks (≤ 24px bars,
 * 4px rounded data-ends, 2px lines), recessive hairline grid, hover/focus tooltips, a table view,
 * and text in text colours only. Single-series charts have no legend; the title names the series.
 * Diverging colours (validated: CVD ΔE 18.8): below/drier/cooler = DIV_LOW, above/wetter/warmer = DIV_HIGH.
 */
export const SERIES = tokens.forest[500];
export const DIV_LOW = "#B0652A";
export const DIV_HIGH = "#1F7FB0";
const GRID = tokens.neutral[200];
const AXIS_TEXT = color.inkSubtle;

export type Datum = { x: string; y: number | null; note?: string };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Bar path with a 4px rounded data-end and a square baseline end. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const up = y1 < y0;
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  return up
    ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`
    : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

type Frame = { title: string; subtitle?: ReactNode; unit: string; data: Datum[]; format: (v: number) => string; table: { x: string; y: string; note?: string }[]; children: (dims: { w: number; h: number; x: (i: number) => number; band: number; y: (v: number) => number; top: number; bottom: number }) => ReactNode; domain: [number, number]; height?: number; xLabelEvery?: number };

function ChartFrame({ title, subtitle, unit, data, format, table, children, domain, height = 200, xLabelEvery }: Frame) {
  const { ref, w } = useWidth();
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const left = 44, right = 8, top = 10, bottom = 26;
  const h = height;
  const ticks = niceTicks(domain[0], domain[1]);
  const lo = Math.min(domain[0], ticks[0] ?? domain[0]);
  const hi = Math.max(domain[1], ticks.at(-1) ?? domain[1]);
  const y = (v: number) => top + (h - top - bottom) * (1 - (v - lo) / (hi - lo || 1));
  const band = (w - left - right) / Math.max(1, data.length);
  const x = (i: number) => left + i * band;
  const every = xLabelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((w - left) / 56))));
  return (
    <Box component="figure" sx={{ m: 0, minWidth: 0 }} aria-labelledby={`${id}-t`}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Typography id={`${id}-t`} component="figcaption" variant="subtitle2">
          {title} <Typography component="span" variant="caption" color="text.secondary">({unit})</Typography>
        </Typography>
        <Button size="small" onClick={() => setAsTable(!asTable)} aria-pressed={asTable} sx={{ minHeight: 32 }}>
          {asTable ? "Show chart" : "Show as table"}
        </Button>
      </Box>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
          {subtitle}
        </Typography>
      )}
      <Box ref={ref} sx={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}>
        {asTable ? (
          <Box sx={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${color.line}`, borderRadius: 1 }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", ...numeric, "& td, & th": { px: 1, py: 0.5, borderBottom: `1px solid ${GRID}`, textAlign: "left" } }}>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Value ({unit})</th>
                  {table.some((r) => r.note) && <th scope="col">Note</th>}
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.x}>
                    <td>{r.x}</td>
                    <td>{r.y}</td>
                    {table.some((q) => q.note) && <td>{r.note ?? ""}</td>}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        ) : (
          <svg width={w} height={h} role="img" aria-label={`${title}. Use “Show as table” for the values.`} style={{ display: "block", overflow: "visible" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={w - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} style={numeric}>
                  {format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % every === 0 ? (
                <text key={d.x} x={x(i) + band / 2} y={h - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT} style={numeric}>
                  {d.x}
                </text>
              ) : null,
            )}
            {children({ w, h, x, band, y, top, bottom })}
          </svg>
        )}
      </Box>
    </Box>
  );
}

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(x - 90, 0), w - 180);
  return (
    <foreignObject x={left} y={Math.max(0, y - 58)} width={180} height={54} style={{ pointerEvents: "none", overflow: "visible" }}>
      <div style={{ background: tokens.forest[950], color: tokens.neutral[50], borderRadius: 6, padding: "4px 8px", font: "500 12px/1.4 var(--font-body), sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,.25)" }}>{children}</div>
    </foreignObject>
  );
}

/** Columns from zero (or from a baseline for diverging data) with an optional reference line. */
export function ColumnChart({
  title,
  subtitle,
  unit,
  data,
  digits = 0,
  reference,
  diverging = false,
  lowLabel,
  highLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  unit: string;
  data: Datum[];
  digits?: number;
  reference?: { value: number; label: string } | null;
  diverging?: boolean;
  lowLabel?: string;
  highLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.y).filter((v): v is number => v !== null);
  const min = Math.min(0, ...vals, reference?.value ?? 0);
  const max = Math.max(0, ...vals, reference?.value ?? 0);
  const fmt = (v: number) => v.toFixed(digits);
  return (
    <ChartFrame
      title={title}
      subtitle={
        <>
          {subtitle}
          {diverging && lowLabel && highLabel && (
            <Box component="span" sx={{ display: "inline-flex", gap: 1.5, ml: subtitle ? 1 : 0, alignItems: "center" }}>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <Box component="span" sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: DIV_LOW }} />
                {lowLabel}
              </Box>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <Box component="span" sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: DIV_HIGH }} />
                {highLabel}
              </Box>
            </Box>
          )}
        </>
      }
      unit={unit}
      data={data}
      format={fmt}
      domain={[min, max === min ? min + 1 : max]}
      table={data.map((d) => ({ x: d.x, y: d.y === null ? "no value (insufficient data)" : fmt(d.y), note: d.note }))}
    >
      {({ x, band, y, w }) => {
        const bw = Math.min(24, Math.max(2, band - 2));
        const y0 = y(0);
        return (
          <>
            {data.map((d, i) => {
              const cx = x(i) + (band - bw) / 2;
              const fill = diverging ? ((d.y ?? 0) < 0 ? DIV_LOW : DIV_HIGH) : SERIES;
              return (
                <g key={d.x} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.x}: ${d.y === null ? "no value" : `${fmt(d.y)} ${unit}`}`} style={{ outline: "none" }}>
                  <rect x={x(i)} y={0} width={band} height={y0 + 40} fill="transparent" />
                  {d.y === null ? (
                    <line x1={cx} x2={cx + bw} y1={y0} y2={y0} stroke={tokens.neutral[400]} strokeWidth={2} strokeDasharray="2 2" />
                  ) : (
                    <path d={barPath(cx, bw, y0, y(d.y))} fill={fill} opacity={hover === null || hover === i ? 1 : 0.55} />
                  )}
                </g>
              );
            })}
            <line x1={x(0)} x2={x(data.length)} y1={y0} y2={y0} stroke={tokens.neutral[400]} strokeWidth={1} />
            {reference && (
              <g>
                <line x1={x(0)} x2={x(data.length)} y1={y(reference.value)} y2={y(reference.value)} stroke={color.ink} strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={x(0) + 4} y={y(reference.value) - 5} textAnchor="start" fontSize={11} fill={color.ink} style={{ ...numeric, paintOrder: "stroke", stroke: color.surface, strokeWidth: 3 }}>
                  {reference.label}
                </text>
              </g>
            )}
            {hover !== null && data[hover] && (
              <Tip x={x(hover) + band / 2} y={data[hover]!.y === null ? y0 : y(Math.max(0, data[hover]!.y!))} w={w}>
                <strong>{data[hover]!.x}</strong>
                <br />
                {data[hover]!.y === null ? "No value: not enough valid data" : `${fmt(data[hover]!.y!)} ${unit}`}
                {data[hover]!.note ? ` · ${data[hover]!.note}` : ""}
              </Tip>
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}

/** A single line with markers and an optional straight trend line (descriptive). */
export function LineChart({ title, subtitle, unit, data, digits = 2, trend }: { title: string; subtitle?: ReactNode; unit: string; data: Datum[]; digits?: number; trend?: { slopePerUnit: number; anchor: { i: number; y: number } } | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.y).filter((v): v is number => v !== null);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const pad = (max - min) * 0.15 || 0.05;
  const fmt = (v: number) => v.toFixed(digits);
  return (
    <ChartFrame title={title} subtitle={subtitle} unit={unit} data={data} format={fmt} domain={[min - pad, max + pad]} table={data.map((d) => ({ x: d.x, y: d.y === null ? "no value (insufficient data)" : fmt(d.y) }))}>
      {({ x, band, y, w }) => {
        const cx = (i: number) => x(i) + band / 2;
        const segs: string[] = [];
        let cur = "";
        data.forEach((d, i) => {
          if (d.y === null) {
            if (cur) segs.push(cur);
            cur = "";
          } else cur += `${cur ? "L" : "M"}${cx(i)},${y(d.y)} `;
        });
        if (cur) segs.push(cur);
        return (
          <>
            {trend && (
              <line
                x1={cx(0)}
                x2={cx(data.length - 1)}
                y1={y(trend.anchor.y + trend.slopePerUnit * (0 - trend.anchor.i))}
                y2={y(trend.anchor.y + trend.slopePerUnit * (data.length - 1 - trend.anchor.i))}
                stroke={color.inkMuted}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            )}
            {segs.map((s, k) => (
              <path key={k} d={s} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {data.map((d, i) =>
              d.y === null ? null : (
                <g key={d.x} tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${d.x}: ${fmt(d.y)} ${unit}`} style={{ outline: "none" }}>
                  <circle cx={cx(i)} cy={y(d.y)} r={12} fill="transparent" />
                  <circle cx={cx(i)} cy={y(d.y)} r={hover === i ? 5 : 4} fill={SERIES} stroke={color.surfaceRaised} strokeWidth={2} />
                </g>
              ),
            )}
            {hover !== null && data[hover]?.y != null && (
              <Tip x={cx(hover)} y={y(data[hover]!.y!)} w={w}>
                <strong>{data[hover]!.x}</strong>
                <br />
                {fmt(data[hover]!.y!)} {unit}
              </Tip>
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
