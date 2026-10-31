import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { Empty, PageHeader, Section } from "@/components/farm/ui";
import { ButtonLink, TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { ENGINE_VERSION } from "@/domain/simulation/engine-version";
import { requireUser } from "@/server/auth/session";
import { listScenarios, SchemaMissingError } from "@/server/farm/queries";
import { color, numeric, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Saved runs" };

export default async function RunsPage() {
  const user = await requireUser("/runs");
  if (user.state !== "signed_in") return <SetupRequired feature="Saved runs" reason={user.state} />;
  let scenarios: Awaited<ReturnType<typeof listScenarios>>;
  try {
    scenarios = await listScenarios(user.supabase);
  } catch (e) {
    if (e instanceof SchemaMissingError) return <SetupRequired feature="Saved runs" reason="unconfigured" />;
    throw e;
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Saved runs">
        <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
          A run will pin a scenario&apos;s frozen inputs, the evidence snapshot and the engine version, so reopening it reproduces the same result.
        </Typography>
      </PageHeader>
      <Alert severity="info" sx={{ mb: 3 }}>
        No runs exist yet because the simulation engine is not built (current engine marker <code>{ENGINE_VERSION}</code>). Scenarios and their frozen input snapshots below are
        already saved and will be runnable once it is.
      </Alert>
      <Section title="Scenarios and input snapshots" intro="Each scenario belongs to a field. Snapshots are immutable copies of the inputs at the moment you froze them.">
        {scenarios.length === 0 ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Empty>No scenarios yet. Create one from a field&apos;s records page.</Empty>
            <ButtonLink href="/farms" variant="outlined">
              Go to your farms
            </ButtonLink>
          </Stack>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            {scenarios.map((s) => (
              <Box component="li" key={s.id} sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surface }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <TextLink href={`/scenarios/${s.id}`} sx={{ fontWeight: 700 }}>
                      {s.name}
                    </TextLink>
                    <Typography variant="body2" color="text.secondary" sx={numeric}>
                      Field <TextLink href={`/fields/${s.fieldId}`}>{s.fieldName}</TextLink> · updated {s.updatedAt.slice(0, 10)}
                    </Typography>
                  </Box>
                  <Chip size="small" label={`${s.snapshots} snapshot${s.snapshots === 1 ? "" : "s"}`} sx={numeric} />
                </Stack>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                  Results: none (engine not built)
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Section>
    </Container>
  );
}
