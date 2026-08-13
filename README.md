# Beetle — Vim Web

Beetle is named after the VW car. Here **VW = Vim Web**: a headless vi core
that runs on the web, as WASM and as TypeScript.

This repo is a sibling experiment next to the Rust editor
[`vici`](../vici). vici is the behavioural oracle. Beetle path-depends on
it; it does not change vici behaviour, and it does not publish-change the
vici tree.

Two engines implement the same TypeScript `Engine` façade:

1. **`vici-wasm`** — `vici::Editor` behind wasm-bindgen (ropey, simd on).
2. **`vici-js`** — an idiomatic TypeScript reimplementation
   (`Intl.Segmenter`). Default storage is a JS string with UTF-8 public
   offsets. `@beetle/vici-js/utf8` is the same engine on a UTF-8 piece
   table, kept so we can measure the UTF-8 tax.

Both storages pass all **411** `editor.vici` snapshot cases
character-for-character.

The shippable TypeScript engine is **12.9 KiB brotli**. After fixing
quadratic insert/search, it is faster than WASM on the bulk ASCII
workloads and about 9× slower on a short mixed `edit-session`. The UTF-8
piece table costs ~20% on most of those benches once the algorithms
match; it is not the reason the first scoreboard looked 15–20× off.

## Speed

Bulk `typeKeys` p50 on Node v24.18.1 / AMD Ryzen 9 9955HX / linux/x64 /
simd on. Generated 2026-08-13T20:41:06.480Z. Per-key `handleKey` and p95
live in [reports/bench.md](reports/bench.md).

| Workload | wasm | js | js-utf8 |
| --- | ---: | ---: | ---: |
| cold start | 46 ms | 92 ms | 91 ms |
| insert-1k | 83 ms | 8.7 ms | 11 ms |
| words-1m | 133 µs | 54 µs | 65 µs |
| delete-word | 7.8 ms | 3.0 ms | 3.5 ms |
| search | 27 ms | 795 µs | 754 µs |
| undo-storm | 24 ms | 3.1 ms | 14 ms |
| edit-session | 244 µs | 2.11 ms | 2.08 ms |

`js` is the shippable JS-string buffer. `js-utf8` is the piece table.
Cold start is a fresh Node process (`await import()` + first
constructor), not mixed into the hot benches.

The first JS numbers (insert-1k 1.47 s, search 367 ms) were
implementation bugs, not a language ceiling: every insert rescanned the
line with `Intl.Segmenter`, search walked every grapheme, and the piece
table never coalesced. Those are gone. What remains is:

- **UTF-8 tax** (`js` vs `js-utf8`): ~20% on insert/words/delete; ~4× on
  undo-storm and `ggdG`, where the piece table splits and flattens.
- **Engine tax** (`edit-session`): both JS storages sit at ~2 ms against
  WASM at 244 µs. That script is a handful of mixed commands, so the
  dispatcher dominates, not the buffer.
- **Search**: JS `indexOf` on an ASCII haystack vs vici's grapheme walk.
  The 34× gap is real and favours JS for literal ASCII search.

## Size

Generated 2026-08-13T20:40:28.678Z. Same Node / simd. Full raw / gzip /
brotli bytes in [reports/size.md](reports/size.md).

| Artifact | raw | brotli |
| --- | ---: | ---: |
| speed wasm (`opt-level=3`, `wasm-opt -O3`) | 273.5 KiB | 83.0 KiB |
| size wasm (`opt-level=z`, `wasm-opt -Oz`) | 229.4 KiB | 75.9 KiB |
| wasm glue (`vici_wasm.cjs`) | 14.1 KiB | 2.6 KiB |
| vici-js minify ESM | 47.9 KiB | 12.9 KiB |

Speed wasm is the binary the benches ran. Size wasm lives in
`packages/vici-wasm/pkg-size/` and is not loaded by tests or benches.
`vici-js` is `esbuild --bundle --minify --format=esm` of
`packages/vici-js/src/index.ts` (no contract parse/render, no piece
table). Web transfer is 12.9 KiB brotli / 14.3 KiB gzip — under the
20 KiB budget. The 47.9 KiB figure is uncompressed minify.

## How to reproduce

From the repo root (POSIX `sh`):

```sh
npm install
npm test              # typecheck contract + vici-js, vitest
npm run build:wasm    # cargo + wasm-bindgen → packages/vici-wasm/pkg
npm run test:wasm     # wasm smoke + 411-case snap (needs build:wasm first)
npm run bench         # speed + size → reports/bench.md, reports/size.md
```

`npm run build:wasm -- --size` writes the size-opt artefact to
`packages/vici-wasm/pkg-size/` (`opt-level=z` / `wasm-opt -Oz`) so it
cannot swap the speed `pkg/` benches use.

