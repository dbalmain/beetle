# Beetle size

Generated: 2026-08-13T12:39:01.461Z

- Node: v24.18.1
- simd: on

- Speed-build wasm is the binary the benches actually ran.
- Size-build wasm lives in packages/vici-wasm/pkg-size and is not loaded by tests or benches.
- vici-js row is esbuild --bundle --minify --format=esm of packages/vici-js/src/index.ts. contract parse/render is not included; Mods is.
- simd is on (ropey simd feature; both wasm profiles).

| Artifact | raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| vici.wasm speed (opt-level=3, LTO, wasm-opt -O3) | 273.5 KiB (280068) | 107.4 KiB (109993) | 83.0 KiB (85033) |
| vici.wasm size (release-size / opt-level=z, wasm-opt -Oz) | 229.4 KiB (234890) | 97.3 KiB (99615) | 75.9 KiB (77744) |
| wasm glue JS (vici_wasm.cjs) | 14.1 KiB (14463) | 3.0 KiB (3042) | 2.6 KiB (2703) |
| vici-js esbuild minify ESM | 47.3 KiB (48467) | 14.1 KiB (14399) | 12.6 KiB (12920) |

