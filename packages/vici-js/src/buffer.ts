// UTF-8 piece table. Public offsets are UTF-8 bytes; Point.col is a byte
// offset in the row. Rows are LF-separated (`\r` is ordinary content).
//
// Flatten policy: collapse to a single original piece when the piece count
// exceeds 512, or after a whole-buffer replace. JS counterpart to ropey —
// not a port of ropey's internals.

import type { Edit, Point } from "@beetle/contract";

import { advanceBytes, type Change } from "./edit.js";

export type ByteRange = {
  start: number;
  end: number;
};

const utf8 = new TextEncoder();
const utf8Decode = new TextDecoder("utf-8", { fatal: true });
const EMPTY = new Uint8Array(0);

/** Flatten when the piece list exceeds this, or after a whole-buffer replace. */
const MAX_PIECES = 512;

type Piece = {
  bytes: Uint8Array;
  start: number;
  length: number;
};

export class Buffer {
  #add: Uint8Array;
  #addLen: number;
  #pieces: Piece[];
  #len: number;
  /** Byte offset of each row start. Always at least `[0]`. */
  #rowStarts: number[];

  constructor(text = "") {
    const bytes = text === "" ? EMPTY : utf8.encode(text);
    this.#add = EMPTY;
    this.#addLen = 0;
    this.#pieces =
      bytes.length === 0 ? [] : [{ bytes, start: 0, length: bytes.length }];
    this.#len = bytes.length;
    this.#rowStarts = rowStartsOf(bytes);
  }

  static fromText(text: string): Buffer {
    return new Buffer(text);
  }

  toString(): string {
    return decode(this.#collect(0, this.#len));
  }

  lenBytes(): number {
    return this.#len;
  }

  isEmpty(): boolean {
    return this.#len === 0;
  }

  lenRows(): number {
    return this.#rowStarts.length;
  }

  byte(idx: number): number {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.#len) {
      throw new RangeError(`byte index ${idx} out of range`);
    }
    let pos = 0;
    for (const piece of this.#pieces) {
      if (idx < pos + piece.length) {
        const value = piece.bytes[piece.start + (idx - pos)];
        if (value === undefined) {
          throw new Error("piece table invariant broken");
        }
        return value;
      }
      pos += piece.length;
    }
    throw new RangeError(`byte index ${idx} out of range`);
  }

  byteToPoint(byte: number): Point {
    if (!Number.isInteger(byte) || byte < 0 || byte > this.#len) {
      throw new RangeError(`byte offset ${byte} out of range`);
    }
    const row = this.#rowAt(byte);
    return { row, col: byte - (this.#rowStarts[row] ?? 0) };
  }

  /** Clamps into the buffer rather than throwing. */
  pointToByte(point: Point): number {
    const last = this.#rowStarts.length - 1;
    const row = clampInt(point.row, 0, last);
    const col = point.col < 0 ? 0 : point.col;
    const content = this.rowContentRange(row);
    return Math.min(content.start + col, content.end);
  }

  /** Byte range of `row` including its line terminator. */
  rowRange(row: number): ByteRange {
    const start = this.#rowStarts[row];
    if (start === undefined) {
      throw new RangeError(`row ${row} out of range`);
    }
    const next = this.#rowStarts[row + 1];
    return { start, end: next === undefined ? this.#len : next };
  }

  /**
   * Byte range of `row` excluding its terminator: a trailing `\n` and a
   * preceding `\r` (and a lone trailing `\r`, matching vici).
   */
  rowContentRange(row: number): ByteRange {
    const full = this.rowRange(row);
    let end = full.end;
    if (end > full.start && this.byte(end - 1) === 0x0a) {
      end -= 1;
    }
    if (end > full.start && this.byte(end - 1) === 0x0d) {
      end -= 1;
    }
    return { start: full.start, end };
  }

  rowText(row: number): string {
    const range = this.rowContentRange(row);
    return this.textIn(range.start, range.end);
  }

  textIn(start: number, end: number): string {
    this.#checkRange(start, end);
    return decode(this.#collect(start, end));
  }

  /** Compute the change without mutating. The buffer is the pre-image. */
  stageReplace(start: number, end: number, text: string): Change {
    this.#checkRange(start, end);
    if (!this.#isCharBoundary(start) || !this.#isCharBoundary(end)) {
      throw new RangeError("replace range is not on a UTF-8 character boundary");
    }
    const inserted = text === "" ? EMPTY : utf8.encode(text);
    const startPoint = this.byteToPoint(start);
    const edit: Edit = {
      startByte: start,
      oldEndByte: end,
      newEndByte: start + inserted.length,
      startPoint,
      oldEndPoint: this.byteToPoint(end),
      newEndPoint: advanceBytes(startPoint, inserted),
    };
    return {
      edit,
      removed: this.textIn(start, end),
      inserted: text,
    };
  }

  apply(change: Change): void {
    const { edit } = change;
    if (this.textIn(edit.startByte, edit.oldEndByte) !== change.removed) {
      throw new Error("buffer does not match the change being applied");
    }
    const inserted =
      change.inserted === "" ? EMPTY : utf8.encode(change.inserted);
    const whole = edit.startByte === 0 && edit.oldEndByte === this.#len;
    this.#deleteRange(edit.startByte, edit.oldEndByte);
    this.#insertAt(edit.startByte, inserted);
    this.#spliceRows(edit.startByte, edit.oldEndByte, inserted);
    if (whole || this.#pieces.length > MAX_PIECES) {
      this.#flatten();
    }
  }

  replace(start: number, end: number, text: string): Change {
    const change = this.stageReplace(start, end, text);
    this.apply(change);
    return change;
  }

  insert(at: number, text: string): Change {
    return this.replace(at, at, text);
  }

  delete(start: number, end: number): Change {
    return this.replace(start, end, "");
  }

  #checkRange(start: number, end: number): void {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.#len
    ) {
      throw new RangeError(`byte range ${start}..${end} out of range`);
    }
  }

  #isCharBoundary(idx: number): boolean {
    if (idx <= 0 || idx >= this.#len) {
      return true;
    }
    return (this.byte(idx) & 0xc0) !== 0x80;
  }

  #rowAt(byte: number): number {
    let lo = 0;
    let hi = this.#rowStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.#rowStarts[mid] ?? 0) <= byte) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  #splitAt(offset: number): number {
    if (offset === 0) {
      return 0;
    }
    if (offset === this.#len) {
      return this.#pieces.length;
    }
    let pos = 0;
    for (let i = 0; i < this.#pieces.length; i++) {
      const piece = this.#pieces[i]!;
      const next = pos + piece.length;
      if (offset === next) {
        return i + 1;
      }
      if (offset < next) {
        const leftLen = offset - pos;
        const right: Piece = {
          bytes: piece.bytes,
          start: piece.start + leftLen,
          length: piece.length - leftLen,
        };
        piece.length = leftLen;
        this.#pieces.splice(i + 1, 0, right);
        return i + 1;
      }
      pos = next;
    }
    return this.#pieces.length;
  }

