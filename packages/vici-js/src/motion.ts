// Grapheme / word motions. Outcomes match vici `motion.rs` for the 4c
// subset: `h j k l 0 ^ $ G gg` plus a word-backward used by insert `<C-w>`.

import type { Buffer } from "./buffer.js";

export type Bound = "OnChar" | "PastEnd";

/** Sentinel sticky column meaning "stay at the end of the row", as `$` does. */
export const STICKY_END = Number.POSITIVE_INFINITY;

const utf8 = new TextEncoder();
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const WHITE_SPACE = /^\p{White_Space}$/u;
const ALPHABETIC = /^\p{Alphabetic}$/u;
const NUMBER = /^\p{N}$/u;

export type Motion =
  | "Left"
  | "Right"
  | "Down"
  | "Up"
  | "FirstColumn"
  | "FirstNonBlank"
  | "LastColumn"
  | "WordBackward"
  | "GotoRow"
  | "GotoFirstRow";

export type Span =
  | { kind: "chars"; start: number; end: number }
  | { kind: "lines"; first: number; last: number };

/** Whole-row operator target: `j`/`k`/`G`/`gg`. */
export function isLinewise(motion: Motion): boolean {
  return (
    motion === "Down" ||
    motion === "Up" ||
    motion === "GotoRow" ||
    motion === "GotoFirstRow"
  );
}

/** Destination character is included: `$` in this slice. */
export function isInclusive(motion: Motion): boolean {
  return motion === "LastColumn";
}

export function spanIsLinewise(span: Span): boolean {
  return span.kind === "lines";
}

/** In-place rewrite: linewise stops before the last row's terminator. */
export function spanContentRange(
  buffer: Buffer,
  span: Span,
): { start: number; end: number } {
  if (span.kind === "chars") {
    return { start: span.start, end: span.end };
  }
  return {
    start: buffer.rowRange(span.first).start,
    end: buffer.rowContentRange(span.last).end,
  };
}

/** Delete range: linewise takes a row break with it (`rowSpan`). */
export function spanDeleteRange(
  buffer: Buffer,
  span: Span,
): { start: number; end: number } {
  if (span.kind === "chars") {
    return { start: span.start, end: span.end };
  }
  return rowSpan(buffer, span.first, span.last);
}

export function spanHome(buffer: Buffer, span: Span): number {
  if (span.kind === "chars") {
    return span.start;
  }
  return buffer.rowContentRange(span.first).start;
}

/** Byte offsets of every grapheme boundary in `row`, including the row end. */
export function graphemeBoundaries(buffer: Buffer, row: number): number[] {
  const range = buffer.rowContentRange(row);
  const text = buffer.textIn(range.start, range.end);
  const out: number[] = [];
  let byte = range.start;
  for (const { segment } of segmenter.segment(text)) {
    out.push(byte);
    byte += utf8.encode(segment).length;
  }
  out.push(range.end);
  return out;
}

function maxCol(boundaries: readonly number[], bound: Bound): number {
  const last = boundaries.length - 1;
  return bound === "PastEnd" ? last : Math.max(0, last - 1);
}

export function graphemeCol(buffer: Buffer, byte: number): number {
  const row = buffer.byteToPoint(byte).row;
  const boundaries = graphemeBoundaries(buffer, row);
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if ((boundaries[i] ?? 0) <= byte) {
      return i;
    }
  }
  return 0;
}

function byteAtCol(
  buffer: Buffer,
  row: number,
  col: number,
  bound: Bound,
): number {
  const boundaries = graphemeBoundaries(buffer, row);
  const index = Math.min(col, maxCol(boundaries, bound));
  return boundaries[index] ?? boundaries[0] ?? 0;
}

export function clamp(buffer: Buffer, byte: number, bound: Bound): number {
  const limited = Math.min(Math.max(0, byte), buffer.lenBytes());
  const row = buffer.byteToPoint(limited).row;
  const boundaries = graphemeBoundaries(buffer, row);
  const allowed = boundaries.slice(0, maxCol(boundaries, bound) + 1);
  let i = 0;
  while (i < allowed.length && (allowed[i] ?? 0) <= limited) {
    i += 1;
  }
  return allowed[Math.max(0, i - 1)] ?? 0;
}

function nextGrapheme(buffer: Buffer, byte: number, bound: Bound): number {
  const row = buffer.byteToPoint(byte).row;
  return byteAtCol(buffer, row, graphemeCol(buffer, byte) + 1, bound);
}

function prevGrapheme(buffer: Buffer, byte: number, bound: Bound): number {
  const row = buffer.byteToPoint(byte).row;
  return byteAtCol(
    buffer,
    row,
    Math.max(0, graphemeCol(buffer, byte) - 1),
    bound,
  );
}

