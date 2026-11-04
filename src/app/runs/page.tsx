import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
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
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/server/auth/session";
import { listScenarios, SchemaMissingError } from "@/server/farm/queries";
import { listAllRuns, listPlans } from "@/server/simulation/queries";
import { color, numeric, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Results" };

export default async function RunsPage() {
  const user = await requireUser("/runs");
  if (user.state !== "signed_in") return <SetupRequired feature="Saved runs" reason={user.state} />;
  let scenarios: Awaited<ReturnType<typeof listScenarios>>;
  let runs: Awaited<ReturnType<typeof listAllRuns>> = [];
  let plans: Awaited<ReturnType<typeof listPlans>> = [];
  try {
    scenarios = await listScenarios(user.supabase);
    runs = await listAllRuns(user.supabase);
    plans = await listPlans(user.supabase);
  } catch (e) {
    if (e instanceof SchemaMissingError) return <SetupRequired feature="Saved runs" reason="unconfigured" />;
    throw e;
  }
  const t = await getT();
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader
        crumbs={[]}
        title={t("nav.runs")}
        subtitle="Every comparison you have run, and the plans you saved. A saved result always reopens exactly as it was."
      />
      <Section icon={<BookmarkRoundedIcon />} title={t("sim.plan.all")} intro={t("sim.plan.allIntro")}>
        {plans.length === 0 ? (
          <Empty>{t("sim.plan.noneAll")}</Empty>
        ) : (
          <Box component="ul" aria-label="Plans" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
            {plans.map((p) => (
              <Box component="li" key={p.id} sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surface }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{p.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={numeric}>
                      {p.scenarioName} · {p.fieldName} · {t(`sim.run.${p.runKind}`)} · {p.createdAt.slice(0, 10)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={2}>
                    <TextLink href={`/runs/${p.runId}`}>{t("sim.open")}</TextLink>
                    <TextLink href={`/runs/${p.runId}/export`}>JSON</TextLink>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Section>
      <Section icon={<CompareArrowsRoundedIcon />} title="Comparisons you ran" intro="Newest first. Each one compares options on past weather; none is a forecast.">
        {runs.length === 0 ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Empty>No comparisons yet. Open one of your fields and follow the steps.</Empty>
            <ButtonLink href="/workspace" variant="contained">
              Go to my fields
            </ButtonLink>
          </Stack>
        ) : (
          <Box component="ul" aria-label="Runs" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
            {runs.map((r) => {
              const st = RUN_STATUS[r.status];
              return (
                <Box component="li" key={r.id} sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surface }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                      <Chip size="small" label={t(`sim.status.${r.status}`)} sx={{ bgcolor: st.bg, color: st.fg, fontWeight: 600 }} />
                      <Typography variant="body2" sx={numeric}>
                        <Box component="strong">{r.scenarioName || "Comparison"}</Box> · {r.fieldName} · {r.queuedAt.slice(0, 10)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={2}>
                      {r.status === "succeeded" && (
                        <ButtonLink href={`/runs/${r.id}`} size="small" variant="contained">
                          {t("sim.open")}
                        </ButtonLink>
                      )}
                      {r.scenarioId && (
                        <ButtonLink href={`/scenarios/${r.scenarioId}`} size="small" variant="text">
                          Settings
                        </ButtonLink>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}
      </Section>
      <Section collapsible icon={<Inventory2OutlinedIcon />} title="All comparison settings" intro="Each comparison belongs to a field. Snapshots are frozen copies of the inputs used by each run.">
        {scenarios.length === 0 ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Empty>No comparisons yet. Start one from a field&apos;s steps.</Empty>
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
                      Field <TextLink href={`/fields/${s.fieldId}/records`}>{s.fieldName}</TextLink> · updated {s.updatedAt.slice(0, 10)}
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
