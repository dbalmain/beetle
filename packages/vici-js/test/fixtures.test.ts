import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCases, renderCase } from "@beetle/contract";
import { describe, expect, it } from "vitest";

import { createEngine } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures",
);

/** 4b allowlist — skip anything that needs operators, visual, or later motions. */
const ALLOWLIST = [
  "move-right-count",
  "move-down",
  "move-dollar-and-home",
  "move-dollar-sticky-short-row",
  "move-dollar-sticky-long-row",
  "move-clamps-at-last-char",
  "move-left-edge",
  "move-first-nonblank",
  "insert-before",
  "insert-after",
  "insert-row-end",
  "insert-first-nonblank",
  "insert-open-below",
  "insert-open-above",
  "insert-backspace",
  "insert-enter",
  "insert-backspace-row-boundary",
  "insert-control-word",
  "replace-mode",
  "replace-mode-row-end",
  "delete-char",
  "delete-char-count",
  "delete-before-char",
  "delete-last-char-x",
  "empty-delete-char",
  "undo-delete",
  "redo-delete",
  "insert-session-undo",
  "undo-caret-open",
  "redo-caret-open",
  "typing-effects",
  "mode-effects",
] as const;

const fixture = readFileSync(join(fixturesDir, "editor.vici"), "utf8");
const snap = readFileSync(join(fixturesDir, "editor_cases.snap"), "utf8");
const cases = new Map(parseCases(fixture).map((c) => [c.name, c]));

describe("vici-js 4b editor.vici allowlist", () => {
  for (const name of ALLOWLIST) {
    it(name, () => {
      const c = cases.get(name);
      if (c === undefined) {
        throw new Error(`missing fixture case ${name}`);
      }
      const engine = createEngine(c.text);
      if (c.settings.viewport !== undefined) {
        engine.setViewport(c.settings.viewport);
      }
      if (c.settings.indent !== undefined) {
        engine.setIndent(c.settings.indent);
      }
      const effects = engine.typeKeys(c.keys);
      const got = renderCase(name, engine, effects);
      const expected = sliceBlock(snap, name);
      expect(got).toBe(expected);
    });
  }
});

describe("vici-js README smoke", () => {
  it("inserts at the cursor without needing cw", () => {
    const engine = createEngine("select id, name\nfrom users");
    const effects = engine.typeKeys("iSELECT <Esc>");
    expect(engine.text()).toBe("SELECT select id, name\nfrom users");
    expect(engine.mode()).toBe("Normal");
    expect(effects.some((effect) => effect.type === "Edit")).toBe(true);
    expect(effects.some((effect) => effect.type === "ModeChanged")).toBe(true);
  });
});

function sliceBlock(text: string, name: string): string {
  const startToken = `== ${name} ==\n`;
  const start = text.indexOf(startToken);
  if (start < 0) {
    throw new Error(`missing snap block == ${name} ==`);
  }
  const from = start;
  const next = text.indexOf("\n== ", from + startToken.length);
  if (next < 0) {
    // Last block: insta collapses the render_case trailing blank to one newline.
    return text.slice(from).replace(/\n+$/, "\n");
  }
  return text.slice(from, next + 1);
}
