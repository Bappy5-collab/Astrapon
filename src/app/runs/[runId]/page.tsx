import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EvidenceChip, PageHeader } from "@/components/farm/ui";
import { SetupRequired } from "@/components/SetupRequired";
import { RUN_STATUS } from "@/components/simulation/status";
import { RunResult } from "@/components/simulation/RunResult";
import { requireUser } from "@/server/auth/session";
import { getRun } from "@/server/simulation/queries";
import { numeric } from "@/theme/tokens";

export const metadata: Metadata = { title: "Run result" };

export default async function RunPage({ params }: PageProps<"/runs/[runId]">) {
  const { runId } = await params;
  const user = await requireUser(`/runs/${runId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="Saved runs" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) notFound();
  const data = await getRun(user.supabase, runId);
  if (!data) notFound();
  const { run, result, scenario } = data;
  const st = RUN_STATUS[run.status];
  const crumbs = [{ href: "/runs", label: "Saved runs" }, ...(scenario ? [{ href: `/fields/${scenario.fieldId}`, label: scenario.fieldName }, { href: `/scenarios/${scenario.id}`, label: scenario.name }] : [])];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={crumbs} title={scenario ? `Run: ${scenario.name}` : "Run"}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Chip size="small" label={st.label} sx={{ bgcolor: st.bg, color: st.fg, fontWeight: 600 }} />
          <EvidenceChip evidenceClass="simulation_output" />
          <Typography variant="body2" color="text.secondary" sx={numeric}>
            {run.queuedAt.slice(0, 16).replace("T", " ")} UTC · engine {run.engineVersion}
            {run.computeMs != null ? ` · computed in ${run.computeMs} ms` : ""}
          </Typography>
        </Stack>
      </PageHeader>
      {run.status === "failed" && <Alert severity="error">{run.errorMessage ?? "The run failed."}</Alert>}
      {(run.status === "queued" || run.status === "running") && <Alert severity="info">This run is {run.status}. Open the scenario to follow it.</Alert>}
      {run.status === "cancelled" && <Alert severity="info">This run was cancelled.</Alert>}
      {result && <RunResult result={result} resultSha256={run.resultSha256} inputDigest={run.inputDigest} />}
    </Container>
  );
}
