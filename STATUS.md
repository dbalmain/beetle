# Beetle status

Orchestrator progress. Isolation none. Do not push.
Do not tick `/home/dave/w/vici/FEATURES.txt`.

## Phases

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Contract package
- [x] Phase 2 — WASM wrapper
- [x] Phase 3 — WASM is the oracle
- [x] Phase 4 — Idiomatic TypeScript engine
  - [x] 4a — Key notation + UTF-8 piece table + Edit/Point + undo
  - [x] 4b — Engine skeleton: typeKeys/handleKey, Normal/Insert/Replace, hjkl0^$, insert entries, x, undo/redo
  - [x] 4c — Counts, operators d c y > <, doubles, visual, p P J r ~
  - [x] 4d — Word/find/object/search/pair/paragraph/screen motions
  - [x] 4e — Surround, marks, jumps, macros, ., gu gU g~, remaining edges
- [x] Phase 5 — Fixture parity for TS
- [x] Phase 6 — Benchmarks and size
- [x] Phase 7 — README results + wrap
- [x] Phase 8 — JS speed: JS-string buffer, UTF-8 tax column, hot-path fixes

## Resume

Phase 8 is done. Shippable `createEngine` is a JS-string buffer (UTF-8
public offsets). `@beetle/vici-js/utf8` is the piece table for the tax
column. Both pass 411/411. JS is 12.9 KiB brotli and faster than WASM
on the bulk ASCII benches; `edit-session` is still ~9× for WASM.
Do not push.

## Phase 0 done-note

**What landed.** Git repo at `/home/dave/w/beetle`. npm workspaces
(`packages/*`) and a Cargo workspace (`crates/vici-wasm` only — vici is not
a member). Stub packages `@beetle/contract`, `@beetle/vici-wasm`,
`@beetle/vici-js`, `@beetle/bench`. Stub crate `vici-wasm` (`cdylib`, no
wasm-bindgen, no vici path-dep). `rust-toolchain.toml` asks for stable +
`wasm32-unknown-unknown`. README leads with Beetle / VW = Vim Web.
`fixtures/editor.vici` is a relative symlink to the sibling vici oracle.
`fixtures/editor_cases.snap` is a copy of the insta snap with the YAML
prelude stripped; 411 case blocks, body matches character-for-character.
`reports/` is empty (`.gitkeep`). Root scripts `test` / `bench` /
`build:wasm` fail with a clear "not yet" message.

**Gates.** `git init` + first commit. `test -e fixtures/editor.vici`.
411 `== name ==` blocks in the snap. `npm install` at root. `cargo
metadata` and `cargo check -p vici-wasm` (host and
`wasm32-unknown-unknown`). `cargo fmt --all --check`. README names Beetle
/ VW = Vim Web and the tree has no "Volkswagen".

**Leftover risk.** `wasm-pack` and `wasm-opt` are not on PATH — phase 2
must install or otherwise obtain them; do not paper over that in phase 1.
`rustup` is not installed; `rust-toolchain.toml` is advisory. The Nix
`rustc` 1.95 already has `wasm32-unknown-unknown` std, so the target
itself is not a blocker on this machine. No TypeScript / vitest deps yet
— phase 1 adds those with the contract package.

## Phase 1 done-note

**What landed.** `@beetle/contract` is the shared façade: `Engine`,
`Effect`, `Key` / `KeyCode` / `Mods`, plus `parseCases` /
`parseSettings` / `unescape` / `validName` (ported from
`vici/crates/vici/tests/editor_cases.rs`) and `renderCase` /
`renderEffect` / `rustDebugString` (Rust `Debug` strings, not JSON).
Source under `packages/contract/src/{types,parse,render,index}.ts`.
Root `npm test` runs `tsc --noEmit -p packages/contract` then vitest.
README how-to no longer says tests are "not yet".

**Gates.** `npm test` green: typecheck clean; 17 vitest tests, including
411 unique kebab-case cases from `fixtures/editor.vici`.

**Leftover risk.** Snapshot renderer is implemented but not proven
against `fixtures/editor_cases.snap` — that is phase 3, once WASM can
feed a real `Engine`. `rustDebugString` uses JS Unicode properties
(`Grapheme_Extend`, `White_Space`, …); a Unicode-version skew vs Rust
would only show up on exotic code points the current fixtures do not
exercise. `keys()` / `render()` stay in phase 4a. `wasm-pack` /
`wasm-opt` still not on PATH.

## Phase 2 done-note

