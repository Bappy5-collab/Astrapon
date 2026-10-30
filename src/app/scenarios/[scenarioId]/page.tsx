import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { Empty, EvidenceChip, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormField, FormSelect } from "@/components/forms/ActionForm";
import { SetupRequired } from "@/components/SetupRequired";
import { canonicalJson } from "@/domain/reference/canonical";
import { IRRIGATION_ASSUMPTIONS, scenarioSettingsV1 } from "@/domain/scenario/settings";
import { requireUser } from "@/server/auth/session";
import { createInputSnapshot, deleteOwnedRecord, updateScenario } from "@/server/farm/actions";
import { getScenario } from "@/server/farm/queries";

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
  const parsed = scenarioSettingsV1(new Date().getUTCFullYear()).safeParse(sc.settings);
  const s = parsed.success ? parsed.data : null;
  const latest = sc.snapshots[0];
  const currentKey = canonicalJson(sc.currentInputs);
  const latestMatches = latest ? canonicalJson(latest.inputs) === currentKey : false;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[{ href: "/farms", label: "Farms" }, { href: `/farms/${sc.farmId}`, label: "Farm" }, { href: `/fields/${sc.field_id}`, label: sc.fieldName }]} title={sc.name}>
        <EvidenceChip evidenceClass="hypothetical_input" />{" "}
        <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
          Settings v{sc.settings_schema_version} · updated {new Date(sc.updated_at).toISOString().replace("T", " ").slice(0, 16)} UTC
        </Typography>
      </PageHeader>

      <Section title="Scenario settings" intro="Replay years select past weather to replay through the model in a later phase. A replay is not a forecast.">
        {!s && <Alert severity="warning" sx={{ mb: 2 }}>The stored settings no longer pass validation. Review and save them again.</Alert>}
        <ActionForm action={updateScenario.bind(null, sc.id)} submitLabel="Save scenario" direction="row">
          <FormField name="name" label="Scenario name" required defaultValue={sc.name} />
          <FormField name="candidateCrops" label="Candidate crops" required defaultValue={s?.candidateCrops.join(", ") ?? ""} helperText="Comma-separated" sx={{ minWidth: 280 }} />
          <FormField name="rotationYears" label="Rotation length (years)" type="number" defaultValue={s?.rotationYears ?? 2} sx={{ width: 190 }} />
          <FormField name="replayFromYear" label="Replay from" type="number" defaultValue={s?.replayFromYear ?? ""} sx={{ width: 130 }} />
          <FormField name="replayToYear" label="Replay to" type="number" defaultValue={s?.replayToYear ?? ""} sx={{ width: 130 }} />
          <FormSelect name="irrigationAssumption" label="Irrigation assumption" options={IRRIGATION_ASSUMPTIONS.map((v) => ({ value: v, label: LABELS[v] }))} defaultValue={s?.irrigationAssumption} />
          <FormField name="notes" label="Notes" defaultValue={s?.notes ?? ""} sx={{ minWidth: 260, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section
        title="Input snapshots"
        intro="A snapshot freezes a full copy of every input (field geometry, zones, history, soil, water, priorities, markets, these settings, cached evidence values) and pins the exact reference-data versions by id and hash. Snapshots cannot be edited, so a saved run can never silently pick up changed rules or newer data."
      >
        {latest ? (
          latestMatches ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              The newest snapshot matches the current inputs.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              Inputs have changed since the newest snapshot. Earlier snapshots keep their original inputs; take a new snapshot to include the changes.
            </Alert>
          )
        ) : null}
        <ActionForm action={createInputSnapshot.bind(null, sc.id)} submitLabel="Freeze inputs into a snapshot">
          <Typography variant="body2" color="text.secondary">
            No simulation engine exists yet (Phase 4). Snapshots record engine version “0.0.0-pre-engine” and no results.
          </Typography>
        </ActionForm>
        <Box sx={{ mt: 3 }}>
          {sc.snapshots.length === 0 ? (
            <Empty>No snapshots yet.</Empty>
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
                      Engine {snap.engine_version} · input schema v{snap.input_schema_version} · reference data:{" "}
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
        </Box>
      </Section>

      <Section title="Delete scenario" intro="Deletes the scenario and its snapshots.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "scenarios", sc.id, sc.field_id)} label={`Delete scenario ${sc.name}`} confirmLabel="Yes, delete this scenario and its snapshots" />
      </Section>
    </Container>
  );
}
