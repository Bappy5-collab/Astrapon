import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { OptionResult, PlannerInput, PlannerResult, Scenario } from "@/domain/water/plan";
import { color, radius, tokens } from "@/theme/tokens";

/** Written-out number formatting (no Intl: identical on server and browser). */
export function num(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const fixed = Math.abs(v) >= 1000 ? Math.round(v).toString() : v.toFixed(digits);
  const [i, d] = fixed.split(".");
  return `${i!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${d ? `.${d}` : ""}`;
}
export const rangeText = (r: Record<Scenario, number> | null | undefined, digits = 1, unit = "") =>
  !r ? "—" : Math.abs(r.low - r.high) < 10 ** -digits ? `${num(r.low, digits)}${unit}` : `${num(r.low, digits)}–${num(r.high, digits)}${unit}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string | null) => (key ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : "—");

/** Evidence-class chip for the water module (observed, mapped, modelled, farmer, hypothetical, unavailable). */
export function ClassChip({ kind }: { kind: "observed" | "mapped" | "modelled" | "farmer" | "hypothetical" | "unavailable" | "assumption" }) {
  const map = {
    observed: { label: "Observed record", bg: "#DDEBF6", fg: "#18476B" },
    mapped: { label: "Mapped feature", bg: "#E1EEF1", fg: "#1E5560" },
    modelled: { label: "Modelled estimate", bg: tokens.lime[200], fg: tokens.forest[900] },
    farmer: { label: "Your input", bg: "#F1E7D6", fg: "#5C4320" },
    hypothetical: { label: "Hypothetical", bg: "#EFE3F3", fg: "#5A2E6B" },
    assumption: { label: "Stated assumption", bg: tokens.neutral[200], fg: tokens.neutral[800] },
    unavailable: { label: "Unavailable", bg: "#F6DED6", fg: tokens.clay },
  }[kind];
  return <Chip size="small" label={map.label} sx={{ height: 22, fontWeight: 700, bgcolor: map.bg, color: map.fg }} />;
}

const SUPPLY: Record<OptionResult["totals"]["supplyStatus"], string> = {
  unknown: "Unknown (no source limit entered)",
  within_limits: "Within the limits you entered",
  exceeds_capacity: "Exceeds the source capacity you entered",
  exceeds_budget: "Exceeds your seasonal water allowance",
  exceeds_both: "Exceeds both capacity and allowance",
};

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Box sx={{ minWidth: 150, flex: "1 1 150px", p: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.surface, border: `1px solid ${tokens.neutral[200]}` }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {note && (
        <Typography variant="caption" color="text.secondary" component="div">
          {note}
        </Typography>
      )}
    </Box>
  );
}

function OptionCard({ o, input, first }: { o: OptionResult; input: PlannerInput; first: boolean }) {
  const t = o.totals;
  return (
    <Box component="article" aria-label={o.label} sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: `${radius.lg}px`, border: `1px solid ${first ? tokens.forest[400] : color.line}`, bgcolor: color.surfaceRaised }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 1 }}>
        <Typography component="h3" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
          {o.label}
        </Typography>
        <Chip size="small" label={o.kind === "baseline" ? "Current rotation" : o.kind === "alternative" ? "Alternative" : "Your demand"} sx={{ height: 22 }} />
        <ClassChip kind={o.kind === "manual" ? (input.demand.mode === "manual" && input.demand.basis === "farmer_report" ? "farmer" : "hypothetical") : "modelled"} />
      </Stack>
      {o.unavailable && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {o.unavailable}
        </Alert>
      )}
      <Stack direction="row" useFlexGap spacing={1.25} sx={{ flexWrap: "wrap" }}>
        <Metric label="Water to pump per year (gross)" value={t.grossM3PerYear == null ? "—" : `${num(t.grossM3PerYear, 0)} m³`} note={o.window ? `Replay window ${o.window.years.join("–")}` : input.demand.mode === "manual" ? "Your stated months" : undefined} />
        {o.annual.grossMedianM3 != null && <Metric label="Median / dry year (80th pct)" value={`${num(o.annual.grossMedianM3, 0)} / ${num(o.annual.grossP80M3, 0)} m³`} note={`Net need ${num(o.annual.netMedianMm, 0)} / ${num(o.annual.netP80Mm, 0)} mm`} />}
        <Metric label="Peak month, average day" value={t.peakDailyM3 == null ? "—" : `${num(t.peakDailyM3, 1)} m³/day`} note={monthLabel(t.peakMonth)} />
        <Metric label="Flow at peak" value={rangeText(t.peakFlowM3PerH, 2, " m³/h")} />
        <Metric label="Total head at peak" value={rangeText(t.peakHeadM, 1, " m")} />
        <Metric label="Pump electrical power" value={rangeText(t.peakPowerKW, 2, " kW")} />
        <Metric label="Pumping energy per year" value={rangeText(t.energyKWhPerYear, 0, " kWh")} />
        <Metric label={input.solar.mode === "evaluate" ? "Lowest monthly solar coverage" : "PV needed (critical month)"} value={input.solar.mode === "evaluate" ? (t.worstCoverage ? `${rangeText({ low: t.worstCoverage.high * 100, high: t.worstCoverage.low * 100 }, 0, " %")}` : "—") : rangeText(t.requiredKwp, 2, " kWp")} note={t.criticalSolarMonth ? `Critical: ${monthLabel(t.criticalSolarMonth)}` : undefined} />
        {input.solar.mode === "size" && t.requiredKwpLowSunDay && <Metric label="PV for a low-sun day" value={rangeText(t.requiredKwpLowSunDay, 2, " kWp")} note="10th-percentile day of that month" />}
        {input.solar.mode === "evaluate" && <Metric label="Solar energy shortfall per year" value={rangeText(t.deficitKWhPerYear, 0, " kWh")} />}
        <Metric label="Water supply" value={SUPPLY[t.supplyStatus]} note={t.supplyDeficitM3PerYear ? `Deficit ≈ ${num(t.supplyDeficitM3PerYear, 0)} m³/yr` : undefined} />
        {t.tankDaysOfPeak != null && <Metric label="Tank holds" value={`${num(t.tankDaysOfPeak, 1)} peak days`} />}
      </Stack>
      {t.instantaneous && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          At full sun (1 kW/m²) your array {t.instantaneous.high === "sufficient" ? "can" : t.instantaneous.low === "sufficient" ? "can only in the low scenario" : "cannot"} supply the pump&apos;s peak electrical power.
        </Typography>
      )}
      {t.frictionShareOfHead != null && t.frictionShareOfHead > 0.5 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {num(t.frictionShareOfHead * 100, 0)} % of the pump&apos;s head at peak flow is lost to pipe and fitting friction (water moving at {num(t.peakVelocityMPerS, 1)} m/s). A wider pipe, a shorter route or longer pumping hours would need much less power and energy; check the pipe size with your installer.
        </Alert>
      )}
      {t.gravityAssisted && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          In the low scenario the total head is zero or negative: water could flow by gravity, so no pump energy is counted for those months.
        </Typography>
      )}
      {o.months.length > 0 && (
        <Box component="details" sx={{ mt: 1.5 }}>
          <Box component="summary" sx={{ cursor: "pointer", fontWeight: 600, color: tokens.forest[600] }}>
            Month by month
          </Box>
          <Box sx={{ overflowX: "auto", mt: 1 }}>
            <Table size="small" aria-label={`Monthly water and energy for ${o.label}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Net need (mm)</TableCell>
                  <TableCell align="right">Gross (m³)</TableCell>
                  <TableCell align="right">Flow (m³/h)</TableCell>
                  <TableCell align="right">Head (m)</TableCell>
                  <TableCell align="right">Energy (kWh)</TableCell>
                  <TableCell align="right">Sun (h/day)</TableCell>
                  <TableCell align="right">{input.solar.mode === "evaluate" ? "Coverage" : "PV (kWp)"}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {o.months.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell>{monthLabel(m.key)}</TableCell>
                    <TableCell align="right">{num(m.netMm, 1)}</TableCell>
                    <TableCell align="right">{num(m.grossM3, 0)}</TableCell>
                    <TableCell align="right">{m.pump ? rangeText({ low: m.pump.low.flowM3PerH, high: m.pump.high.flowM3PerH }, 2) : "—"}</TableCell>
                    <TableCell align="right">{m.pump && (m.grossM3 ?? 0) > 0 ? rangeText({ low: m.pump.low.head.totalHeadM, high: m.pump.high.head.totalHeadM }, 1) : "—"}</TableCell>
                    <TableCell align="right">{m.pump ? rangeText({ low: m.pump.low.energyKWh, high: m.pump.high.energyKWh }, 0) : "—"}</TableCell>
                    <TableCell align="right">{num(m.pv?.meanPsh ?? null, 2)}</TableCell>
                    <TableCell align="right">{input.solar.mode === "evaluate" ? (m.pv?.coverage ? `${num(m.pv.coverage.high * 100, 0)}–${num(m.pv.coverage.low * 100, 0)} %` : "—") : (m.grossM3 ?? 0) > 0 ? rangeText(m.pv?.requiredKwp, 2) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Monthly values are sums of the engine&apos;s daily water balance over one historical replay window; they are not an observed or forecast daily schedule.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** Results of one planner calculation (live or saved). Pure rendering; reads only the given result. */
export function ResultsView({ result, input }: { result: PlannerResult; input: PlannerInput }) {
  const order = result.comparison.energyRanking ?? result.options.map((o) => o.optionId);
  const options = [...result.options].sort((a, b) => order.indexOf(a.optionId) - order.indexOf(b.optionId));
  return (
    <Box>
      {result.pumpUnavailable && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {result.pumpUnavailable}
        </Alert>
      )}
      {result.solarUnavailable && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {result.solarUnavailable}
        </Alert>
      )}
      <Typography variant="body2" sx={{ mb: 2 }}>
        Ranges show a low and a high scenario from the uncertain inputs (depth, route length, fittings). {result.comparison.energyRankingNote}
      </Typography>
      {options.map((o, i) => (
        <OptionCard key={o.optionId} o={o} input={input} first={i === 0 && !!result.comparison.energyRanking} />
      ))}
      <Alert severity="info" sx={{ mb: 2 }}>
        Operational feasibility is not verified: only the daily energy balance is modelled. A pump also needs enough power at every moment it runs, a suitable controller and start-up behaviour, and (for surface pumps) acceptable suction lift. Historical solar averages are not a forecast.
      </Alert>
      <Box component="details" sx={{ mb: 1 }}>
        <Box component="summary" sx={{ cursor: "pointer", fontWeight: 600, color: tokens.forest[600] }}>
          Assumptions and gaps ({result.assumptions.length + result.gaps.length})
        </Box>
        <Typography component="h4" variant="subtitle2" sx={{ mt: 1 }}>
          Gaps
        </Typography>
        <Box component="ul" sx={{ mt: 0.5, pl: 3 }}>
          {result.gaps.length ? result.gaps.map((g) => <li key={g}>{g}</li>) : <li>None recorded.</li>}
        </Box>
        <Typography component="h4" variant="subtitle2">
          Assumptions
        </Typography>
        <Box component="ul" sx={{ mt: 0.5, pl: 3 }}>
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Model: Astrapon water-energy {result.modelVersion}. Methods: docs/water-energy-methodology.md.
        </Typography>
      </Box>
    </Box>
  );
}
