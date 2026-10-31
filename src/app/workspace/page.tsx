import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { Empty, PageHeader, Section } from "@/components/farm/ui";
import { ButtonLink, TextLink } from "@/components/links";
import { getAuth } from "@/server/auth/session";
import { color, numeric, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Workspace" };

/** Entry point: open one of your fields in the workspace, start a new one, or explore the sample. */
export default async function WorkspaceHubPage() {
  const auth = await getAuth();
  let fields: { id: string; name: string; area_ha: number | null; farmName: string }[] | null = null;
  if (auth.state === "signed_in") {
    const { data } = await auth.supabase.from("fields").select("id, name, area_ha, farms(name)").order("updated_at", { ascending: false }).limit(50);
    fields = (data ?? []).map((f) => ({ id: f.id, name: f.name, area_ha: f.area_ha === null ? null : Number(f.area_ha), farmName: (f.farms as unknown as { name: string } | null)?.name ?? "" }));
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Field workspace">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <ButtonLink href="/fields/new" variant="contained">
            Create my field
          </ButtonLink>
          <ButtonLink href="/sample" variant="outlined">
            Explore the sample
          </ButtonLink>
        </Stack>
      </PageHeader>
      <Section title="Your fields" intro="Open a field to draw zones, assign crops by season and inspect it in 3D.">
        {fields === null ? (
          <Typography>
            <TextLink href="/sign-in?next=/workspace">Sign in</TextLink> to open your own fields. The sample works without an account.
          </Typography>
        ) : fields.length === 0 ? (
          <Empty>No fields yet. Create your first field from the map.</Empty>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
            {fields.map((f) => (
              <Box component="li" key={f.id} sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surface }}>
                <TextLink href={`/fields/${f.id}`} sx={{ fontWeight: 700 }}>
                  {f.name}
                </TextLink>
                <Typography variant="body2" color="text.secondary" sx={numeric}>
                  {f.farmName} · {f.area_ha !== null ? `${f.area_ha.toFixed(2)} ha` : "no boundary yet"}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Section>
    </Container>
  );
}
