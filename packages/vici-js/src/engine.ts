// Single-dispatcher Engine. Matches vici outcomes for 4b (modes, hjkl0^$,
// the six insert entries, replace, x/X, undo/redo). `dd` is the only
// operator double, so the undo-delete fixtures can restore a caret.

import type {
  Edit,
  Effect,
  Engine,
  Indent,
  Key,
  Mode,
  Point,
  Viewport,
} from "@beetle/contract";
import { Mods } from "@beetle/contract";

import { shift } from "./edit.js";
import { Document } from "./document.js";
import { asDigit, asText, keys, render } from "./key.js";
import {
  STICKY_END,
  clamp,
  firstNonBlank,
  graphemeCol,
  resolve,
  rowSpan,
  type Bound,
  type Motion,
} from "./motion.js";

const DEFAULT_INDENT: Indent = {
  shiftWidth: 4,
  tabWidth: 8,
  useTabs: false,
};

type ChangeKind =
  | "enterInsert"
  | "enterReplace"
  | "enterNormal"
  | "deleteChar"
  | "deleteRow"
  | "other";

export class JsEngine implements Engine {
  #doc: Document;
  #indent: Indent = { ...DEFAULT_INDENT };
  #viewport: Viewport = { topRow: 0, height: 0 };
  #mode: Mode = "Normal";
  #cursor = 0;
  #sticky = 0;
  #register = { text: "", linewise: false };
  #marks = new Map<string, number>();
  #jumps: number[] = [];
  #pending: Key[] = [];
  #count: number | undefined;
  #operator: "delete" | undefined;
  #lastChange: Key[] = [];
  #changeKeys: Key[] | null = null;
  #insertGroup = false;

  constructor(text = "") {
    this.#doc = Document.fromText(text);
  }

  static fromText(text: string): JsEngine {
    return new JsEngine(text);
  }

  typeKeys(spec: string): Effect[] {
    const effects: Effect[] = [];
    for (const key of keys(spec)) {
      effects.push(...this.handleKey(key));
    }
    return effects;
  }

  handleKey(key: Key): Effect[] {
    if (this.#changeKeys !== null) {
      this.#changeKeys.push(key);
    }
    if (this.#mode === "Insert" || this.#mode === "Replace") {
      return this.#handleInsert(key);
    }
    return this.#handleNormal(key);
  }

  setText(text: string): void {
    this.#doc = Document.fromText(text);
    this.#cursor = 0;
    this.#sticky = 0;
    this.#mode = "Normal";
    this.#register = { text: "", linewise: false };
    this.#marks.clear();
    this.#jumps = [];
    this.#resetPending();
    this.#lastChange = [];
    this.#changeKeys = null;
    this.#insertGroup = false;
  }

  setIndent(indent: Indent): void {
    this.#indent = indent;
  }

  setViewport(viewport: Viewport): void {
    this.#viewport = viewport;
  }

  text(): string {
    return this.#doc.toString();
  }

  cursor(): number {
    return this.#cursor;
  }

  cursorPoint(): Point {
    return this.#buffer().byteToPoint(this.#cursor);
  }

  mode(): Mode {
    return this.#mode;
  }

  selection(): { start: number; end: number } | null {
    return null;
  }

