import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ButtonLink } from "@/components/links";
import { PhaseChip } from "@/components/PhaseChip";
import { FarmPreview } from "@/components/scene/FarmPreview";
import { EVIDENCE_CLASSES, EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import { WORKFLOW_STEPS } from "@/lib/roadmap";
import { tokens } from "@/theme/tokens";

const GUARDRAILS = [
  {
    title: "Replay is not a forecast",
    body: "Past seasons show how a rotation would have fared under conditions that already happened. They do not predict next year.",
  },
  {
    title: "Coarse data stays coarse",
    body: "A regional weather grid cannot tell two halves of your field apart. Differences between your zones come from what you tell us, not from guesses.",
  },
  {
    title: "No invented outcomes",
    body: "FieldShift will not show yield, profit, carbon, or nitrogen-credit figures unless the model can actually support them.",
  },
  {
    title: "Your judgment decides",
    body: "Results are options to review with your agronomist, with the reasons, evidence gaps, and local checks spelled out.",
  },
];

export default function HomePage() {
  return (
    <>
      <Box sx={{ bgcolor: tokens.neutral[100], pt: { xs: 5, md: 8 }, pb: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 5, md: 6 }} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="overline" sx={{ color: tokens.forest[600] }}>
                Crop rotation decision support
              </Typography>
              <Typography variant="h1" sx={{ mt: 1.5, color: tokens.forest[900] }}>
                Test a new rotation on your field before you plant it.
              </Typography>
              <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 3 }}>
                Given your field, its crop history, environmental evidence, water limits, and your priorities: which rotation options
                are plausible, and what tradeoffs should you review locally?
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 4 }}>
                <ButtonLink href="/workspace" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>
                  Open the workspace
                </ButtonLink>
                <ButtonLink href="/setup" variant="outlined" size="large">
                  Setup status
                </ButtonLink>
              </Stack>
              <Alert severity="info" variant="outlined" sx={{ mt: 4, bgcolor: tokens.neutral[50] }}>
                Early development. Field setup, environmental evidence, and the rotation model are not connected yet, so nothing here
                describes a real farm.
              </Alert>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <FarmPreview height={{ xs: 340, sm: 440, md: 540 }} />
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="workflow-heading" sx={{ py: { xs: 7, md: 10 }, bgcolor: tokens.neutral[50] }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: tokens.forest[600] }}>
            How it will work
          </Typography>
          <Typography id="workflow-heading" variant="h2" sx={{ mt: 1, maxWidth: 720, color: tokens.forest[900] }}>
            From a pin on the map to a rotation comparison you can defend.
          </Typography>
          <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 5, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(5, 1fr)" } }}>
            {WORKFLOW_STEPS.map((step, i) => (
              <Card component="li" key={step.title} sx={{ height: "100%" }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
                  <Typography sx={{ fontFamily: "var(--font-display)", fontSize: "2rem", lineHeight: 1, color: tokens.lime[700] }} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </Typography>
                  <Typography variant="h5" component="h3">
                    {step.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {step.detail}
                  </Typography>
                  <Box>
                    <PhaseChip phase={step.phase} />
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="evidence-heading" sx={{ py: { xs: 7, md: 10 }, bgcolor: tokens.forest[900], color: tokens.neutral[100] }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="overline" sx={{ color: tokens.lime[400] }}>
                Scientific contract
              </Typography>
              <Typography id="evidence-heading" variant="h2" sx={{ mt: 1 }}>
                Every value says where it came from.
              </Typography>
              <Typography sx={{ mt: 2, color: tokens.neutral[300] }}>
                Observations, model products, ground records, your own reports, what-if assumptions, and simulation results are kept
                apart and labelled throughout, so you always know what you are looking at.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Box component="dl" sx={{ m: 0, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                {EVIDENCE_CLASSES.map((c) => (
                  <Box key={c} sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${tokens.forest[700]}`, bgcolor: tokens.forest[800] }}>
                    <Typography component="dt" variant="h6" sx={{ color: tokens.lime[300] }}>
                      {EVIDENCE_CLASS_INFO[c].label}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.75, color: tokens.neutral[200] }}>
                      {EVIDENCE_CLASS_INFO[c].meaning}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="guardrails-heading" sx={{ py: { xs: 7, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography id="guardrails-heading" variant="h2" sx={{ color: tokens.forest[900], maxWidth: 640 }}>
            What FieldShift will not pretend to know.
          </Typography>
          <Grid container spacing={3} sx={{ mt: 3 }}>
            {GUARDRAILS.map((g) => (
              <Grid key={g.title} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ borderTop: `3px solid ${tokens.lime[500]}`, pt: 2 }}>
                  <Typography variant="h5" component="h3">
                    {g.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {g.body}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </>
  );
}
