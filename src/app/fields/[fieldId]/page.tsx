import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoundaryPreview } from "@/components/farm/BoundaryPreview";
import { DeleteButton } from "@/components/farm/DeleteButton";
import { Empty, EvidenceChip, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormCheckbox, FormField, FormSelect } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
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
import { getField } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Field" };

const humanise = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const opts = (values: readonly string[], blank?: string) => [...(blank !== undefined ? [{ value: "", label: blank }] : []), ...values.map((v) => ({ value: v, label: humanise(v) }))];
const IRRIGATION_ASSUMPTION_LABELS: Record<(typeof IRRIGATION_ASSUMPTIONS)[number], string> = {
  as_recorded: "As recorded for this field",
  rainfed: "Rainfed (no irrigation)",
  full_irrigation: "Fully irrigated",
};

export default async function FieldPage({ params }: PageProps<"/fields/[fieldId]">) {
  const { fieldId } = await params;
  const user = await requireUser(`/fields/${fieldId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saving fields" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(fieldId)) notFound();
  const field = await getField(user.supabase, fieldId);
  if (!field) notFound();
  const zoneOptions = [{ value: "", label: "Whole field" }, ...field.zones.map((z) => ({ value: z.id, label: z.name }))];
  const zoneName = (id: string | null) => (id ? (field.zones.find((z) => z.id === id)?.name ?? "zone") : "Whole field");
  const lastYear = new Date().getUTCFullYear() - 1;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[{ href: "/farms", label: "Farms" }, { href: `/farms/${field.farm_id}`, label: field.farmName }]} title={field.name}>
        <Typography color="text.secondary">
          {field.area_ha !== null ? `${Number(field.area_ha).toFixed(2)} ha, computed from the saved boundary.` : "No boundary saved yet."} Everything on this page is a farmer
          report unless labelled otherwise.
        </Typography>
      </PageHeader>

      <Section id="boundary" title="Boundary" intro="Paste the field outline as GeoJSON (Polygon or MultiPolygon, [longitude, latitude] in WGS84), for example exported from a farm-management or GIS tool. It is checked for closure, crossings and size before saving.">
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
          <Box sx={{ flexShrink: 0 }}>
            {field.geometry.boundary ? (
              <BoundaryPreview boundary={field.geometry.boundary} zones={field.geometry.zones} label={`Outline of ${field.name}`} />
            ) : (
              <Empty>No boundary yet.</Empty>
            )}
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <ActionForm action={setFieldBoundary.bind(null, field.id)} submitLabel={field.geometry.boundary ? "Replace boundary" : "Save boundary"}>
              <FormField
                name="boundary"
                label="Boundary GeoJSON"
                multiline
                minRows={5}
                maxRows={14}
                fullWidth
                defaultValue={field.geometry.boundary ? JSON.stringify(field.geometry.boundary) : ""}
                helperText='Shape: {"type":"Polygon","coordinates":[[[lon,lat],[lon,lat],…,[lon,lat]]]}'
                slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: "0.8rem" } } }}
              />
              <FormSelect name="source" label="Where it came from" options={[{ value: "farmer_entered_coordinates", label: "Typed or pasted coordinates" }, { value: "farmer_uploaded", label: "Exported from another tool" }]} defaultValue={field.boundary_source ?? "farmer_entered_coordinates"} />
            </ActionForm>
          </Box>
        </Stack>
      </Section>

      <Section id="zones" title="Planting zones" intro="Only add zones you know differ (from your own knowledge, a soil survey or yield maps). FieldShift will not invent within-field differences from coarse satellite data.">
        {field.zones.length === 0 ? (
          <Empty>No zones. The field is treated as one unit.</Empty>
        ) : (
          <RecordList
            label="Planting zones"
            items={field.zones.map((z) => ({
              key: z.id,
              primary: z.name,
              secondary: `${Number(z.area_ha).toFixed(2)} ha · basis: ${ZONE_BASIS_LABELS[z.basis as keyof typeof ZONE_BASIS_LABELS] ?? z.basis}${z.notes ? ` · ${z.notes}` : ""}`,
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "planting_zones", z.id, field.id)} label={`Delete zone ${z.name}`} />,
            }))}
          />
        )}
        {field.geometry.boundary ? (
          <ActionForm action={createZone.bind(null, field.id)} submitLabel="Add zone">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormField name="name" label="Zone name" required />
              <FormSelect name="basis" label="Basis for this zone" options={ZONE_BASES.map((b) => ({ value: b, label: ZONE_BASIS_LABELS[b] }))} />
              <FormField name="notes" label="Notes" sx={{ flexGrow: 1 }} />
            </Stack>
            <FormField name="boundary" label="Zone GeoJSON (inside the field boundary)" multiline minRows={3} fullWidth slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: "0.8rem" } } }} />
          </ActionForm>
        ) : (
          <Empty>Save the field boundary first.</Empty>
        )}
      </Section>

      <Section id="history" title="Crop history" intro="What was grown, by season. Yields are kept exactly as reported, in your unit.">
        {field.history.length === 0 ? (
          <Empty>No crop history yet.</Empty>
        ) : (
          <RecordList
            label="Crop history"
            items={field.history.map((h) => ({
              key: h.id,
              primary: `${h.season_year} · ${h.crop_name}`,
              secondary: [humanise(h.season), zoneName(h.zone_id), h.planted_on && `planted ${h.planted_on}`, h.harvested_on && `harvested ${h.harvested_on}`, h.tillage && humanise(h.tillage), h.reported_yield !== null && `reported yield ${h.reported_yield} ${h.reported_yield_unit}`].filter(Boolean).join(" · "),
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "crop_history", h.id, field.id)} label={`Delete ${h.season_year} ${h.crop_name}`} />,
            }))}
          />
        )}
        <ActionForm action={addCropHistory.bind(null, field.id)} submitLabel="Add season" direction="row">
          <FormField name="seasonYear" label="Year" type="number" required defaultValue={lastYear} sx={{ width: 110 }} />
          <FormSelect name="season" label="Season" options={opts(SEASONS)} sx={{ minWidth: 150 }} />
          <FormField name="cropName" label="Crop" required />
          <FormSelect name="zoneId" label="Zone" options={zoneOptions} sx={{ minWidth: 150 }} />
          <FormField name="plantedOn" label="Planted" type="date" slotProps={{ inputLabel: { shrink: true } }} />
          <FormField name="harvestedOn" label="Harvested" type="date" slotProps={{ inputLabel: { shrink: true } }} />
          <FormSelect name="tillage" label="Tillage" options={opts(TILLAGE, "Not recorded")} sx={{ minWidth: 150 }} />
          <FormField name="reportedYield" label="Reported yield" type="number" sx={{ width: 150 }} />
          <FormField name="reportedYieldUnit" label="Yield unit" helperText="e.g. t/ha, bu/ac" sx={{ width: 140 }} />
        </ActionForm>
      </Section>

      <Section id="soil" title="Soil observations" intro="Dated soil test or survey values. Mark lab or survey results as ground measurements and your own assessments as farmer reports.">
        {field.soil.length === 0 ? (
          <Empty>No soil observations yet.</Empty>
        ) : (
          <RecordList
            label="Soil observations"
            items={field.soil.map((s) => ({
              key: s.id,
              primary: (
                <>
                  {SOIL_PROPERTIES[s.property as keyof typeof SOIL_PROPERTIES]?.label ?? s.property}: {s.value_numeric ?? s.value_text} {s.unit ?? ""}{" "}
                  <EvidenceChip evidenceClass={s.evidence_class as "ground_measurement" | "farmer_report"} />
                </>
              ),
              secondary: [s.observed_on, `${s.depth_top_cm}–${s.depth_bottom_cm} cm`, zoneName(s.zone_id), s.method, s.source].filter(Boolean).join(" · "),
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "soil_observations", s.id, field.id)} label={`Delete soil observation from ${s.observed_on}`} />,
            }))}
          />
        )}
        <ActionForm action={addSoilObservation.bind(null, field.id)} submitLabel="Add observation" direction="row">
          <FormSelect name="property" label="Property" options={Object.entries(SOIL_PROPERTIES).map(([k, v]) => ({ value: k, label: v.unit ? `${v.label} (${v.unit})` : v.label }))} />
          <FormField name="value" label="Value" required sx={{ width: 160 }} />
          <FormField name="observedOn" label="Sampled on" type="date" required slotProps={{ inputLabel: { shrink: true } }} />
          <FormField name="depthTopCm" label="Top (cm)" type="number" required defaultValue={0} sx={{ width: 110 }} />
          <FormField name="depthBottomCm" label="Bottom (cm)" type="number" required defaultValue={15} sx={{ width: 120 }} />
          <FormSelect name="zoneId" label="Zone" options={zoneOptions} sx={{ minWidth: 150 }} />
          <FormSelect name="evidenceClass" label="Kind" options={[{ value: "ground_measurement", label: "Lab / survey measurement" }, { value: "farmer_report", label: "Farmer assessment" }]} />
          <FormField name="method" label="Method" helperText="e.g. 1:1 water pH" />
          <FormField name="source" label="Lab or source" />
        </ActionForm>
      </Section>

      <Section id="water" title="Water and equipment" intro="Limits that rule options in or out. Farmer-reported.">
        <ActionForm action={saveFieldConstraints.bind(null, field.id)} submitLabel="Save water and equipment">
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormSelect name="irrigation" label="Irrigation" options={opts(IRRIGATION)} defaultValue={field.constraints?.irrigation ?? "unknown"} />
            <FormSelect name="irrigationMethod" label="Method" options={opts(IRRIGATION_METHODS, "None")} defaultValue={field.constraints?.irrigation_method ?? ""} />
            <FormField name="seasonalWaterAllocationMm" label="Seasonal allocation (mm)" type="number" defaultValue={field.constraints?.seasonal_water_allocation_mm ?? ""} />
            <FormField name="waterSource" label="Water source" defaultValue={field.constraints?.water_source ?? ""} />
          </Stack>
          <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
            <Typography component="legend" variant="body2" sx={{ fontWeight: 600 }}>
              Equipment available
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap" }}>
              {EQUIPMENT.map((e) => (
                <FormCheckbox key={e} name="equipment" value={e} label={humanise(e)} defaultChecked={field.constraints?.equipment.includes(e)} />
              ))}
            </Box>
          </Box>
          <FormField name="equipmentNotes" label="Equipment notes" fullWidth defaultValue={field.constraints?.equipment_notes ?? ""} />
        </ActionForm>
      </Section>

      <Section id="priorities" title="Your priorities" intro="How much each goal matters to you (0 = not at all, 5 = a lot). These weight comparisons; they are not predictions of outcomes.">
        <ActionForm action={saveFarmerPriorities.bind(null, field.id)} submitLabel="Save priorities" direction="row">
          {PRIORITY_KEYS.map((k) => (
            <FormSelect key={k} name={k} label={PRIORITY_LABELS[k]} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} defaultValue={String(field.priorities?.[k] ?? 3)} sx={{ minWidth: 170 }} />
          ))}
          <FormField name="excludedCrops" label="Crops you will not grow" helperText="Comma-separated" defaultValue={field.priorities?.excluded_crops.join(", ") ?? ""} sx={{ minWidth: 260 }} />
        </ActionForm>
      </Section>

      <Section id="scenarios" title="Scenarios" intro="A scenario is a set of what-if choices (hypothetical inputs) to compare later. Replay years are past weather, not a forecast.">
        {field.scenarios.length === 0 ? (
          <Empty>No scenarios yet.</Empty>
        ) : (
          <RecordList
            label="Scenarios"
            items={field.scenarios.map((s) => ({
              key: s.id,
              primary: <TextLink href={`/scenarios/${s.id}`}>{s.name}</TextLink>,
              secondary: `${s.snapshotCount} input snapshot${s.snapshotCount === 1 ? "" : "s"} · updated ${new Date(s.updated_at).toISOString().slice(0, 10)}`,
            }))}
          />
        )}
        <ActionForm action={createScenario.bind(null, field.id)} submitLabel="Create scenario" direction="row">
          <FormField name="name" label="Scenario name" required />
          <FormField name="candidateCrops" label="Candidate crops" helperText="Comma-separated, e.g. maize, soybean, wheat" required sx={{ minWidth: 280 }} />
          <FormField name="rotationYears" label="Rotation length (years)" type="number" defaultValue={2} sx={{ width: 190 }} />
          <FormField name="replayFromYear" label="Replay from" type="number" defaultValue={lastYear - 19} sx={{ width: 130 }} />
          <FormField name="replayToYear" label="Replay to" type="number" defaultValue={lastYear} sx={{ width: 130 }} />
          <FormSelect name="irrigationAssumption" label="Irrigation assumption" options={IRRIGATION_ASSUMPTIONS.map((v) => ({ value: v, label: IRRIGATION_ASSUMPTION_LABELS[v] }))} />
        </ActionForm>
      </Section>

      <Section title="Delete field" intro="Permanently deletes this field with its zones, records, scenarios and snapshots.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "fields", field.id, field.farm_id)} label={`Delete field ${field.name}`} confirmLabel="Yes, delete this field and everything in it" />
      </Section>
    </Container>
  );
}