**What landed.** `crates/vici-wasm` is a wasm-bindgen class over
`vici::Editor` (path-dep `../../../vici/crates/vici`). Methods map onto
the TypeScript `Engine`. `type_keys` stays in Rust. `run_case` copies
vici's `render_case` / `render_effect` so snapshot `Debug` strings cannot
drift. Effects cross the ABI as JSON and are rebuilt in
`@beetle/vici-wasm`. `Editor` clone and `Buffer::rope` are not exported.
`packages/vici-wasm` is a thin `WasmEngine` / `createWasmEngine` /
`runCase` wrapper. Release profile is `opt-level=3` + LTO; `release-size`
(`opt-level=z`) exists for phase 6. `npm run build:wasm` writes
`packages/vici-wasm/pkg/` (gitignored). `npm run test:wasm` is the
README smoke; `npm test` stays contract-only.

**How wasm is built (no rustup).** Nix `rustc` 1.95 already has
`wasm32-unknown-unknown` std. `wasm-pack` wants rustup, so the script is
`cargo build --target wasm32-unknown-unknown --release` then
`wasm-bindgen --target nodejs` (crate pinned to CLI 0.2.121). Missing
tools come from an ephemeral
`nix shell nixpkgs#wasm-bindgen-cli nixpkgs#lld nixpkgs#binaryen` —
Nix rustc links wasm with `lld -flavor wasm` and does not ship
`rust-lld`. Glue is renamed to `vici_wasm.cjs` because the package is
ESM. Speed build is `wasm-opt -O3`'d. Do not `nix profile install`.

**simd.** On. `cargo check -p vici-wasm --target wasm32-unknown-unknown`
accepted ropey's `simd` feature. vici was not touched. `FEATURES.txt`
was not ticked.

**Gates.** `cargo fmt --all --check`. `cargo clippy --workspace
--all-targets -- -D warnings`. `cargo test --workspace` (6 host unit
tests, including two snapshot blocks that match
`fixtures/editor_cases.snap`). `npm run build:wasm` produced a loadable
nodejs artefact. `npm run test:wasm` green (README
`cwSELECT<Esc>` smoke). `npm test` still 17 contract tests, typecheck
clean.

**Leftover risk.** Full 411-case snap is phase 3. Host tests cannot
construct `JsError` (wasm-bindgen imported fn); parse errors are
checked via `run_case_inner`. wasm-bindgen string crossing still copies
UTF-8 ↔ UTF-16 on every `text()` / `typeKeys` — bulk benches must not
call `text()` per iteration. Size-opt artefact is phase 6.

## Phase 3 done-note

**What landed.** `packages/vici-wasm/test/fixtures.test.ts` parses all
411 `editor.vici` cases via `@beetle/contract` `parseCases` and runs
each through Rust `run_case` (`runCase` in `@beetle/vici-wasm`). The
concatenated blocks match `fixtures/editor_cases.snap`
character-for-character. No wrapper or Rust renderer change was
needed: every case already matched. The only snap-file difference is
insta collapsing the last `render_case` blank line to a single POSIX
newline; the test applies that same trim. `npm run test:wasm` is now
the 411-case gate. Root `npm test` stays contract-only and does not
rebuild wasm. `vici-js` was not started.

**Gates.** `npm run test:wasm` green (tsc + vitest: smoke + 411-case
snap). `npm test` green (17 contract tests, typecheck clean). Rust
untouched, so cargo fmt/clippy/test were not re-run.

**Leftover risk.** The JS `renderCase` path is still only unit-tested
against a fake engine, not the live `WasmEngine`. Phase 5 will need
that when `vici-js` is the subject. wasm-bindgen string copies and
the size-opt artefact are unchanged.

## Phase 4a done-note

**What landed.** `@beetle/vici-js` now has the three prescribed
structures (not a file-for-file vici port):

- `src/key.ts` — `keys` / `key` / `render` plus `makeKey` (SHIFT+char
  is ASCII-uppercase, SHIFT dropped; `<S-Tab>` keeps SHIFT). Types
  are `@beetle/contract`'s `Key` / `KeyCode` / `Mods`.
- `src/buffer.ts` — UTF-8 piece table. Public offsets are UTF-8
  bytes; `Point.col` is a byte offset in the row. LF rows, `\r` is
  content, trailing newline ⇒ phantom empty row, empty buffer has
  one row.
- `src/edit.ts` — `shift` / `invert*` / `advance` (new col after `\n`
  is measured from the last newline).
- `src/history.ts` + `src/document.ts` — self-inverting `Change`s,
  nested groups are one step, new change truncates redo, noops are
  not recorded, optional limit.

