# Beetle speed

Generated: 2026-08-13T20:41:06.480Z

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
- js is the shippable JS-string buffer (UTF-8 public offsets, ASCII is identity).
- js-utf8 is the same engine on the UTF-8 piece table — the UTF-8 tax column.

## Cold start

| Engine | p50 | p95 | mean | iters |
| --- | ---: | ---: | ---: | ---: |
| wasm | 45.63 ms | 49.37 ms | 46.43 ms | 12 |
| js | 92.23 ms | 94.76 ms | 92.21 ms | 12 |
| js-utf8 | 91.38 ms | 98.90 ms | 92.95 ms | 12 |

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
| `insert-1k` | wasm | bulk | 83.41 ms | 84.16 ms | 83.44 ms | 20 |
| `insert-1k` | wasm | per-key | 84.00 ms | 85.03 ms | 84.20 ms | 20 |
| `insert-1k` | js | bulk | 8.74 ms | 9.59 ms | 8.82 ms | 86 |
| `insert-1k` | js | per-key | 7.90 ms | 8.81 ms | 8.03 ms | 95 |
| `insert-1k` | js-utf8 | bulk | 10.64 ms | 12.22 ms | 10.68 ms | 71 |
| `insert-1k` | js-utf8 | per-key | 10.55 ms | 11.51 ms | 10.48 ms | 73 |
| `words-small` | wasm | bulk | 112.42 µs | 122.76 µs | 114.75 µs | 196 |
| `words-small` | wasm | per-key | 119.17 µs | 135.13 µs | 122.20 µs | 196 |
| `words-small` | js | bulk | 40.63 µs | 105.20 µs | 52.55 µs | 196 |
| `words-small` | js | per-key | 29.39 µs | 43.10 µs | 31.45 µs | 196 |
| `words-small` | js-utf8 | bulk | 49.88 µs | 145.99 µs | 68.24 µs | 196 |
| `words-small` | js-utf8 | per-key | 37.23 µs | 47.79 µs | 38.47 µs | 196 |
| `words-100k` | wasm | bulk | 128.34 µs | 134.82 µs | 129.15 µs | 196 |
| `words-100k` | wasm | per-key | 128.86 µs | 142.15 µs | 130.69 µs | 196 |
| `words-100k` | js | bulk | 48.84 µs | 70.17 µs | 49.51 µs | 196 |
| `words-100k` | js | per-key | 36.43 µs | 51.18 µs | 38.70 µs | 196 |
| `words-100k` | js-utf8 | bulk | 64.25 µs | 93.86 µs | 71.60 µs | 196 |
| `words-100k` | js-utf8 | per-key | 59.29 µs | 97.53 µs | 65.40 µs | 196 |
| `words-1m` | wasm | bulk | 132.94 µs | 142.65 µs | 134.57 µs | 196 |
| `words-1m` | wasm | per-key | 135.03 µs | 156.81 µs | 138.93 µs | 196 |
| `words-1m` | js | bulk | 54.12 µs | 99.74 µs | 60.40 µs | 196 |
| `words-1m` | js | per-key | 38.84 µs | 48.78 µs | 41.03 µs | 196 |
| `words-1m` | js-utf8 | bulk | 65.49 µs | 178.18 µs | 79.04 µs | 196 |
| `words-1m` | js-utf8 | per-key | 60.43 µs | 117.87 µs | 71.60 µs | 196 |
| `delete-word` | wasm | bulk | 7.81 ms | 8.35 ms | 7.90 ms | 98 |
| `delete-word` | wasm | per-key | 8.13 ms | 9.14 ms | 8.25 ms | 93 |
| `delete-word` | js | bulk | 2.96 ms | 3.77 ms | 3.05 ms | 196 |
| `delete-word` | js | per-key | 2.79 ms | 3.39 ms | 2.88 ms | 196 |
| `delete-word` | js-utf8 | bulk | 3.54 ms | 5.29 ms | 3.82 ms | 196 |
| `delete-word` | js-utf8 | per-key | 3.50 ms | 5.33 ms | 3.78 ms | 196 |
| `undo-storm` | wasm | bulk | 24.47 ms | 24.72 ms | 24.53 ms | 29 |
| `undo-storm` | wasm | per-key | 26.41 ms | 27.20 ms | 26.37 ms | 27 |
| `undo-storm` | js | bulk | 3.14 ms | 4.26 ms | 3.35 ms | 196 |
| `undo-storm` | js | per-key | 3.05 ms | 3.38 ms | 3.09 ms | 196 |
| `undo-storm` | js-utf8 | bulk | 13.68 ms | 14.41 ms | 13.75 ms | 54 |
| `undo-storm` | js-utf8 | per-key | 13.33 ms | 13.65 ms | 13.35 ms | 56 |
| `macro` | wasm | bulk | 371.48 µs | 392.20 µs | 377.42 µs | 196 |
| `macro` | wasm | per-key | 378.42 µs | 395.02 µs | 388.56 µs | 196 |
| `macro` | js | bulk | 261.24 µs | 1.01 ms | 370.73 µs | 196 |
| `macro` | js | per-key | 213.01 µs | 229.13 µs | 215.44 µs | 196 |
| `macro` | js-utf8 | bulk | 272.44 µs | 387.99 µs | 292.32 µs | 196 |
| `macro` | js-utf8 | per-key | 256.07 µs | 625.94 µs | 324.07 µs | 196 |
| `search` | wasm | bulk | 27.42 ms | 27.64 ms | 27.42 ms | 26 |
| `search` | wasm | per-key | 27.68 ms | 27.73 ms | 27.67 ms | 25 |
| `search` | js | bulk | 795.27 µs | 893.40 µs | 823.55 µs | 196 |
| `search` | js | per-key | 778.57 µs | 794.29 µs | 779.82 µs | 196 |
| `search` | js-utf8 | bulk | 754.12 µs | 1.02 ms | 838.06 µs | 196 |
| `search` | js-utf8 | per-key | 735.38 µs | 860.14 µs | 768.33 µs | 196 |
| `operator-all` | wasm | bulk | 78.47 µs | 486.04 µs | 140.14 µs | 196 |
| `operator-all` | wasm | per-key | 77.80 µs | 398.89 µs | 102.69 µs | 196 |
| `operator-all` | js | bulk | 31.05 µs | 49.68 µs | 28.80 µs | 196 |
| `operator-all` | js | per-key | 13.20 µs | 20.71 µs | 14.61 µs | 196 |
| `operator-all` | js-utf8 | bulk | 138.50 µs | 267.57 µs | 153.35 µs | 196 |
| `operator-all` | js-utf8 | per-key | 123.04 µs | 180.99 µs | 127.14 µs | 196 |
| `edit-session` | wasm | bulk | 244.06 µs | 251.69 µs | 245.32 µs | 196 |
| `edit-session` | wasm | per-key | 265.17 µs | 275.71 µs | 266.40 µs | 196 |
| `edit-session` | js | bulk | 2.11 ms | 4.03 ms | 2.49 ms | 196 |
| `edit-session` | js | per-key | 2.09 ms | 3.92 ms | 2.42 ms | 196 |
| `edit-session` | js-utf8 | bulk | 2.08 ms | 4.45 ms | 2.53 ms | 196 |
| `edit-session` | js-utf8 | per-key | 1.97 ms | 4.30 ms | 2.60 ms | 196 |

