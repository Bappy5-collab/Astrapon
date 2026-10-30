import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REFERENCE_SOURCES } from "./references";
import { DATA_SOURCES } from "./registry";
import { SOURCE_DECISIONS, SOURCE_STATUSES } from "./types";

const ROOT = join(import.meta.dirname, "..", "..", "..");

describe("data source registry", () => {
  it("has unique ids and valid enums", () => {
    const ids = DATA_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DATA_SOURCES) {
      expect(SOURCE_STATUSES).toContain(s.status);
      expect(SOURCE_DECISIONS).toContain(s.decision);
    }
  });

  it("documents access, limits, and what each source cannot establish", () => {
    for (const s of DATA_SOURCES) {
      expect(s.officialUrls.length, s.id).toBeGreaterThan(0);
      expect(s.access.route.length, s.id).toBeGreaterThan(0);
      expect(s.cannotEstablish.length, s.id).toBeGreaterThan(0);
      expect(s.statusEvidence.length, s.id).toBeGreaterThan(0);
    }
  });

  it("only claims live_verified when a committed artifact recorded a passing live check", () => {
    for (const s of DATA_SOURCES.filter((x) => x.status === "live_verified")) {
      const file = join(ROOT, s.statusEvidence);
      expect(existsSync(file), `${s.id}: ${s.statusEvidence}`).toBe(true);
      const artifact = JSON.parse(readFileSync(file, "utf8"));
      expect(artifact.outcome, s.id).toBe("live_verified");
      expect(artifact.checks.every((c: { passed: boolean }) => c.passed), s.id).toBe(true);
      expect(artifact.trace, `${s.id} needs a traceable sample value`).toBeTruthy();
    }
  });

  it("never marks a credential-requiring source as live without credentials", () => {
    for (const s of DATA_SOURCES.filter((x) => x.access.auth !== "none")) expect(s.status, s.id).not.toBe("live_verified");
  });

  it("keeps the initial subset small and non-NASA sources clearly identified", () => {
    const selected = DATA_SOURCES.filter((s) => s.decision === "selected_initial" || s.decision === "selected_pending_access");
    expect(selected.length).toBeLessThanOrEqual(7);
    for (const s of DATA_SOURCES.filter((x) => !x.isNasa)) expect(s.producer).toMatch(/non-NASA/);
  });
});

describe("reference sources", () => {
  it("cite a URL and state caveats", () => {
    for (const r of REFERENCE_SOURCES) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.caveats.length).toBeGreaterThan(0);
    }
  });
});
