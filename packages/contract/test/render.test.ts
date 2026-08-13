import { describe, expect, it } from "vitest";

import {
  Mods,
  renderCase,
  renderEffect,
  rustDebugString,
  type Effect,
  type Engine,
  type Key,
} from "../src/index.js";

function fakeEngine(overrides: Partial<EngineState> = {}): Engine {
  const state: EngineState = {
    text: "select id, name\nfrom users\nwhere id = 1",
    cursor: 3,
    point: { row: 0, col: 3 },
    mode: "Normal",
    selection: null,
    register: { text: "", linewise: false },
    undo: 0,
    redo: 0,
    jumps: [],
    marks: [],
    pending: "",
    lastChange: "",
    recording: null,
    ...overrides,
  };
  return {
    typeKeys() {
      return [];
    },
    handleKey(_key: Key) {
      return [];
    },
    setText() {},
    setIndent() {},
    setViewport() {},
    text: () => state.text,
    cursor: () => state.cursor,
    cursorPoint: () => state.point,
    mode: () => state.mode,
    selection: () => state.selection,
    register: () => state.register,
    undoDepth: () => state.undo,
    redoDepth: () => state.redo,
    jumps: () => state.jumps,
    marks: () => state.marks,
    pending: () => state.pending,
    lastChange: () => state.lastChange,
    recording: () => state.recording,
  };
}

type EngineState = {
  text: string;
  cursor: number;
  point: { row: number; col: number };
  mode: Engine["mode"] extends () => infer M ? M : never;
  selection: { start: number; end: number } | null;
  register: { text: string; linewise: boolean };
  undo: number;
  redo: number;
  jumps: number[];
  marks: { name: string; offset: number }[];
  pending: string;
  lastChange: string;
  recording: string | null;
};

describe("Mods", () => {
  it("matches the vici flag bits", () => {
    expect(Mods.NONE).toBe(0);
    expect(Mods.CTRL).toBe(1);
    expect(Mods.ALT).toBe(2);
    expect(Mods.SHIFT).toBe(4);
  });
});

describe("rustDebugString", () => {
  it("matches Rust Debug for the snapshot strings we already have", () => {
    expect(rustDebugString("")).toBe('""');
    expect(rustDebugString("select id, name\nfrom users\nwhere id = 1")).toBe(
      '"select id, name\\nfrom users\\nwhere id = 1"',
    );
    expect(rustDebugString("café NIÑO")).toBe('"café NIÑO"');
    expect(rustDebugString("日本語")).toBe('"日本語"');
    expect(rustDebugString("🇦🇺café")).toBe('"🇦🇺café"');
    expect(rustDebugString("e\u0301")).toBe('"e\\u{301}"');
    expect(rustDebugString("aé\u0301b\ncaf\nx")).toBe(
      '"aé\\u{301}b\\ncaf\\nx"',
    );
    expect(rustDebugString('say "hi"')).toBe('"say \\"hi\\""');
    expect(rustDebugString("a\\b")).toBe('"a\\\\b"');
    expect(rustDebugString("a\tb\r")).toBe('"a\\tb\\r"');
    expect(rustDebugString("\0")).toBe('"\\0"');
  });
});

describe("renderEffect", () => {
  it("prints each variant the way render_effect does", () => {
    const edit: Effect = {
      type: "Edit",
      edit: {
        startByte: 0,
        oldEndByte: 3,
        newEndByte: 1,
        startPoint: { row: 0, col: 0 },
        oldEndPoint: { row: 0, col: 3 },
        newEndPoint: { row: 0, col: 1 },
      },
    };
    expect(renderEffect(edit)).toBe("edit 0..3 -> 1; (0,0)..(0,3) -> (0,1)");
    expect(renderEffect({ type: "ModeChanged", mode: "Visual(Char)" })).toBe(
      "mode Visual(Char)",
    );
    expect(renderEffect({ type: "Scroll", scroll: "HalfPageDown" })).toBe(
      "scroll HalfPageDown",
    );
    expect(renderEffect({ type: "CommandPrompt" })).toBe("command prompt :");
    expect(renderEffect({ type: "Bell" })).toBe("bell");
    expect(renderEffect({ type: "RecordingStarted", register: "a" })).toBe(
      "recording @a",
    );
    expect(renderEffect({ type: "RecordingStopped", register: "a" })).toBe(
      "recorded @a",
    );
  });
});

describe("renderCase", () => {
  it("emits the snapshot header lines for a fake engine", () => {
    const out = renderCase("move-right-count", fakeEngine(), []);
    expect(out.startsWith("== move-right-count ==\n")).toBe(true);
    expect(out).toContain(
      'text: "select id, name\\nfrom users\\nwhere id = 1"',
    );
    expect(out).toContain("cursor: 3 @ 0:3");
    expect(out).toContain("mode: Normal; selection: -");
    expect(out).toContain('register: char ""');
    expect(out).toContain("history: undo=0 redo=0");
    expect(out).toContain("jumps: []");
    expect(out).toContain("marks: []");
    expect(out).toContain('pending: ""; last-change: ""; recording: -');
    expect(out).toContain("effects:\n");
    expect(out.endsWith("effects:\n\n")).toBe(true);
  });

  it("formats selection, marks, jumps, line register, and effects", () => {
    const out = renderCase(
      "viewport-screen-operator-top",
      fakeEngine({
        text: "0\n1",
        cursor: 2,
        point: { row: 1, col: 0 },
        register: { text: "2\n3\n4\n5\n", linewise: true },
        undo: 1,
        jumps: [0],
        marks: [
          { name: "]", offset: 2 },
          { name: "[", offset: 3 },
        ],
        lastChange: "dH",
      }),
      [
        {
          type: "Edit",
          edit: {
            startByte: 3,
            oldEndByte: 11,
            newEndByte: 3,
            startPoint: { row: 1, col: 1 },
            oldEndPoint: { row: 5, col: 1 },
            newEndPoint: { row: 1, col: 1 },
          },
        },
      ],
    );
    expect(out).toContain("register: line \"2\\n3\\n4\\n5\\n\"");
    expect(out).toContain("jumps: [0]");
    expect(out).toContain("marks: [[:3, ]:2]");
    expect(out).toContain('last-change: "dH"');
    expect(out).toContain("  edit 3..11 -> 3; (1,1)..(5,1) -> (1,1)\n");
  });
});
