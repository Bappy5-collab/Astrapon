import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { Empty, EvidenceChip, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormField, FormSelect } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { RunPanel } from "@/components/simulation/RunPanel";
import { canonicalJson } from "@/domain/reference/canonical";
import { IRRIGATION_ASSUMPTIONS, MAX_PLANTING_WINDOWS, parseScenarioSettings } from "@/domain/scenario/settings";
import { ENGINE_VERSION } from "@/domain/simulation/engine-version";
import { requireUser } from "@/server/auth/session";
import { deleteOwnedRecord, updateScenario } from "@/server/farm/actions";
import { getScenario } from "@/server/farm/queries";
import { cancelRun, reproduceRun, requestSimulation } from "@/server/simulation/actions";
import { listScenarioRuns } from "@/server/simulation/queries";

export const metadata: Metadata = { title: "Scenario" };

const LABELS: Record<(typeof IRRIGATION_ASSUMPTIONS)[number], string> = {
  as_recorded: "As recorded for this field",
  rainfed: "Rainfed (no irrigation)",
  full_irrigation: "Fully irrigated",
};

type PinnedDataset = { id: string; kind: string; name: string; version: number; content_sha256: string };

export default async function ScenarioPage({ params }: PageProps<"/scenarios/[scenarioId]">) {
  const { scenarioId } = await params;
  const user = await requireUser(`/scenarios/${scenarioId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saving scenarios" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(scenarioId)) notFound();
  const sc = await getScenario(user.supabase, scenarioId);
  if (!sc) notFound();

  // Stored settings are re-validated on read; an invalid stored value is shown, never silently replaced.
  const parsed = parseScenarioSettings(sc.settings_schema_version, sc.settings, new Date().getUTCFullYear());
  const s = parsed.ok ? parsed.settings : null;
  const latest = sc.snapshots[0];
  const latestMatches = latest ? canonicalJson(latest.inputs) === canonicalJson(sc.currentInputs) : false;
  const runs = await listScenarioRuns(user.supabase, sc.id);

  // Calendar regions from the published NASS dataset (item keys are "<State>|<crop>").
  const { data: cal } = await user.supabase.from("reference_datasets").select("id").eq("name", "usda-nass-usual-dates-2010").eq("status", "published").order("version", { ascending: false }).limit(1);
  let regions: string[] = [];
  if (cal?.[0]) {
    const { data: items } = await user.supabase.from("reference_items").select("item_key").eq("dataset_id", cal[0].id).limit(1000);
    regions = [...new Set((items ?? []).map((i) => i.item_key.split("|")[0]!))].sort();
  }
  const currentInputs = sc.currentInputs as { field?: { centroid?: unknown } } | null;
  const hasLocation = Boolean(currentInputs?.field?.centroid);
  const windows = s?.plantingWindows ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[{ href: "/farms", label: "Farms" }, { href: `/farms/${sc.farmId}`, label: "Farm" }, { href: `/fields/${sc.field_id}`, label: sc.fieldName }]} title={sc.name}>
        <EvidenceChip evidenceClass="hypothetical_input" />{" "}
        <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
          Settings v{sc.settings_schema_version} · updated {new Date(sc.updated_at).toISOString().replace("T", " ").slice(0, 16)} UTC
        </Typography>
      </PageHeader>

      <Section
        title="Run the rotation comparison"
        intro={
          <>
            Compares your existing rotation with feasible alternatives on the same past weather, your water limits and your priorities. Method:{" "}
            <TextLink href="/methodology#simulation">how the simulation works</TextLink>.
          </>
        }
      >
        <RunPanel
          runs={runs}
          // eslint-disable-next-line react-hooks/purity -- server render time, used only to flag long-queued runs
          renderedAt={Date.now()}
          canRun={Boolean(s) && hasLocation}
          blockedReason={!hasLocation ? "Draw the field boundary first: the engine needs the field's location." : !s ? "Save the scenario settings below first." : undefined}
          actions={{ request: requestSimulation.bind(null, sc.id), reproduce: reproduceRun, cancel: cancelRun }}
        />
      </Section>

      <Section title="Scenario settings" intro="Replay years select past weather to replay. A replay is not a forecast. Planting dates come only from your records, the windows you enter, or (in the US) the USDA NASS calendar for the state you choose.">
        {!s && <Alert severity="warning" sx={{ mb: 2 }}>The stored settings no longer pass validation. Review and save them again.</Alert>}
        {parsed.ok && parsed.upgradedFrom === 1 && <Alert severity="info" sx={{ mb: 2 }}>This scenario was created before planting windows and weather changes existed. Save it once to store the new settings.</Alert>}
        <ActionForm action={updateScenario.bind(null, sc.id)} submitLabel="Save scenario" direction="row">
          <FormField name="name" label="Scenario name" required defaultValue={sc.name} />
          <FormField name="candidateCrops" label="Candidate crops" required defaultValue={s?.candidateCrops.join(", ") ?? ""} helperText="Comma-separated. Your recorded crops are always included." sx={{ minWidth: 280 }} />
          <FormField name="rotationYears" label="Rotation length (years)" type="number" defaultValue={s?.rotationYears ?? 2} helperText="1 to 4" sx={{ width: 190 }} />
          <FormField name="replayFromYear" label="Replay from" type="number" defaultValue={s?.replayFromYear ?? ""} sx={{ width: 130 }} />
          <FormField name="replayToYear" label="Replay to" type="number" defaultValue={s?.replayToYear ?? ""} sx={{ width: 130 }} />
          <FormSelect name="irrigationAssumption" label="Irrigation assumption" options={IRRIGATION_ASSUMPTIONS.map((v) => ({ value: v, label: LABELS[v] }))} defaultValue={s?.irrigationAssumption} />
          <FormSelect
            name="calendarRegion"
            label="Planting calendar (US only)"
            options={[{ value: "", label: "None: use only my own dates" }, ...regions.map((r) => ({ value: r, label: `USDA NASS 2010: ${r}` }))]}
            defaultValue={s?.calendarRegion ?? ""}
            sx={{ minWidth: 260 }}
          />
          <FormField name="turnaroundDays" label="Days between harvest and next planting" type="number" defaultValue={s?.turnaroundDays ?? ""} helperText="Leave empty if unsure (0 is assumed and shown)" sx={{ width: 260 }} />
          <FormField name="precipitationChangePct" label="Rainfall change (%)" type="number" defaultValue={s?.precipitationChangePct ?? 0} helperText="Hypothetical, −50 to +50" sx={{ width: 190 }} />
          <FormField name="temperatureChangeC" label="Temperature change (°C)" type="number" defaultValue={s?.temperatureChangeC ?? 0} helperText="Hypothetical, −5 to +5" slotProps={{ htmlInput: { step: 0.5 } }} sx={{ width: 190 }} />
          <Box sx={{ width: "100%" }}>
            <Typography variant="subtitle2" component="p" sx={{ mt: 1 }}>
              Your planting windows
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              For crops you have not recorded with dates. Use month-day, e.g. plant from 11-01 to 11-20, 110 days to harvest.
            </Typography>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr 1fr" } }}>
              {Array.from({ length: MAX_PLANTING_WINDOWS }, (_, i) => (
                <Box key={i} sx={{ display: "contents" }}>
                  <FormField name={`win_crop_${i}`} label={`Crop ${i + 1}`} defaultValue={windows[i]?.crop ?? ""} size="small" />
                  <FormField name={`win_from_${i}`} label="Plant from" placeholder="MM-DD" defaultValue={windows[i]?.plantFrom ?? ""} size="small" />
                  <FormField name={`win_to_${i}`} label="Plant to" placeholder="MM-DD" defaultValue={windows[i]?.plantTo ?? ""} size="small" />
                  <FormField name={`win_len_${i}`} label="Days to harvest" type="number" defaultValue={windows[i]?.lengthDays ?? ""} size="small" />
                </Box>
              ))}
            </Box>
          </Box>
          <FormField name="notes" label="Notes" defaultValue={s?.notes ?? ""} sx={{ minWidth: 260, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section
        title="Input snapshots"
        intro="Each run freezes a full copy of every input (field geometry, zones, history, soil, water, priorities, markets, these settings and the pinned evidence) and pins the exact reference-data versions by id and hash. Snapshots cannot be edited, so a saved run can never silently pick up changed rules or newer data."
      >
        {latest ? (
          latestMatches ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              The newest snapshot matches the current inputs.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              Inputs have changed since the newest snapshot. Earlier snapshots keep their original inputs; the next run takes a new snapshot.
            </Alert>
          )
        ) : null}
        {sc.snapshots.length === 0 ? (
          <Empty>No snapshots yet. Running the simulation creates one.</Empty>
        ) : (
          <RecordList
            label="Input snapshots"
            items={sc.snapshots.map((snap) => {
              const pinned = ((snap.inputs as { reference_datasets?: PinnedDataset[] }).reference_datasets ?? []) as PinnedDataset[];
              return {
                key: snap.id,
                primary: `${new Date(snap.created_at).toISOString().replace("T", " ").slice(0, 19)} UTC · sha256 ${snap.inputs_sha256.slice(0, 16)}…`,
                secondary: (
                  <>
                    Engine {snap.engine_version}
                    {snap.engine_version !== ENGINE_VERSION ? " (taken before the engine existed; cannot be run)" : ""} · input schema v{snap.input_schema_version} · reference data:{" "}
                    {pinned.length ? pinned.map((d) => `${d.name} v${d.version} (${d.content_sha256.slice(0, 8)})`).join(", ") : "none published"}
                    <Box component="details" sx={{ mt: 1 }}>
                      <summary>Show frozen inputs</summary>
                      <Box component="pre" sx={{ fontSize: "0.75rem", maxHeight: 360, overflow: "auto", bgcolor: "background.paper", p: 1.5, borderRadius: 1 }}>
                        {JSON.stringify(snap.inputs, null, 2)}
                      </Box>
                    </Box>
                  </>
                ),
              };
            })}
          />
        )}
      </Section>

      <Section title="Delete scenario" intro="Deletes the scenario, its snapshots, runs and results.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "scenarios", sc.id, sc.field_id)} label={`Delete scenario ${sc.name}`} confirmLabel="Yes, delete this scenario and its snapshots" />
      </Section>
    </Container>
  );
}
