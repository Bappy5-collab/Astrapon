import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { EarthHero } from "@/components/home/EarthHero";
import { ButtonLink, TextLink } from "@/components/links";
import { HeroSearch } from "@/components/location/HeroSearch";
import { parseBoundary } from "@/domain/geo/boundary";
import { boundaryOrigin, projectField } from "@/domain/geo/local-frame";
import { EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import { SAMPLE_FIELD } from "@/domain/sample/sample-field";
import { fieldCoverage } from "@/domain/sources/coverage";
import { getT } from "@/lib/i18n/server";
import { color, elevation, numeric, radius, tokens } from "@/theme/tokens";

const FEATURES = [
  { icon: <CompareArrowsRoundedIcon />, title: "Compare rotations", body: "Your current rotation next to alternatives on the same past weather, ranked by what matters to you — with the reasons and the trade-offs.", href: "/methodology" },
  { icon: <ViewInArRoundedIcon />, title: "Replay seasons in 3D", body: "Watch your real field outline through past seasons: planting, growth, dry spells and irrigation, day by day, with a table for every fact.", href: "/sample" },
  { icon: <WaterDropRoundedIcon />, title: "Plan water and energy", body: "Find mapped rivers, ponds and groundwater records near your field, then see the pump power and solar panels each rotation would need.", href: "/sources" },
  { icon: <FactCheckRoundedIcon />, title: "Trust every number", body: "Each value says where it came from and how coarse it is. Unknowns stay unknown — nothing is filled in silently.", href: "/sources" },
];

const WORKFLOW = [
  { n: "1", title: "Find and draw your field", body: "Search your village or type coordinates, then click the corners of your field.", href: "/fields/new", cta: "Add my field" },
  { n: "2", title: "Tell us what you grew", body: "Your past seasons, and your soil test or water if you have them. Everything else is optional.", href: "/sample", cta: "See the sample" },
  { n: "3", title: "Get your field's data", body: "One click fetches 40+ years of NASA POWER weather (and US soil survey data) for your location.", href: "/sources", cta: "About the data" },
  { n: "4", title: "Compare and decide", body: "See the options side by side, replay them in 3D, check water and energy, and save your plan.", href: "/methodology", cta: "How it works" },
];

const DATA = ["NASA POWER weather & sunshine", "USDA soil survey", "OpenStreetMap water", "USGS · Hub'Eau · IGRAC groundwater", "FAO-56 crop water method"];

export default async function HomePage() {
  const t = await getT();
  const sample = parseBoundary(SAMPLE_FIELD.boundary);
  const sampleHa = sample.ok ? sample.areaHa : 0;
  const coverage = fieldCoverage(boundaryOrigin(SAMPLE_FIELD.boundary)[1], projectField(SAMPLE_FIELD.boundary).extentM, "US").filter((c) => c.cellM);

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <Box
        component="section"
        aria-labelledby="hero-title"
        sx={{
          position: "relative",
          overflow: "hidden",
          color: color.onForest,
          bgcolor: tokens.forest[950],
          backgroundImage: `radial-gradient(900px 520px at 78% 38%, rgba(63,107,75,0.55), transparent 70%), radial-gradient(700px 400px at 10% 0%, rgba(199,231,122,0.10), transparent 70%), linear-gradient(180deg, ${tokens.forest[950]} 0%, #0B231B 100%)`,
          pt: { xs: 5, md: 8 },
          pb: { xs: 6, md: 9 },
        }}
      >
        <Container maxWidth="lg" sx={{ position: "relative" }}>
          <Grid container spacing={{ xs: 4, md: 5 }} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, px: 1.5, py: 0.5, borderRadius: 99, border: `1px solid ${tokens.forest[600]}`, bgcolor: "rgba(255,255,255,0.04)" }}>
                <PublicRoundedIcon sx={{ fontSize: 18, color: color.accent }} />
                <Typography variant="caption" sx={{ color: color.onForest, fontWeight: 600, letterSpacing: "0.02em" }}>
                  {t("hero.kicker")} · works worldwide
                </Typography>
              </Box>
              <Typography id="hero-title" variant="h1" sx={{ mt: 2.5, color: tokens.neutral[50], fontSize: { xs: "2.3rem", sm: "3rem", md: "3.5rem" }, lineHeight: 1.06, letterSpacing: "-0.02em" }}>
                {t("hero.title")}
              </Typography>
              <Typography sx={{ mt: 2.5, maxWidth: 560, color: color.onForestMuted, fontSize: { xs: "1.05rem", md: "1.15rem" }, lineHeight: 1.6 }}>
                {t("hero.lead")}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3.5 }}>
                <ButtonLink href="/fields/new" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ bgcolor: color.accent, color: color.accentInk, fontWeight: 700, "&:hover": { bgcolor: tokens.lime[300] } }}>
                  {t("hero.create")}
                </ButtonLink>
                <ButtonLink href="/sample" variant="outlined" size="large" sx={{ color: color.onForest, borderColor: tokens.forest[400], "&:hover": { borderColor: color.accent, bgcolor: "rgba(255,255,255,0.04)" } }}>
                  {t("hero.explore")} — no account
                </ButtonLink>
              </Stack>
              <Box sx={{ mt: 4, p: { xs: 2, sm: 2.5 }, borderRadius: `${radius.lg + 4}px`, bgcolor: color.surfaceRaised, color: color.ink, boxShadow: "0 24px 60px -28px rgba(0,0,0,0.65)" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                  <SearchRoundedIcon sx={{ color: color.leaf }} />
                  <Typography variant="h6" component="h2">
                    {t("hero.find")}
                  </Typography>
                </Stack>
                <HeroSearch />
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
                <LockRoundedIcon sx={{ fontSize: 16, color: color.onForestMuted }} />
                <Typography variant="caption" sx={{ color: color.onForestMuted }}>
                  Free · your fields stay private to your account · not affiliated with NASA
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <EarthHero />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ------------------------------------------------------ data strip */}
      <Box component="section" aria-label="Public data used" sx={{ bgcolor: tokens.forest[900], borderTop: `1px solid ${tokens.forest[700]}`, py: 2.5 }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 1, md: 3 }} sx={{ alignItems: { md: "center" } }}>
            <Typography variant="overline" sx={{ color: color.accent, flexShrink: 0, lineHeight: 1.6 }}>
              Built on public data
            </Typography>
            <Stack component="ul" direction="row" useFlexGap spacing={1} sx={{ listStyle: "none", p: 0, m: 0, flexWrap: "wrap" }}>
              {DATA.map((d) => (
                <Box component="li" key={d} sx={{ px: 1.5, py: 0.5, borderRadius: 99, border: `1px solid ${tokens.forest[600]}`, color: color.onForest, fontSize: "0.85rem" }}>
                  {d}
                </Box>
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* -------------------------------------------------------- features */}
      <Box component="section" aria-labelledby="features-title" sx={{ py: { xs: 7, md: 11 }, bgcolor: color.surface }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: color.leaf }}>
            What you can do
          </Typography>
          <Typography id="features-title" variant="h2" sx={{ mt: 1, maxWidth: 760, color: color.forest }}>
            Try a new rotation on screen before you try it on your land.
          </Typography>
          <Box sx={{ mt: 5, display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
            {FEATURES.map((f) => (
              <Box
                key={f.title}
                component="article"
                sx={{
                  p: 3,
                  borderRadius: "18px",
                  bgcolor: color.surfaceRaised,
                  border: `1px solid ${color.line}`,
                  boxShadow: elevation.raised,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                  transition: "transform 200ms, box-shadow 200ms",
                  "&:hover": { transform: "translateY(-3px)", boxShadow: elevation.overlay },
                  "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
                }}
              >
                <Box aria-hidden="true" sx={{ width: 48, height: 48, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: tokens.forest[900], color: color.accent, "& svg": { fontSize: 26 } }}>
                  {f.icon}
                </Box>
                <Typography variant="h5" component="h3" sx={{ mt: 0.5 }}>
                  {f.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, lineHeight: 1.6 }}>
                  {f.body}
                </Typography>
                <TextLink href={f.href} sx={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  Learn more →
                </TextLink>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* -------------------------------------------------------- workflow */}
      <Box component="section" id="how" aria-labelledby="workflow-title" sx={{ py: { xs: 7, md: 11 }, bgcolor: color.surfaceRaised, borderTop: `1px solid ${color.line}` }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: color.leaf }}>
            How it works
          </Typography>
          <Typography id="workflow-title" variant="h2" sx={{ mt: 1, maxWidth: 760, color: color.forest }}>
            Four steps from your field to a clear comparison.
          </Typography>
          <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 5, display: "grid", gap: { xs: 3, lg: 2 }, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" }, position: "relative" }}>
            {WORKFLOW.map((s, i) => (
              <Box component="li" key={s.n} sx={{ position: "relative", pr: { lg: 2 } }}>
                {i < WORKFLOW.length - 1 && <Box aria-hidden="true" sx={{ display: { xs: "none", lg: "block" }, position: "absolute", top: 23, left: 56, right: 0, height: 2, background: `linear-gradient(90deg, ${tokens.lime[500]}, ${tokens.neutral[300]})` }} />}
                <Box aria-hidden="true" sx={{ position: "relative", width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: color.accent, color: color.accentInk, fontWeight: 800, fontSize: "1.15rem", ...numeric }}>
                  {s.n}
                </Box>
                <Typography variant="h5" component="h3" sx={{ mt: 2 }}>
                  {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
                  {s.body}
                </Typography>
                <TextLink href={s.href} sx={{ display: "inline-block", mt: 1.25, fontSize: "0.9rem", fontWeight: 600 }}>
                  {s.cta} →
                </TextLink>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* -------------------------------------------------------- evidence */}
      <Box component="section" aria-labelledby="evidence-title" sx={{ py: { xs: 7, md: 11 }, bgcolor: color.forest, color: color.onForest }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 6 }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="overline" sx={{ color: color.accent }}>
                Honest about the data
              </Typography>
              <Typography id="evidence-title" variant="h2" sx={{ mt: 1 }}>
                Every value says where it came from, and how coarse it is.
              </Typography>
              <Typography sx={{ mt: 2, color: color.onForestMuted }}>
                Astrapon keeps {Object.keys(EVIDENCE_CLASS_INFO).length} kinds of evidence apart: satellite observations, model products, ground measurements, your reports, what-if inputs, simulation outputs and illustrations. Before fetching anything, it checks whether a source&apos;s grid can even see inside your field.
              </Typography>
              <ButtonLink href="/methodology" variant="outlined" sx={{ mt: 3, color: color.onForest, borderColor: tokens.forest[400], "&:hover": { borderColor: color.accent } }}>
                Read the methodology
              </ButtonLink>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: "18px", bgcolor: tokens.forest[950], border: `1px solid ${tokens.forest[700]}` }}>
                <Typography variant="h6" component="h3" sx={{ color: color.accent }}>
                  Data grid size versus the {sampleHa.toFixed(1)} ha sample field
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
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ------------------------------------------------------------- CTA */}
      <Box component="section" aria-labelledby="cta-title" sx={{ py: { xs: 7, md: 10 }, bgcolor: color.surface }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              p: { xs: 3, md: 6 },
              borderRadius: "24px",
              textAlign: "center",
              color: color.onForest,
              bgcolor: tokens.forest[900],
              backgroundImage: `radial-gradient(600px 300px at 50% 0%, rgba(199,231,122,0.14), transparent 70%)`,
              boxShadow: "0 30px 70px -40px rgba(10,29,22,0.7)",
            }}
          >
            <Typography id="cta-title" variant="h2" sx={{ color: tokens.neutral[50] }}>
              Start with the sample, or with your own field.
            </Typography>
            <Typography sx={{ mt: 1.5, color: color.onForestMuted, maxWidth: 620, mx: "auto" }}>
              The sample needs no account and is clearly marked as invented. Your own fields are private to your account.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3.5, justifyContent: "center" }}>
              <ButtonLink href="/fields/new" variant="contained" size="large" sx={{ bgcolor: color.accent, color: color.accentInk, fontWeight: 700, "&:hover": { bgcolor: tokens.lime[300] } }}>
                {t("hero.create")}
              </ButtonLink>
              <ButtonLink href="/sample" variant="outlined" size="large" sx={{ color: color.onForest, borderColor: tokens.forest[400], "&:hover": { borderColor: color.accent } }}>
                {t("hero.explore")}
              </ButtonLink>
            </Stack>
          </Box>
        </Container>
      </Box>
    </>
  );
}