  register(): { text: string; linewise: boolean } {
    return { text: this.#register.text, linewise: this.#register.linewise };
  }

  undoDepth(): number {
    return this.#doc.undoDepth();
  }

  redoDepth(): number {
    return this.#doc.redoDepth();
  }

  jumps(): number[] {
    return this.#jumps.slice();
  }

  marks(): { name: string; offset: number }[] {
    return [...this.#marks.entries()].map(([name, offset]) => ({
      name,
      offset,
    }));
  }

  pending(): string {
    return render(this.#pending);
  }

  lastChange(): string {
    return render(this.#lastChange);
  }

  recording(): string | null {
    return null;
  }

  #buffer() {
    return this.#doc.buffer;
  }

  #bound(): Bound {
    return this.#mode === "Insert" || this.#mode === "Replace"
      ? "PastEnd"
      : "OnChar";
  }

  #handleInsert(key: Key): Effect[] {
    if (isCode(key, "Esc") || isCtrl(key, "c")) {
      return this.#run("enterNormal", [], (effects) => this.#enterNormal(effects));
    }
    if (isCode(key, "Enter")) {
      return this.#run("other", [], (effects) => this.#insertNewline(effects));
    }
    if (isCode(key, "Backspace")) {
      return this.#run("other", [], (effects) => this.#deleteBack(effects));
    }
    if (isCtrl(key, "w")) {
      return this.#run("other", [], (effects) => this.#deleteWordBack(effects));
    }
    if (isCode(key, "Tab")) {
      return this.#run("other", [], (effects) => this.#insertText("\t", effects));
    }
    const motion = insertMotion(key);
    if (motion !== undefined) {
      return this.#run("other", [], (effects) =>
        this.#move(motion, 1, effects),
      );
    }
    const ch = asText(key);
    if (ch !== undefined) {
      return this.#run("other", [], (effects) => this.#insertText(ch, effects));
    }
    return [{ type: "Bell" }];
  }

  #handleNormal(key: Key): Effect[] {
    if (isCode(key, "Esc") && !this.#isIdle()) {
      this.#resetPending();
      return [];
    }

    const digit = asDigit(key);
    if (digit !== undefined && !(digit === 0 && this.#count === undefined)) {
      this.#pending.push(key);
      this.#count = (this.#count ?? 0) * 10 + digit;
      return [];
    }

    this.#pending.push(key);

    if (this.#operator === "delete") {
      if (asText(key) === "d") {
        const count = this.#count;
        const consumed = this.#takePending();
        return this.#run("deleteRow", consumed, (effects) =>
          this.#deleteRow(count ?? 1, effects),
        );
      }
      this.#resetPending();
      return [{ type: "Bell" }];
    }

    const motion = normalMotion(key);
    if (motion !== undefined) {
      const count = this.#count;
      const consumed = this.#takePending();
      return this.#run("other", consumed, (effects) =>
        this.#move(motion, count ?? 1, effects),
      );
    }

    const insertAt = insertEntry(key);
    if (insertAt !== undefined) {
      const consumed = this.#takePending();
      return this.#run("enterInsert", consumed, (effects) =>
        this.#enterInsert(insertAt, effects),
      );
    }

    if (asText(key) === "R") {
      const consumed = this.#takePending();
      return this.#run("enterReplace", consumed, (effects) => {
        this.#openInsertGroup();
        this.#setMode("Replace", effects);
      });
    }

    if (asText(key) === "x" || isCode(key, "Delete")) {
      const count = this.#count;
      const consumed = this.#takePending();
      return this.#run("deleteChar", consumed, (effects) =>
        this.#deleteChar(false, count ?? 1, effects),
      );
    }

    if (asText(key) === "X") {
      const count = this.#count;
      const consumed = this.#takePending();
      return this.#run("deleteChar", consumed, (effects) =>
        this.#deleteChar(true, count ?? 1, effects),
      );
    }

    if (asText(key) === "u") {
      const consumed = this.#takePending();
      return this.#run("other", consumed, (effects) => this.#undo(effects));
    }

    if (isCtrl(key, "r")) {
      const consumed = this.#takePending();
      return this.#run("other", consumed, (effects) => this.#redo(effects));
    }

    if (isCode(key, "Esc")) {
      const consumed = this.#takePending();
      return this.#run("enterNormal", consumed, (effects) =>
        this.#enterNormal(effects),
      );
    }

    if (asText(key) === "d") {
      this.#operator = "delete";
      return [];
    }

    this.#resetPending();
    return [{ type: "Bell" }];
  }

  #run(
    kind: ChangeKind,
    consumed: readonly Key[],
    body: (effects: Effect[]) => void,
  ): Effect[] {
    const before = this.#cursor;
    this.#doc.history.beginGroup(before);
    const effects: Effect[] = [];
    body(effects);
    this.#rememberChange(effects);
    this.#doc.history.endGroup(this.#cursor);
    this.#noteChange(kind, consumed);
    return effects;
  }

  #noteChange(kind: ChangeKind, consumed: readonly Key[]): void {
    const script = consumed.slice();
    switch (kind) {
      case "enterInsert":
      case "enterReplace":
        this.#changeKeys = script;
        break;
      case "enterNormal":
        if (this.#changeKeys !== null) {
          this.#lastChange = this.#changeKeys;
          this.#changeKeys = null;
        }
        break;
      case "deleteChar":
      case "deleteRow":
        if (this.#changeKeys === null) {
          this.#lastChange = script;
        }
        break;
      default:
        break;
    }
  }

  #move(motion: Motion, count: number, _effects: Effect[]): void {
    const landed = resolve(
      this.#buffer(),
      this.#cursor,
      motion,
      count,
      this.#sticky,
      this.#bound(),
    );
    this.#cursor = landed;
    this.#updateSticky(motion);
  }

  #enterInsert(at: InsertAt, effects: Effect[]): void {
    this.#openInsertGroup();
    switch (at) {
      case "Cursor":
        break;
      case "After":
        this.#cursor = this.#step("Right", 1, "PastEnd");
        break;
      case "FirstNonBlank":
        this.#cursor = this.#step("FirstNonBlank", 1, "OnChar");
        break;
      case "EndOfRow":
        this.#cursor = this.#buffer().rowContentRange(this.cursorPoint().row).end;
        break;
      case "RowBelow": {
        const end = this.#buffer().rowContentRange(this.cursorPoint().row).end;
        this.#edit(end, end, "\n", effects);
        this.#cursor = end + 1;
        break;
      }
      case "RowAbove": {
        const start = this.#buffer().rowRange(this.cursorPoint().row).start;
        this.#edit(start, start, "\n", effects);
        this.#cursor = start;
        break;
      }
    }
    this.#setMode("Insert", effects);
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #enterNormal(effects: Effect[]): void {
    const leavingInsert = this.#mode === "Insert" || this.#mode === "Replace";
    this.#closeInsertGroup();
    if (leavingInsert) {
      this.#cursor = this.#step("Left", 1, "PastEnd");
      this.#setMark("^", this.#cursor);
    }
    this.#setMode("Normal", effects);
    if (leavingInsert) {
      this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
    }
  }

  #insertText(text: string, effects: Effect[]): void {
    if (this.#mode === "Replace") {
      const end = this.#step("Right", 1, "PastEnd");
      this.#edit(this.#cursor, end, text, effects);
    } else {
      this.#edit(this.#cursor, this.#cursor, text, effects);
    }
    this.#cursor += utf8Len(text);
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #insertNewline(effects: Effect[]): void {
    this.#edit(this.#cursor, this.#cursor, "\n", effects);
    this.#cursor += 1;
    this.#sticky = 0;
  }

  #deleteBack(effects: Effect[]): void {
    const start = this.#prevPosition();
    if (start === this.#cursor) {
      effects.push({ type: "Bell" });
      return;
    }
    this.#edit(start, this.#cursor, "", effects);
    this.#cursor = start;
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #deleteWordBack(effects: Effect[]): void {
    const start = resolve(
      this.#buffer(),
      this.#cursor,
      "WordBackward",
      1,
      this.#sticky,
      "PastEnd",
    );
    if (start >= this.#cursor) {
      effects.push({ type: "Bell" });
      return;
    }
    this.#edit(start, this.#cursor, "", effects);
    this.#cursor = start;
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #deleteChar(before: boolean, repeat: number, effects: Effect[]): void {
    const range = before
      ? { start: this.#step("Left", repeat, "OnChar"), end: this.#cursor }
      : { start: this.#cursor, end: this.#step("Right", repeat, "PastEnd") };
    if (range.start === range.end) {
      effects.push({ type: "Bell" });
      return;
    }
    this.#yankChars(range.start, range.end);
    this.#edit(range.start, range.end, "", effects);
    this.#placeCursor(range.start);
  }

  #deleteRow(repeat: number, effects: Effect[]): void {
    const buffer = this.#buffer();
    const first = this.cursorPoint().row;
    const last = Math.min(first + Math.max(1, repeat) - 1, buffer.lenRows() - 1);
    const span = rowSpan(buffer, first, last);
    const home = buffer.rowContentRange(first).start;
    this.#yankLines(first, last);
    this.#edit(span.start, span.end, "", effects);
    this.#cursor = clamp(this.#buffer(), home, this.#bound());
    this.#cursor = firstNonBlank(this.#buffer(), this.cursorPoint().row);
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #undo(effects: Effect[]): void {
    this.#revert(this.#doc.undo(), effects);
  }

  #redo(effects: Effect[]): void {
    this.#revert(this.#doc.redo(), effects);
  }

  #revert(
    step: { changes: { edit: Edit }[]; cursor?: number },
    effects: Effect[],
  ): void {
    if (step.changes.length === 0) {
      effects.push({ type: "Bell" });
      return;
    }
    for (const change of step.changes) {
      this.#shiftPositions(change.edit);
      effects.push({ type: "Edit", edit: change.edit });
    }
    const last = step.changes[step.changes.length - 1];
    const at = step.cursor ?? last?.edit.startByte ?? 0;
    this.#placeCursor(at);
  }

  #edit(start: number, end: number, text: string, effects: Effect[]): void {
    if (start === end && text === "") {
      return;
    }
    const edit = this.#doc.replace(start, end, text);
    this.#shiftPositions(edit);
    effects.push({ type: "Edit", edit });
  }

  #setMode(mode: Mode, effects: Effect[]): void {
    if (this.#mode === mode) {
      return;
    }
    this.#mode = mode;
    this.#cursor = clamp(this.#buffer(), this.#cursor, this.#bound());
    effects.push({ type: "ModeChanged", mode });
  }

  #step(motion: Motion, times: number, bound: Bound): number {
    return resolve(
      this.#buffer(),
      this.#cursor,
      motion,
      times,
      this.#sticky,
      bound,
    );
  }

  #prevPosition(): number {
    const point = this.cursorPoint();
    if (point.col > 0) {
      return this.#step("Left", 1, "PastEnd");
    }
    if (point.row === 0) {
      return this.#cursor;
    }
    return this.#buffer().rowContentRange(point.row - 1).end;
  }

  #previousGrapheme(byte: number): number {
    const limited = Math.min(byte, this.#buffer().lenBytes());
    const point = this.#buffer().byteToPoint(limited);
    if (limited > 0 && point.col === 0) {
      return this.#buffer().rowContentRange(point.row - 1).end;
    }
    return resolve(
      this.#buffer(),
      limited,
      "Left",
      1,
      this.#sticky,
      "PastEnd",
    );
  }

  #placeCursor(byte: number): void {
    this.#cursor = clamp(this.#buffer(), byte, this.#bound());
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #updateSticky(motion: Motion): void {
    if (motion === "Up" || motion === "Down") {
      return;
    }
    if (motion === "LastColumn") {
      this.#sticky = STICKY_END;
      return;
    }
    this.#sticky = graphemeCol(this.#buffer(), this.#cursor);
  }

  #setMark(name: string, offset: number): void {
    this.#marks.set(name, offset);
  }

  #shiftPositions(edit: Edit): void {
    for (let i = 0; i < this.#jumps.length; i++) {
      this.#jumps[i] = shift(edit, this.#jumps[i] ?? 0);
    }
    for (const [name, offset] of this.#marks) {
      this.#marks.set(name, shift(edit, offset));
    }
  }

  #rememberChange(effects: readonly Effect[]): void {
    const edits: Edit[] = [];
    for (const effect of effects) {
      if (effect.type === "Edit") {
        edits.push(effect.edit);
      }
    }
    if (edits.length === 0) {
      return;
    }
    let start = Number.POSITIVE_INFINITY;
    let end = 0;
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      const later = edits.slice(i + 1);
      const editStart = later.reduce((offset, next) => shift(next, offset), edit.startByte);
      const editEnd = later.reduce((offset, next) => shift(next, offset), edit.newEndByte);
      start = Math.min(start, editStart);
      end = Math.max(end, editEnd);
    }
    this.#setMark("[", start);
    this.#setMark("]", this.#previousGrapheme(end));
  }

  #yankChars(start: number, end: number): void {
    this.#register = {
      text: this.#buffer().textIn(start, end),
      linewise: false,
    };
    this.#setMark("[", start);
    this.#setMark("]", this.#previousGrapheme(end));
  }

  #yankLines(first: number, last: number): void {
    const buffer = this.#buffer();
    const start = buffer.rowRange(first).start;
    const end = buffer.rowRange(last).end;
    let text = buffer.textIn(start, end);
    if (!text.endsWith("\n")) {
      text += "\n";
    }
    this.#register = { text, linewise: true };
    this.#setMark("[", start);
    this.#setMark("]", this.#previousGrapheme(end));
  }

  #openInsertGroup(): void {
    if (!this.#insertGroup) {
      this.#doc.history.beginGroup(this.#cursor);
      this.#insertGroup = true;
    }
  }

  #closeInsertGroup(): void {
    if (this.#insertGroup) {
      this.#doc.history.endGroup(this.#cursor);
      this.#insertGroup = false;
    }
  }

  #isIdle(): boolean {
    return this.#pending.length === 0 && this.#count === undefined && this.#operator === undefined;
  }

  #takePending(): Key[] {
    const consumed = this.#pending;
    this.#resetPending();
    return consumed;
  }

  #resetPending(): void {
    this.#pending = [];
    this.#count = undefined;
    this.#operator = undefined;
  }
}

