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

/** 4b + 4c allowlist. Dropped: cases that need 4d motions (`w`/`iw`/`f`/`{`). */
const ALLOWLIST = [
  // 4b
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
  // 4c — goto
  "move-goto-last-and-first",
  "move-goto-counted-row",
  // 4c — operators / linewise / last-row
  "delete-row",
  "delete-two-rows",
  "delete-row-after-motion",
  "delete-last-row",
  "delete-to-row-end",
  "delete-linewise-motion",
  "delete-dollar-before-newline",
  "delete-last-char-with-motion",
  "change-row",
  "change-final-row-no-newline",
  "change-middle-row-no-newline",
  "change-final-row-trailing-newline",
  "delete-final-row-trailing-newline",
  "change-first-row-no-newline",
  "change-two-rows-no-newline",
  "change-first-row-trailing-newline",
  "change-middle-row-trailing-newline",
  "change-final-only-trailing-newline",
  "change-two-rows-trailing-newline",
  "visual-change-final-row-no-newline",
  "visual-change-final-row-trailing-newline",
  "shift-row-right",
  "shift-row-left",
  "shift-count",
  "shift-motion",
  "shift-indent-tabs",
  "shift-noop",
  "shift-whitespace-to-empty",
  "shift-empty-noop",
  "shift-cursor-first-nonblank",
  "shift-final-row",
  "shift-final-row-up",
  "yank-line-put-after",
  "yank-line-put-before",
  "yank-final-row-put-after",
  "yank-final-row-put-before",
  "yank-first-row-put-final-after",
  "yank-first-row-put-final-before",
  "delete-then-put",
  "delete-end-count",
  "empty-delete-row",
  "empty-put-join-swap",
  "empty-replace",
  "empty-delete-before",
  "empty-undo-redo",
  "empty-visual-operators",
  "empty-delete-end",
  "pending-command",
  "invalid-sequence",
  "invalid-cancelled-sequence",
  "command-prompt-effect",
  "edit-geometry",
  // 4c — visual
  "visual-char-selection",
  "visual-char-delete",
  "visual-line-delete",
  "visual-two-line-delete",
  "visual-line-selection",
  "visual-toggle",
  "visual-escape",
  "shift-visual",
  "shift-visual-count",
  // 4c — p P J r ~
  "replace-char",
  "replace-char-count",
  "swap-char",
  "swap-char-count",
  "join-rows",
  "join-trims-indent",
  "join-count",
  // 4c — linewise matrix (no gU/gu/g~)
  ...linewise("dd"),
  ...linewise("cc"),
  ...linewise("yank-put"),
  ...linewise("shift-right"),
  ...linewise("shift-left"),
  ...linewise("visual-delete"),
  ...linewise("visual-change"),
  ...linewise("visual-yank"),
  ...linewise("visual-shift-right"),
  "lines-dd-counted-off-end",
  "lines-cc-counted-off-end",
] as const;

function linewise(kind: string): string[] {
  const positions = [
    "first-no-newline",
    "middle-no-newline",
    "final-no-newline",
    "first-trailing-newline",
    "middle-trailing-newline",
    "final-trailing-newline",
    "single-row",
  ];
  return positions.map((position) => `lines-${kind}-${position}`);
}

const fixture = readFileSync(join(fixturesDir, "editor.vici"), "utf8");
const snap = readFileSync(join(fixturesDir, "editor_cases.snap"), "utf8");
const cases = new Map(parseCases(fixture).map((c) => [c.name, c]));

describe("vici-js 4c editor.vici allowlist", () => {
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
