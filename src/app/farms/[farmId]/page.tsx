import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeleteButton } from "@/components/farm/DeleteButton";
import { FieldCard, FieldGrid } from "@/components/farm/FieldCard";
import { Empty, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormCheckbox, FormField, FormSelect } from "@/components/forms/ActionForm";
import { ButtonLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { fieldSteps } from "@/domain/farm/progress";
import { MARKET_PREFERENCES } from "@/domain/farm/records";
import { requireUser } from "@/server/auth/session";
import { addMarketPreference, createField, deleteOwnedRecord } from "@/server/farm/actions";
import { fieldFacts, getFarm } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Farm" };

const PREF_LABEL: Record<(typeof MARKET_PREFERENCES)[number], string> = {
  preferred: "I prefer to sell it",
  acceptable: "I can sell it",
  avoid: "I'd rather not",
  no_market_access: "No buyer near me",
};

export default async function FarmPage({ params }: PageProps<"/farms/[farmId]">) {
  const { farmId } = await params;
  const user = await requireUser(`/farms/${farmId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saving farms" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(farmId)) notFound();
  const farm = await getFarm(user.supabase, farmId);
  if (!farm) notFound();
  const facts = await fieldFacts(user.supabase, farm.fields.map((f) => f.id));

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <PageHeader
        crumbs={[{ href: "/farms", label: "Farms" }]}
        title={farm.name}
        eyebrow="Farm"
        subtitle={[farm.country_code, farm.notes].filter(Boolean).join(" · ") || undefined}
        actions={
          <ButtonLink href="/fields/new" variant="contained" startIcon={<AddRoundedIcon />}>
            Add a field on the map
          </ButtonLink>
        }
      />

      <Typography variant="h5" component="h2" sx={{ mb: 1.5 }}>
        Fields
      </Typography>
      {farm.fields.length === 0 ? (
        <Empty>No fields yet. Use “Add a field on the map” to draw your first one.</Empty>
      ) : (
        <FieldGrid label="Fields">
          {farm.fields.map((f) => {
            const fx = facts.get(f.id);
            return fx ? <FieldCard key={f.id} id={f.id} name={f.name} areaHa={f.area_ha === null ? null : Number(f.area_ha)} steps={fieldSteps(f.id, fx)} /> : null;
          })}
        </FieldGrid>
      )}

      <Section collapsible title="Add a field by name only" intro="Creates an empty field you can draw later. Most people use “Add a field on the map” instead." icon={<AddRoundedIcon />}>
        <ActionForm action={createField.bind(null, farm.id)} submitLabel="Add field" direction="row">
          <FormField name="name" label="Field name" required sx={{ minWidth: 240 }} />
          <FormField name="notes" label="Notes" sx={{ minWidth: 280, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section
        collapsible
        defaultOpen={farm.markets.length > 0}
        icon={<StorefrontRoundedIcon />}
        title="Where you can sell"
        intro="Optional. Crops you can or cannot sell nearby. Astrapon does not estimate prices or profit."
      >
        {farm.markets.length === 0 ? (
          <Empty>Nothing recorded.</Empty>
        ) : (
          <RecordList
            label="Where you can sell"
            items={farm.markets.map((m) => ({
              key: m.id,
              primary: m.crop_name,
              secondary: `${PREF_LABEL[m.preference as keyof typeof PREF_LABEL] ?? m.preference}${m.has_contract ? " · under contract" : ""}${m.notes ? ` · ${m.notes}` : ""}`,
              action: <DeleteButton action={deleteOwnedRecord.bind(null, "market_preferences", m.id, farm.id)} label={`Delete market preference for ${m.crop_name}`} />,
            }))}
          />
        )}
        <ActionForm action={addMarketPreference.bind(null, farm.id)} submitLabel="Add" direction="row">
          <FormField name="cropName" label="Crop" required />
          <FormSelect name="preference" label="Can you sell it?" options={MARKET_PREFERENCES.map((v) => ({ value: v, label: PREF_LABEL[v] }))} defaultValue="acceptable" />
          <FormCheckbox name="hasContract" label="Under contract" />
          <FormField name="notes" label="Notes" sx={{ minWidth: 240, flexGrow: 1 }} />
        </ActionForm>
      </Section>

      <Section collapsible tone="danger" icon={<DeleteOutlineRoundedIcon />} title="Delete this farm" intro="Removes the farm and every field, season, comparison and result in it. This cannot be undone.">
        <DeleteButton action={deleteOwnedRecord.bind(null, "farms", farm.id, farm.id)} label={`Delete farm ${farm.name}`} confirmLabel="Yes, delete this farm and everything in it" />
      </Section>
    </Container>
  );
}
