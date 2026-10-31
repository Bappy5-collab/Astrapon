import Container from "@mui/material/Container";
import type { Metadata } from "next";

import { PageHeader, Section } from "@/components/farm/ui";
import { TextLink } from "@/components/links";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const t = await getT();
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title={t("set.title")} />
      <Section title="Display" intro="These preferences apply to this browser. Account details (name, units, password) are on the Account page.">
        <SettingsForm />
      </Section>
      <Section title="Account">
        <TextLink href="/account">Open account settings</TextLink>
      </Section>
    </Container>
  );
}
