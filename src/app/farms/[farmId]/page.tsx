import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { Empty, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormCheckbox, FormField, FormSelect } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { MARKET_PREFERENCES } from "@/domain/farm/records";
import { requireUser } from "@/server/auth/session";
import { addMarketPreference, createField, deleteOwnedRecord } from "@/server/farm/actions";
import { getFarm } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Farm" };

const PREF_LABEL: Record<(typeof MARKET_PREFERENCES)[number], string> = {
  preferred: "Preferred",
  acceptable: "Acceptable",
  avoid: "Avoid",
  no_market_access: "No market access",
};

export default async function FarmPage({ params }: PageProps<"/farms/[farmId]">) {
  const { farmId } = await params;
  const user = await requireUser(`/farms/${farmId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saving farms" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(farmId)) notFound();
  const farm = await getFarm(user.supabase, farmId);
  if (!farm) notFound();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[{ href: "/farms", label: "Farms" }]} title={farm.name}>
        {(farm.country_code || farm.notes) && (
          <Typography color="text.secondary">
            {farm.country_code}
            {farm.country_code && farm.notes ? " · " : ""}
            {farm.notes}
          </Typography>
        )}
      </PageHeader>

      <Section title="Fields" intro="Each field holds its own boundary, zones, crop history, soil records, water limits, priorities and scenarios.">
        {farm.fields.length === 0 ? (
          <Empty>No fields yet.</Empty>
        ) : (
          <RecordList
            label="Fields"
            items={farm.fields.map((f) => ({
              key: f.id,
              primary: <TextLink href={`/fields/${f.id}`}>{f.name}</TextLink>,
              secondary: f.area_ha !== null ? `${Number(f.area_ha).toFixed(2)} ha (from boundary)` : "No boundary yet",
            }))}
          />
        )}
        <ActionForm action={createField.bind(null, farm.id)} submitLabel="Add field" direction="row">
          <FormField name="name" label="Field name" required sx={{ minWidth: 240 }} />
          <FormField name="notes" label="Notes" sx={{ minWidth: 280, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section title="Market preferences" intro="Where you can sell. Farmer-reported; Astrapon does not estimate prices or profit.">
        {farm.markets.length === 0 ? (
          <Empty>No market preferences recorded.</Empty>
        ) : (
          <RecordList
            label="Market preferences"
            items={farm.markets.map((m) => ({
              key: m.id,
              primary: m.crop_name,
              secondary: `${PREF_LABEL[m.preference as keyof typeof PREF_LABEL] ?? m.preference}${m.has_contract ? " · under contract" : ""}${m.notes ? ` · ${m.notes}` : ""}`,
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "market_preferences", m.id, farm.id)} label={`Delete market preference for ${m.crop_name}`} />,
            }))}
          />
        )}
        <ActionForm action={addMarketPreference.bind(null, farm.id)} submitLabel="Add preference" direction="row">
          <FormField name="cropName" label="Crop" required />
          <FormSelect name="preference" label="Preference" options={MARKET_PREFERENCES.map((v) => ({ value: v, label: PREF_LABEL[v] }))} defaultValue="acceptable" />
          <FormCheckbox name="hasContract" label="Under contract" />
          <FormField name="notes" label="Notes" sx={{ minWidth: 240, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section title="Delete farm" intro="Permanently deletes this farm and every field, zone, record and scenario under it.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "farms", farm.id, farm.id)} label={`Delete farm ${farm.name}`} confirmLabel="Yes, delete this farm and everything in it" />
      </Section>
    </Container>
  );
}
