"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { WorkspaceEdits } from "@/domain/workspace/workspace";

import type { CoverageList, SaveResult, WorkspaceFieldData } from "./types";
import { Workspace } from "./Workspace";

/** Workspace for a saved field: saves through a server action, then reloads server data. */
export function SavedWorkspace({
  field,
  coverage,
  currentYear,
  save,
}: {
  field: WorkspaceFieldData;
  coverage: CoverageList;
  currentYear: number;
  save: (edits: WorkspaceEdits) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const onSaved = useCallback(() => router.refresh(), [router]);
  return <Workspace mode="saved" field={field} coverage={coverage} currentYear={currentYear} onSave={save} onSaved={onSaved} />;
}
