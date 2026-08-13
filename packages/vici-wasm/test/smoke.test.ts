import { describe, expect, it } from "vitest";

import { createWasmEngine, runCase } from "../src/index.js";

describe("WasmEngine smoke", () => {
  it("changes a word like the README example", () => {
    const engine = createWasmEngine("select id, name\nfrom users");
    const effects = engine.typeKeys("cwSELECT<Esc>");
    expect(engine.text()).toBe("SELECT id, name\nfrom users");
    expect(engine.text()).toContain("SELECT");
    expect(engine.mode()).toBe("Normal");
    expect(engine.cursor()).toBeGreaterThan(0);
    expect(effects.some((effect) => effect.type === "Edit")).toBe(true);
    expect(effects.some((effect) => effect.type === "ModeChanged")).toBe(true);

    const snapshot = runCase(
      "smoke",
      "select id, name\nfrom users",
      "cwSELECT<Esc>",
    );
    expect(snapshot).toContain("== smoke ==");
    expect(snapshot).toContain("SELECT");
    expect(snapshot).toContain("mode: Normal");
  });
});
