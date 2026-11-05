import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ButtonLink, TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { WaterPlanner } from "@/components/water/WaterPlanner";
import { requireUser } from "@/server/auth/session";
import { getField } from "@/server/farm/queries";
import { deleteWaterPlan, findGroundwater, findSurfaceWater, loadSolar, saveWaterPlan } from "@/server/water/actions";
import { listFieldRunDemands, listWaterPlans } from "@/server/water/queries";

export const metadata: Metadata = { title: "Water & Energy" };

export default async function WaterPage({ params, searchParams }: PageProps<"/fields/[fieldId]/water">) {
  const { fieldId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/fields/${fieldId}/water`);
  if (user.state !== "signed_in") return <SetupRequired feature="Water & Energy" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(fieldId)) notFound();
  const field = await getField(user.supabase, fieldId);
  if (!field) notFound();
  const crumbs = [{ href: "/workspace", label: "My fields" }, { href: `/fields/${fieldId}/records`, label: field.name }];
  if (!field.geometry.boundary)
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <PageHeader crumbs={crumbs} title="Water & Energy" />
        <Typography>Draw the field on the map first: water sources, groundwater records and sunshine are found from the field&apos;s location.</Typography>
        <ButtonLink href={`/fields/${fieldId}`} variant="contained" sx={{ mt: 2 }}>
          Draw the field
        </ButtonLink>
      </Container>
    );
  const [runs, plans] = await Promise.all([listFieldRunDemands(user.supabase, fieldId), listWaterPlans(user.supabase, fieldId)]);
  const runParam = typeof sp.run === "string" ? sp.run : null;

  const surface = async (r: number) => {
    "use server";
    return findSurfaceWater(fieldId, r);
  };
  const groundwater = async (r: number) => {
    "use server";
    return findGroundwater(fieldId, r);
  };
  const solar = async () => {
    "use server";
    return loadSolar(fieldId);
  };
  const save = async (raw: unknown) => {
    "use server";
    return saveWaterPlan(fieldId, raw);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader
        crumbs={crumbs}
        title="Water & Energy"
        eyebrow={field.name}
        subtitle="Where irrigation water could come from, how much each rotation needs, and the pump and solar energy to move it. An Astrapon extension to the rotation comparison (not a NASA requirement or endorsement). Groundwater record coverage varies by country and monitoring network."
        actions={
          <ButtonLink href={`/fields/${fieldId}/records`} variant="outlined">
            Back to the field steps
          </ButtonLink>
        }
      />
      <WaterPlanner
        key={fieldId}
        fieldId={fieldId}
        fieldName={field.name}
        boundary={field.geometry.boundary}
        areaHa={Number(field.area_ha) || 0.01}
        runs={runs.map((r) => ({ runId: r.runId, resultSha256: r.resultSha256, scenarioName: r.scenarioName, finishedAt: r.finishedAt, demand: r.demand }))}
        initialRunId={runParam}
        actions={{ surface, groundwater, solar, save }}
      />
      <Section title="Saved versions" intro="Each saved version keeps its inputs, provider records and dates, model version and result exactly. Opening or exporting one never recalculates it.">
        {plans.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing saved yet.
          </Typography>
        ) : (
          <RecordList
            label="Saved water and energy versions"
            items={plans.map((p) => ({
              key: p.id,
              primary: <TextLink href={`/fields/${fieldId}/water/plans/${p.id}`}>{`v${p.version} · ${p.name}`}</TextLink>,
              secondary: `Saved ${p.createdAt.slice(0, 16).replace("T", " ")} UTC · model ${p.modelVersion} · ${p.result.options.length} option(s) · ${p.inputs.source.kind === "well" ? "well" : "surface source"}`,
              action: (
                <DeleteButton
                  label={`Delete version ${p.version}`}
                  action={async () => {
                    "use server";
                    await deleteWaterPlan(fieldId, p.id);
                  }}
                />
              ),
            }))}
          />
        )}
      </Section>
    </Container>
  );
}
