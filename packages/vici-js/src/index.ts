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

export { Buffer } from "./buffer.js";
export type { ByteRange } from "./buffer.js";

export { History } from "./history.js";
export type { Step } from "./history.js";

export { Document } from "./document.js";
