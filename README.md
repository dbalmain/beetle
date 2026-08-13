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
npm test              # not yet — contract tests land in phase 1
npm run build:wasm    # not yet — wasm-pack wrapper lands in phase 2
npm run bench         # not yet — benches land in phase 6
```

The Cargo workspace is valid now so later phases can land in
`crates/vici-wasm`:

```sh
cargo metadata
cargo check -p vici-wasm
```

`wasm-pack` and `wasm-opt` are not wired yet.

## Fixtures

`fixtures/editor.vici` is a symlink into the sibling vici tree so the oracle
cannot drift. `fixtures/editor_cases.snap` is a copy of vici's insta snapshot
with the `---` / `source:` / `expression:` header stripped; the case blocks
are character-for-character.

Do not tick `../vici/FEATURES.txt`. Do not edit anything under `../vici`
from this experiment except the smallest possible wasm `simd` feature flip,
and only if phase 2 cannot compile without it.
