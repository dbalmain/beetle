#!/bin/sh
# Build crates/vici-wasm for Node. No rustup.
#
# This machine has Nix rustc with wasm32-unknown-unknown std, but not rustup,
# wasm-pack, or wasm-bindgen on PATH. wasm-pack wants rustup to add the target,
# so this script is cargo + wasm-bindgen-cli. Missing tools come from an
# ephemeral `nix shell` — do not `nix profile install`.
#
#   --size    release-size + wasm-opt -Oz → packages/vici-wasm/pkg-size
#             (kept off the speed pkg/ used by benches and tests)

set -eu

size=0
for arg in "$@"; do
  case "$arg" in
    --size) size=1 ;;
    -h|--help)
      echo "usage: $0 [--size]" >&2
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# Nix rustc targets `lld -flavor wasm` and does not ship rust-lld.
# wasm-opt is required: the size table weighs the post-opt artefact.
if ! command -v wasm-bindgen >/dev/null 2>&1 \
  || ! command -v lld >/dev/null 2>&1 \
  || ! command -v wasm-opt >/dev/null 2>&1; then
  exec nix shell \
    nixpkgs#wasm-bindgen-cli \
    nixpkgs#binaryen \
    nixpkgs#lld \
    --command "$0" "$@"
fi

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

if [ "$size" -eq 1 ]; then
  profile=release-size
  out="$root/packages/vici-wasm/pkg-size"
  opt_flag=-Oz
else
  profile=release
  out="$root/packages/vici-wasm/pkg"
  opt_flag=-O3
fi

wasm="$root/target/wasm32-unknown-unknown/${profile}/vici_wasm.wasm"

cli_ver=$(wasm-bindgen --version)
case "$cli_ver" in
  *0.2.121*) ;;
  *)
    echo "error: wasm-bindgen CLI is '$cli_ver'; crate is pinned to 0.2.121" >&2
    exit 1
    ;;
esac

echo "cargo build -p vici-wasm --target wasm32-unknown-unknown --profile $profile" >&2
cargo build -p vici-wasm --target wasm32-unknown-unknown --profile "$profile"

rm -rf "$out"
mkdir -p "$out"

echo "wasm-bindgen --target nodejs --out-dir $out" >&2
wasm-bindgen --target nodejs --out-dir "$out" "$wasm"

# Parent package is ESM (`type: module`). Rename the glue so Node / vitest
# load it as CommonJS rather than treating `.js` as ESM.
mv "$out/vici_wasm.js" "$out/vici_wasm.cjs"
printf '%s\n' '{"type":"commonjs"}' > "$out/package.json"

bg="$out/vici_wasm_bg.wasm"
echo "wasm-opt $opt_flag $bg" >&2
tmp="${bg}.opt"
wasm-opt "$opt_flag" "$bg" -o "$tmp"
mv "$tmp" "$bg"

echo "wrote $out" >&2