export function firstNonBlank(buffer: Buffer, row: number): number {
  const range = buffer.rowContentRange(row);
  const text = buffer.textIn(range.start, range.end);
  let offset = 0;
  for (const ch of text) {
    if (!WHITE_SPACE.test(ch)) {
      return range.start + offset;
    }
    offset += utf8.encode(ch).length;
  }
  return range.start;
}

export function resolve(
  buffer: Buffer,
  from: number,
  motion: Motion,
  count: number | undefined,
  sticky: number,
  bound: Bound,
): number {
  const repeat = count === undefined ? 1 : Math.max(1, count);
  const point = buffer.byteToPoint(from);
  const rows = buffer.lenRows();
  let target: number;
  switch (motion) {
    case "Left": {
      let pos = from;
      for (let i = 0; i < repeat; i++) {
        pos = prevGrapheme(buffer, pos, bound);
      }
      target = pos;
      break;
    }
    case "Right": {
      let pos = from;
      for (let i = 0; i < repeat; i++) {
        pos = nextGrapheme(buffer, pos, bound);
      }
      target = pos;
      break;
    }
    case "Down":
      target = byteAtCol(
        buffer,
        Math.min(point.row + repeat, rows - 1),
        sticky,
        bound,
      );
      break;
    case "Up":
      target = byteAtCol(
        buffer,
        Math.max(0, point.row - repeat),
        sticky,
        bound,
      );
      break;
    case "FirstColumn":
      target = buffer.rowContentRange(point.row).start;
      break;
    case "FirstNonBlank":
      target = firstNonBlank(buffer, point.row);
      break;
    case "LastColumn":
      target = byteAtCol(
        buffer,
        Math.min(point.row + repeat - 1, rows - 1),
        STICKY_END,
        bound,
      );
      break;
    case "GotoRow": {
      const targetRow =
        count === undefined
          ? rows - 1
          : Math.min(Math.max(0, count - 1), rows - 1);
      target = firstNonBlank(buffer, targetRow);
      break;
    }
    case "GotoFirstRow": {
      const targetRow =
        count === undefined ? 0 : Math.min(Math.max(0, count - 1), rows - 1);
      target = firstNonBlank(buffer, targetRow);
      break;
    }
    case "WordBackward": {
      let pos = from;
      for (let i = 0; i < repeat; i++) {
        pos = wordBackward(buffer, pos);
      }
      target = pos;
      break;
    }
  }
  return clamp(buffer, target, bound);
}

export function rowSpan(
  buffer: Buffer,
  first: number,
  last: number,
): { start: number; end: number } {
  const lastRow = Math.min(last, buffer.lenRows() - 1);
  const start = buffer.rowRange(first).start;
  const end = buffer.rowRange(lastRow).end;
  if (end === buffer.lenBytes() && first > 0) {
    return { start: buffer.rowRange(first - 1).end - 1, end };
  }
  return { start, end };
}

type Class = "Blank" | "Word" | "Punct";

function classify(ch: string): Class {
  if (WHITE_SPACE.test(ch)) {
    return "Blank";
  }
  if (ch === "_" || ALPHABETIC.test(ch) || NUMBER.test(ch)) {
    return "Word";
  }
  return "Punct";
}

function utf8CharLen(first: number): number {
  if (first < 0x80) {
    return 1;
  }
  if (first < 0xe0) {
    return 2;
  }
  if (first < 0xf0) {
    return 3;
  }
  return 4;
}

function charAt(buffer: Buffer, byte: number): string | undefined {
  if (byte < 0 || byte >= buffer.lenBytes()) {
    return undefined;
  }
  const len = utf8CharLen(buffer.byte(byte));
  return buffer.textIn(byte, byte + len);
}

function classAt(buffer: Buffer, byte: number): Class | undefined {
  const ch = charAt(buffer, byte);
  return ch === undefined ? undefined : classify(ch);
}

function retreatChar(buffer: Buffer, byte: number): number {
  if (byte <= 0) {
    return 0;
  }
  let i = byte - 1;
  while (i > 0 && (buffer.byte(i) & 0xc0) === 0x80) {
    i -= 1;
  }
  return i;
}

/** `b`: the start of this word, or of the previous one. */
export function wordBackward(buffer: Buffer, from: number): number {
  let pos = retreatChar(buffer, from);
  while (pos > 0 && classAt(buffer, pos) === "Blank") {
    pos = retreatChar(buffer, pos);
  }
  const current = classAt(buffer, pos);
  if (current === undefined || current === "Blank") {
    return pos;
  }
  while (pos > 0) {
    const prev = retreatChar(buffer, pos);
    if (classAt(buffer, prev) === current) {
      pos = prev;
    } else {
      break;
    }
  }
  return pos;
}