`npm test` is the contract suite plus vici-js (411-case snap and unit
tests). `test:wasm` is separate so that run does not rebuild the artefact.
`npm run bench` builds missing wasm artefacts, weighs them, then times
wasm, the JS-string engine, and the UTF-8 piece table.

`npm run build:wasm` does **not** use rustup or `wasm-pack`. This machine
has Nix `rustc` with `wasm32-unknown-unknown` std; `wasm-pack` wants rustup
to add the target. The script runs:

```sh
cargo build -p vici-wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target nodejs --out-dir packages/vici-wasm/pkg \
  target/wasm32-unknown-unknown/release/vici_wasm.wasm
# glue is renamed to vici_wasm.cjs (parent package is ESM)
wasm-opt -O3 packages/vici-wasm/pkg/vici_wasm_bg.wasm
```

If `wasm-bindgen` / `lld` / `wasm-opt` are not on `PATH`, the script
re-execs inside an ephemeral `nix shell nixpkgs#wasm-bindgen-cli
nixpkgs#lld nixpkgs#binaryen`. Nix `rustc` links wasm with `lld -flavor
wasm` and does not ship `rust-lld`. Do not `nix profile install`. The
`wasm-bindgen` crate is pinned to the CLI (0.2.121). ropey's `simd`
feature stays on — the wasm32 build accepted it.

Each speed workload is run as bulk `typeKeys(script)` and as per-key
`handleKey` (script parsed by `@beetle/vici-js` `keys()`), on wasm, `js`,
and `js-utf8`. `setText` is untimed; `text()` is never called in the hot
loop. The `edit-session` buffer is read from `../vici/FEATURES.txt`;
that file is not modified.

The Cargo workspace is `crates/vici-wasm` only (vici is a path-dep):

```sh
cargo metadata
cargo check -p vici-wasm
cargo check -p vici-wasm --target wasm32-unknown-unknown
```

## Caveats

These numbers compare Node engines that match the same 411 snapshots,
not "Rust vs JavaScript" in the abstract.

- **JS string vs piece table vs ropey.** Shippable `vici-js` stores a JS
  string. Public offsets are still UTF-8 bytes (ASCII is identity).
  `@beetle/vici-js/utf8` is the old piece table (flatten at 512 pieces or
  a whole-buffer replace). WASM uses vici's ropey buffer. All three
  report the same `Engine` offsets.
- **Graphemes.** JS uses `Intl.Segmenter`; Rust uses
  `unicode-segmentation`. The 411 cases agree. ZWJ / flag emoji elsewhere
  could still diverge. ASCII insert no longer rescan the row.
- **FFI copies.** wasm-bindgen copies UTF-8 ↔ UTF-16 on every `text()` /
  `typeKeys` / `handleKey`. Bulk `typeKeys` stays inside the engine;
  per-key pays the crossing once per token. Benches never call `text()`
  in the hot loop. The insert-1k WASM number is therefore inside Rust.
- **Search.** ASCII search is `String.prototype.indexOf`. Non-ASCII
  still walks grapheme starts. WASM still runs vici's grapheme search.
- **Case mapping.** `vici-js` uses an explicit mapper that matches Rust
  `char::to_uppercase` / `to_lowercase` / one-to-one `swap_case` on
  SpecialCasing, ASCII, Latin-1, and Latin Extended-A even/odd pairs
  (`ß` → `SS`). It is not a full Unicode Simple table; a scalar outside
  that set stays unchanged.
- **Node / V8 only.** No browser harness. Cold start includes WASM
  compile/instantiate vs TS module eval in this Node. V8 cons strings
  shape the JS insert numbers.
- **vici is a path-dep sibling**, not vendored. simd is on (ropey `simd`
  feature; both wasm profiles). There is no native-Rust column on the
  scoreboard — WASM includes the wasm-bindgen tax.

Do not tick `../vici/FEATURES.txt`.

## Layout

```
beetle/
  fixtures/                 # oracle copies (do not edit by hand)
    editor.vici             # symlink to ../vici/.../editor.vici
    editor_cases.snap       # insta snap with the YAML header stripped
  crates/
    vici-wasm/              # Rust wasm-bindgen façade
  packages/
    contract/               # fixture parser, snapshot renderer, Engine type
    vici-wasm/              # generated bindings + thin Engine wrapper
    vici-js/                # TypeScript reimplementation
    bench/                  # speed + size runners
  reports/                  # generated bench / size output
```

Package names stay `@beetle/contract`, `@beetle/vici-wasm`,
`@beetle/vici-js`, and `@beetle/bench`.

`fixtures/editor.vici` is a symlink into the sibling vici tree so the
oracle cannot drift. `fixtures/editor_cases.snap` is a copy of vici's
insta snapshot with the `---` / `source:` / `expression:` header stripped;
the case blocks are character-for-character.

## License

MIT OR Apache-2.0, at your option.
