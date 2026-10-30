import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { PhaseChip } from "@/components/PhaseChip";
import { FarmPreview } from "@/components/scene/FarmPreview";
import { WORKFLOW_STEPS } from "@/lib/roadmap";
import { tokens } from "@/theme/tokens";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "360px 1fr" },
        gap: { xs: 2, md: 3 },
        p: { xs: 2, md: 3 },
        bgcolor: tokens.neutral[100],
      }}
    >
      <Paper component="aside" aria-labelledby="workspace-steps" variant="outlined" sx={{ p: 3, borderRadius: 4, alignSelf: "start" }}>
        <Typography variant="overline" sx={{ color: tokens.forest[600] }}>
          Field workspace
        </Typography>
        <Typography id="workspace-steps" variant="h3" component="h1" sx={{ mt: 0.5 }}>
          No field loaded
        </Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          The field workflow is not built yet. The scene shows a placeholder farm so the 3D workspace can be developed and
          reviewed.
        </Alert>
        <Divider sx={{ my: 3 }} />
        <Stack component="ol" spacing={2.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
          {WORKFLOW_STEPS.map((step, i) => (
            <Box component="li" key={step.title}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                <Typography sx={{ fontWeight: 700, color: tokens.neutral[500], minWidth: 20 }} aria-hidden="true">
                  {i + 1}
                </Typography>
                <Box>
                  <Typography variant="h6" component="h2">
                    {step.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {step.detail}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <PhaseChip phase={step.phase} />
                  </Box>
                </Box>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>
      <Box component="section" aria-label="3D farm view" sx={{ minWidth: 0 }}>
        <FarmPreview
          height={{ xs: 420, md: "calc(100dvh - 68px - 48px - 64px)" }}
          caption="Placeholder farm for developing the 3D workspace. Real field boundaries, zones, and simulation results will replace it once those phases are built."
        />
      </Box>
    </Box>
  );
}
