import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { Empty, PageHeader, Section } from "@/components/farm/ui";
import { ButtonLink, TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { RUN_STATUS } from "@/components/simulation/status";
import { requireUser } from "@/server/auth/session";
import { listScenarios, SchemaMissingError } from "@/server/farm/queries";
import { listAllRuns } from "@/server/simulation/queries";
import { color, numeric, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Saved runs" };

export default async function RunsPage() {
  const user = await requireUser("/runs");
  if (user.state !== "signed_in") return <SetupRequired feature="Saved runs" reason={user.state} />;
  let scenarios: Awaited<ReturnType<typeof listScenarios>>;
  let runs: Awaited<ReturnType<typeof listAllRuns>> = [];
  try {
    scenarios = await listScenarios(user.supabase);
    runs = await listAllRuns(user.supabase);
  } catch (e) {
    if (e instanceof SchemaMissingError) return <SetupRequired feature="Saved runs" reason="unconfigured" />;
    throw e;
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Saved runs">
        <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
          A run pins a scenario&apos;s frozen inputs, the evidence it used and the engine version, so reopening it shows exactly the stored result, and a re-run reproduces it.
        </Typography>
      </PageHeader>
      <Section title="Runs" intro="Newest first. Results are relative comparisons on past weather, not forecasts.">
        {runs.length === 0 ? (
          <Empty>No runs yet. Open a scenario and choose “Run simulation”.</Empty>
        ) : (
          <Box component="ul" aria-label="Runs" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
            {runs.map((r) => {
              const st = RUN_STATUS[r.status];
              return (
                <Box component="li" key={r.id} sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surface }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                      <Chip size="small" label={st.label} sx={{ bgcolor: st.bg, color: st.fg, fontWeight: 600 }} />
                      <Typography variant="body2" sx={numeric}>
                        {r.scenarioName || "Scenario"} · {r.fieldName} · {r.queuedAt.slice(0, 16).replace("T", " ")} UTC · engine {r.engineVersion}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={2}>
                      {r.status === "succeeded" && <TextLink href={`/runs/${r.id}`}>Open result</TextLink>}
                      {r.scenarioId && <TextLink href={`/scenarios/${r.scenarioId}`}>Scenario</TextLink>}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}
      </Section>
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

              </Box>
            ))}
          </Box>
        )}
      </Section>
    </Container>
  );
}
