import type { PipelineSource } from "@/domain/evidence/catalog";

import { runModis } from "./modis";
import { runPower } from "./power";
import { runSsurgo } from "./ssurgo";
import type { FieldContext, PipelineOutput, Progress } from "./types";

export const RUNNERS: Record<PipelineSource, (ctx: FieldContext, progress: Progress) => Promise<PipelineOutput>> = {
  "nasa-power-daily": (ctx, p) => runPower(ctx, p),
  "modis-mod13q1-ornl": (ctx, p) => runModis(ctx, p),
  "usda-ssurgo-sda": (ctx, p) => runSsurgo(ctx, p),
};
