# Beetle status

Orchestrator progress. After compact, read the plan and this file, then
resume at the first non-done phase. One writer at a time. Isolation none.
Do not push. Do not tick `/home/dave/w/vici/FEATURES.txt`.

## Phases

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Contract package
- [x] Phase 2 — WASM wrapper
- [x] Phase 3 — WASM is the oracle
- [ ] Phase 4 — Idiomatic TypeScript engine
  - [x] 4a — Key notation + UTF-8 piece table + Edit/Point + undo
  - [x] 4b — Engine skeleton: typeKeys/handleKey, Normal/Insert/Replace, hjkl0^$, insert entries, x, undo/redo
  - [x] 4c — Counts, operators d c y > <, doubles, visual, p P J r ~
  - [x] 4d — Word/find/object/search/pair/paragraph/screen motions
  - [ ] 4e — Surround, marks, jumps, macros, ., gu gU g~, remaining edges
- [ ] Phase 5 — Fixture parity for TS
- [ ] Phase 6 — Benchmarks and size
- [ ] Phase 7 — README results + wrap

## Resume

Read the compact-safe playbook at

`/home/dave/.grok/sessions/%2Fhome%2Fdave%2Fw%2Fbeetle/019ffa97-3d6c-7730-a423-600054622b16/plan.md`

and this file. Start at the first unchecked phase. Commit at each green
boundary. Write a done-note here (what landed, gates run, leftover risk) —
not a transcript.

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
