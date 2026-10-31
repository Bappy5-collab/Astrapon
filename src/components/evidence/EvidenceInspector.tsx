"use client";

import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import { INDICATORS, SOURCE_LABELS } from "@/domain/evidence/catalog";
import type { Metric, RetrievalMeta } from "@/domain/evidence/view";
import { EVIDENCE_CLASS_INFO, type EvidenceClass } from "@/domain/provenance/evidence";
import { color, numeric, radius, tokens } from "@/theme/tokens";

const CLASS_STYLE: Partial<Record<EvidenceClass, { bg: string; fg: string; short: string }>> = {
  satellite_observation: { bg: "#DCEBF5", fg: "#0F3B57", short: "Observed (satellite)" },
  assimilated_model_product: { bg: "#EFE6F6", fg: "#3E2257", short: "Model-derived" },
  ground_measurement: { bg: "#E3EFDF", fg: "#1D3B1B", short: "Survey / ground" },
  farmer_report: { bg: tokens.lime[200], fg: tokens.forest[950], short: "Farmer-entered" },
  hypothetical_input: { bg: "#FBE7C6", fg: "#5A3A00", short: "Hypothetical" },
  illustrative: { bg: tokens.neutral[200], fg: color.ink, short: "Illustrative" },
};

/** Consistent label for evidence classes everywhere evidence is shown. */
export function EvidenceClassChip({ value }: { value: EvidenceClass }) {
  const s = CLASS_STYLE[value] ?? { bg: tokens.neutral[200], fg: color.ink, short: EVIDENCE_CLASS_INFO[value].label };
  return <Chip size="small" label={s.short} title={EVIDENCE_CLASS_INFO[value].meaning} sx={{ height: 22, bgcolor: s.bg, color: s.fg, fontWeight: 700 }} />;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <Box sx={{ display: "contents" }}>
      <Typography component="dt" variant="body2" color="text.secondary">
        {k}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere", ...numeric }}>
        {v}
      </Typography>
    </Box>
  );
}

/**
 * The evidence inspector: plain facts first (what, when, where, how complete, limits), technical
 * provenance behind an expander (product and processing versions, retrieval id, hashes, request, checks).
 */
export function EvidenceInspector({ metric, retrieval, open, onClose }: { metric: Metric | null; retrieval: RetrievalMeta | null; open: boolean; onClose: () => void }) {
  if (!metric) return null;
  const def = INDICATORS[metric.indicator];
  const src = SOURCE_LABELS[metric.source];
  const checks = retrieval?.checks ?? [];
  const failed = checks.filter((c) => !c.passed);
  const req = retrieval?.request ?? {};
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="inspector-title" fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle id="inspector-title" sx={{ pb: 1 }}>
        {metric.label}
        <Box sx={{ mt: 0.75, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography component="span" sx={{ fontSize: "1.6rem", fontWeight: 700, ...numeric }}>
            {metric.display}
          </Typography>
          <EvidenceClassChip value={metric.evidenceClass} />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {def && (
          <Typography variant="body1" sx={{ mb: 2 }}>
            {def.plain}
          </Typography>
        )}
        <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", columnGap: 2, rowGap: 1 }}>
          <Row k="Source" v={src.name} />
          <Row k="Units" v={metric.unit} />
          <Row k="Period" v={metric.period} />
          {metric.comparison && <Row k="Compared with" v={metric.comparison} />}
          <Row k="Covers" v={retrieval?.spatial_support ?? src.support} />
          <Row k="Completeness" v={metric.completeness} />
          {retrieval && <Row k="Data fetched" v={`${new Date(retrieval.retrieved_at).toISOString().slice(0, 16).replace("T", " ")} UTC`} />}
          {retrieval?.observation_start && <Row k="Observations" v={`${retrieval.observation_start} to ${retrieval.observation_end}`} />}
        </Box>
        {def && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">
              Limits
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {def.limitations.map((l) => (
                <Typography component="li" variant="body2" key={l} sx={{ mb: 0.5 }}>
                  {l}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
        <Accordion disableGutters elevation={0} sx={{ mt: 2, border: `1px solid ${color.line}`, borderRadius: `${radius.md}px !important`, "&::before": { display: "none" } }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Typography variant="subtitle2">How it was computed (technical)</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {def && (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Transformation
                </Typography>
                <Box component="ol" sx={{ m: 0, mt: 0.5, mb: 1.5, pl: 2.5 }}>
                  {def.transformation.map((s) => (
                    <Typography component="li" variant="body2" key={s}>
                      {s}
                    </Typography>
                  ))}
                </Box>
              </>
            )}
            {retrieval ? (
              <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", columnGap: 2, rowGap: 0.75, fontSize: "0.85rem" }}>
                <Row k="Product" v={`${retrieval.product_id}${retrieval.product_version ? ` · version ${retrieval.product_version}` : ""}`} />
                <Row k="Processing" v={retrieval.processing_version ?? "—"} />
                <Row k="Evidence class" v={EVIDENCE_CLASS_INFO[retrieval.evidence_class as EvidenceClass]?.label ?? retrieval.evidence_class} />
                <Row k="Retrieval id" v={<code>{retrieval.id}</code>} />
                <Row k="Response SHA-256" v={<code>{retrieval.response_sha256}</code>} />
                <Row k="Response size" v={`${(retrieval.response_bytes / 1024).toFixed(0)} KB (raw data is not stored in the database)`} />
                <Row k="Request" v={<code style={{ fontSize: "0.78rem" }}>{JSON.stringify({ endpoint: req.endpoint, latitude: req.latitude, longitude: req.longitude, ...(req.kmAboveBelow !== undefined ? { kmAboveBelow: req.kmAboveBelow } : {}) })}</code>} />
                <Row k="Validation" v={`${checks.length - failed.length} of ${checks.length} checks passed${failed.length ? `; failed: ${failed.slice(0, 6).map((c) => c.id).join(", ")}` : ""}`} />
                <Row k="Outcome" v={retrieval.outcome} />
                {retrieval.cache_key && <Row k="Cache key" v={<code>{retrieval.cache_key.slice(0, 16)}…</code>} />}
              </Box>
            ) : (
              <Typography variant="body2">No retrieval metadata available.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
