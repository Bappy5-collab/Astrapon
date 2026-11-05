import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AgricultureRoundedIcon from "@mui/icons-material/AgricultureRounded";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { FieldCard, FieldGrid } from "@/components/farm/FieldCard";
import { PageHeader } from "@/components/farm/ui";
import { ButtonLink } from "@/components/links";
import { fieldSteps } from "@/domain/farm/progress";
import { getAuth } from "@/server/auth/session";
import { fieldFacts } from "@/server/farm/queries";
import { color, elevation, radius, tokens } from "@/theme/tokens";

export const metadata: Metadata = { title: "My fields" };

/** The farmer's home: every field with how far it is, and the one next thing to do. */
export default async function MyFieldsPage() {
  const auth = await getAuth();
  let fields: { id: string; name: string; area_ha: number | null; farmName: string }[] | null = null;
  let facts = new Map<string, Parameters<typeof fieldSteps>[1]>();
  if (auth.state === "signed_in") {
    const { data } = await auth.supabase.from("fields").select("id, name, area_ha, farms(name)").order("updated_at", { ascending: false }).limit(50);
    fields = (data ?? []).map((f) => ({ id: f.id, name: f.name, area_ha: f.area_ha === null ? null : Number(f.area_ha), farmName: (f.farms as unknown as { name: string } | null)?.name ?? "" }));
    facts = await fieldFacts(auth.supabase, fields.map((f) => f.id));
  }
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <PageHeader
        crumbs={[]}
        title="My fields"
        subtitle="Pick a field to continue where you left off, or add a new one."
        actions={
          fields !== null && (
            <>
              <ButtonLink href="/fields/new" variant="contained" startIcon={<AddRoundedIcon />}>
                Add a field
              </ButtonLink>
              <ButtonLink href="/farms" variant="outlined">
                Manage farms
              </ButtonLink>
            </>
          )
        }
      />
      {fields === null || fields.length === 0 ? (
        <Box sx={{ p: { xs: 3, md: 5 }, borderRadius: `${radius.lg + 4}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised, boxShadow: elevation.raised, textAlign: "center" }}>
          <Box aria-hidden sx={{ width: 64, height: 64, mx: "auto", mb: 2, borderRadius: "18px", display: "grid", placeItems: "center", bgcolor: tokens.lime[200], color: tokens.forest[800] }}>
            <AgricultureRoundedIcon sx={{ fontSize: 34 }} />
          </Box>
          <Typography variant="h5" component="h2">
            {fields === null ? "Sign in to see your fields" : "Add your first field"}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: 520, mx: "auto" }}>
            {fields === null
              ? "Your fields are private to your account. You can try the sample field without an account."
              : "Find your field on the map and draw its outline. It takes about two minutes."}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "center" }}>
            <ButtonLink href={fields === null ? "/sign-in?next=/workspace" : "/fields/new"} variant="contained" size="large">
              {fields === null ? "Sign in" : "Add a field"}
            </ButtonLink>
            <ButtonLink href="/sample" variant="outlined" size="large">
              Try the sample field
            </ButtonLink>
          </Stack>
        </Box>
      ) : (
        <>
          {![...facts.values()].some((f) => f.latestRunId) && (
            <Box component="section" aria-labelledby="path-title" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, borderRadius: `${radius.lg + 4}px`, bgcolor: tokens.forest[900], color: color.onForest }}>
              <Typography id="path-title" variant="h6" component="h2" sx={{ color: color.accent }}>
                Your path to a first result
              </Typography>
              <Box component="ol" sx={{ m: 0, mt: 1.5, p: 0, listStyle: "none", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
                {PATH.map((t, i) => (
                  <Stack component="li" key={t} direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                    <Box aria-hidden sx={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: color.accent, color: color.accentInk, fontWeight: 800, fontSize: "0.9rem" }}>
                      {i + 1}
                    </Box>
                    <Typography variant="body2" sx={{ color: color.onForest, pt: 0.4 }}>
                      {t}
                    </Typography>
                  </Stack>
                ))}
              </Box>
              <Typography variant="caption" component="p" sx={{ mt: 1.5, color: color.onForestMuted }}>
                Each field card below shows its next step. Water & Energy (pumps and solar) is an optional extra once you have a result.
              </Typography>
            </Box>
          )}
          <FieldGrid label="Your fields">
            {fields.map((f) => (
              <FieldCard key={f.id} id={f.id} name={f.name} farmName={f.farmName} areaHa={f.area_ha} steps={fieldSteps(f.id, facts.get(f.id) ?? EMPTY)} />
            ))}
            <Box component="li" sx={{ minHeight: 180 }}>
              <ButtonLink
                href="/fields/new"
                startIcon={<AddRoundedIcon />}
                sx={{ width: "100%", height: "100%", minHeight: 180, borderRadius: `${radius.lg + 4}px`, border: `2px dashed ${color.lineStrong}`, color: tokens.forest[700], fontWeight: 700, "&:hover": { borderColor: tokens.forest[500], bgcolor: color.surfaceRaised } }}
              >
                Add another field
              </ButtonLink>
            </Box>
          </FieldGrid>
        </>
      )}
    </Container>
  );
}

const PATH = ["Draw the field on the map", "Add one or two past seasons with dates", "Press “Get weather” (it downloads in the background)", "Start a comparison and open the result"];

const EMPTY = { hasBoundary: false, historyCount: 0, datedHistoryCount: 0, soilCount: 0, hasSoilSurvey: false, waterSaved: false, prioritiesSaved: false, hasWeather: false, weatherPending: false, scenarioCount: 0, latestRunId: null, waterPlanCount: 0 };
