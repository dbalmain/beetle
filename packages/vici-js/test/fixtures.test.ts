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

/** 4b + 4c + 4d allowlist. Dropped: 4e surround / marks / macros / `.` / `gU`. */
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
  // 4d — words
  "delete-word",
  "delete-word-motion-count",
  "delete-word-operator-count",
  "delete-word-end-inclusive",
  "delete-exclusive-end",
  "delete-exclusive-end-count",
  "delete-big-word-end",
  "change-word",
  "empty-change-word",
  "empty-delete-word",
  "move-word-forward",
  "move-big-word-forward",
  "move-word-backward",
  "move-big-word-backward",
  "move-word-end",
  "move-big-word-end-count",
  "word-end-over-flag",
  "change-session-undo",
  "delete-end-command",
  "change-end-command",
  // 4d — find
  "delete-find-inclusive",
  "delete-till-exclusive",
  "move-find-forward-count",
  "move-find-backward",
  "move-till-forward",
  "move-till-backward",
  "move-find-reverse-repeat",
  "find-till-repeat",
  "find-till-reverse",
  "find-backward-till-repeat",
  "find-repeat-count",
  // 4d — objects
  "delete-inner-word",
  "delete-around-word",
  "delete-inner-word-count-two",
  "delete-inner-word-count-three",
  "delete-around-word-count-two",
  "empty-delete-inner-word",
  "change-inner-quote",
  "change-inner-paren-delimiter",
  "change-inner-paren-seeks",
  "delete-inner-brace-multiline",
  "delete-around-brace-seeks",
  "delete-inner-brace-seek-one",
  "delete-inner-brace-seek-two",
  "delete-inner-brace-operator-count",
  "delete-around-brace-count",
  "delete-inner-brace-too-deep",
  "visual-inner-brace-count",
  "visual-inner-brace-seeks",
  "visual-inner-brace-count-seeks",
  "visual-object-selection",
  "visual-object-change",
  "yank-char-put-before",
  "shift-object",
  // 4d — pairs / paragraphs / screen
  "delete-percent-forward",
  "delete-percent-backward",
  "delete-percent-quote",
  "delete-percent-no-match",
  "paragraph-forward",
  "paragraph-backward",
  "paragraph-running-off-forward",
  "paragraph-running-off-backward",
  "paragraph-counted",
  "paragraph-delete-exclusive",
  "paragraph-consecutive-blanks",
  "paragraph-no-blanks",
  "paragraph-empty",
  "shift-paragraph",
  "viewport-half-page",
  "viewport-full-page",
  "viewport-clamps-ends",
  "viewport-dollar-sticky",
  "viewport-screen-motions",
  "viewport-screen-operator-top",
  "viewport-screen-operator-bottom",
  "viewport-zero-height-scroll",
  "screen-motion-without-viewport",
  "scroll-effects",
  // 4d — search (not search-dot-operator / search-in-macro)
  "search-forward",
  "search-backward",
  "search-smartcase-lowercase",
  "search-smartcase-uppercase",
  "search-wrap-forward",
  "search-wrap-backward",
  "search-missing",
  "search-delete-exclusive",
  "search-counted",
  "search-repeat-forward-after-forward",
  "search-repeat-reverse-after-forward",
  "search-repeat-forward-after-backward",
  "search-repeat-reverse-after-backward",
  "search-reverse-keeps-forward-direction",
  "search-reverse-keeps-backward-direction",
  "search-repeat-counted",
  "search-repeat-without-pattern",
  "search-cancel",
  "search-backspace",
  "search-multibyte",
  "search-pushes-jump",
  // 4d — motion-adjacent
  "combining-grapheme-delete",
  "multibyte-motion-and-edit",
  "empty-motions",
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

describe("vici-js 4d editor.vici allowlist", () => {
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
  it("changes the word under the cursor", () => {
    const engine = createEngine("select id, name\nfrom users");
    const effects = engine.typeKeys("cwSELECT<Esc>");
    expect(engine.text()).toBe("SELECT id, name\nfrom users");
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