export function createEngine(text = ""): JsEngine {
  return new JsEngine(text);
}

type InsertAt =
  | "Cursor"
  | "After"
  | "FirstNonBlank"
  | "EndOfRow"
  | "RowBelow"
  | "RowAbove";

function insertEntry(key: Key): InsertAt | undefined {
  switch (asText(key)) {
    case "i":
      return "Cursor";
    case "a":
      return "After";
    case "I":
      return "FirstNonBlank";
    case "A":
      return "EndOfRow";
    case "o":
      return "RowBelow";
    case "O":
      return "RowAbove";
    default:
      return undefined;
  }
}

function normalMotion(key: Key): Motion | undefined {
  const ch = asText(key);
  if (ch === "h") {
    return "Left";
  }
  if (ch === "l") {
    return "Right";
  }
  if (ch === "j") {
    return "Down";
  }
  if (ch === "k") {
    return "Up";
  }
  if (ch === "0") {
    return "FirstColumn";
  }
  if (ch === "^") {
    return "FirstNonBlank";
  }
  if (ch === "$") {
    return "LastColumn";
  }
  if (isCode(key, "Left")) {
    return "Left";
  }
  if (isCode(key, "Right")) {
    return "Right";
  }
  if (isCode(key, "Down")) {
    return "Down";
  }
  if (isCode(key, "Up")) {
    return "Up";
  }
  if (isCode(key, "Home")) {
    return "FirstColumn";
  }
  if (isCode(key, "End")) {
    return "LastColumn";
  }
  return undefined;
}

function insertMotion(key: Key): Motion | undefined {
  if (isCode(key, "Left")) {
    return "Left";
  }
  if (isCode(key, "Right")) {
    return "Right";
  }
  if (isCode(key, "Down")) {
    return "Down";
  }
  if (isCode(key, "Up")) {
    return "Up";
  }
  return undefined;
}

function isCode(key: Key, type: Key["code"]["type"]): boolean {
  return key.code.type === type && key.mods === Mods.NONE;
}

function isCtrl(key: Key, ch: string): boolean {
  return (
    key.code.type === "Char" &&
    key.code.char === ch &&
    key.mods === Mods.CTRL
  );
}

function utf8Len(text: string): number {
  return new TextEncoder().encode(text).length;
}