**Flatten policy.** Collapse to a single original piece when the
piece count exceeds 512, or after a whole-buffer replace.

**Gates.** `npm test` green: `tsc --noEmit` on contract + vici-js;
64 vitest tests (17 contract + 47 vici-js). No wasm rebuild.

**Leftover risk.** `render(keys("<C-gt>"))` is `<C->>`, which does
not parse (vici Display quirk; write `<C-gt>` in scripts). No
Engine / modes / operators yet (4b). Unicode case mapping (`ß` →
`SS`) is 4e; graphemes are 4d. Flatten threshold is unmeasured
against the 1 MiB benches.

## Phase 4b done-note

**What landed.** `@beetle/vici-js` implements `Engine` (`JsEngine` /
`createEngine`) as a single `handleKey` dispatcher — Normal vs
Insert/Replace — not a Pending/Keymap/Editor::run port. Reuses 4a's
Buffer / Document / keys / `renderCase`.

- Modes: Normal, Insert, Replace. Operator-pending is not a mode.
- Motions: `h j k l 0 ^ $` with counts; `$` is sticky.
- Six insert entries, insert typing (`<CR>` `<BS>` `<C-w>` `<Esc>`),
  Replace `R`, `x`/`<Del>`/`X`, `u`/`<C-r>`.
- Graphemes via `Intl.Segmenter`. Insert session is one undo group.
- `dd` only (so `undo-delete` / `redo-delete` restore text + caret).
  No `d`/`c`/`y`/`>`/`<` motions, no visual, no `.`.

**Fixtures.** All 32 allowlist cases match `editor_cases.snap` via
`renderCase`. README smoke is `iSELECT <Esc>` (no `cw`). None skipped.

**Gates.** `npm test` green: `tsc --noEmit` on contract + vici-js;
97 vitest tests (17 contract + 47 4a + 33 4b). No wasm rebuild.

**Leftover risk.** `dd` is a special-case double, not a general
operator grammar — 4c must replace it. `2d` stays pending and is
not in the allowlist. `Intl.Segmenter` vs `unicode-segmentation`
is untested on combining-mark fixtures (none in 4b). Indent /
viewport are stored but unused until 4c.

## Phase 4c done-note

**What landed.** The 4b `dd` special case is a real operator
grammar on the same single dispatcher. Prefix × motion counts
multiply (`2d3j` → 6); `None` vs `Some(1)` is load-bearing for
`G`/`gg`/`1G`. Doubles `dd`/`cc`/`yy`/`>>`/`<<` are linewise on
the current row. Motions this slice: `h j k l 0 ^ $ G gg`. `$`
is inclusive; `j`/`k`/`G`/`gg` are linewise. Visual `v`/`V`
toggle or switch; selection includes the character under the
cursor; visual `d c y > <` act on it. `p`/`P` honour the
register's linewise flag; `J` joins (count is rows, default 2);
`r{char}` and `~` take a count; `:` emits `CommandPrompt`.
`D`/`C` are `d$`/`c$`. Change-session is one undo group. Last-row
`dd` still eats the previous `\n`.

**Fixtures.** 167 allowlist cases match `editor_cases.snap` via
`renderCase` (32 from 4b + 135 new). Dropped three that need 4d
`w`: `change-session-undo` (`cw`), `delete-end-command` (`wD`),
`change-end-command` (`wC`). No `cw` README smoke — left for 4d.

**Gates.** `npm test` green: `tsc --noEmit` on contract + vici-js;
232 vitest tests (17 contract + 47 4a + 168 4b/4c fixtures).
No wasm rebuild.

**Leftover risk.** Last-row newline and count multiplication are
the easy places to regress (covered by the linewise matrix and
`2dd`/`d3j`/`2D`, but `2d3j` itself is not a named case). `~`
uses JS case mapping; `ß` → `SS` is 4e. No word/find/object
motions, no `.` / surround / marks / macros.

## Phase 4d done-note

**What landed.** Word / find / object / search / pair / paragraph
/ screen motions on the existing 4c dispatcher. Outcomes copied
from vici `motion.rs` / `editor.rs` / `command.rs`:

- `w W b B e E` — three classes (Blank / Word=alnum+`_` / Punct);
  big WORD collapses Word+Punct. Walk Unicode scalar values, then
  `clamp` snaps to a grapheme (`word-end-over-flag`).
- `cw` ≡ `ce` (do not swallow the trailing space).
- `f F t T ; ,` — row-local find; `;` repeats, `,` reverses;
  forward f/t inclusive, backward F/T exclusive.
