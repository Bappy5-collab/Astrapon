/**
 * Version recorded on every input snapshot and run. Snapshots taken before the engine existed
 * recorded PRE_ENGINE_VERSION; they cannot be run (a run's engine must match its snapshot), so a
 * new snapshot is taken. Bump ENGINE_VERSION whenever docs/scientific-methodology.md changes.
 */
export const ENGINE_VERSION = "1.0.0";
export const PRE_ENGINE_VERSION = "0.0.0-pre-engine";
