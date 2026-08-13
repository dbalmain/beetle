import { describe, expect, it } from "vitest";

import {
  Buffer,
  advance,
  invertChange,
  shift,
} from "../src/index.js";

describe("rows are counted by LF only", () => {
  it("treats \\r as ordinary content", () => {
    const buffer = Buffer.fromText("a\rb\nc");
    expect(buffer.lenRows()).toBe(2);
    expect(buffer.rowText(0)).toBe("a\rb");
    expect(buffer.byteToPoint(4)).toEqual({ row: 1, col: 0 });
  });

  it("preserves CRLF as a single terminator", () => {
    const buffer = Buffer.fromText("a\r\nb");
    expect(buffer.rowRange(0)).toEqual({ start: 0, end: 3 });
    expect(buffer.rowContentRange(0)).toEqual({ start: 0, end: 1 });
    expect(buffer.rowText(0)).toBe("a");
    expect(buffer.toString()).toBe("a\r\nb");
  });

  it("gives an empty buffer one empty row", () => {
    const buffer = new Buffer();
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.lenRows()).toBe(1);
    expect(buffer.rowContentRange(0)).toEqual({ start: 0, end: 0 });
    expect(buffer.byteToPoint(0)).toEqual({ row: 0, col: 0 });
  });

  it("adds a phantom empty row after a trailing newline", () => {
    const buffer = Buffer.fromText("hello\n");
    expect(buffer.lenRows()).toBe(2);
    expect(buffer.rowText(0)).toBe("hello");
    expect(buffer.rowText(1)).toBe("");
    expect(buffer.rowRange(1)).toEqual({ start: 6, end: 6 });
    expect(buffer.byteToPoint(6)).toEqual({ row: 1, col: 0 });
  });
});

describe("byte / point mapping", () => {
  it("clamps stale coordinates", () => {
    const buffer = Buffer.fromText("one\ntwo");
    expect(buffer.pointToByte({ row: 99, col: 0 })).toBe(4);
    expect(buffer.pointToByte({ row: 1, col: 99 })).toBe(7);
    expect(buffer.pointToByte({ row: 0, col: 99 })).toBe(3);
  });

  it("counts café's é as two UTF-8 bytes", () => {
    const buffer = Buffer.fromText("-- café");
    expect(buffer.lenBytes()).toBe(8);
    expect(buffer.byteToPoint(8)).toEqual({ row: 0, col: 8 });
    expect(buffer.pointToByte({ row: 0, col: 8 })).toBe(8);
  });
});

describe("advance after insert", () => {
  it("adds byte length when there is no newline", () => {
    expect(advance({ row: 0, col: 2 }, "xyz")).toEqual({ row: 0, col: 5 });
    expect(advance({ row: 1, col: 3 }, "é")).toEqual({ row: 1, col: 5 });
  });

  it("measures the column from the last newline", () => {
    expect(advance({ row: 0, col: 2 }, "x\ny")).toEqual({ row: 1, col: 1 });
    expect(advance({ row: 2, col: 5 }, "ab\ncd\nef")).toEqual({
      row: 4,
      col: 2,
    });
  });
});

describe("insert and delete update points", () => {
  it("inserts text containing a newline", () => {
    const buffer = Buffer.fromText("abc");
    const change = buffer.insert(1, "x\ny");
    expect(change.edit).toEqual({
      startByte: 1,
      oldEndByte: 1,
      newEndByte: 4,
      startPoint: { row: 0, col: 1 },
      oldEndPoint: { row: 0, col: 1 },
      newEndPoint: { row: 1, col: 1 },
    });
    expect(buffer.toString()).toBe("ax\nybc");
    expect(buffer.lenRows()).toBe(2);
    expect(buffer.byteToPoint(3)).toEqual({ row: 1, col: 0 });
    expect(buffer.pointToByte({ row: 1, col: 0 })).toBe(3);
  });

  it("deletes across a newline", () => {
    const buffer = Buffer.fromText("ab\ncd");
    const change = buffer.delete(1, 4);
    expect(buffer.toString()).toBe("ad");
    expect(change.edit.newEndPoint).toEqual({ row: 0, col: 1 });
    expect(buffer.lenRows()).toBe(1);
  });
});

describe("insert/delete invert", () => {
  it("restores bytes and points", () => {
    const original = "hello\nwoéld";
    const buffer = Buffer.fromText(original);
    const beforePoints = [0, 5, 6, buffer.lenBytes()].map((b) =>
      buffer.byteToPoint(b),
    );
    const change = buffer.replace(1, 5, "i\n");
    expect(buffer.toString()).not.toBe(original);
    buffer.apply(invertChange(change));
    expect(buffer.toString()).toBe(original);
    expect(buffer.lenBytes()).toBe(new TextEncoder().encode(original).length);
    expect([0, 5, 6, buffer.lenBytes()].map((b) => buffer.byteToPoint(b))).toEqual(
      beforePoints,
    );
  });

  it("inverts a multi-line insert", () => {
    const buffer = Buffer.fromText("abc");
    const change = buffer.insert(1, "x\ny");
    buffer.apply(invertChange(change));
    expect(buffer.toString()).toBe("abc");
    expect(buffer.byteToPoint(1)).toEqual({ row: 0, col: 1 });
    expect(buffer.lenRows()).toBe(1);
  });
});

describe("Edit.shift", () => {
  it("applies mark gravity", () => {
    const buffer = Buffer.fromText("abcdef");
    const change = buffer.replace(2, 4, "XYZ");
    expect(shift(change.edit, 0)).toBe(0);
    expect(shift(change.edit, 2)).toBe(2);
    expect(shift(change.edit, 3)).toBe(2);
    expect(shift(change.edit, 4)).toBe(5);
    expect(shift(change.edit, 5)).toBe(6);
  });
});

describe("flatten policy", () => {
  it("stays correct after many small inserts", () => {
    const buffer = new Buffer();
    let expected = "";
    for (let i = 0; i < 600; i++) {
      const ch = String.fromCharCode(97 + (i % 26));
      buffer.insert(buffer.lenBytes(), ch);
      expected += ch;
    }
    expect(buffer.toString()).toBe(expected);
    expect(buffer.lenBytes()).toBe(600);
    expect(buffer.byteToPoint(600)).toEqual({ row: 0, col: 600 });
  });

  it("flattens a whole-buffer replace", () => {
    const buffer = Buffer.fromText("old\ntext");
    buffer.replace(0, buffer.lenBytes(), "new\nvalue\n");
    expect(buffer.toString()).toBe("new\nvalue\n");
    expect(buffer.lenRows()).toBe(3);
    expect(buffer.rowText(1)).toBe("value");
  });
});