- `iw aw iW aW` plus delimited / quoted objects (`i(`/`a(`/`ib`/
  `i{`/`i"` / …). Inner-block row shrink copied. Seek + count
  climb/descend as in `pair_at_level`.
- `/` `?` `n` `N` — literal search, smartcase, wrap, count.
  Missing pattern bells. `/` prompt is transient pending input
  (backspace edits the shown keys).
- `%` pair on the row (brackets first, else quote). Inclusive
  both ways.
- `{` `}` paragraph (next/previous blank row). Exclusive.
- `H M L` from host Viewport; `<C-d>` `<C-u>` `<C-f>` `<C-b>`
  `zz` `zt` `zb` scroll effects. Zero-height viewport bells /
  emits scroll without moving.
- `<C-o>` / `<C-i>` jump navigation (the list already existed)
  so `search-pushes-jump` can return. Named marks stay 4e.

**Fixtures.** 269 allowlist cases match `editor_cases.snap` via
`renderCase` (167 from 4b/4c + 102 new). README smoke is
`cwSELECT<Esc>`. Dropped from the search family:
`search-dot-operator` (needs `.`) and `search-in-macro` (needs
macros) — both 4e. No other listed case was dropped.

**Gates.** `npm test` green: `tsc --noEmit` on contract +
vici-js; 334 vitest tests (17 contract + 47 4a + 270 4b/4c/4d
fixtures). No wasm rebuild.

**Leftover risk.** `Intl.Segmenter` vs `unicode-segmentation`
is now exercised (`combining-grapheme-delete`,
`word-end-over-flag`, `search-multibyte`) and matches these
snaps; ZWJ / flag-as-one-grapheme elsewhere could still
diverge. Smartcase uses JS `toLowerCase` / "has a lowercase
mapping" rather than Rust `is_uppercase`; ASCII + `日本` is
what the suite hits. `cw`≡`ce` is a Change-only rewrite of
`w`/`W`. Jump *navigation* is in; `'a` / `` `a `` / surround /
macros / `.` / `gu` `gU` `g~` are 4e.

## Phase 4e done-note

**What landed.** The remaining editor surface on the same dispatcher.
Outcomes copied from vici `editor.rs` / `keymap.rs` / `pending.rs`:

- `gu` `gU` `g~` (and visual `u` `U` `~`) over motions / objects /
  current-row / visual. They do not fill the register. Recase is an
  explicit mapper (`src/case.ts`) matching Rust `char::to_uppercase` /
  `to_lowercase` / one-to-one `swap_case` — not JS `toUpperCase`.
  `ß` → `SS`. Doubled `gUU` / `gUgU` / `guu` / `g~~`.
- `.` stores and replays **keys**. `3.` replays the whole script three
  times. Visual `.` prepends the keys that shaped the selection.
  `MAX_REPLAY_DEPTH = 64`, shared with macros.
- `q{reg}` / `q` macros. Closing `q` is not recorded. `@a` replays
  keys with count. Self-referential macros stop at depth 64.
- User marks `a–z`; `` `a `` exact, `'a` first-non-blank. Auto `'<`
  `'>` `'[` `']` `'^`. `''` / ```` toggle the last jump. Gravity via
  `Edit.shift`; deleted offsets collapse. Jump list cap 100.
- Surround: `cs` / `ds` / visual `S`. Opening delimiter pads, closing
  does not. `ys` stays unbound. Undo is one step.

**Fixtures.** 411 allowlist cases match `editor_cases.snap` via
`renderCase` (269 from 4b–4d + 142 remaining, including leftover
`put-after-multibyte-yank` / `put-before-multibyte-yank` /
`paragraph-jump`). None skipped. The last snap block
(`surround-leaves-register-untouched`) needs the same insta trailing-
newline trim as phase 3 — engine output is a blank line; insta
collapsed it.

**Gates.** `npm test` green: `tsc --noEmit` on contract + vici-js;
all 411 fixture cases plus 4a unit tests. No wasm rebuild.

**Leftover risk.** Case mapper covers SpecialCasing one-to-many, ASCII,
Latin-1, and Latin Extended-A even/odd pairs. Full Unicode Simple
mapping is not vendored; a scalar outside that set stays unchanged.
`Intl.Segmenter` vs `unicode-segmentation` is still the only other
known skew (none of the 411 disagree).

## Phase 5 done-note

**What landed.** Harness-only. `packages/vici-js/test/fixtures.test.ts`
iterates every `parseCases(fixtures/editor.vici)` case — no allowlist,
no skip list. Each `renderCase` block matches the corresponding
`== name ==` snap block (same insta trailing-newline trim as phase 3).
A length assert pins `parseCases(...).length === 411`. A second test
concatenates all rendered blocks and compares to the whole snap. No
4e scratch (`remaining.json` / `remaining.test.ts`) was left to delete.
Engine code unchanged.

