import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader, Section } from "@/components/farm/ui";
import { ButtonLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { ResultsView } from "@/components/water/ResultsView";
import { basisText } from "@/domain/water/plan";
import { requireUser } from "@/server/auth/session";
import { getWaterPlan } from "@/server/water/queries";

export const metadata: Metadata = { title: "Saved water & energy version" };

const rangeOf = (r: { low: number; high: number } | null) => (r ? (r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`) : "unknown");

type Evidence = {
  surface?: { selected?: { name?: string | null; category?: string; lastEdited?: string | null } | null; search?: { osmBase?: string | null } } | null;
  groundwater?: { providers?: { name: string; outcome: string }[]; asOf?: string } | null;
  solar?: { apiVersion?: string | null; retrievedAt?: string; units?: string; requestedYears?: [number, number] } | null;
};

export default async function WaterPlanPage({ params }: PageProps<"/fields/[fieldId]/water/plans/[planId]">) {
  const { fieldId, planId } = await params;
  const user = await requireUser(`/fields/${fieldId}/water/plans/${planId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Water & Energy" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) notFound();
  const plan = await getWaterPlan(user.supabase, planId);
  if (!plan || plan.fieldId !== fieldId) notFound();
  const i = plan.inputs;
  const ev = plan.evidence as Evidence;
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader
        crumbs={[{ href: "/workspace", label: "My fields" }, { href: `/fields/${fieldId}/water`, label: "Water & Energy" }]}
        title={`v${plan.version} · ${plan.name}`}
        eyebrow="Saved version"
        subtitle={`Saved ${plan.createdAt.slice(0, 16).replace("T", " ")} UTC with model ${plan.modelVersion}. Shown exactly as stored; nothing is recalculated.`}
        actions={
          <>
            <ButtonLink href={`/fields/${fieldId}/water/plans/${planId}/export`} variant="outlined">
              Export JSON
            </ButtonLink>
            <ButtonLink href={`/fields/${fieldId}/water`} variant="contained">
              Open the planner
            </ButtonLink>
          </>
        }
      />
      <Section title="Inputs and evidence used">
        <Box component="ul" sx={{ pl: 3, m: 0 }}>
          <li>
            Source: {i.source.label} ({basisText(i.source.basis)}){i.source.straightLineM != null ? `, ${Math.round(i.source.straightLineM)} m straight line` : ""}
            {i.source.geometryNote ? ` (${i.source.geometryNote})` : ""}.
          </li>
          {ev.surface?.selected && (
            <li>
              Mapped feature: {ev.surface.selected.name ?? ev.surface.selected.category}, OpenStreetMap data as of {ev.surface.search?.osmBase?.slice(0, 10) ?? "?"}, map edited {ev.surface.selected.lastEdited?.slice(0, 10) ?? "?"}.
            </li>
          )}
          {i.lift.kind === "well" ? (
            <li>
              Well level: {i.lift.levelKind === "pumping" ? "pumping level" : "static level + drawdown"} {rangeOf(i.lift.depthM)} m below ground ({basisText(i.lift.basis)})
              {i.lift.drawdownM ? `, drawdown ${rangeOf(i.lift.drawdownM)} m` : ""}; delivery {i.lift.deliveryAboveGroundM} m above the well head.
              {i.lift.proxy ? ` Proxy station: ${i.lift.proxy.stationName}, ${(i.lift.proxy.distanceM / 1000).toFixed(1)} km away, latest ${i.lift.proxy.observedAt.slice(0, 10)} (original ${i.lift.proxy.originalValue} ${i.lift.proxy.originalUnit}).` : ""}
            </li>
          ) : (
            <li>
              Delivery point {rangeOf(i.lift.deliveryAboveWaterM)} m above the water surface ({basisText(i.lift.basis)}).
            </li>
          )}
          <li>
            Pipe: {rangeOf(i.pipe.lengthM)} m ({basisText(i.pipe.lengthBasis)}), {i.pipe.innerDiameterMm} mm, roughness {i.pipe.roughnessMm} mm, Σ K {rangeOf(i.pipe.minorLossK)}; outlet pressure {i.deliveryPressureKPa} kPa.
          </li>
          <li>
            Pump-and-motor efficiency {Math.round(i.pump.etaPumpMotor * 100)} %, {i.pump.runtimeHoursPerDay} h/day; PV performance ratio {i.solar.performanceRatio}, controller {Math.round(i.solar.controllerEfficiency * 100)} %
            {i.solar.existingKwp != null ? `, existing array ${i.solar.existingKwp} kWp` : ""}.
          </li>
          <li>
            Demand:{" "}
            {i.demand.mode === "run" ? `stored comparison ${i.demand.runId.slice(0, 8)}… (result ${i.demand.resultSha256.slice(0, 12)}…)` : `${i.demand.dailyGrossM3} m³/day in months ${i.demand.months.join(", ")} (${basisText(i.demand.basis)})`}.
          </li>
          {ev.groundwater && (
            <li>
              Groundwater search ({ev.groundwater.asOf?.slice(0, 10)}): {ev.groundwater.providers?.map((p) => `${p.name}: ${p.outcome.replaceAll("_", " ")}`).join("; ")}.
            </li>
          )}
          {ev.solar && (
            <li>
              NASA POWER solar, {ev.solar.requestedYears?.join("–")}, units {ev.solar.units}, API {ev.solar.apiVersion ?? "?"}, retrieved {ev.solar.retrievedAt?.slice(0, 10)}.
            </li>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Inputs hash {plan.inputsSha256.slice(0, 16)}… · result hash {plan.resultSha256.slice(0, 16)}…
        </Typography>
      </Section>
      <Section title="Result as saved">
        {plan.result.modelVersion !== plan.modelVersion && <Alert severity="warning">Stored model version mismatch.</Alert>}
        <ResultsView result={plan.result} input={plan.inputs} />
      </Section>
    </Container>
  );
}
