"use client";

import Button from "@mui/material/Button";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { parseBoundary } from "@/domain/geo/boundary";
import { SAMPLE_FIELD, SAMPLE_HISTORY } from "@/domain/sample/sample-field";
import type { WorkspaceEdits } from "@/domain/workspace/workspace";
import { useT } from "@/lib/i18n/I18nProvider";

import type { CoverageList, SaveResult, WorkspaceFieldData } from "./types";
import { Workspace } from "./Workspace";

/**
 * The public sample: an invented field anyone can explore without an account. Saving applies the
 * same edits locally and keeps them in this browser (localStorage) so the save → reload flow can
 * be tried; nothing is sent to the server.
 */

const KEY = "fs.sample.v1";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readStored = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const writeStored = (v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, v);
  } catch {
    // Storage blocked: the sample still works until the page is reloaded.
    memory = v;
  }
  listeners.forEach((l) => l());
};
let memory: string | null = null;

export function defaultSample(): WorkspaceFieldData {
  return {
    id: null,
    name: SAMPLE_FIELD.name,
    farmName: SAMPLE_FIELD.farmName,
    farmHref: null,
    countryCode: "US",
    placeLabel: SAMPLE_FIELD.placeLabel,
    boundary: SAMPLE_FIELD.boundary,
    areaHa: parseBoundary(SAMPLE_FIELD.boundary).ok ? (parseBoundary(SAMPLE_FIELD.boundary) as { areaHa: number }).areaHa : null,
    zones: SAMPLE_FIELD.zones.map((z) => ({ id: z.key, name: z.name, basis: z.basis, notes: z.notes, boundary: z.boundary, areaHa: (parseBoundary(z.boundary) as { areaHa: number }).areaHa })),
    history: SAMPLE_HISTORY,
    soil: [],
    scenarioCount: 0,
  };
}

/** Applies edits to the sample exactly as the database RPC would (minus persistence). */
export function applySampleEdits(field: WorkspaceFieldData, edits: WorkspaceEdits): WorkspaceFieldData {
  let next = { ...field };
  if (edits.boundary) {
    const b = parseBoundary(edits.boundary.geometry);
    if (b.ok) next = { ...next, boundary: b.geometry, areaHa: b.areaHa };
  }
  let zones = next.zones.filter((z) => !edits.deleteZoneIds.includes(z.id));
  let history = next.history.filter((h) => !h.zone_id || !edits.deleteZoneIds.includes(h.zone_id));
  const ids = new Map<string, string>();
  for (const z of edits.zones) {
    if (z.id) {
      ids.set(z.ref, z.id);
      zones = zones.map((q) => (q.id === z.id ? { ...q, name: z.name, basis: z.basis, notes: z.notes, ...(z.boundary ? { boundary: z.boundary, areaHa: (parseBoundary(z.boundary) as { areaHa: number }).areaHa } : {}) } : q));
    } else if (z.boundary) {
      const id = `sample-${crypto.randomUUID()}`;
      ids.set(z.ref, id);
      zones = [...zones, { id, name: z.name, basis: z.basis, notes: z.notes, boundary: z.boundary, areaHa: (parseBoundary(z.boundary) as { areaHa: number }).areaHa }];
    }
  }
  for (const c of edits.crops) {
    const zoneId = c.zoneRef === null ? null : (ids.get(c.zoneRef) ?? c.zoneRef);
    const i = history.findIndex((h) => h.zone_id === zoneId && h.season_year === c.seasonYear && h.season === c.season);
    if (i >= 0) history = history.map((h, j) => (j === i ? { ...h, crop_name: c.cropName } : h));
    else history = [...history, { id: `sample-h-${crypto.randomUUID()}`, zone_id: zoneId, season_year: c.seasonYear, season: c.season, crop_name: c.cropName }];
  }
  return { ...next, zones, history };
}

export function SampleWorkspace({ coverage, currentYear }: { coverage: CoverageList; currentYear: number }) {
  const t = useT();
  const stored = useSyncExternalStore(subscribe, () => memory ?? readStored(), () => null);
  const field = useMemo(() => {
    if (!stored) return defaultSample();
    try {
      return JSON.parse(stored) as WorkspaceFieldData;
    } catch {
      return defaultSample();
    }
  }, [stored]);

  const save = useCallback(
    async (edits: WorkspaceEdits): Promise<SaveResult> => {
      writeStored(JSON.stringify(applySampleEdits(field, edits)));
      return { ok: true, message: "Sample saved in this browser." };
    },
    [field],
  );

  return (
    <Workspace
      key={stored ?? "default"}
      mode="sample"
      field={field}
      coverage={coverage}
      currentYear={currentYear}
      onSave={save}
      extraActions={
        stored ? (
          <Button size="small" onClick={() => writeStored(null)} sx={{ flexShrink: 0 }}>
            {t("ws.resetSample")}
          </Button>
        ) : undefined
      }
    />
  );
}