**Gates.** `npm test` green: `tsc --noEmit` on contract + vici-js;
411/411 fixture cases plus concat + smoke + 4a unit tests. No wasm
rebuild.

**Leftover risk.** Same as 4e: case mapper is not a full Unicode Simple
table; `Intl.Segmenter` vs `unicode-segmentation` could still diverge
on ZWJ / flags not in this suite. None of the 411 disagree.

## Phase 6 done-note

**What landed.** `npm run bench` drives both engines on the same scripts
(bulk `typeKeys` × per-key `handleKey` via `keys()`), writes
`reports/bench.md` + `reports/bench.json`, weighs speed wasm / size wasm /
glue / minified `vici-js` into `reports/size.md` (+ `size.json`). Size
build is `scripts/build-wasm.sh --size` → `packages/vici-wasm/pkg-size/`
(`opt-level=z`, `wasm-opt -Oz`), kept off the speed `pkg/` benches use.
Cold start is a fresh Node process (`await import()` + first constructor),
not mixed into hot benches. `setText` is untimed; `text()` is never called
in the hot loop. JS search was accidental O(n²) (`byteToJs` + tail `slice`
per grapheme); one-pass scan so the prescribed 100 KiB `/needle` finishes.
Search fixtures still match.

**Reproduce.** From the repo root: `npm run bench`. Missing wasm artefacts
are built first. Node / V8 only (`--expose-gc`). Reports are the artefact.

**Headline.** Node v24.18.1, Ryzen 9 9955HX, simd on. WASM insert-1k
84 ms vs JS 1.47 s; words-1m `50w50b` 137 µs vs 881 µs; 100 KiB search
27 ms vs 367 ms; 200× `dw` 7.9 ms vs 156 ms. Cold start: wasm 47 ms, js
89 ms. Speed wasm 273.5 KiB (83 KiB brotli); size wasm 229.4 KiB
(76 KiB brotli); vici-js minify ESM 47.3 KiB (12.6 KiB brotli).

**Gates.** `npm run bench` wrote the three report files. Numbers are
nonzero, both engines present, p50 ≤ p95, 1 MiB did not OOM. README
links the reports. `npm test` green after the search fix (478 tests).

**Leftover risk.** Piece-table flatten (512 / whole-buffer replace) still
shapes large-edit numbers. wasm-bindgen copies the script and serializes
effects on every `typeKeys` / `handleKey`. V8-only. JS search still
`toString()`s the buffer each time. Phase 7 writes the comparison essay.

## Phase 7 done-note

**What landed.** README is the results front page: Beetle / VW = Vim Web,
411/411 on both engines, bulk-p50 speed highlights and size from the
Phase 6 reports (Node v24.18.1, Ryzen 9 9955HX, simd on), how to
reproduce (no rustup / ephemeral nix-shell), and the comparison
caveats. STATUS.md marks every phase done.

**Gates.** Numbers copied from `reports/bench.md`
(2026-08-13T12:41:43.673Z) and `reports/size.md`
(2026-08-13T12:39:01.461Z); benches were not re-run. No vici edits.
`FEATURES.txt` not ticked.

**Leftover risk.** Same as Phase 6: piece-table flatten, wasm-bindgen
copies, V8-only, incomplete Unicode case table, no native-Rust column.
None of those block the write-up.

## Phase 8 done-note

**What landed.** Shippable `createEngine` stores a JS string (`JsBuffer`)
with UTF-8 public offsets and an ASCII identity fast path. The UTF-8
piece table moved to `@beetle/vici-js/utf8` (`createUtf8Engine`) so the
minify bundle does not include both. Shared hot-path fixes: incremental
ASCII sticky, `indexOf` search, ASCII `charAt` / grapheme boundaries,
piece-table coalesce + finger + in-place add-buffer grow. Both storages
are 411/411.

**Headline (Node v24.18.1 / 9955HX).** insert-1k 1.47 s → 8.7 ms;
search 367 ms → 795 µs. JS-string beats WASM on the bulk ASCII benches;
`edit-session` is still 2.11 ms vs 244 µs. UTF-8 tax is ~20% on
insert/words/delete, ~4× on undo-storm. Size 47.9 / 12.9 KiB brotli.

**Gates.** `npm test` green (492+). `npm run bench` wrote reports.
README updated. No vici edits. Not pushed.
