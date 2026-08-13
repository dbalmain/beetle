import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Generated wasm-bindgen class. Snake_case matches the Rust exports. */
export type NativeEditor = {
  type_keys(spec: string): string;
  handle_key(codeType: string, payload: string, mods: number): string;
  set_text(text: string): void;
  set_indent(shiftWidth: number, tabWidth: number, useTabs: boolean): void;
  set_viewport(topRow: number, height: number): void;
  text(): string;
  cursor(): number;
  cursor_row(): number;
  cursor_col(): number;
  mode(): string;
  selection(): string;
  register_text(): string;
  register_linewise(): boolean;
  undo_depth(): number;
  redo_depth(): number;
  jumps(): Uint32Array;
  mark_names(): string;
  mark_offsets(): Uint32Array;
  pending(): string;
  last_change(): string;
  recording(): string | undefined;
  free(): void;
};

export type Bindings = {
  WasmEditor: new (text: string) => NativeEditor;
  run_case(
    name: string,
    text: string,
    keys: string,
    viewport?: string,
    indent?: string,
  ): string;
};

const require = createRequire(import.meta.url);
const bindingsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../pkg/vici_wasm.cjs",
);

let cached: Bindings | undefined;

export function loadBindings(): Bindings {
  if (cached !== undefined) {
    return cached;
  }
  try {
    cached = require(bindingsPath) as Bindings;
  } catch (error) {
    throw new Error(
      `vici-wasm bindings not found at ${bindingsPath}; run npm run build:wasm first`,
      { cause: error },
    );
  }
  return cached;
}
