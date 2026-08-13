import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCases } from "@beetle/contract";
import { describe, expect, it } from "vitest";

import { runCase } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures",
);

describe("WASM editor.vici oracle", () => {
  it("matches fixtures/editor_cases.snap character-for-character", () => {
    const fixture = readFileSync(join(fixturesDir, "editor.vici"), "utf8");
    const expected = readFileSync(
      join(fixturesDir, "editor_cases.snap"),
      "utf8",
    );
    const cases = parseCases(fixture);
    expect(cases).toHaveLength(411);

    // Each run_case block ends with the blank line render_case appends.
    // insta writes the concatenated string with trailing newlines collapsed
    // to a single POSIX newline — that is the snap file. Do not change the
    // renderer; it must still emit the inter-case blank line.
    const got = cases
      .map((c) =>
        runCase(c.name, c.text, c.keys, c.settings.viewport, c.settings.indent),
      )
      .join("")
      .replace(/\n+$/, "\n");

    if (got !== expected) {
      const mismatches = mismatchedCases(cases, got, expected);
      expect.fail(
        `${mismatches.length} case(s) differ from the snap` +
          (mismatches.length > 0 ? `:\n${mismatches.slice(0, 20).join("\n")}` : ""),
      );
    }
  });
});

function mismatchedCases(
  cases: readonly { name: string }[],
  got: string,
  expected: string,
): string[] {
  const mismatches: string[] = [];
  for (let i = 0; i < cases.length; i++) {
    const name = cases[i]?.name;
    const next = cases[i + 1]?.name;
    if (name === undefined) {
      break;
    }
    const gotBlock = sliceBlock(got, name, next);
    const expectedBlock = sliceBlock(expected, name, next);
    if (gotBlock !== expectedBlock) {
      mismatches.push(describeMismatch(name, gotBlock, expectedBlock));
    }
  }
  if (mismatches.length === 0 && got !== expected) {
    mismatches.push(
      `concatenation length ${got.length} vs snap ${expected.length} ` +
        `(no per-case header mismatch; likely trailing whitespace)`,
    );
  }
  return mismatches;
}

function sliceBlock(
  snap: string,
  name: string,
  nextName: string | undefined,
): string {
  const startToken = `== ${name} ==\n`;
  const start = snap.indexOf(startToken);
  if (start < 0) {
    return `<missing == ${name} ==>`;
  }
  const end =
    nextName === undefined ? snap.length : snap.indexOf(`== ${nextName} ==\n`, start);
  if (end < 0) {
    return snap.slice(start);
  }
  return snap.slice(start, end);
}

function describeMismatch(name: string, got: string, expected: string): string {
  if (got.startsWith("<missing")) {
    return `${name}: missing from WASM output`;
  }
  if (expected.startsWith("<missing")) {
    return `${name}: missing from snap`;
  }
  const limit = Math.min(got.length, expected.length);
  let i = 0;
  while (i < limit && got.charCodeAt(i) === expected.charCodeAt(i)) {
    i += 1;
  }
  const gotLine = lineAt(got, i);
  const expectedLine = lineAt(expected, i);
  return `${name}: first diff at byte ${i}\n  got:  ${JSON.stringify(gotLine)}\n  snap: ${JSON.stringify(expectedLine)}`;
}

function lineAt(text: string, index: number): string {
  const from = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const to = text.indexOf("\n", index);
  return text.slice(from, to < 0 ? text.length : to);
}
