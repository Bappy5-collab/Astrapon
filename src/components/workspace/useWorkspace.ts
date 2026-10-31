"use client";

import { useCallback, useMemo, useState } from "react";

import { cropForm } from "@/domain/farm/crops";
import { parseBoundary, pointInRing, type BoundaryGeometry, type BoundaryResult } from "@/domain/geo/boundary";
import * as D from "@/domain/geo/drawing";
import {
  resolveCrop,
  summariseChanges,
  timelineYears,
  upsertAssignment,
  type CropAssignment,
  type WorkspaceEdits,
  type WorkspaceZone,
} from "@/domain/workspace/workspace";
import { buildSceneData, FIELD_KEY, type RegionCrop } from "@/components/field3d/model";
import type { GrowthStage } from "@/components/field3d/plants";

import type { WorkspaceFieldData } from "./types";

export type Tool = "select" | "zone" | "boundary" | "zoneShape";
export type View = "3d" | "map";

/** What the farmer is drawing and what happens when the shape is confirmed. */
export type DrawSession = { tool: Exclude<Tool, "select">; zoneKey?: string; state: D.DrawState; history: D.DrawState[] };

const MAX_UNDO = 50;

export function useWorkspace(field: WorkspaceFieldData, currentYear: number) {
  const [boundary, setBoundary] = useState<BoundaryGeometry | null>(field.boundary);
  const [boundaryEdit, setBoundaryEdit] = useState<{ before: number | null; after: number } | null>(null);
  const [zones, setZones] = useState<WorkspaceZone[]>(() =>
    field.zones.map((z) => ({ key: z.id, saved: true, name: z.name, basis: z.basis, notes: z.notes ?? "", boundary: z.boundary, areaHa: z.areaHa })),
  );
  const [editedZoneKeys, setEditedZoneKeys] = useState<Set<string>>(new Set());
  const [shapeEditedKeys, setShapeEditedKeys] = useState<Set<string>>(new Set());
  const [deletedZones, setDeletedZones] = useState<{ key: string; name: string }[]>([]);
  const [crops, setCrops] = useState<CropAssignment[]>([]);
  const years = useMemo(() => timelineYears(field.history, currentYear), [field.history, currentYear]);
  const lastRecorded = field.history.reduce((m, h) => Math.max(m, h.season_year), 0);
  const [year, setYear] = useState<number>(lastRecorded > 0 && lastRecorded <= currentYear ? lastRecorded : currentYear - 1);
  const [stage, setStage] = useState<GrowthStage>("mature");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<View>(field.boundary ? "3d" : "map");
  const [draw, setDraw] = useState<DrawSession | null>(field.boundary ? null : { tool: "boundary", state: D.emptyDraw(), history: [] });

  const zoneName = useCallback((key: string | null) => (key === null || key === FIELD_KEY ? "Whole field" : (zones.find((z) => z.key === key)?.name ?? "zone")), [zones]);

  const sceneData = useMemo(() => (boundary ? buildSceneData(boundary, zones.map((z) => ({ key: z.key, name: z.name, boundary: z.boundary }))) : null), [boundary, zones]);

  const cropFor = useCallback((key: string | null, y: number) => resolveCrop(field.history, crops, key === FIELD_KEY ? null : key, y), [field.history, crops]);

  const sceneCrops = useMemo(() => {
    const out: Record<string, RegionCrop> = {};
    const f = cropFor(null, year);
    out[FIELD_KEY] = { form: f ? cropForm(f.cropName) : "fallow", cropName: f?.cropName ?? null };
    for (const z of zones) {
      const c = cropFor(z.key, year);
      out[z.key] = { form: c ? cropForm(c.cropName) : "fallow", cropName: c?.cropName ?? null };
    }
    return out;
  }, [zones, year, cropFor]);

  const changes = useMemo(
    () =>
      summariseChanges({
        boundary: boundaryEdit,
        zones,
        editedZoneKeys: new Set([...editedZoneKeys, ...shapeEditedKeys]),
        deletedZones,
        crops,
        zoneName,
      }),
    [boundaryEdit, zones, editedZoneKeys, shapeEditedKeys, deletedZones, crops, zoneName],
  );

  /** Zones whose vertices fall outside the (draft) boundary by more than ~1 m. */
  const zonesOutside = useMemo(() => {
    if (!boundary) return [];
    const shells = (boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates).map((p) => p[0]!);
    return zones.filter((z) => {
      const rings = (z.boundary.type === "Polygon" ? [z.boundary.coordinates] : z.boundary.coordinates).map((p) => p[0]!);
      // ~1 m in degrees of latitude; a conservative client-side pre-check (the database is authoritative).
      const tol = 0.00001;
      return rings.some((r) => r.some(([x, y]) => !shells.some((s) => [[0, 0], [tol, 0], [-tol, 0], [0, tol], [0, -tol]].some(([dx, dy]) => pointInRing([x + dx!, y + dy!], s)))));
    });
  }, [boundary, zones]);

  // ------------------------------------------------------------- drawing ---

  const updateDraw = useCallback((fn: (s: D.DrawState) => D.DrawState) => {
    setDraw((d) => {
      if (!d) return d;
      const next = fn(d.state);
      if (next === d.state) return d;
      return { ...d, state: next, history: [...d.history.slice(-MAX_UNDO + 1), d.state] };
    });
  }, []);

  const undo = useCallback(() => setDraw((d) => (d && d.history.length ? { ...d, state: d.history[d.history.length - 1]!, history: d.history.slice(0, -1) } : d)), []);

  const startDraw = useCallback(
    (tool: Exclude<Tool, "select">, zoneKey?: string) => {
      let state = D.emptyDraw();
      if (tool === "boundary" && boundary) state = D.fromGeometry(boundary);
      if (tool === "zoneShape" && zoneKey) {
        const z = zones.find((q) => q.key === zoneKey);
        if (z) state = D.fromGeometry(z.boundary);
      }
      setDraw({ tool, zoneKey, state, history: [] });
      setView("map");
    },
    [boundary, zones],
  );

  const cancelDraw = useCallback(() => setDraw(null), []);

  const drawResult: BoundaryResult | null = useMemo(() => (draw ? D.validateDrawing(draw.state) : null), [draw]);

  /** Checks a drawn zone lies inside the field; returns a message or null. */
  const zoneInsideMessage = useCallback(
    (g: BoundaryGeometry): string | null => {
      if (!boundary) return "Save the field boundary first.";
      const shells = (boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates).map((p) => p[0]!);
      const ring = (g.type === "Polygon" ? g.coordinates : g.coordinates[0]!)[0]!;
      const tol = 0.00001;
      const outside = ring.some(([x, y]) => !shells.some((s) => [[0, 0], [tol, 0], [-tol, 0], [0, tol], [0, -tol]].some(([dx, dy]) => pointInRing([x + dx!, y + dy!], s))));
      return outside ? "Part of this zone is outside the field boundary. Move the highlighted points inside the field." : null;
    },
    [boundary],
  );

  const applyBoundary = useCallback(
    (g: BoundaryGeometry, areaHa: number) => {
      setBoundaryEdit((prev) => ({ before: prev ? prev.before : field.areaHa, after: areaHa }));
      setBoundary(g);
      setDraw(null);
      setView("3d");
    },
    [field.areaHa],
  );

  const addZone = useCallback((z: { name: string; basis: WorkspaceZone["basis"]; notes: string; boundary: BoundaryGeometry; areaHa: number }) => {
    const key = `new-${crypto.randomUUID()}`;
    setZones((list) => [...list, { key, saved: false, ...z }]);
    setSelectedKey(key);
    setDraw(null);
    setView("3d");
    return key;
  }, []);

  const applyZoneShape = useCallback((key: string, g: BoundaryGeometry, areaHa: number) => {
    setZones((list) => list.map((z) => (z.key === key ? { ...z, boundary: g, areaHa } : z)));
    setShapeEditedKeys((s) => new Set(s).add(key));
    setDraw(null);
    setView("3d");
  }, []);

  const editZone = useCallback((key: string, patch: Partial<Pick<WorkspaceZone, "name" | "basis" | "notes">>) => {
    setZones((list) => list.map((z) => (z.key === key ? { ...z, ...patch } : z)));
    setEditedZoneKeys((s) => new Set(s).add(key));
  }, []);

  const deleteZone = useCallback(
    (key: string) => {
      const z = zones.find((q) => q.key === key);
      if (!z) return;
      setZones((list) => list.filter((q) => q.key !== key));
      if (z.saved) setDeletedZones((d) => [...d, { key, name: z.name }]);
      setCrops((c) => c.filter((a) => a.zoneKey !== key));
      setSelectedKey((s) => (s === key ? null : s));
    },
    [zones],
  );

  const assignCrop = useCallback((a: CropAssignment) => setCrops((list) => upsertAssignment(list, a)), []);
  const removeAssignment = useCallback((a: CropAssignment) => setCrops((list) => list.filter((x) => x !== a)), []);

  const dirty = changes.length > 0;

  /** Payload for the save RPC (or the sample's local store). */
  const edits = useMemo<WorkspaceEdits>(
    () => ({
      boundary: boundaryEdit && boundary ? { geometry: boundary, source: "farmer_drawn" } : null,
      deleteZoneIds: deletedZones.map((d) => d.key),
      zones: zones
        .filter((z) => !z.saved || editedZoneKeys.has(z.key) || shapeEditedKeys.has(z.key))
        .map((z) => ({
          id: z.saved ? z.key : null,
          ref: z.key,
          name: z.name,
          basis: z.basis,
          notes: z.notes || null,
          boundary: !z.saved || shapeEditedKeys.has(z.key) ? z.boundary : null,
        })),
      crops: crops.map((c) => ({ zoneRef: c.zoneKey, seasonYear: c.seasonYear, season: c.season, cropName: c.cropName })),
    }),
    [boundaryEdit, boundary, deletedZones, zones, editedZoneKeys, shapeEditedKeys, crops],
  );

  return {
    boundary, zones, crops, years, year, setYear, stage, setStage, selectedKey, setSelectedKey, view, setView,
    draw, startDraw, cancelDraw, updateDraw, undo, drawResult, zoneInsideMessage, applyBoundary, addZone, applyZoneShape,
    editZone, deleteZone, assignCrop, removeAssignment, sceneData, sceneCrops, cropFor, changes, dirty, edits, zoneName, zonesOutside,
    parseBoundary,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
