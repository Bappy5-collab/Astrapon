import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { HeroField } from "@/components/field3d/HeroField";
import { ButtonLink, TextLink } from "@/components/links";
import { HeroSearch } from "@/components/location/HeroSearch";
import { parseBoundary } from "@/domain/geo/boundary";
import { boundaryOrigin, projectField } from "@/domain/geo/local-frame";
import { EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import { SAMPLE_FIELD } from "@/domain/sample/sample-field";
import { fieldCoverage } from "@/domain/sources/coverage";
import { getT } from "@/lib/i18n/server";
import { color, elevation, numeric, radius, tokens } from "@/theme/tokens";

const PROBLEMS = [
  {
    title: "A rotation is a multi-year bet",
    body: "Changing what follows what affects water, soil and workload for several seasons. Trying it on the real field is slow and costly.",
  },
  {
    title: "Regional data is coarse",
    body: "Weather and soil-moisture grids are often larger than the whole farm. Tools that paint within-field detail from them are guessing.",
  },
  {
    title: "Your records matter most",
    body: "Which part floods, what grew last year, what water you can use: that local knowledge decides what is feasible.",
  },
];

const WORKFLOW = [
  { n: "01", title: "Locate", body: "Search a place, type coordinates, or use your device location only when you ask.", status: "Working", href: "/fields/new" },
  { n: "02", title: "Draw the boundary", body: "Click the corners on a street map or NASA HLS imagery; area is computed on the ellipsoid and checked before saving.", status: "Working", href: "/fields/new" },
  { n: "03", title: "Zones and crops", body: "Mark parts you know differ, and record what grew in each, season by season. Saved together after you confirm.", status: "Working", href: "/sample" },
  { n: "04", title: "Inspect in 3D", body: "Orbit the field, select zones by tap or from the list, and step through recorded seasons.", status: "Working", href: "/sample" },
  { n: "05", title: "Compare rotations", body: "Replay past seasons with evidence, your water limits and your priorities, then compare your rotation with feasible alternatives and see why they rank as they do.", status: "Working", href: "/methodology" },
];

export default async function HomePage() {
  const t = await getT();
  const sample = parseBoundary(SAMPLE_FIELD.boundary);
  const sampleHa = sample.ok ? sample.areaHa : 0;
  const coverage = fieldCoverage(boundaryOrigin(SAMPLE_FIELD.boundary)[1], projectField(SAMPLE_FIELD.boundary).extentM, "US").filter((c) => c.cellM);

  return (
    <>
      <Box component="section" aria-labelledby="hero-title" sx={{ bgcolor: color.surface, pt: { xs: 4, md: 7 }, pb: { xs: 6, md: 9 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 6 }} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 5.5 }}>
              <Typography variant="overline" sx={{ color: color.leaf }}>
                {t("hero.kicker")}
              </Typography>
              <Typography id="hero-title" variant="h1" sx={{ mt: 1, color: color.forest }}>
                {t("hero.title")}
              </Typography>
              <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 2.5, maxWidth: 560 }}>
                {t("hero.lead")}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3.5 }}>
                <ButtonLink href="/sample" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />}>
                  {t("hero.explore")}
                </ButtonLink>
                <ButtonLink href="/fields/new" variant="outlined" size="large">
                  {t("hero.create")}
                </ButtonLink>
              </Stack>
              <Box sx={{ mt: 4, p: { xs: 2, sm: 2.5 }, borderRadius: `${radius.lg}px`, bgcolor: color.surfaceRaised, border: `1px solid ${color.line}`, boxShadow: elevation.raised }}>
                <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                  {t("hero.find")}
                </Typography>
                <HeroSearch />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6.5 }}>
              <HeroField />
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="problem-title" sx={{ py: { xs: 7, md: 10 }, bgcolor: color.surfaceRaised, borderTop: `1px solid ${color.line}` }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: color.leaf }}>
            The problem
          </Typography>
          <Typography id="problem-title" variant="h2" sx={{ mt: 1, maxWidth: 760, color: color.forest }}>
            Which rotation could work on this field, and what should be checked locally first?
          </Typography>
          <Grid container spacing={{ xs: 3, md: 4 }} sx={{ mt: 2 }}>
            {PROBLEMS.map((p) => (
              <Grid key={p.title} size={{ xs: 12, md: 4 }}>
                <Box sx={{ borderTop: `3px solid ${tokens.lime[500]}`, pt: 2 }}>
                  <Typography variant="h5" component="h3">
                    {p.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {p.body}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="workflow-title" sx={{ py: { xs: 7, md: 10 }, bgcolor: color.surface }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: color.leaf }}>
            The workflow, as built today
          </Typography>
          <Typography id="workflow-title" variant="h2" sx={{ mt: 1, maxWidth: 760, color: color.forest }}>
            From a place name to a field you can inspect, in a few minutes.
          </Typography>
          <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 4, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(5, 1fr)" } }}>
            {WORKFLOW.map((s) => (
              <Box component="li" key={s.n} sx={{ p: 2.5, borderRadius: `${radius.lg}px`, bgcolor: color.surfaceRaised, border: `1px solid ${color.line}`, boxShadow: elevation.raised, display: "flex", flexDirection: "column", gap: 1.25 }}>
                <Typography aria-hidden="true" sx={{ fontFamily: "var(--font-display)", fontSize: "1.9rem", lineHeight: 1, color: tokens.lime[700], ...numeric }}>
                  {s.n}
                </Typography>
                <Typography variant="h5" component="h3">
                  {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {s.body}
                </Typography>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Chip size="small" label={s.status} sx={s.status === "Working" ? { bgcolor: tokens.lime[400], color: tokens.forest[950] } : { bgcolor: tokens.neutral[200], color: color.ink }} />
                  <TextLink href={s.href} sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {s.status === "Working" ? "Try it" : "Why"}
                  </TextLink>
                </Stack>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="evidence-title" sx={{ py: { xs: 7, md: 10 }, bgcolor: color.forest, color: color.onForest }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 6 }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="overline" sx={{ color: color.accent }}>
                Evidence and sources
              </Typography>
              <Typography id="evidence-title" variant="h2" sx={{ mt: 1 }}>
                Every value says where it came from, and how coarse it is.
              </Typography>
              <Typography sx={{ mt: 2, color: color.onForestMuted }}>
                Astrapon keeps {Object.keys(EVIDENCE_CLASS_INFO).length} evidence classes apart: satellite observations, model products, ground measurements, your reports, what-if
                inputs, simulation outputs and illustrations. Before fetching anything, it checks whether a source&apos;s grid can even see inside your field.
              </Typography>
              <ButtonLink href="/methodology" variant="outlined" sx={{ mt: 3, color: color.onForest, borderColor: tokens.forest[400], "&:hover": { borderColor: color.accent } }}>
                Read the methodology
              </ButtonLink>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography variant="h6" component="h3" sx={{ color: color.accent }}>
                Native grid versus the {sampleHa.toFixed(1)} ha sample field
              </Typography>
              <Box component="table" sx={{ mt: 1.5, width: "100%", borderCollapse: "collapse", ...numeric, "& th, & td": { textAlign: "left", py: 1.1, pr: 1.5, borderBottom: `1px solid ${tokens.forest[700]}`, fontSize: "0.9rem", verticalAlign: "top" } }}>
                <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Selected sources, their native cell size, and what that means for the sample field</caption>
                <thead>
                  <tr>
                    <Box component="th" scope="col" sx={{ color: color.onForestMuted, fontWeight: 600 }}>
                      Source
                    </Box>
                    <Box component="th" scope="col" sx={{ color: color.onForestMuted, fontWeight: 600 }}>
                      Cell
                    </Box>
                    <Box component="th" scope="col" sx={{ color: color.onForestMuted, fontWeight: 600, display: { xs: "none", sm: "table-cell" } }}>
                      What it means here
                    </Box>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((c) => (
                    <tr key={c.id}>
                      <Box component="th" scope="row" sx={{ fontWeight: 600 }}>
                        {c.name}
                        <Box component="span" sx={{ display: "block", fontWeight: 400, fontSize: "0.8rem", color: color.onForestMuted }}>
                          {EVIDENCE_CLASS_INFO[c.evidenceClass].label}
                        </Box>
                      </Box>
                      <td>{c.cellM ? (Math.max(...c.cellM) >= 1000 ? `${(Math.max(...c.cellM) / 1000).toFixed(1)} km` : `${Math.round(Math.max(...c.cellM))} m`) : "—"}</td>
                      <Box component="td" sx={{ display: { xs: "none", sm: "table-cell" }, color: color.onForestMuted }}>
                        {c.verdict === "single_value" ? "One value for the whole field" : c.verdict === "coarse" ? "Too coarse to separate zones" : "Can show patterns inside the field"}
                      </Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
              <Typography variant="body2" sx={{ mt: 1.5, color: color.onForestMuted }}>
                Arithmetic on documented resolutions; no values are fetched on this page. See <TextLink href="/sources" sx={{ color: color.accent }}>Sources</TextLink> for licences and verification status.
              </Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box component="section" aria-labelledby="cta-title" sx={{ py: { xs: 7, md: 9 }, bgcolor: color.surface }}>
        <Container maxWidth="md" sx={{ textAlign: "center" }}>
          <Typography id="cta-title" variant="h2" sx={{ color: color.forest }}>
            Start with the sample, or with your own field.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            The sample needs no account and is clearly marked as invented. Your own fields are private to your account.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3, justifyContent: "center" }}>
            <ButtonLink href="/sample" variant="contained" size="large">
              {t("hero.explore")}
            </ButtonLink>
            <ButtonLink href="/fields/new" variant="outlined" size="large">
              {t("hero.create")}
            </ButtonLink>
          </Stack>
        </Container>
      </Box>
    </>
  );
}