  #deleteRange(start: number, end: number): void {
    if (start === end) {
      return;
    }
    const left = this.#splitAt(start);
    const right = this.#splitAt(end);
    this.#pieces.splice(left, right - left);
    this.#len -= end - start;
  }

  #insertAt(offset: number, bytes: Uint8Array): void {
    if (bytes.length === 0) {
      return;
    }
    const i = this.#splitAt(offset);
    this.#ensureAdd(bytes.length);
    this.#add.set(bytes, this.#addLen);
    this.#pieces.splice(i, 0, {
      bytes: this.#add,
      start: this.#addLen,
      length: bytes.length,
    });
    this.#addLen += bytes.length;
    this.#len += bytes.length;
  }

  #ensureAdd(more: number): void {
    if (this.#addLen + more <= this.#add.length) {
      return;
    }
    const grown = this.#add.length === 0 ? 64 : this.#add.length * 2;
    this.#add = new Uint8Array(Math.max(more, grown));
    this.#addLen = 0;
  }

  #spliceRows(start: number, oldEnd: number, inserted: Uint8Array): void {
    const first = this.#rowAt(start);
    let i = first + 1;
    while (i < this.#rowStarts.length && (this.#rowStarts[i] ?? 0) <= oldEnd) {
      i += 1;
    }
    const added: number[] = [];
    for (let j = 0; j < inserted.length; j++) {
      if (inserted[j] === 0x0a) {
        added.push(start + j + 1);
      }
    }
    const delta = inserted.length - (oldEnd - start);
    const tail: number[] = [];
    for (; i < this.#rowStarts.length; i++) {
      tail.push((this.#rowStarts[i] ?? 0) + delta);
    }
    this.#rowStarts = this.#rowStarts.slice(0, first + 1).concat(added, tail);
  }

  #flatten(): void {
    const bytes = this.#collect(0, this.#len);
    this.#add = EMPTY;
    this.#addLen = 0;
    this.#pieces =
      bytes.length === 0 ? [] : [{ bytes, start: 0, length: bytes.length }];
  }

  #collect(start: number, end: number): Uint8Array {
    if (start === end) {
      return EMPTY;
    }
    const out = new Uint8Array(end - start);
    let written = 0;
    let pos = 0;
    for (const piece of this.#pieces) {
      const pieceEnd = pos + piece.length;
      if (pieceEnd <= start) {
        pos = pieceEnd;
        continue;
      }
      if (pos >= end) {
        break;
      }
      const from = Math.max(start, pos) - pos;
      const to = Math.min(end, pieceEnd) - pos;
      out.set(
        piece.bytes.subarray(piece.start + from, piece.start + to),
        written,
      );
      written += to - from;
      pos = pieceEnd;
    }
    return out;
  }
}

function decode(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }
  return utf8Decode.decode(bytes);
}

function rowStartsOf(bytes: Uint8Array): number[] {
  const starts = [0];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
