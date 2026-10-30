import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import { REFERENCE_SOURCES } from "@/domain/sources/references";
import { DATA_SOURCES } from "@/domain/sources/registry";
import type { DataSource, SourceDecision, SourceStatus } from "@/domain/sources/types";
import { tokens } from "@/theme/tokens";

export const metadata: Metadata = { title: "Data sources" };

const STATUS: Record<SourceStatus, { label: string; bg: string; fg: string }> = {
  live_verified: { label: "Live-verified", bg: tokens.lime[400], fg: tokens.forest[950] },
  implemented: { label: "Implemented", bg: tokens.forest[600], fg: tokens.neutral[50] },
  credential_blocked: { label: "Needs credentials", bg: "#F3E1B8", fg: "#5A3E07" },
  unavailable: { label: "Unavailable now", bg: "#F2D4CB", fg: "#6B2414" },
  researched: { label: "Researched only", bg: tokens.neutral[200], fg: tokens.neutral[700] },
};

const DECISION: Record<SourceDecision, string> = {
  selected_initial: "Initial subset",
  selected_pending_access: "Initial subset · pending access",
  deferred: "Deferred",
  rejected: "Not used for field decisions",
  reference: "Reference",
};

const ORDER: SourceDecision[] = ["selected_initial", "selected_pending_access", "deferred", "rejected", "reference"];

export default function SourcesPage() {
  const sorted = [...DATA_SOURCES].sort((a, b) => ORDER.indexOf(a.decision) - ORDER.indexOf(b.decision));
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
      <Typography variant="overline" sx={{ color: tokens.forest[600] }}>
        Evidence inventory
      </Typography>
      <Typography variant="h2" component="h1" sx={{ mt: 1, color: tokens.forest[900] }}>
        Data sources
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 760 }}>
        What FieldShift may use, what kind of evidence each source is, how it is accessed, and what it cannot tell you. “Live-verified”
        means a scripted request returned real values that passed content checks; it does not mean the source is integrated into a
        field workflow yet. Hosting by NASA does not make a product a direct observation.
      </Typography>

      <Stack spacing={2} component="ul" aria-label="Data sources" sx={{ listStyle: "none", p: 0, m: 0, mt: 5 }}>
        {sorted.map((s) => (
          <SourceCard key={s.id} s={s} />
        ))}
      </Stack>

      <Typography variant="h3" component="h2" sx={{ mt: 8 }}>
        Agronomic references
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
        Static tables and literature. None of these is a measurement of your field.
      </Typography>
      <Box component="ul" sx={{ mt: 2, pl: 2.5 }}>
        {REFERENCE_SOURCES.map((r) => (
          <Typography component="li" key={r.id} variant="body2" sx={{ mb: 1 }}>
            <Link href={r.url} rel="noopener noreferrer" target="_blank">
              {r.citation}
            </Link>{" "}
            — {r.usedFor} <em>Caveat:</em> {r.caveats}
          </Typography>
        ))}
      </Box>
    </Container>
  );
}

function SourceCard({ s }: { s: DataSource }) {
  const st = STATUS[s.status];
  return (
    <Box component="li" sx={{ p: { xs: 2, md: 3 }, overflowWrap: "anywhere", borderRadius: 3, border: `1px solid ${tokens.neutral[300]}`, bgcolor: tokens.neutral[50] }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
        <Box>
          <Typography variant="h5" component="h2">
            {s.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {s.producer} · {s.productId} · version {s.version}
            {s.doi ? ` · doi:${s.doi}` : ""}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", flexShrink: 0 }}>
          <Chip size="small" label={st.label} sx={{ bgcolor: st.bg, color: st.fg }} />
          <Chip size="small" variant="outlined" label={DECISION[s.decision]} />
        </Stack>
      </Stack>
      <Box component="dl" sx={{ m: 0, mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", md: "180px 1fr" }, columnGap: 2, rowGap: 0.75, "& dt": { fontWeight: 700, fontSize: "0.85rem" }, "& dd": { m: 0, fontSize: "0.9rem" } }}>
        <dt>Evidence type</dt>
        <dd>
          {EVIDENCE_CLASS_INFO[s.evidenceClass].label}. {s.evidenceNote}
        </dd>
        <dt>Spatial support</dt>
        <dd>{s.spatialSupport}</dd>
        <dt>Time</dt>
        <dd>
          {s.temporal.resolution}; {s.temporal.archive}; latency {s.temporal.documentedLatency}
          {s.temporal.observedLatency ? ` (observed: ${s.temporal.observedLatency})` : ""}
        </dd>
        <dt>Access</dt>
        <dd>
          {s.access.auth === "none" ? "No credentials" : s.access.auth.replace("_", " ")}. {s.access.limits}
        </dd>
        <dt>Supports</dt>
        <dd>{s.supports.join("; ")}</dd>
        <dt>Cannot establish</dt>
        <dd>{s.cannotEstablish.join("; ")}</dd>
        <dt>Decision</dt>
        <dd>{s.rationale}</dd>
        <dt>Status evidence</dt>
        <dd style={{ wordBreak: "break-word" }}>
          {s.statusEvidence} (checked {s.checkedAt})
        </dd>
        {s.unconfirmed.length > 0 && (
          <>
            <dt>Not yet confirmed</dt>
            <dd>{s.unconfirmed.join("; ")}</dd>
          </>
        )}
      </Box>
    </Box>
  );
}
