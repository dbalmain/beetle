export type { Edit, Key, KeyCode, Point } from "@beetle/contract";
export { Mods } from "@beetle/contract";

export {
  KeyParseError,
  asDigit,
  asText,
  charKey,
  codeKey,
  ctrlKey,
  key,
  keys,
  makeKey,
  render,
  renderKey,
} from "./key.js";

export {
  advance,
  invertChange,
  invertEdit,
  isNoopChange,
  shift,
} from "./edit.js";
export type { Change } from "./edit.js";

export { JsBuffer as Buffer, JsBuffer } from "./buffer-js.js";
export type { ByteRange, TextBuffer, BufferFactory } from "./text-buffer.js";

export { History } from "./history.js";
export type { Step } from "./history.js";

export { Document } from "./document.js";

export { JsEngine, createEngine } from "./engine.js";
