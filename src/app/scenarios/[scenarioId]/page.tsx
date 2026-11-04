import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { Empty, EvidenceChip, More, PageHeader, RecordList, Section, StatusChip } from "@/components/farm/ui";
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
import { color, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Crop comparison" };

const LABELS: Record<(typeof IRRIGATION_ASSUMPTIONS)[number], string> = {
  as_recorded: "As I recorded for this field",
  rainfed: "Rain only (no irrigation)",
  full_irrigation: "Fully irrigated",
};

type PinnedDataset = { id: string; kind: string; name: string; version: number; content_sha256: string };
type Window = { crop: string; plantFrom: string; plantTo: string; lengthDays: number };

/** Planting-window inputs; names stay win_*_<index> so the saved form is unchanged. */
function PlantingRows({ from, to, windows }: { from: number; to: number; windows: Window[] }) {
  if (to <= from) return null;
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr 1fr" }, mb: 1.5, width: "100%" }}>
      {Array.from({ length: to - from }, (_, k) => {
        const i = from + k;
        return (
          <Box key={i} sx={{ display: "contents" }}>
            <FormField name={`win_crop_${i}`} label="Crop" placeholder="e.g. wheat" defaultValue={windows[i]?.crop ?? ""} sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }} />
            <FormField name={`win_from_${i}`} label="Plant from (MM-DD)" placeholder="11-01" defaultValue={windows[i]?.plantFrom ?? ""} />
            <FormField name={`win_to_${i}`} label="Plant until (MM-DD)" placeholder="11-20" defaultValue={windows[i]?.plantTo ?? ""} />
            <FormField name={`win_len_${i}`} label="Days to harvest" type="number" defaultValue={windows[i]?.lengthDays ?? ""} sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }} />
          </Box>
        );
      })}
    </Box>
  );
}

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
  const shown = Math.min(MAX_PLANTING_WINDOWS, Math.max(3, windows.length));

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <PageHeader
        crumbs={[{ href: "/workspace", label: "My fields" }, { href: `/fields/${sc.field_id}/records`, label: sc.fieldName }]}
        title={sc.name}
        eyebrow={`Crop comparison · ${sc.fieldName}`}
        subtitle="Choose the crops to consider, then run. Astrapon replays past weather on your field for your current rotation and for the options, side by side."
      >
        <EvidenceChip evidenceClass="hypothetical_input" />{" "}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Updated {new Date(sc.updated_at).toISOString().slice(0, 10)}
        </Typography>
      </PageHeader>

      <Section
        id="run"
        icon={<PlayArrowRoundedIcon />}
        title="Run the comparison"
        intro={
          <>
            Uses the crops and settings below together with your seasons, soil, water and priorities. Usually ready within a minute. <TextLink href="/methodology#simulation">How it works</TextLink>
          </>
        }
      >
        <RunPanel
          runs={runs}
          // eslint-disable-next-line react-hooks/purity -- server render time, used only to flag long-queued runs
          renderedAt={Date.now()}
          canRun={Boolean(s) && hasLocation}
          blockedReason={!hasLocation ? "Draw the field on the map first: the comparison needs the field's location." : !s ? "Save the settings below first." : undefined}
          actions={{ request: requestSimulation.bind(null, sc.id), reproduce: reproduceRun, cancel: cancelRun }}
        />
      </Section>

      <Section
        id="settings"
        icon={<TuneRoundedIcon />}
        title="Crops and settings"
        intro="Planting dates come only from your own seasons, the planting windows you enter, or (in the US) the official USDA state calendar. Past weather is replayed; it is not a forecast."
      >
        {!s && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The saved settings no longer pass the checks. Review them and save again.
          </Alert>
        )}
        {parsed.ok && parsed.upgradedFrom === 1 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This comparison was created before planting windows and weather changes existed. Save it once to store the new settings.
          </Alert>
        )}
        <ActionForm action={updateScenario.bind(null, sc.id)} submitLabel="Save settings" direction="row" successMessage="Settings saved. Run the comparison again to use them.">
          <FormField name="name" label="Name" required defaultValue={sc.name} sx={{ minWidth: 220 }} />
          <FormField name="candidateCrops" label="Crops to consider" required defaultValue={s?.candidateCrops.join(", ") ?? ""} helperText="Separate with commas. Crops from your seasons are always included." sx={{ minWidth: 320, flexGrow: 1 }} />
          <FormSelect
            name="calendarRegion"
            label="Planting calendar (US only)"
            options={[{ value: "", label: "None: use only my own dates" }, ...regions.map((r) => ({ value: r, label: `USDA NASS 2010: ${r}` }))]}
            defaultValue={s?.calendarRegion ?? ""}
            sx={{ minWidth: 260 }}
          />
          <FormSelect name="irrigationAssumption" label="Irrigation" options={IRRIGATION_ASSUMPTIONS.map((v) => ({ value: v, label: LABELS[v] }))} defaultValue={s?.irrigationAssumption} />

          <Box sx={{ width: "100%", mt: 1 }}>
            <Typography variant="subtitle2" component="h3">
              When you plant each new crop
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
              Needed for crops you have not grown here with dates, unless a US calendar is chosen above. Write dates as month-day: for example plant from 11-01 until 11-20, about 110 days to harvest. A
              crop without dates is left out, and the result says why.
            </Typography>
            <PlantingRows from={0} to={shown} windows={windows} />
            {shown < MAX_PLANTING_WINDOWS && (
              <More label="Add more crops">
                <PlantingRows from={shown} to={MAX_PLANTING_WINDOWS} windows={windows} />
              </More>
            )}
          </Box>

          <Box sx={{ width: "100%", mt: 1, p: 2, borderRadius: `${radius.md}px`, bgcolor: color.surface, border: `1px solid ${color.line}` }}>
            <Typography variant="subtitle2" component="h3">
              What if the weather changes? (optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Try a drier or hotter version of the same past years. Leave both at 0 for the weather as it was.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormField name="precipitationChangePct" label="Rainfall change (%)" type="number" defaultValue={s?.precipitationChangePct ?? 0} helperText="e.g. -20 for 20% less rain (−50 to +50)" sx={{ width: { sm: 280 } }} />
              <FormField name="temperatureChangeC" label="Temperature change (°C)" type="number" defaultValue={s?.temperatureChangeC ?? 0} helperText="e.g. 1.5 for warmer (−5 to +5)" slotProps={{ htmlInput: { step: 0.5 } }} sx={{ width: { sm: 280 } }} />
            </Stack>
          </Box>

          <More label="Years and other options">
            <FormField name="rotationYears" label="Rotation length (years)" type="number" defaultValue={s?.rotationYears ?? 2} helperText="1 to 4" sx={{ width: 190 }} />
            <FormField name="replayFromYear" label="Past weather from" type="number" defaultValue={s?.replayFromYear ?? ""} sx={{ width: 160 }} />
            <FormField name="replayToYear" label="Past weather to" type="number" defaultValue={s?.replayToYear ?? ""} sx={{ width: 160 }} />
            <FormField name="turnaroundDays" label="Days between harvest and next planting" type="number" defaultValue={s?.turnaroundDays ?? ""} helperText="Leave empty if unsure (0 is assumed and shown)" sx={{ width: 300 }} />
            <FormField name="notes" label="Notes" defaultValue={s?.notes ?? ""} sx={{ minWidth: 260, flexGrow: 1 }} />
          </More>
        </ActionForm>
      </Section>

      <Section
        id="record"
        collapsible
        icon={<Inventory2OutlinedIcon />}
        title="Saved inputs (for advisers)"
        intro="Every run keeps a frozen copy of all inputs, so a saved result can always be reproduced exactly."
        aside={latest ? <StatusChip done={latestMatches} label={latestMatches ? "Matches current inputs" : "Inputs changed since the last run"} /> : undefined}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
          A snapshot holds the field shape, parts, seasons, soil, water, priorities, markets, these settings and the pinned weather and soil data, with the exact reference-data versions by id and hash.
          Snapshots cannot be edited, so a saved run never silently picks up changed rules or newer data.
        </Typography>
        {latest && !latestMatches && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Inputs have changed since the newest snapshot. Earlier snapshots keep their original inputs; the next run takes a new one.
          </Alert>
        )}
        {sc.snapshots.length === 0 ? (
          <Empty>No snapshots yet. Running the comparison creates one.</Empty>
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

      <Section id="delete" collapsible tone="danger" icon={<DeleteOutlineRoundedIcon />} title="Delete this comparison" intro="Removes the comparison with its snapshots, runs and results.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "scenarios", sc.id, sc.field_id)} label={`Delete scenario ${sc.name}`} confirmLabel="Yes, delete this comparison" />
      </Section>
    </Container>
  );
}
