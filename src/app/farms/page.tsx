import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { Empty, PageHeader, Section } from "@/components/farm/ui";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { requireUser } from "@/server/auth/session";
import { createFarm } from "@/server/farm/actions";
import { listFarms, SchemaMissingError } from "@/server/farm/queries";
import { color, elevation, radius, tokens } from "@/theme/tokens";

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
          You are signed in, but the Astrapon tables do not exist in this Supabase project yet, so nothing can be saved. The
          project owner needs to run <code>pnpm db:migrate</code> (see supabase/README.md).
        </Alert>
      </Container>
    );
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <PageHeader crumbs={[{ href: "/workspace", label: "My fields" }]} title="Your farms" subtitle="A farm groups your fields. Everything here is private to your account." />
      {farms.length === 0 ? (
        <Empty>No farms yet. Add your first farm below, then add its fields on the map.</Empty>
      ) : (
        <Box component="ul" aria-label="Farms" sx={{ listStyle: "none", p: 0, m: 0, mb: 3, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
          {farms.map((f) => (
            <Box
              component="li"
              key={f.id}
              sx={{ p: 2.5, borderRadius: `${radius.lg + 2}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised, boxShadow: elevation.raised, "&:hover": { borderColor: tokens.forest[400] } }}
            >
              <TextLink href={`/farms/${f.id}`} underline="hover" sx={{ fontWeight: 700, fontSize: "1.15rem", color: tokens.forest[900], display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                {f.name} <ArrowForwardRoundedIcon fontSize="small" />
              </TextLink>
              <Typography variant="body2" color="text.secondary">
                {`${f.fieldCount} field${f.fieldCount === 1 ? "" : "s"}${f.country_code ? ` · ${f.country_code}` : ""}`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Section title="Add a farm" icon={<AddRoundedIcon />}>
        <ActionForm action={createFarm} submitLabel="Create farm" direction="row">
          <FormField name="name" label="Farm name" required sx={{ minWidth: 240 }} />
          <FormField name="countryCode" label="Country code" helperText="Two letters, e.g. US, BD, IN" slotProps={{ htmlInput: { maxLength: 2 } }} sx={{ width: 200 }} />
          <FormField name="notes" label="Notes" multiline minRows={1} sx={{ minWidth: 280, flexGrow: 1 }} />
        </ActionForm>
      </Section>
    </Container>
  );
}
