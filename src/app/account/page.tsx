import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { PageHeader, Section } from "@/components/farm/ui";
import { ActionForm, FormField, FormSelect } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { signOut } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";
import { updateProfile } from "@/server/farm/actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  if (user.state !== "signed_in") return <SetupRequired feature="Accounts" reason={user.state} />;
  const { data: profile } = await user.supabase.from("profiles").select("display_name, unit_system").eq("id", user.userId).maybeSingle();
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Account">
        <Typography color="text.secondary">Signed in as {user.email ?? "your account"}.</Typography>
      </PageHeader>
      <Section title="Preferences">
        <ActionForm action={updateProfile} submitLabel="Save preferences" direction="row">
          <FormField name="displayName" label="Display name" defaultValue={profile?.display_name ?? ""} />
          <FormSelect name="unitSystem" label="Units" options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} defaultValue={profile?.unit_system ?? "metric"} />
        </ActionForm>
      </Section>
      <Section title="Security">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <TextLink href="/account/update-password">Change password</TextLink>
          <form action={signOut}>
            <Button type="submit" variant="outlined">
              Sign out
            </Button>
          </form>
        </Stack>
      </Section>
    </Container>
  );
}
