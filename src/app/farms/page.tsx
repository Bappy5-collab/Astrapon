import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Container from "@mui/material/Container";
import type { Metadata } from "next";

import { Empty, PageHeader, RecordList, Section } from "@/components/farm/ui";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { requireUser } from "@/server/auth/session";
import { createFarm } from "@/server/farm/actions";
import { listFarms, SchemaMissingError } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Your farms" };

export default async function FarmsPage() {
  const user = await requireUser("/farms");
  if (user.state !== "signed_in") return <SetupRequired feature="Saving farms" reason={user.state} />;
  let farms: Awaited<ReturnType<typeof listFarms>>;
  try {
    farms = await listFarms(user.supabase);
  } catch (error) {
    if (!(error instanceof SchemaMissingError)) throw error;
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Database schema not applied</AlertTitle>
          You are signed in, but the FieldShift tables do not exist in this Supabase project yet, so nothing can be saved. The
          project owner needs to run <code>pnpm db:migrate</code> (see supabase/README.md).
        </Alert>
      </Container>
    );
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Your farms" />
      <Section title="Farms" intro="Private to your account. Fields, zones, history and scenarios are stored under each farm.">
        {farms.length === 0 ? (
          <Empty>No farms yet. Add your first farm below.</Empty>
        ) : (
          <RecordList
            label="Farms"
            items={farms.map((f) => ({
              key: f.id,
              primary: <TextLink href={`/farms/${f.id}`}>{f.name}</TextLink>,
              secondary: `${f.fieldCount} field${f.fieldCount === 1 ? "" : "s"}${f.country_code ? ` · ${f.country_code}` : ""}`,
            }))}
          />
        )}
      </Section>
      <Section title="Add a farm">
        <ActionForm action={createFarm} submitLabel="Create farm" direction="row">
          <FormField name="name" label="Farm name" required sx={{ minWidth: 240 }} />
          <FormField name="countryCode" label="Country code" helperText="Two letters, e.g. US" slotProps={{ htmlInput: { maxLength: 2 } }} sx={{ width: 160 }} />
          <FormField name="notes" label="Notes" multiline minRows={1} sx={{ minWidth: 280, flexGrow: 1 }} />
        </ActionForm>
      </Section>
    </Container>
  );
}
