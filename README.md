# Beetle — Vim Web

Beetle is named after the VW car. Here **VW = Vim Web**: a headless vi core
that runs on the web, as WASM and as TypeScript.

This repo is an experiment next to the sibling Rust editor
[`vici`](../vici). It will:

1. Wrap existing Rust `vici` as WASM and expose it to Node.
2. Reimplement the same editor in TypeScript (`vici-js`).
3. Prove both engines against vici's 411-case `editor.vici` snapshot suite.
4. Benchmark speed (Node) and compare shipped package size (raw / gzip / brotli).

vici is the behavioural oracle. Beetle path-depends on it; it does not change
vici behaviour, and it does not publish-change the vici tree.

There are no results yet. Later phases fill in the engines, the fixture
harness, and the numbers.

## Layout

```
beetle/
  fixtures/                 # oracle copies (do not edit by hand)
    editor.vici             # symlink to ../vici/.../editor.vici
    editor_cases.snap       # insta snap with the YAML header stripped
  crates/
    vici-wasm/              # Rust wasm-bindgen façade (phase 2)
  packages/
    contract/               # fixture parser, snapshot renderer, Engine type
    vici-wasm/              # generated bindings + thin Engine wrapper
    vici-js/                # TypeScript reimplementation
    bench/                  # speed + size runners
  reports/                  # generated bench / size output
```

Package names stay `@beetle/contract`, `@beetle/vici-wasm`, `@beetle/vici-js`,
and `@beetle/bench`.

## Build / test / bench

From the repo root (POSIX `sh`):

```sh
npm install
npm test              # typecheck @beetle/contract + vitest (parser, 411 cases)
npm run build:wasm    # cargo + wasm-bindgen → packages/vici-wasm/pkg
npm run test:wasm     # wasm smoke + 411-case snap (needs build:wasm first)
npm run bench         # not yet — benches land in phase 6
```

`npm test` stays the contract suite. The wasm oracle (`test:wasm`) is
separate so a contract run does not rebuild the artefact.

`npm run build:wasm` does **not** use rustup or `wasm-pack`. This machine
has Nix `rustc` with `wasm32-unknown-unknown` std; `wasm-pack` wants rustup
to add the target. The script runs:

```sh
cargo build -p vici-wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target nodejs --out-dir packages/vici-wasm/pkg \
  target/wasm32-unknown-unknown/release/vici_wasm.wasm
# glue is renamed to vici_wasm.cjs (parent package is ESM)
wasm-opt -O3 packages/vici-wasm/pkg/vici_wasm_bg.wasm   # if present
```

If `wasm-bindgen` / `lld` / `wasm-opt` are not on `PATH`, the script re-execs
inside an ephemeral `nix shell nixpkgs#wasm-bindgen-cli nixpkgs#lld
nixpkgs#binaryen`. Nix `rustc` links wasm with `lld -flavor wasm` and does
not ship `rust-lld`. Do not `nix profile install`. The `wasm-bindgen` crate
is pinned to the CLI (0.2.121). ropey's `simd` feature stays on — the wasm32
build accepted it.

The Cargo workspace is `crates/vici-wasm` only (vici is a path-dep):

```sh
cargo metadata
cargo check -p vici-wasm
cargo check -p vici-wasm --target wasm32-unknown-unknown
```

## Fixtures

`fixtures/editor.vici` is a symlink into the sibling vici tree so the oracle
cannot drift. `fixtures/editor_cases.snap` is a copy of vici's insta snapshot
with the `---` / `source:` / `expression:` header stripped; the case blocks
are character-for-character.

Do not tick `../vici/FEATURES.txt`. Phase 2 built wasm32 with ropey's
`simd` feature on, so vici was not touched.
