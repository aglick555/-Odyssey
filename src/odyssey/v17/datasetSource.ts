// Active-dataset management for the v17 dashboard.
//
// The whole UI used to import `odysseyDemo` directly; that meant the dataset
// was baked in at module load. WS8 lets the user replace it at runtime via
// JSON upload (and persist the choice across reloads via localStorage).
//
// Strategy:
// - One module-level mutable reference (_active) that all helpers read.
// - Setter persists to localStorage and dispatches a window event so any
//   subscribed React component can force a re-render.
// - useActiveDataset() is a tiny hook that subscribes to that event and
//   returns the current dataset, so the root component re-renders the entire
//   tree when the active dataset changes.

import { useEffect, useReducer } from "react";
import type { OdysseyDataset } from "../types";
import { odysseyDemo } from "../data/demoOdyssey";

const STORAGE_KEY = "odyssey:dataset:v1";
const CHANGE_EVENT = "odyssey:dataset-changed";

export type DatasetSource = "demo" | "custom";

export type DatasetValidationResult =
  | { ok: true; dataset: OdysseyDataset }
  | { ok: false; errors: string[] };

// Lightweight structural validation against OdysseyDataset. Not a full schema
// validator (no Zod dependency) — just enough to catch obvious paste errors
// and reject malformed inputs before they crash the renderer.
export function validateDataset(input: unknown): DatasetValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["Dataset must be a JSON object"] };
  }
  const d = input as Record<string, unknown>;
  if (typeof d.title !== "string") errors.push("title: missing or not a string");
  if (typeof d.subtitle !== "string") errors.push("subtitle: missing or not a string");
  if (!Array.isArray(d.stages)) errors.push("stages: missing or not an array");
  if (!Array.isArray(d.nodes)) errors.push("nodes: missing or not an array");
  if (!Array.isArray(d.flows)) errors.push("flows: missing or not an array");
  if (!Array.isArray(d.metrics)) errors.push("metrics: missing or not an array");

  if (Array.isArray(d.nodes)) {
    const seenIds = new Set<string>();
    (d.nodes as unknown[]).forEach((n, i) => {
      if (!n || typeof n !== "object") { errors.push(`nodes[${i}]: not an object`); return; }
      const node = n as Record<string, unknown>;
      if (typeof node.id !== "string") errors.push(`nodes[${i}].id: not a string`);
      else if (seenIds.has(node.id)) errors.push(`nodes[${i}].id: duplicate "${node.id}"`);
      else seenIds.add(node.id);
      if (typeof node.stage !== "string") errors.push(`nodes[${i}].stage: not a string`);
      if (typeof node.label !== "string") errors.push(`nodes[${i}].label: not a string`);
      if (typeof node.value !== "number") errors.push(`nodes[${i}].value: not a number`);
      if (typeof node.color !== "string") errors.push(`nodes[${i}].color: not a string`);
    });
  }

  if (Array.isArray(d.flows)) {
    const ids = new Set(((d.nodes as unknown[]) || []).filter((n) => n && typeof n === "object" && typeof (n as Record<string, unknown>).id === "string").map((n) => (n as Record<string, unknown>).id as string));
    (d.flows as unknown[]).forEach((f, i) => {
      if (!f || typeof f !== "object") { errors.push(`flows[${i}]: not an object`); return; }
      const flow = f as Record<string, unknown>;
      if (typeof flow.id !== "string") errors.push(`flows[${i}].id: not a string`);
      if (typeof flow.from !== "string") errors.push(`flows[${i}].from: not a string`);
      else if (ids.size > 0 && !ids.has(flow.from as string)) errors.push(`flows[${i}].from: "${flow.from}" not found in nodes`);
      if (typeof flow.to !== "string") errors.push(`flows[${i}].to: not a string`);
      else if (ids.size > 0 && !ids.has(flow.to as string)) errors.push(`flows[${i}].to: "${flow.to}" not found in nodes`);
      if (typeof flow.value !== "number") errors.push(`flows[${i}].value: not a number`);
      if (typeof flow.color !== "string") errors.push(`flows[${i}].color: not a string`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, dataset: input as OdysseyDataset };
}

let _active: OdysseyDataset = odysseyDemo;
let _source: DatasetSource = "demo";

// Try to restore a custom dataset from localStorage on module load.
if (typeof window !== "undefined") {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const result = validateDataset(parsed);
      if (result.ok) {
        _active = result.dataset;
        _source = "custom";
      } else {
        // Corrupt or stale entry — clear it.
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    // localStorage unavailable / parse error; fall back to demo.
  }
}

export function getActiveDataset(): OdysseyDataset { return _active; }
export function getActiveSource(): DatasetSource { return _source; }

export function setActiveDataset(d: OdysseyDataset, source: DatasetSource = "custom") {
  _active = d;
  _source = source;
  if (typeof window !== "undefined") {
    try {
      if (source === "custom") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage quota or disabled — ignore
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function resetToDemo() {
  setActiveDataset(odysseyDemo, "demo");
}

// Hook: subscribe to dataset changes. Returns the current dataset and source.
export function useActiveDataset(): { dataset: OdysseyDataset; source: DatasetSource } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => force();
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);
  return { dataset: _active, source: _source };
}

// Convenience: download the current dataset as a JSON file.
export function exportActiveDataset(filename = "odyssey-dataset.json") {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(_active, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
