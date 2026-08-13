import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseCases,
  parseSettings,
  unescape,
  validName,
} from "../src/index.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/editor.vici",
);

describe("validName", () => {
  it("accepts kebab-case", () => {
    expect(validName("move-right-count")).toBe(true);
    expect(validName("a")).toBe(true);
    expect(validName("a1")).toBe(true);
    expect(validName("1a")).toBe(true);
    expect(validName("viewport-half-page")).toBe(true);
  });

  it("rejects empty, edge hyphens, and non-kebab", () => {
    expect(validName("")).toBe(false);
    expect(validName("-a")).toBe(false);
    expect(validName("a-")).toBe(false);
    expect(validName("A")).toBe(false);
    expect(validName("foo_bar")).toBe(false);
    expect(validName("foo bar")).toBe(false);
    expect(validName("Upper")).toBe(false);
  });
});

describe("unescape", () => {
  it("expands the four supported escapes", () => {
    expect(unescape("a\\nb", "t")).toBe("a\nb");
    expect(unescape("a\\tb", "t")).toBe("a\tb");
    expect(unescape("a\\rb", "t")).toBe("a\rb");
    expect(unescape("a\\\\b", "t")).toBe("a\\b");
    expect(unescape("select id, name\\nfrom users", "t")).toBe(
      "select id, name\nfrom users",
    );
  });

  it("leaves non-escape text alone", () => {
    expect(unescape("plain", "t")).toBe("plain");
    expect(unescape("", "t")).toBe("");
    expect(unescape("café", "t")).toBe("café");
  });

  it("throws on unknown escapes and a trailing backslash", () => {
    expect(() => unescape("\\x", "t")).toThrow("t: unsupported escape \\x");
    expect(() => unescape("foo\\", "t")).toThrow(
      "t: unsupported trailing backslash",
    );
  });
});

describe("parseSettings", () => {
  it("parses viewport and indent spaces/tabs", () => {
    expect(parseSettings("viewport=0,6", "t")).toEqual({
      viewport: { topRow: 0, height: 6 },
    });
    expect(parseSettings("indent=4,8,spaces", "t")).toEqual({
      indent: { shiftWidth: 4, tabWidth: 8, useTabs: false },
    });
    expect(parseSettings("indent=4,8,tabs", "t")).toEqual({
      indent: { shiftWidth: 4, tabWidth: 8, useTabs: true },
    });
    expect(parseSettings("viewport=2,5 indent=4,8,spaces", "t")).toEqual({
      viewport: { topRow: 2, height: 5 },
      indent: { shiftWidth: 4, tabWidth: 8, useTabs: false },
    });
  });

  it("throws on malformed settings", () => {
    expect(() => parseSettings("viewport", "t")).toThrow(
      "t: setting needs a value: viewport",
    );
    expect(() => parseSettings("viewport=0", "t")).toThrow(
      "t: unsupported setting viewport=0",
    );
    expect(() => parseSettings("indent=4,8,spaces indent=4,8,tabs", "t")).toThrow(
      "t: duplicate indent",
    );
    expect(() => parseSettings("viewport=0,6 viewport=1,6", "t")).toThrow(
      "t: duplicate viewport",
    );
    expect(() => parseSettings("indent=4,8,fancy", "t")).toThrow(
      "t: indent wants tabs or spaces, got fancy",
    );
    expect(() => parseSettings("viewport=x,6", "t")).toThrow(
      "t: invalid setting number x",
    );
  });
});

describe("parseCases", () => {
  it("parses a handful of fixture chunks", () => {
    const cases = parseCases(`# comment

case move-right-count
text select id, name\\nfrom users\\nwhere id = 1
keys 3l
---
case viewport-half-page
text 0\\n1\\n2
keys j<C-d>
with viewport=0,6
---
# skipped
case shift-indent-tabs
text \\tword
keys >>
with indent=4,8,tabs
`);
    expect(cases).toHaveLength(3);
    expect(cases[0]).toEqual({
      name: "move-right-count",
      text: "select id, name\nfrom users\nwhere id = 1",
      keys: "3l",
      settings: {},
    });
    expect(cases[1]).toEqual({
      name: "viewport-half-page",
      text: "0\n1\n2",
      keys: "j<C-d>",
      settings: { viewport: { topRow: 0, height: 6 } },
    });
    expect(cases[2]).toEqual({
      name: "shift-indent-tabs",
      text: "\tword",
      keys: ">>",
      settings: { indent: { shiftWidth: 4, tabWidth: 8, useTabs: true } },
    });
  });

  it("accepts a bare text line as empty", () => {
    const [only] = parseCases("case empty-delete-char\ntext\nkeys x\n");
    expect(only).toEqual({
      name: "empty-delete-char",
      text: "",
      keys: "x",
      settings: {},
    });
  });

  it("skips blank lines and # comments", () => {
    const cases = parseCases(`# header
# more

case one
text a
keys l

# between
---

case two
text b
keys h
`);
    expect(cases.map((c) => c.name)).toEqual(["one", "two"]);
  });

  it("throws on invalid names, unknown prefixes, and missing fields", () => {
    expect(() => parseCases("case BadName\ntext a\nkeys l\n")).toThrow(
      "<unknown>: case must be first and kebab-case",
    );
    expect(() => parseCases("case -lead\ntext a\nkeys l\n")).toThrow(
      "<unknown>: case must be first and kebab-case",
    );
    expect(() => parseCases("case ok\ntext a\nkeys l\nnope x\n")).toThrow(
      "ok: unknown fixture prefix: nope x",
    );
    expect(() => parseCases("case ok\nkeys l\n")).toThrow("ok: missing text");
    expect(() => parseCases("case ok\ntext a\n")).toThrow("ok: missing keys");
    expect(() =>
      parseCases("case ok\ntext a\ntext b\nkeys l\n"),
    ).toThrow("ok: duplicate text");
    expect(() =>
      parseCases("case ok\ntext a\nkeys l\nkeys h\n"),
    ).toThrow("ok: duplicate keys");
    expect(() =>
      parseCases(
        "case one\ntext a\nkeys l\n---\ncase one\ntext b\nkeys h\n",
      ),
    ).toThrow("one: duplicate case name");
    expect(() => parseCases("# only comments\n\n")).toThrow(
      "<unknown>: fixture has no cases",
    );
    expect(() => parseCases("case ok\ntextbook\nkeys l\n")).toThrow(
      "ok: malformed text",
    );
  });

  it("parses all 411 oracle cases with unique kebab-case names", () => {
    const fixture = readFileSync(fixturePath, "utf8");
    const cases = parseCases(fixture);
    expect(cases).toHaveLength(411);
    const names = cases.map((c) => c.name);
    expect(new Set(names).size).toBe(411);
    for (const name of names) {
      expect(validName(name), name).toBe(true);
    }
    const byName = new Map(cases.map((c) => [c.name, c]));
    expect(byName.get("move-right-count")?.keys).toBe("3l");
    expect(byName.get("viewport-half-page")?.settings.viewport).toEqual({
      topRow: 0,
      height: 6,
    });
    expect(byName.get("shift-indent-tabs")?.settings.indent).toEqual({
      shiftWidth: 4,
      tabWidth: 8,
      useTabs: true,
    });
    expect(byName.get("empty-delete-char")?.text).toBe("");
    expect(byName.get("command-prompt-effect")?.keys).toBe(":");
  });
});
