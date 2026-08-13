#!/bin/sh
# Build crates/vici-wasm for Node. No rustup.
#
# This machine has Nix rustc with wasm32-unknown-unknown std, but not rustup,
# wasm-pack, or wasm-bindgen on PATH. wasm-pack wants rustup to add the target,
# so this script is cargo + wasm-bindgen-cli. Missing tools come from an
# ephemeral `nix shell` — do not `nix profile install`.

set -eu

# Nix rustc targets `lld -flavor wasm` and does not ship rust-lld.
if ! command -v wasm-bindgen >/dev/null 2>&1 || ! command -v lld >/dev/null 2>&1; then
  exec nix shell \
    nixpkgs#wasm-bindgen-cli \
    nixpkgs#binaryen \
    nixpkgs#lld \
    --command "$0" "$@"
fi

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

out="$root/packages/vici-wasm/pkg"
wasm="$root/target/wasm32-unknown-unknown/release/vici_wasm.wasm"

cli_ver=$(wasm-bindgen --version)
case "$cli_ver" in
  *0.2.121*) ;;
  *)
    echo "error: wasm-bindgen CLI is '$cli_ver'; crate is pinned to 0.2.121" >&2
    exit 1
    ;;
esac

echo "cargo build -p vici-wasm --target wasm32-unknown-unknown --release" >&2
cargo build -p vici-wasm --target wasm32-unknown-unknown --release

rm -rf "$out"
mkdir -p "$out"

echo "wasm-bindgen --target nodejs --out-dir $out" >&2
wasm-bindgen --target nodejs --out-dir "$out" "$wasm"

# Parent package is ESM (`type: module`). Rename the glue so Node / vitest
# load it as CommonJS rather than treating `.js` as ESM.
mv "$out/vici_wasm.js" "$out/vici_wasm.cjs"
printf '%s\n' '{"type":"commonjs"}' > "$out/package.json"

bg="$out/vici_wasm_bg.wasm"
if command -v wasm-opt >/dev/null 2>&1; then
  echo "wasm-opt -O3 $bg" >&2
  tmp="${bg}.opt"
  wasm-opt -O3 "$bg" -o "$tmp"
  mv "$tmp" "$bg"
fi

echo "wrote $out" >&2
