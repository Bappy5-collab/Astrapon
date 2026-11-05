import AgricultureRoundedIcon from "@mui/icons-material/AgricultureRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import GrassRoundedIcon from "@mui/icons-material/GrassRounded";
import PolylineRoundedIcon from "@mui/icons-material/PolylineRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import WbSunnyRoundedIcon from "@mui/icons-material/WbSunnyRounded";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoundaryPreview } from "@/components/farm/BoundaryPreview";
import { DeleteButton } from "@/components/farm/DeleteButton";
import { StepGuide } from "@/components/farm/StepGuide";
import { Empty, EvidenceChip, More, PageHeader, RecordList, Section, StatusChip } from "@/components/farm/ui";
import { ActionForm, FormCheckbox, FormField, FormSelect } from "@/components/forms/ActionForm";
import { ButtonLink, TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { fieldSteps } from "@/domain/farm/progress";
import {
  EQUIPMENT,
  IRRIGATION,
  IRRIGATION_METHODS,
  PRIORITY_KEYS,
  PRIORITY_LABELS,
  SEASONS,
  SOIL_PROPERTIES,
  TILLAGE,
  ZONE_BASES,
  ZONE_BASIS_LABELS,
} from "@/domain/farm/records";
import { IRRIGATION_ASSUMPTIONS } from "@/domain/scenario/settings";
import { requireUser } from "@/server/auth/session";
import {
  addCropHistory,
  addSoilObservation,
  createScenario,
  createZone,
  deleteOwnedRecord,
  saveFarmerPriorities,
  saveFieldConstraints,
  setFieldBoundary,
} from "@/server/farm/actions";
import { fieldFacts, getField } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Field records" };

const humanise = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const opts = (values: readonly string[], blank?: string) => [...(blank !== undefined ? [{ value: "", label: blank }] : []), ...values.map((v) => ({ value: v, label: humanise(v) }))];
const IRRIGATION_ASSUMPTION_LABELS: Record<(typeof IRRIGATION_ASSUMPTIONS)[number], string> = {
  as_recorded: "As I recorded for this field",
  rainfed: "Rain only (no irrigation)",
  full_irrigation: "Fully irrigated",
};
const IRRIGATION_LABELS: Record<(typeof IRRIGATION)[number], string> = {
  none: "No irrigation (rain only)",
  full: "Full irrigation",
  deficit: "Limited irrigation",
  supplemental: "Only in dry spells",
  unknown: "Not sure",
};
/** Plain words for the 0–5 weights the engine uses. */
const IMPORTANCE = ["Doesn't matter", "A little", "Somewhat", "Important", "Very important", "Most important"];

export default async function FieldPage({ params }: PageProps<"/fields/[fieldId]">) {
  const { fieldId } = await params;
  const user = await requireUser(`/fields/${fieldId}/records`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saving fields" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(fieldId)) notFound();
  const field = await getField(user.supabase, fieldId);
  if (!field) notFound();
  const facts = (await fieldFacts(user.supabase, [field.id])).get(field.id)!;
  const steps = fieldSteps(field.id, facts);
  const state = (id: string) => steps.find((s) => s.id === id)!;
  const zoneOptions = [{ value: "", label: "Whole field" }, ...field.zones.map((z) => ({ value: z.id, label: z.name }))];
  const zoneName = (id: string | null) => (id ? (field.zones.find((z) => z.id === id)?.name ?? "zone") : "Whole field");
  const lastYear = new Date().getUTCFullYear() - 1;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <PageHeader
        crumbs={[{ href: "/workspace", label: "My fields" }, { href: `/farms/${field.farm_id}`, label: field.farmName }]}
        title={field.name}
        eyebrow={field.farmName}
        subtitle={field.area_ha !== null ? `${Number(field.area_ha).toFixed(2)} hectares. Fill in the steps below; everything you enter is saved as your own report.` : "Start by drawing the field on the map."}
        actions={
          <>
            <ButtonLink href={`/fields/${field.id}`} variant="outlined" startIcon={<ViewInArRoundedIcon />}>
              3D view
            </ButtonLink>
            <ButtonLink href={`/fields/${field.id}/evidence`} variant="outlined" startIcon={<WbSunnyRoundedIcon />}>
              Weather and soil data
            </ButtonLink>
            {field.area_ha !== null && (
              <ButtonLink href={`/fields/${field.id}/water`} variant="outlined" startIcon={<WaterDropRoundedIcon />}>
                Water & Energy
              </ButtonLink>
            )}
          </>
        }
      />

      <StepGuide steps={steps} />

      <Section
        id="history"
        step={1}
        icon={<GrassRoundedIcon />}
        title="What you grew"
        aside={<StatusChip done={state("history").state === "done"} label={state("history").status} />}
        intro="Add each past season: the crop, and the dates you planted and harvested. These seasons are your “existing practice”, and every other option is compared with it."
      >
        {field.history.length === 0 ? (
          <Empty>No seasons yet. Add your most recent season first.</Empty>
        ) : (
          <RecordList
            label="Seasons"
            items={field.history.map((h) => ({
              key: h.id,
              primary: `${h.season_year} · ${h.crop_name}`,
              secondary: [
                humanise(h.season),
                zoneName(h.zone_id),
                h.planted_on ? `planted ${h.planted_on}` : "no planting date",
                h.harvested_on ? `harvested ${h.harvested_on}` : "no harvest date",
                h.tillage && humanise(h.tillage),
                h.reported_yield !== null && `yield ${h.reported_yield} ${h.reported_yield_unit}`,
              ]
                .filter(Boolean)
                .join(" · "),
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "crop_history", h.id, field.id)} label={`Delete ${h.season_year} ${h.crop_name}`} />,
            }))}
          />
        )}
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
          Add a season
        </Typography>
        <ActionForm action={addCropHistory.bind(null, field.id)} submitLabel="Add season" direction="row" successMessage="Season added.">
          <FormField name="cropName" label="Crop" required placeholder="e.g. maize, rice, wheat" sx={{ minWidth: 220 }} />
          <FormField name="seasonYear" label="Year" type="number" required defaultValue={lastYear} sx={{ width: 110 }} />
          <FormSelect name="season" label="Season" options={opts(SEASONS)} sx={{ minWidth: 150 }} />
          <FormField name="plantedOn" label="Planted on" type="date" slotProps={{ inputLabel: { shrink: true } }} />
          <FormField name="harvestedOn" label="Harvested on" type="date" slotProps={{ inputLabel: { shrink: true } }} />
          <More>
            <FormSelect name="zoneId" label="Part of the field" options={zoneOptions} sx={{ minWidth: 170 }} />
            <FormSelect name="tillage" label="Tillage" options={opts(TILLAGE, "Not recorded")} sx={{ minWidth: 150 }} />
            <FormField name="reportedYield" label="Yield you got" type="number" sx={{ width: 150 }} />
            <FormField name="reportedYieldUnit" label="Yield unit" helperText="e.g. t/ha, bu/ac, maund/bigha" sx={{ width: 200 }} />
          </More>
        </ActionForm>
      </Section>

      <Section
        id="soil"
        step={2}
        icon={<AgricultureRoundedIcon />}
        title="Your soil"
        aside={<StatusChip done={field.soil.length > 0 || facts.hasSoilSurvey} label={field.soil.length ? `${field.soil.length} soil test${field.soil.length === 1 ? "" : "s"}` : facts.hasSoilSurvey ? "Soil survey found" : "Optional"} />}
        intro={
          <>
            Results from a soil test, if you have one. The most useful value is <strong>available water capacity</strong> (how much water the soil holds for roots). Outside the
            United States there is no public soil survey, so your own test is the only soil value the comparison can use.
          </>
        }
      >
        {field.soil.length === 0 ? (
          <Empty>No soil tests yet.{facts.hasSoilSurvey ? " A US soil survey value was found for this field, so this step is optional." : ""}</Empty>
        ) : (
          <RecordList
            label="Soil tests"
            items={field.soil.map((s) => ({
              key: s.id,
              primary: (
                <>
                  {SOIL_PROPERTIES[s.property as keyof typeof SOIL_PROPERTIES]?.label ?? s.property}: {s.value_numeric ?? s.value_text} {s.unit ?? ""}{" "}
                  <EvidenceChip evidenceClass={s.evidence_class as "ground_measurement" | "farmer_report"} />
                </>
              ),
              secondary: [s.observed_on, `${s.depth_top_cm}–${s.depth_bottom_cm} cm deep`, zoneName(s.zone_id), s.method, s.source].filter(Boolean).join(" · "),
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "soil_observations", s.id, field.id)} label={`Delete soil test from ${s.observed_on}`} />,
            }))}
          />
        )}
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
          Add a soil test result
        </Typography>
        <ActionForm action={addSoilObservation.bind(null, field.id)} submitLabel="Add soil test" direction="row" successMessage="Soil test added.">
          <FormSelect
            name="property"
            label="What was measured"
            options={Object.entries(SOIL_PROPERTIES).map(([k, v]) => ({ value: k, label: v.unit ? `${v.label} (${v.unit})` : v.label }))}
            defaultValue="available_water_capacity"
            sx={{ minWidth: 280 }}
          />
          <FormField name="value" label="Value" required sx={{ width: 140 }} />
          <FormField name="observedOn" label="Sampled on" type="date" required slotProps={{ inputLabel: { shrink: true } }} />
          <More label="Depth, lab and method">
            <FormField name="depthTopCm" label="From depth (cm)" type="number" required defaultValue={0} sx={{ width: 150 }} />
            <FormField name="depthBottomCm" label="To depth (cm)" type="number" required defaultValue={100} helperText="Water capacity needs 0 to 100" sx={{ width: 220 }} />
            <FormSelect name="zoneId" label="Part of the field" options={zoneOptions} sx={{ minWidth: 170 }} />
            <FormSelect name="evidenceClass" label="Who measured it" options={[{ value: "ground_measurement", label: "A lab or soil survey" }, { value: "farmer_report", label: "My own estimate" }]} />
            <FormField name="method" label="Method" helperText="e.g. 1:1 water pH" />
            <FormField name="source" label="Lab or source" />
          </More>
        </ActionForm>
      </Section>

      <Section
        id="water"
        step={3}
        icon={<WaterDropRoundedIcon />}
        title="Water and machines"
        aside={<StatusChip done={facts.waterSaved} label={facts.waterSaved ? "Saved" : "Not set"} />}
        intro="Can you irrigate this field? Crops that need more water than you can give are ruled out."
      >
        <ActionForm action={saveFieldConstraints.bind(null, field.id)} submitLabel="Save water and machines" successMessage="Saved.">
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormSelect name="irrigation" label="Irrigation" options={IRRIGATION.map((v) => ({ value: v, label: IRRIGATION_LABELS[v] }))} defaultValue={field.constraints?.irrigation ?? "unknown"} sx={{ minWidth: 240 }} />
            <FormSelect name="irrigationMethod" label="How you irrigate" options={opts(IRRIGATION_METHODS, "None")} defaultValue={field.constraints?.irrigation_method ?? ""} />
            <FormField name="seasonalWaterAllocationMm" label="Water you can use per season (mm)" type="number" defaultValue={field.constraints?.seasonal_water_allocation_mm ?? ""} sx={{ minWidth: 260 }} />
            <FormField name="waterSource" label="Water source" placeholder="e.g. tube well, canal" defaultValue={field.constraints?.water_source ?? ""} />
          </Stack>
          <More label="Machines you have (optional)" open={Boolean(field.constraints?.equipment.length)}>
            <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, width: "100%" }}>
              <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Machines available
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                {EQUIPMENT.map((e) => (
                  <FormCheckbox key={e} name="equipment" value={e} label={humanise(e)} defaultChecked={field.constraints?.equipment.includes(e)} />
                ))}
              </Box>
              <FormField name="equipmentNotes" label="Notes about machines" fullWidth defaultValue={field.constraints?.equipment_notes ?? ""} sx={{ mt: 1 }} />
            </Box>
          </More>
        </ActionForm>
      </Section>

      <Section
        id="priorities"
        step={4}
        icon={<TuneRoundedIcon />}
        title="What matters most to you"
        aside={<StatusChip done={facts.prioritiesSaved} label={facts.prioritiesSaved ? "Saved" : "Not set"} />}
        intro="Choose how important each goal is. Options that do better on what you care about rank higher. These are your choices, not predictions."
      >
        <ActionForm action={saveFarmerPriorities.bind(null, field.id)} submitLabel="Save priorities" successMessage="Priorities saved.">
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
            {PRIORITY_KEYS.map((k) => (
              <FormSelect key={k} name={k} label={PRIORITY_LABELS[k]} options={IMPORTANCE.map((label, n) => ({ value: String(n), label }))} defaultValue={String(field.priorities?.[k] ?? 3)} sx={{ minWidth: 0, width: "100%" }} />
            ))}
          </Box>
          <FormField name="excludedCrops" label="Crops you will not grow" helperText="Separate with commas, e.g. cotton, tobacco" defaultValue={field.priorities?.excluded_crops.join(", ") ?? ""} sx={{ maxWidth: 520 }} />
        </ActionForm>
      </Section>

      <Section
        id="compare"
        step={5}
        icon={<CompareArrowsRoundedIcon />}
        title="Compare crop options"
        aside={<StatusChip done={Boolean(facts.latestRunId)} label={facts.latestRunId ? "Results ready" : field.scenarios.length ? "Set up" : "Not started"} />}
        intro={
          <>
            List the crops you would consider. Astrapon replays past weather on your field for your current rotation and for options built from these crops, then shows them side by side.
            {!facts.hasWeather && (
              <>
                {" "}
                First <TextLink href={`/fields/${field.id}/evidence`}>get the weather for this field</TextLink>.
              </>
            )}
          </>
        }
      >
        {field.scenarios.length > 0 && (
          <RecordList
            label="Comparisons"
            items={field.scenarios.map((s) => ({
              key: s.id,
              primary: <TextLink href={`/scenarios/${s.id}`}>{s.name}</TextLink>,
              secondary: `${s.snapshotCount ? `run ${s.snapshotCount === 1 ? "once" : `${s.snapshotCount} times`}` : "not run yet"} · updated ${new Date(s.updated_at).toISOString().slice(0, 10)}`,
              action: (
                <ButtonLink href={`/scenarios/${s.id}`} size="small" variant="outlined">
                  Open
                </ButtonLink>
              ),
            }))}
          />
        )}
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
          {field.scenarios.length ? "Start another comparison" : "Start a comparison"}
        </Typography>
        <ActionForm action={createScenario.bind(null, field.id)} submitLabel="Create comparison" direction="row">
          <FormField name="name" label="Name" required defaultValue={field.scenarios.length ? "" : "My crop options"} sx={{ minWidth: 220 }} />
          <FormField name="candidateCrops" label="Crops to consider" helperText="Separate with commas, e.g. maize, soybean, wheat" required sx={{ minWidth: 320, flexGrow: 1 }} />
          <More label="Years and irrigation (optional)">
            <FormField name="rotationYears" label="Rotation length (years)" type="number" defaultValue={2} sx={{ width: 190 }} />
            <FormField name="replayFromYear" label="Past weather from" type="number" defaultValue={lastYear - 19} sx={{ width: 160 }} />
            <FormField name="replayToYear" label="Past weather to" type="number" defaultValue={lastYear} sx={{ width: 160 }} />
            <FormSelect name="irrigationAssumption" label="Irrigation" options={IRRIGATION_ASSUMPTIONS.map((v) => ({ value: v, label: IRRIGATION_ASSUMPTION_LABELS[v] }))} />
          </More>
        </ActionForm>
      </Section>

      <Typography variant="overline" component="h2" sx={{ display: "block", mt: 4, mb: 1, color: "text.secondary", fontWeight: 700 }}>
        Advanced
      </Typography>

      <Section
        id="boundary"
        collapsible
        icon={<PolylineRoundedIcon />}
        title="Field shape and parts of the field"
        intro="Draw or edit the shape in the 3D view. Here you can paste coordinates from another tool, or add parts of the field that behave differently."
      >
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
          Field shape
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mb: 3 }}>
          <Box sx={{ flexShrink: 0 }}>{field.geometry.boundary ? <BoundaryPreview boundary={field.geometry.boundary} zones={field.geometry.zones} label={`Outline of ${field.name}`} /> : <Empty>No shape yet.</Empty>}</Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <ActionForm action={setFieldBoundary.bind(null, field.id)} submitLabel={field.geometry.boundary ? "Replace shape" : "Save shape"}>
              <FormField
                name="boundary"
                label="Shape as GeoJSON"
                multiline
                minRows={4}
                maxRows={12}
                fullWidth
                defaultValue={field.geometry.boundary ? JSON.stringify(field.geometry.boundary) : ""}
                helperText='Polygon or MultiPolygon in [longitude, latitude], e.g. exported from a farm-management or GIS tool. Checked for closure, crossings and size.'
                slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: "0.8rem" } } }}
              />
              <FormSelect name="source" label="Where it came from" options={[{ value: "farmer_entered_coordinates", label: "Typed or pasted coordinates" }, { value: "farmer_uploaded", label: "Exported from another tool" }]} defaultValue={field.boundary_source ?? "farmer_entered_coordinates"} />
            </ActionForm>
          </Box>
        </Stack>

        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          Parts of the field (zones)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 720 }}>
          Only add a part you know is different, for example a low spot that floods. Astrapon never invents differences inside a field from coarse satellite data. The easiest way is “Draw zone” in the 3D view.
        </Typography>
        {field.zones.length === 0 ? (
          <Empty>No parts. The field is treated as one unit.</Empty>
        ) : (
          <RecordList
            label="Parts of the field"
            items={field.zones.map((z) => ({
              key: z.id,
              primary: z.name,
              secondary: `${Number(z.area_ha).toFixed(2)} ha · ${ZONE_BASIS_LABELS[z.basis as keyof typeof ZONE_BASIS_LABELS] ?? z.basis}${z.notes ? ` · ${z.notes}` : ""}`,
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "planting_zones", z.id, field.id)} label={`Delete zone ${z.name}`} />,
            }))}
          />
        )}
        {field.geometry.boundary ? (
          <ActionForm action={createZone.bind(null, field.id)} submitLabel="Add part">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormField name="name" label="Name" required />
              <FormSelect name="basis" label="How you know it differs" options={ZONE_BASES.map((b) => ({ value: b, label: ZONE_BASIS_LABELS[b] }))} />
              <FormField name="notes" label="Notes" sx={{ flexGrow: 1 }} />
            </Stack>
            <FormField name="boundary" label="Shape as GeoJSON (inside the field)" multiline minRows={3} fullWidth slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: "0.8rem" } } }} />
          </ActionForm>
        ) : (
          <Empty>Save the field shape first.</Empty>
        )}
      </Section>

      <Section id="delete" collapsible tone="danger" icon={<DeleteOutlineRoundedIcon />} title="Delete this field" intro="Removes the field with all its seasons, soil tests, comparisons and results. This cannot be undone.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "fields", field.id, field.farm_id)} label={`Delete field ${field.name}`} confirmLabel="Yes, delete this field and everything in it" />
      </Section>
    </Container>
  );
}
