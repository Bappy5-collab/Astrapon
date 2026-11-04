"use client";

import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import SkipPreviousRoundedIcon from "@mui/icons-material/SkipPreviousRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { SceneShell } from "@/components/field3d/FieldViewport";
import { buildSceneData, FIELD_KEY } from "@/components/field3d/model";
import { SceneMessage } from "@/components/scene/SceneMessage";
import type { BoundaryGeometry } from "@/domain/geo/boundary";
import type { StrategyView, TimelineView } from "@/domain/simulation/engine";
import {
  dateOf,
  dayValues,
  markers as markersOf,
  monthlySummary,
  plantingOn,
  sceneStage,
} from "@/domain/simulation/view";
import { useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { useReducedMotion } from "@/lib/preferences";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import { useFmt, useOptionName } from "./format";
import { soilTint, type ReplayPanel } from "./ReplayScene";

const ReplayScene = dynamic(() => import("./ReplayScene"), {
  ssr: false,
  loading: () => <SceneMessage title="Loading 3D replay…" busy />,
});

const SPEEDS = [7, 15, 30, 60] as const;

export type ReplayGeometry = {
  boundary: BoundaryGeometry;
  zones: { id: string; name: string; boundary: BoundaryGeometry }[];
} | null;

/**
 * Day-by-day replay of the stored timeline. Playback only moves an index into stored arrays, so
 * speed, scrubbing and frame rate cannot change any number. Every scene fact is repeated in the
 * selected-date table and the monthly table.
 */
export function ReplayPlayer({
  timeline,
  options,
  ranking,
  geometry,
}: {
  timeline: TimelineView;
  options: StrategyView[];
  ranking: string[];
  geometry: ReplayGeometry;
}) {
  const t = useT();
  const [tech, setTech] = useState(false);
  const f = useFmt();
  const optionName = useOptionName();
  const reduced = useReducedMotion();
  // Default (SSR-safe) mode: the first client render matches the server, then the real width applies.
  const wide = useMediaQuery("(min-width: 900px)");
  const days = timeline.days;
  // Open on a day when the first option shown (usually the existing practice) has a crop in the
  // ground, a few weeks after its first planting in the window, so the scene is not empty.
  const [day, setDay] = useState(() => {
    const lead = timeline.strategies.find((x) => x.id === options[0]?.id) ?? timeline.strategies[0];
    const p = lead?.plantings.find((x) => x.start >= 0 && x.start < days);
    if (p) return Math.min(days - 1, p.start + Math.min(60, Math.floor((p.end - p.start) / 2)));
    const first = timeline.strategies.flatMap((x) => x.plantings.map((q) => q.start)).filter((d) => d >= 0 && d < days);
    return first.length ? Math.min(...first) : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(15);
  const [layout, setLayout] = useState<"side" | "single">("side");
  const [shown, setShown] = useState(options[0]?.id ?? "");
  const [selected, setSelected] = useState<{
    panelId: string;
    key: string;
  } | null>(null);

  // Existing practice plus the two best-ranked alternatives side by side; any option one at a time.
  const sideIds = useMemo(() => {
    const base = options.filter((o) => o.kind === "baseline").map((o) => o.id);
    const alts = ranking
      .filter((id) => id !== "baseline" && options.some((o) => o.id === id))
      .slice(0, base.length ? 2 : 3);
    return [...base, ...alts];
  }, [options, ranking]);
  const side = wide && layout === "side" && sideIds.length > 1;
  const panelIds = useMemo(
    () => (side ? sideIds : [shown]),
    [side, sideIds, shown],
  );
  const byId = useMemo(
    () => new Map(timeline.strategies.map((s) => [s.id, s])),
    [timeline],
  );
  const nameOf = (id: string) => {
    const o = options.find((x) => x.id === id);
    return o ? optionName(o) : id;
  };

  // Playback: advances a day index from elapsed time (frame-rate independent); never recomputes.
  const playRef = useRef({ last: 0, acc: 0 });
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    playRef.current = { last: performance.now(), acc: 0 };
    const tick = (now: number) => {
      const r = playRef.current;
      r.acc += ((now - r.last) / 1000) * speed;
      r.last = now;
      if (r.acc >= 1) {
        const step = Math.floor(r.acc);
        r.acc -= step;
        setDay((d) => Math.min(days - 1, d + step));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, days]);
  const atEnd = day >= days - 1;
  const isPlaying = playing && !atEnd;

  const scene = useMemo(() => {
    if (!geometry) return null;
    try {
      return buildSceneData(
        geometry.boundary,
        geometry.zones.map((z) => ({
          key: z.id,
          name: z.name,
          boundary: z.boundary,
        })),
      );
    } catch {
      return null;
    }
  }, [geometry]);

  const events = useMemo(
    () => markersOf(timeline, panelIds),
    [timeline, panelIds],
  );
  const jump = (dir: 1 | -1) => {
    const next =
      dir > 0
        ? events.find((m) => m.day > day)
        : [...events].reverse().find((m) => m.day < day);
    if (next) setDay(next.day);
  };

  const panels: ReplayPanel[] = panelIds.filter((id) => byId.has(id)).map((id) => {
    const s = byId.get(id)!;
    const p = plantingOn(s, day);
    return {
      id,
      crop: p?.planting.crop ?? null,
      stage: sceneStage(p),
      growth: p?.growth ?? 0,
      depletion: s.depletion[day] ?? null,
      irrigated: (s.irrigation[day] ?? 0) > 0,
    };
  });
  // The scene follows `day` at once; the text tables may lag a frame behind on slow devices.
  const tableDay = useDeferredValue(day);
  const date = dateOf(timeline, day);
  const tableDate = dateOf(timeline, tableDay);
  const onPick = useCallback((panelId: string, key: string) => setSelected({ panelId, key }), []);
  const rain = timeline.weather.precip[day] ?? null;
  const zoneName = (key: string) =>
    geometry?.zones.find((z) => z.id === key)?.name ?? key;
  const label = (stage: string | null) =>
    stage ? t(`sim.stage.${stage}` as "sim.stage.initial") : "—";

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{
          mb: 1.5,
          alignItems: { md: "center" },
          justifyContent: "space-between",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {fmt(t("sim.window"), {
            years:
              timeline.years.length > 1
                ? `${timeline.years[0]}–${timeline.years.at(-1)}`
                : String(timeline.years[0]),
          })}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}
        >
          {wide && sideIds.length > 1 && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={layout}
              onChange={(_, v) => v && setLayout(v)}
              aria-label={t("sim.view")}
            >
              <ToggleButton value="side">{t("sim.view.side")}</ToggleButton>
              <ToggleButton value="single">{t("sim.view.single")}</ToggleButton>
            </ToggleButtonGroup>
          )}
          {!side && (
            <TextField
              select
              size="small"
              label={t("sim.showing")}
              value={shown}
              onChange={(e) => setShown(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              {options.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {optionName(o)} · {o.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Stack>

      {/* Names of the field copies, left to right, so the 3D view never relies on colour or position alone. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${panelIds.length}, minmax(0, 1fr))`,
          gap: 1,
          mb: 1,
        }}
        aria-hidden={panelIds.length === 1}
      >
        {panelIds.map((id, i) => (
          <Typography
            key={id}
            variant="caption"
            sx={{
              textAlign: "center",
              fontWeight: 700,
              color: color.ink,
              overflowWrap: "anywhere",
            }}
          >
            {nameOf(id)}: {panels[i]?.crop ?? t("sim.bare")}
          </Typography>
        ))}
      </Box>

      <Box
        sx={{
          height: { xs: 340, md: side ? 440 : 400 },
          borderRadius: `${radius.lg}px`,
          overflow: "hidden",
          border: `1px solid ${color.line}`,
        }}
      >
        {scene ? (
          <SceneShell
            label={t("sim.illustrative")}
            selectedLabel={
              selected
                ? `${nameOf(selected.panelId)}${selected.key !== FIELD_KEY ? ` · ${zoneName(selected.key)}` : ""}`
                : null
            }
            renderScene={(c) => (
              <ReplayScene
                data={scene}
                panels={panels}
                rainMm={rain}
                selected={selected}
                onSelect={onPick}
                animateWeather={!reduced}
                {...c}
              />
            )}
          />
        ) : (
          <SceneMessage
            title={t("sim.noTimeline")}
            body="The field outline is not available, so the 3D replay cannot be drawn. The tables below show every value."
          />
        )}
      </Box>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}
      >
        {timeline.soilKnown ? (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Box
              aria-hidden
              sx={{
                width: 64,
                height: 10,
                borderRadius: 1,
                background: `linear-gradient(90deg, ${soilTint(0)}, ${soilTint(1)})`,
                border: `1px solid ${color.line}`,
              }}
            />
            <Typography variant="caption">
              {t("sim.legend.moisture")}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption">
            {t("sim.legend.unknownSoil")}
          </Typography>
        )}
        {timeline.irrigationMode === "full" && (
          <Typography variant="caption">
            {t("sim.legend.irrigation")}
          </Typography>
        )}
        {!reduced && (
          <Typography variant="caption">{t("sim.rainNote")}</Typography>
        )}
      </Stack>
      {selected && selected.key !== FIELD_KEY && (
        <Alert severity="info" sx={{ mt: 1 }} onClose={() => setSelected(null)}>
          {fmt(t("sim.zoneNote"), { zone: zoneName(selected.key) })}
        </Alert>
      )}

      {/* Timeline controls */}
      <Box
        sx={{
          mt: 2,
          p: { xs: 1.5, md: 2 },
          borderRadius: `${radius.md}px`,
          bgcolor: color.surfaceRaised,
          border: `1px solid ${color.line}`,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Stack
            direction="row"
            spacing={0.5}
            role="toolbar"
            aria-label={t("sim.scrubber")}
          >
            <Tooltip title={isPlaying ? t("sim.pause") : t("sim.play")}>
              <IconButton
                onClick={() => {
                  if (atEnd) setDay(0);
                  setPlaying(!isPlaying);
                }}
                aria-label={isPlaying ? t("sim.pause") : t("sim.play")}
                sx={{
                  bgcolor: tokens.forest[800],
                  color: tokens.neutral[0],
                  "&:hover": { bgcolor: tokens.forest[900] },
                }}
              >
                {isPlaying ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title={t("sim.reset")}>
              <IconButton
                aria-label={t("sim.reset")}
                onClick={() => {
                  setPlaying(false);
                  setDay(0);
                }}
              >
                <ReplayRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("sim.prevEvent")}>
              <IconButton
                aria-label={t("sim.prevEvent")}
                onClick={() => jump(-1)}
              >
                <SkipPreviousRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("sim.prevDay")}>
              <IconButton
                aria-label={t("sim.prevDay")}
                onClick={() => setDay((d) => Math.max(0, d - 1))}
              >
                <ChevronLeftRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("sim.nextDay")}>
              <IconButton
                aria-label={t("sim.nextDay")}
                onClick={() => setDay((d) => Math.min(days - 1, d + 1))}
              >
                <ChevronRightRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("sim.nextEvent")}>
              <IconButton
                aria-label={t("sim.nextEvent")}
                onClick={() => jump(1)}
              >
                <SkipNextRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography
            aria-live="polite"
            sx={{ ...numeric, fontWeight: 700, minWidth: 170 }}
          >
            {f.date(date)}
          </Typography>
          <TextField
            select
            size="small"
            label={t("sim.speed")}
            value={speed}
            onChange={(e) =>
              setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])
            }
            sx={{ minWidth: 180, ml: { sm: "auto" } }}
          >
            {SPEEDS.map((s) => (
              <MenuItem key={s} value={s}>
                {fmt(t("sim.speedValue"), { n: f.int(s) })}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Box sx={{ position: "relative", px: 1, mt: 1 }}>
          <Slider
            value={day}
            min={0}
            max={days - 1}
            step={1}
            onChange={(_, v) => {
              setPlaying(false);
              setDay(v as number);
            }}
            getAriaValueText={(v) => f.date(dateOf(timeline, v))}
            aria-label={t("sim.scrubber")}
            valueLabelDisplay="off"
            sx={{ color: tokens.forest[700] }}
          />
          <Box aria-hidden sx={{ position: "relative", height: 16, mx: "2px" }}>
            {events.map((m, i) => (
              <Box
                key={`${m.strategyId}-${m.kind}-${m.day}-${i}`}
                title={`${f.date(dateOf(timeline, m.day))}: ${m.kind === "plant" ? "▲" : "▼"} ${m.crop} (${nameOf(m.strategyId)})`}
                sx={{
                  position: "absolute",
                  left: `${(m.day / Math.max(1, days - 1)) * 100}%`,
                  transform: "translateX(-50%)",
                  fontSize: 11,
                  lineHeight: 1,
                  color: m.kind === "plant" ? tokens.forest[700] : tokens.clay,
                }}
              >
                {m.kind === "plant" ? "▲" : "▼"}
              </Box>
            ))}
          </Box>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="caption" color="text.secondary" sx={numeric}>
              {f.shortDate(timeline.startDate)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("sim.markers")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={numeric}>
              {f.shortDate(dateOf(timeline, days - 1))}
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* Selected-date inspection: the text equivalent of the scene. */}
      <Box component="section" aria-labelledby="day-h" sx={{ mt: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", mb: 1 }}>
          <Typography id="day-h" variant="h6" component="h3">
            {fmt(t("sim.day.title"), { date: f.date(tableDate) })}
          </Typography>
          <FormControlLabel className="no-print" control={<Switch size="small" checked={tech} onChange={(e) => setTech(e.target.checked)} />} label={<Typography variant="body2">{t("sim.day.tech")}</Typography>} />
        </Stack>
        <Typography variant="body2" sx={{ mb: 1, ...numeric }}>
          {t("sim.day.weather")}: {t("sim.col.rain")} {f.num(timeline.weather.precip[tableDay] ?? null)} mm ·{" "}
          {t("sim.col.tmax")} {f.num(timeline.weather.tmax[tableDay])} °C ·{" "}
          {t("sim.col.tmin")} {f.num(timeline.weather.tmin[tableDay])} °C ·{" "}
          {t("sim.col.et0")} {f.num(timeline.weather.et0[tableDay])} mm
        </Typography>
        <Box
          sx={{
            overflowX: "auto",
            border: `1px solid ${color.line}`,
            borderRadius: `${radius.md}px`,
          }}
        >
          <Table size="small" aria-labelledby="day-h">
            <TableHead>
              <TableRow>
                <TableCell>{t("sim.col.option")}</TableCell>
                <TableCell>{t("sim.col.crop")}</TableCell>
                <TableCell>{t("sim.col.stage")}</TableCell>
                {tech && <TableCell align="right">{t("sim.col.kc")}</TableCell>}
                <TableCell align="right">{t("sim.col.etc")} (mm)</TableCell>
                <TableCell align="right">{t("sim.col.eta")} (mm)</TableCell>
                <TableCell align="right">{t("sim.col.depletion")}</TableCell>
                {tech && <TableCell align="right">{t("sim.col.ks")}</TableCell>}
                <TableCell align="right">
                  {t("sim.col.irrigation")} (mm)
                </TableCell>
                {tech && (
                  <TableCell align="right">
                    {t("sim.col.drainage")} (mm)
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {options.map((o) => {
                const s = byId.get(o.id);
                if (!s) return null;
                const v = dayValues(timeline, s, tableDay);
                const on = panelIds.includes(o.id);
                return (
                  <TableRow
                    key={o.id}
                    selected={selected?.panelId === o.id}
                    sx={on ? undefined : { opacity: 0.85 }}
                  >
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                    >
                      {optionName(o)}
                    </TableCell>
                    <TableCell colSpan={v.crop ? 1 : tech ? 9 : 6} sx={{ minWidth: 150 }}>
                      {v.crop ?? t("sim.noCrop")}
                      {v.crop && v.dayInCrop != null && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", ...numeric }}
                        >
                          {t("sim.col.dayInCrop")} {f.int(v.dayInCrop)} /{" "}
                          {f.int(v.cropDays ?? 0)}
                          {v.potentialOnly
                            ? ` · ${t("sim.potentialOnly")}`
                            : ""}
                        </Typography>
                      )}
                    </TableCell>
                    {v.crop && (
                      <>
                        <TableCell>{label(v.stage)}</TableCell>
                        {tech && (
                          <TableCell align="right" sx={numeric}>
                            {f.num(v.kc, 2)}
                          </TableCell>
                        )}
                        <TableCell align="right" sx={numeric}>
                          {f.num(v.etc)}
                        </TableCell>
                        <TableCell align="right" sx={numeric}>
                          {f.num(v.eta)}
                        </TableCell>
                        <TableCell align="right" sx={numeric}>
                          {f.pct(v.depletion)}
                        </TableCell>
                        {tech && (
                          <TableCell align="right" sx={numeric}>
                            {f.num(v.ks, 2)}
                          </TableCell>
                        )}
                        <TableCell align="right" sx={numeric}>
                          {f.num(v.irrigation)}
                        </TableCell>
                        {tech && (
                          <TableCell align="right" sx={numeric}>
                            {f.num(v.drainage)}
                          </TableCell>
                        )}
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.5 }}
        >
          “—” = {t("sim.insufficient")}
        </Typography>
      </Box>

      <MonthlyTables timeline={timeline} options={options} />
    </Box>
  );
}

function MonthlyTables({
  timeline,
  options,
}: {
  timeline: TimelineView;
  options: StrategyView[];
}) {
  const t = useT();
  const f = useFmt();
  const optionName = useOptionName();
  const [id, setId] = useState(options[0]?.id ?? "");
  const s = timeline.strategies.find((x) => x.id === id);
  const rows = useMemo(
    () => (s ? monthlySummary(timeline, s) : []),
    [timeline, s],
  );
  return (
    <Box
      component="details"
      sx={{
        mt: 2.5,
        "& > summary": { cursor: "pointer", fontWeight: 600, py: 0.5 },
      }}
    >
      <summary>{t("sim.monthly")}</summary>
      <TextField
        select
        size="small"
        label={t("sim.col.option")}
        value={id}
        onChange={(e) => setId(e.target.value)}
        sx={{ my: 1.5, minWidth: 240 }}
      >
        {options.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {optionName(o)} · {o.label}
          </MenuItem>
        ))}
      </TextField>
      <Box
        sx={{
          overflowX: "auto",
          border: `1px solid ${color.line}`,
          borderRadius: `${radius.md}px`,
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("sim.col.month")}</TableCell>
              <TableCell>{t("sim.col.crop")}</TableCell>
              <TableCell align="right">{t("sim.col.rain")} (mm)</TableCell>
              <TableCell align="right">{t("sim.col.etc")} (mm)</TableCell>
              <TableCell align="right">{t("sim.col.eta")} (mm)</TableCell>
              <TableCell align="right">
                {t("sim.col.irrigation")} (mm)
              </TableCell>
              <TableCell align="right">{t("sim.col.stressDays")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {f.month(r.month)}
                </TableCell>
                <TableCell>
                  {r.crops.length ? (
                    r.crops.join(", ")
                  ) : (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t("sim.bare")}
                    />
                  )}
                </TableCell>
                <TableCell align="right" sx={numeric}>
                  {f.num(r.rainMm)}
                </TableCell>
                <TableCell align="right" sx={numeric}>
                  {f.num(r.etcMm)}
                </TableCell>
                <TableCell align="right" sx={numeric}>
                  {f.num(r.etaMm)}
                </TableCell>
                <TableCell align="right" sx={numeric}>
                  {f.num(r.irrigationMm)}
                </TableCell>
                <TableCell align="right" sx={numeric}>
                  {r.stressDays == null ? "—" : f.int(r.stressDays)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
