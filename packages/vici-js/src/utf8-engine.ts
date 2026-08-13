// Separate entry so the shippable `createEngine` bundle does not pull in
// the UTF-8 piece table. Benches import this to measure the UTF-8 tax.

import { Utf8Buffer } from "./buffer.js";
import { JsEngine } from "./engine.js";

export function createUtf8Engine(text = ""): JsEngine {
  return new JsEngine(text, (value = "") => Utf8Buffer.fromText(value));
}
