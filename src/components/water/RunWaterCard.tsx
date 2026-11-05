import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { Section } from "@/components/farm/ui";
import { ButtonLink } from "@/components/links";
import type { RunDemand } from "@/domain/water/demand";
import type { PlannerResult } from "@/domain/water/plan";

import { num, rangeText } from "./ResultsView";

/**
 * Water & Energy beside the rotation comparison. Shows the newest saved water plan made from this
 * run (stored values only), or what the run can offer the planner. It never changes the ranking.
 */
export function RunWaterCard({ fieldId, runId, demand, saved }: { fieldId: string; runId: string; demand: RunDemand; saved: { id: string; version: number; name: string; createdAt: string; result: PlannerResult } | null }) {
  const href = `/fields/${fieldId}/water?run=${runId}`;
  return (
    <Section
      title="Water & Energy for these options"
      intro="Irrigation water to pump, pump energy and solar size for each compared rotation, on the same weather years. An Astrapon extension; it does not change the ranking above."
      aside={undefined}
    >
      {saved ? (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>
            From saved version v{saved.version} “{saved.name}” ({saved.createdAt.slice(0, 10)}). Ranges are the low and high scenarios of that version.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Water and energy per option">
              <TableHead>
                <TableRow>
                  <TableCell>Option</TableCell>
                  <TableCell align="right">Water pumped (m³/yr)</TableCell>
                  <TableCell align="right">Energy (kWh/yr)</TableCell>
                  <TableCell align="right">Peak power (kW)</TableCell>
                  <TableCell align="right">PV needed (kWp)</TableCell>
                  <TableCell>Water supply</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {saved.result.options.map((o) => (
                  <TableRow key={o.optionId}>
                    <TableCell>{o.label}</TableCell>
                    <TableCell align="right">{num(o.totals.grossM3PerYear, 0)}</TableCell>
                    <TableCell align="right">{rangeText(o.totals.energyKWhPerYear, 0)}</TableCell>
                    <TableCell align="right">{rangeText(o.totals.peakPowerKW, 2)}</TableCell>
                    <TableCell align="right">{rangeText(o.totals.requiredKwp, 2)}</TableCell>
                    <TableCell>{o.totals.supplyStatus === "unknown" ? "Unknown (no limit entered)" : o.totals.supplyStatus.replaceAll("_", " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {saved.result.comparison.energyRankingNote}
          </Typography>
        </>
      ) : demand.unavailable ? (
        <Alert severity="info">{demand.unavailable}</Alert>
      ) : (
        <Typography variant="body2">
          This comparison has irrigation need for {demand.options.filter((o) => !o.unavailable).length} of {demand.options.length} option(s). Choose a water source and pump details to see energy and solar size.
        </Typography>
      )}
      <ButtonLink href={href} variant="outlined" sx={{ mt: 1.5 }}>
        {saved ? "Open Water & Energy" : "Plan water and energy"}
      </ButtonLink>
    </Section>
  );
}
