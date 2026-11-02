import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { connection } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { SERVER_FEATURE_LABELS, type FeatureStatus, type ServerFeature } from "@/lib/env/schema";
import { getServerEnvReport } from "@/server/env";
import { tokens } from "@/theme/tokens";

export const metadata: Metadata = { title: "Setup status" };

type Row = { name: string; status: FeatureStatus; enables: string; implemented: string };

const ENABLES: Record<ServerFeature, string> = {
  supabaseAdmin: "Server jobs, reference-data loading, and administrative database access.",
  nasaEarthdata: "IMERG, SMAP (via AppEEARS), and other NASA products that require Earthdata Login.",
  openTopography: "NASADEM elevation for slope, frost-pocket, and wet-hollow indicators.",
  aiExplanations: "Optional plain-language drafting of explanations from computed results.",
  workerDispatch: "Starts the GitHub Actions evidence worker as soon as a refresh or run is queued (otherwise it runs on its 10-minute schedule).",
};

export default async function SetupPage() {
  // Read configuration at request time, not at build time.
  await connection();
  const publicSupabase = getSupabasePublicEnv().status;
  const server = getServerEnvReport();

  const rows: Row[] = [
    {
      name: "Supabase project (public URL + publishable key)",
      status: publicSupabase,
      enables: "Accounts, saved farms and fields, and saved runs.",
      implemented: "Phase 2: email/password accounts, RLS-protected farms, fields, zones, records and scenarios. Schema applied with pnpm db:migrate.",
    },
    ...(Object.keys(SERVER_FEATURE_LABELS) as ServerFeature[]).map((k) => ({
      name: SERVER_FEATURE_LABELS[k],
      status: server[k],
      enables: ENABLES[k],
      implemented:
        k === "aiExplanations"
          ? "Phase 6: optional AI draft of a run explanation (claude-opus-5-5). Receives only the stored result; output is checked against its sources and numbers. Server-only key."
          : k === "workerDispatch"
            ? "Server-only token (GitHub fine-grained, Actions read and write on this repository). Used after queueing; never sent to the browser."
          : k === "nasaEarthdata" || k === "openTopography"
            ? "Researched; not used by the app yet (see /sources)."
            : "Used only by local database scripts (reference-data import, verification, tests). Never sent to the browser or used by app pages.",
    })),
  ];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
      <Typography variant="overline" sx={{ color: tokens.forest[600] }}>
        Configuration
      </Typography>
      <Typography variant="h2" component="h1" sx={{ mt: 1, color: tokens.forest[900] }}>
        Setup status
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 720 }}>
        Astrapon runs without any credentials: the shell and the illustrative 3D preview always work. Features that need an
        external service stay unavailable, and say so, until that service is configured. Values are never shown here, only whether
        each one is present and valid.
      </Typography>

      <TableContainer component={Box} sx={{ mt: 4, border: `1px solid ${tokens.neutral[300]}`, borderRadius: 3, bgcolor: tokens.neutral[50] }}>
        <Table aria-label="Service configuration">
          <TableHead>
            <TableRow>
              <TableCell>Service</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Enables</TableCell>
              <TableCell>Implementation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                <TableCell>
                  <StatusDetail status={r.status} />
                </TableCell>
                <TableCell>{r.enables}</TableCell>
                <TableCell>{r.implemented}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Alert severity="info" sx={{ mt: 4 }}>
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in the values for a Astrapon development Supabase project,
        and restart <code>pnpm dev</code>. See <code>README.md</code> for details.
      </Alert>
    </Container>
  );
}

function StatusDetail({ status }: { status: FeatureStatus }) {
  if (status.state === "configured") {
    return <Chip size="small" label="Configured" sx={{ bgcolor: tokens.lime[400], color: tokens.forest[950] }} />;
  }
  const label = status.state === "missing" ? "Not configured" : "Invalid";
  const detail = status.state === "missing" ? `Missing: ${status.missing.join(", ")}` : status.problems.join("; ");
  return (
    <Box>
      <Chip size="small" label={label} color={status.state === "invalid" ? "error" : "default"} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, wordBreak: "break-word" }}>
        {detail}
      </Typography>
    </Box>
  );
}
