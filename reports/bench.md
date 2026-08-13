# Beetle speed

Generated: 2026-08-13T12:41:43.673Z

- Node: v24.18.1 (node/v8)
- CPU: AMD Ryzen 9 9955HX 16-Core Processor
- Platform: linux/x64
- simd: on

## Protocol

- Hot benches: mitata, warmup then ≥24 samples or 800ms (cap 200). setText is a computed parameter and is not timed.
- text() is never called in the hot loop (wasm-bindgen copies UTF-8↔UTF-16 on text()/typeKeys).
- Bulk is typeKeys(script) inside the engine. Per-key is handleKey for each keys(script) token.
- Cold start is a fresh Node process: await import() + first constructor. Not mixed into hot benches.
- Speed wasm is the opt-level=3 / wasm-opt -O3 artefact in packages/vici-wasm/pkg. simd is on.

## Cold start

| Engine | p50 | p95 | mean | iters |
| --- | ---: | ---: | ---: | ---: |
| wasm | 47.00 ms | 48.24 ms | 46.86 ms | 12 |
| js | 88.69 ms | 91.94 ms | 89.16 ms | 12 |

## Workloads

| Name | Buffer | Script |
| --- | --- | --- |
| `insert-1k` | empty | `iabcdefghijklmnopqrstuvwxyz0123456789 ab…` (1006 chars) |
| `words-small` | ~1 KiB prose | `10w10b3dw` |
| `words-100k` | ~100 KiB repeated prose | `50w50b` |
| `words-1m` | ~1 MiB repeated prose | `50w50b` |
| `delete-word` | 100 KiB prose | `ggdwdwdwdwdwdwdwdwdwdwdwdwdwdwdwdwdwdwdw…` (402 chars) |
| `undo-storm` | 10 KiB prose | `ia<Esc>ia<Esc>ia<Esc>ia<Esc>ia<Esc>ia<Es…` (1412 chars) |
| `macro` | 3-line sample | `qa~jq200@a` |
| `search` | 100 KiB prose with a rare needle | `/needle<CR>nnn` |
| `operator-all` | 100 KiB prose | `ggdG` |
| `edit-session` | FEATURES.txt (19349 bytes) | `ggjwcwSELECT<Esc>viwywpu` |

## Hot

| Name | Engine | Mode | p50 | p95 | mean | iters |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `insert-1k` | wasm | bulk | 83.83 ms | 85.85 ms | 84.25 ms | 20 |
| `insert-1k` | wasm | per-key | 86.64 ms | 87.04 ms | 86.66 ms | 20 |
| `insert-1k` | js | bulk | 1.47 s | 1.55 s | 1.48 s | 20 |
| `insert-1k` | js | per-key | 1.68 s | 1.70 s | 1.68 s | 20 |
| `words-small` | wasm | bulk | 113.75 µs | 121.76 µs | 116.11 µs | 196 |
| `words-small` | wasm | per-key | 120.01 µs | 142.26 µs | 123.59 µs | 196 |
| `words-small` | js | bulk | 1.12 ms | 2.01 ms | 1.30 ms | 196 |
| `words-small` | js | per-key | 1.13 ms | 2.21 ms | 1.41 ms | 196 |
| `words-100k` | wasm | bulk | 131.32 µs | 153.64 µs | 134.67 µs | 196 |
| `words-100k` | wasm | per-key | 129.87 µs | 135.36 µs | 130.89 µs | 196 |
| `words-100k` | js | bulk | 863.88 µs | 1.85 ms | 984.49 µs | 196 |
| `words-100k` | js | per-key | 932.01 µs | 1.97 ms | 1.10 ms | 196 |
| `words-1m` | wasm | bulk | 137.02 µs | 143.09 µs | 138.07 µs | 196 |
| `words-1m` | wasm | per-key | 135.79 µs | 142.32 µs | 136.98 µs | 196 |
| `words-1m` | js | bulk | 880.68 µs | 1.56 ms | 965.25 µs | 196 |
| `words-1m` | js | per-key | 810.05 µs | 1.19 ms | 925.43 µs | 196 |
| `delete-word` | wasm | bulk | 7.86 ms | 8.40 ms | 7.91 ms | 97 |
| `delete-word` | wasm | per-key | 8.32 ms | 9.31 ms | 8.45 ms | 91 |
| `delete-word` | js | bulk | 155.78 ms | 189.03 ms | 160.41 ms | 20 |
| `delete-word` | js | per-key | 157.67 ms | 178.92 ms | 159.56 ms | 20 |
| `undo-storm` | wasm | bulk | 25.18 ms | 26.73 ms | 25.40 ms | 27 |
| `undo-storm` | wasm | per-key | 27.55 ms | 28.75 ms | 27.31 ms | 26 |
| `undo-storm` | js | bulk | 531.04 ms | 560.75 ms | 530.13 ms | 20 |
| `undo-storm` | js | per-key | 528.68 ms | 546.24 ms | 530.59 ms | 20 |
| `macro` | wasm | bulk | 371.80 µs | 444.22 µs | 424.84 µs | 196 |
| `macro` | wasm | per-key | 375.09 µs | 415.20 µs | 390.35 µs | 196 |
| `macro` | js | bulk | 2.99 ms | 3.72 ms | 2.95 ms | 181 |
| `macro` | js | per-key | 2.21 ms | 2.54 ms | 2.27 ms | 196 |
| `search` | wasm | bulk | 27.08 ms | 27.26 ms | 27.12 ms | 26 |
| `search` | wasm | per-key | 27.24 ms | 27.37 ms | 27.27 ms | 26 |
| `search` | js | bulk | 367.27 ms | 409.42 ms | 367.03 ms | 20 |
| `search` | js | per-key | 350.94 ms | 405.23 ms | 363.72 ms | 20 |
| `operator-all` | wasm | bulk | 75.98 µs | 418.68 µs | 103.09 µs | 196 |
| `operator-all` | wasm | per-key | 75.16 µs | 445.96 µs | 120.03 µs | 196 |
| `operator-all` | js | bulk | 249.80 µs | 476.84 µs | 267.66 µs | 196 |
| `operator-all` | js | per-key | 227.33 µs | 426.18 µs | 254.00 µs | 196 |
| `edit-session` | wasm | bulk | 243.75 µs | 251.13 µs | 244.45 µs | 196 |
| `edit-session` | wasm | per-key | 265.54 µs | 272.75 µs | 266.76 µs | 196 |
| `edit-session` | js | bulk | 2.31 ms | 4.30 ms | 2.70 ms | 196 |
| `edit-session` | js | per-key | 2.46 ms | 4.64 ms | 2.82 ms | 196 |

