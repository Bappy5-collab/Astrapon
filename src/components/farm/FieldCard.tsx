import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ButtonLink, TextLink } from "@/components/links";
import { nextStep, type FieldStep } from "@/domain/farm/progress";
import { color, elevation, numeric, radius, tokens } from "@/theme/tokens";

import { StepProgress } from "./StepGuide";

/** One field as a card: name, size, progress through the steps and the single next action. */
export function FieldCard({ id, name, farmName, areaHa, steps }: { id: string; name: string; farmName?: string; areaHa: number | null; steps: FieldStep[] }) {
  const next = nextStep(steps);
  const results = steps.find((s) => s.id === "compare" && s.state === "done");
  return (
    <Box
      component="li"
      sx={{
        p: 2.5,
        borderRadius: `${radius.lg + 2}px`,
        border: `1px solid ${color.line}`,
        bgcolor: color.surfaceRaised,
        boxShadow: elevation.raised,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        transition: "box-shadow 160ms, border-color 160ms",
        "&:hover": { borderColor: tokens.forest[400], boxShadow: elevation.overlay },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <TextLink href={`/fields/${id}/records`} underline="hover" sx={{ fontWeight: 700, fontSize: "1.15rem", color: tokens.forest[900] }}>
          {name}
        </TextLink>
        <Typography variant="body2" color="text.secondary" sx={numeric}>
          {[farmName, areaHa !== null ? `${areaHa.toFixed(2)} ha` : "not drawn yet"].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
      <StepProgress steps={steps} dense />
      <Box sx={{ flexGrow: 1 }}>
        {next ? (
          <Typography variant="body2">
            <Box component="span" sx={{ color: "text.secondary" }}>
              Next:{" "}
            </Box>
            <strong>{next.title}</strong>
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: tokens.forest[600] }}>
            <CheckCircleRoundedIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Results ready
            </Typography>
          </Stack>
        )}
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <ButtonLink href={next ? next.href : (results?.href ?? `/fields/${id}/records`)} variant="contained" size="small" endIcon={<ArrowForwardRoundedIcon />}>
          {next ? next.action : "See results"}
        </ButtonLink>
        <ButtonLink href={`/fields/${id}/records`} variant="text" size="small">
          Open field
        </ButtonLink>
      </Stack>
    </Box>
  );
}

export function FieldGrid({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
      {children}
    </Box>
  );
}
