import type {
  Effect,
  Engine,
  Indent,
  Key,
  Mode,
  Viewport,
} from "@beetle/contract";

import { loadBindings, type NativeEditor } from "./bindings.js";

export class WasmEngine implements Engine {
  readonly #inner: NativeEditor;

  constructor(text = "") {
    this.#inner = new (loadBindings().WasmEditor)(text);
  }

  typeKeys(spec: string): Effect[] {
    return parseEffects(this.#inner.type_keys(spec));
  }

  handleKey(key: Key): Effect[] {
    const [codeType, payload] = keyParts(key);
    return parseEffects(this.#inner.handle_key(codeType, payload, key.mods));
  }

  setText(text: string): void {
    this.#inner.set_text(text);
  }

  setIndent(indent: Indent): void {
    this.#inner.set_indent(indent.shiftWidth, indent.tabWidth, indent.useTabs);
  }

  setViewport(viewport: Viewport): void {
    this.#inner.set_viewport(viewport.topRow, viewport.height);
  }

  text(): string {
    return this.#inner.text();
  }

  cursor(): number {
    return this.#inner.cursor();
  }

  cursorPoint(): { row: number; col: number } {
    return { row: this.#inner.cursor_row(), col: this.#inner.cursor_col() };
  }

  mode(): Mode {
    return this.#inner.mode() as Mode;
  }

  selection(): { start: number; end: number } | null {
    const packed = this.#inner.selection();
    if (packed === "") {
      return null;
    }
    const sep = packed.indexOf(",");
    return {
      start: Number(packed.slice(0, sep)),
      end: Number(packed.slice(sep + 1)),
    };
  }

  register(): { text: string; linewise: boolean } {
    return {
      text: this.#inner.register_text(),
      linewise: this.#inner.register_linewise(),
    };
  }

  undoDepth(): number {
    return this.#inner.undo_depth();
  }

  redoDepth(): number {
    return this.#inner.redo_depth();
  }

  jumps(): number[] {
    return Array.from(this.#inner.jumps());
  }

  marks(): { name: string; offset: number }[] {
    const names = this.#inner.mark_names();
    const offsets = Array.from(this.#inner.mark_offsets());
    const out: { name: string; offset: number }[] = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      const offset = offsets[i];
      if (name === undefined || offset === undefined) {
        break;
      }
      out.push({ name, offset });
    }
    return out;
  }

  pending(): string {
    return this.#inner.pending();
  }

  lastChange(): string {
    return this.#inner.last_change();
  }

  recording(): string | null {
    return this.#inner.recording() ?? null;
  }
}

export function createWasmEngine(text = ""): WasmEngine {
  return new WasmEngine(text);
}

export function runCase(
  name: string,
  text: string,
  keys: string,
  viewport?: Viewport,
  indent?: Indent,
): string {
  const packedViewport =
    viewport === undefined
      ? undefined
      : `${viewport.topRow},${viewport.height}`;
  const packedIndent =
    indent === undefined
      ? undefined
      : `${indent.shiftWidth},${indent.tabWidth},${indent.useTabs ? "tabs" : "spaces"}`;
  return loadBindings().run_case(
    name,
    text,
    keys,
    packedViewport,
    packedIndent,
  );
}

function parseEffects(json: string): Effect[] {
  return JSON.parse(json) as Effect[];
}

function keyParts(key: Key): [string, string] {
  switch (key.code.type) {
    case "Char":
      return ["Char", key.code.char];
    case "F":
      return ["F", String(key.code.n)];
    default:
      return [key.code.type, ""];
  }
}
