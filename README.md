# Beetle — Vim Web

Beetle is named after the VW car. Here **VW = Vim Web**: a headless vi core
that runs on the web, as WASM and as TypeScript.

This repo is a sibling experiment next to the Rust editor
[`vici`](../vici). vici is the behavioural oracle. Beetle path-depends on
it; it does not change vici behaviour, and it does not publish-change the
vici tree.

Two engines implement the same TypeScript `Engine` façade:

1. **`vici-wasm`** — `vici::Editor` behind wasm-bindgen (ropey, simd on).
2. **`vici-js`** — an idiomatic TypeScript reimplementation (UTF-8 piece
   table, `Intl.Segmenter`).

Both pass all **411** `editor.vici` snapshot cases character-for-character.

WASM is faster on every timed workload. The minified TypeScript engine is
about a sixth the brotli size of the speed wasm.

## Speed

Bulk `typeKeys` p50 on Node v24.18.1 / AMD Ryzen 9 9955HX / linux/x64 /
simd on. Generated 2026-08-13T12:41:43.673Z. Per-key `handleKey` and p95
live in [reports/bench.md](reports/bench.md).

| Workload | wasm | js |
| --- | ---: | ---: |
| cold start | 47 ms | 89 ms |
| insert-1k | 84 ms | 1.47 s |
| words-1m | 137 µs | 881 µs |
| delete-word | 7.9 ms | 156 ms |
| search | 27 ms | 367 ms |
| edit-session | 244 µs | 2.31 ms |

Cold start is a fresh Node process (`await import()` + first constructor),
not mixed into the hot benches.

## Size

Generated 2026-08-13T12:39:01.461Z. Same Node / simd. Full raw / gzip /
brotli bytes in [reports/size.md](reports/size.md).

| Artifact | raw | brotli |
| --- | ---: | ---: |
| speed wasm (`opt-level=3`, `wasm-opt -O3`) | 273.5 KiB | 83.0 KiB |
| size wasm (`opt-level=z`, `wasm-opt -Oz`) | 229.4 KiB | 75.9 KiB |
| wasm glue (`vici_wasm.cjs`) | 14.1 KiB | 2.6 KiB |
| vici-js minify ESM | 47.3 KiB | 12.6 KiB |

Speed wasm is the binary the benches ran. Size wasm lives in
`packages/vici-wasm/pkg-size/` and is not loaded by tests or benches.
`vici-js` is `esbuild --bundle --minify --format=esm` of
`packages/vici-js/src/index.ts` (no contract parse/render).

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
both engines.

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
`handleKey` (script parsed by `@beetle/vici-js` `keys()`), on both engines.
`setText` is untimed; `text()` is never called in the hot loop. The
`edit-session` buffer is read from `../vici/FEATURES.txt`; that file is
not modified.

The Cargo workspace is `crates/vici-wasm` only (vici is a path-dep):

```sh
cargo metadata
cargo check -p vici-wasm
cargo check -p vici-wasm --target wasm32-unknown-unknown
```

## Caveats

These numbers compare two Node engines that match the same 411 snapshots,
not "Rust vs JavaScript" in the abstract.

- **Piece table vs ropey.** `vici-js` is a UTF-8 piece table (public
  offsets are bytes). WASM uses vici's ropey buffer. Flatten collapses to
  a single original piece when the piece count exceeds 512, or after a
  whole-buffer replace. That policy shapes large-edit numbers.
- **Graphemes.** JS uses `Intl.Segmenter`; Rust uses
  `unicode-segmentation`. The 411 cases agree. ZWJ / flag emoji elsewhere
  could still diverge.
- **FFI copies.** wasm-bindgen copies UTF-8 ↔ UTF-16 on every `text()` /
  `typeKeys` / `handleKey`. Bulk `typeKeys` stays inside the engine;
  per-key pays the crossing once per token. Benches never call `text()`
  in the hot loop.
- **Search.** Both engines still `toString()` the buffer to scan. JS
  search is one-pass over grapheme starts; it is not a rope walk.
- **Case mapping.** `vici-js` uses an explicit mapper that matches Rust
  `char::to_uppercase` / `to_lowercase` / one-to-one `swap_case` on
  SpecialCasing, ASCII, Latin-1, and Latin Extended-A even/odd pairs
  (`ß` → `SS`). It is not a full Unicode Simple table; a scalar outside
  that set stays unchanged.
- **Node / V8 only.** No browser harness. Cold start includes WASM
  compile/instantiate vs TS module eval in this Node.
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
