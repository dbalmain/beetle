import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCases, renderCase } from "@beetle/contract";
import type { Case } from "@beetle/contract";
import { describe, expect, it } from "vitest";

import { createEngine } from "../src/index.js";
import { createUtf8Engine } from "../src/utf8-engine.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures",
);

const fixture = readFileSync(join(fixturesDir, "editor.vici"), "utf8");
const snap = readFileSync(join(fixturesDir, "editor_cases.snap"), "utf8");
const cases = parseCases(fixture);

function runCase(
  c: Case,
  make = createEngine,
): string {
  const engine = make(c.text);
  if (c.settings.viewport !== undefined) {
    engine.setViewport(c.settings.viewport);
  }
  if (c.settings.indent !== undefined) {
    engine.setIndent(c.settings.indent);
  }
  const effects = engine.typeKeys(c.keys);
  return renderCase(c.name, engine, effects);
}

describe("vici-js editor.vici", () => {
  it("parses 411 cases", () => {
    expect(cases).toHaveLength(411);
  });

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (c === undefined) {
      break;
    }
    const last = i === cases.length - 1;
    it(c.name, () => {
      const rendered = runCase(c);
      const expected = sliceBlock(snap, c.name);
      // insta collapses the last render_case trailing blank to one newline.
      const got = last ? rendered.replace(/\n+$/, "\n") : rendered;
      expect(got).toBe(expected);
    });
  }

  it("concatenated blocks match the snap", () => {
    const got = cases
      .map((c) => runCase(c))
      .join("")
      .replace(/\n+$/, "\n");
    expect(got).toBe(snap);
  });
});

describe("vici-js utf8 piece table editor.vici", () => {
  it("concatenated blocks match the snap", () => {
    const got = cases
      .map((c) => runCase(c, createUtf8Engine))
      .join("")
      .replace(/\n+$/, "\n");
    expect(got).toBe(snap);
  });
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
  const next = text.indexOf("\n== ", start + startToken.length);
  if (next < 0) {
    // Last block: insta collapses the render_case trailing blank to one newline.
    return text.slice(start).replace(/\n+$/, "\n");
  }
  return text.slice(start, next + 1);
}
