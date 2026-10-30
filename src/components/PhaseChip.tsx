import Chip from "@mui/material/Chip";

import { CURRENT_PHASE } from "@/lib/roadmap";
import { tokens } from "@/theme/tokens";

export function PhaseChip({ phase }: { phase: number }) {
  const done = phase <= CURRENT_PHASE;
  return (
    <Chip
      size="small"
      label={done ? "Available" : `Not built yet · Phase ${phase}`}
      sx={{
        bgcolor: done ? tokens.lime[400] : tokens.neutral[200],
        color: done ? tokens.forest[950] : tokens.neutral[700],
        border: `1px solid ${done ? tokens.lime[500] : tokens.neutral[300]}`,
      }}
    />
  );
}
