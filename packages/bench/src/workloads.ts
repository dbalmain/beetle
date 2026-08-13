// Shared buffers and vi scripts. Both engines run the same strings.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Workload = {
  name: string;
  /** Human description of the starting buffer. */
  bufferLabel: string;
  buffer: string;
  script: string;
};

const PARA =
  "The quick brown fox jumps over the lazy dog. " +
  "Pack my box with five dozen liquor jugs. " +
  "How vexingly quick daft zebras jump. " +
  "Sphinx of black quartz, judge my vow.\n";

function prose(targetBytes: number): string {
  const n = Math.ceil(targetBytes / PARA.length);
  return PARA.repeat(n).slice(0, targetBytes);
}

function proseWithNeedle(
  targetBytes: number,
  needle: string,
  count: number,
): string {
  const base = prose(targetBytes);
  const step = Math.floor(base.length / (count + 1));
  const parts: string[] = [];
  let cursor = 0;
  for (let i = 1; i <= count; i++) {
    const at = step * i;
    parts.push(base.slice(cursor, at), needle);
    cursor = at;
  }
  parts.push(base.slice(cursor));
  return parts.join("");
}

function insert1kScript(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  let body = "";
  for (let i = 0; i < 1000; i++) {
    const ch = alphabet[i % alphabet.length];
    if (ch === undefined) {
      throw new Error("alphabet lookup failed");
    }
    body += ch;
  }
  return `i${body}<Esc>`;
}

export function loadWorkloads(repoRoot: string): Workload[] {
  // Read only. Do not tick or write FEATURES.txt.
  const features = readFileSync(
    join(repoRoot, "../vici/FEATURES.txt"),
    "utf8",
  );

  return [
    {
      name: "insert-1k",
      bufferLabel: "empty",
      buffer: "",
      script: insert1kScript(),
    },
    {
      name: "words-small",
      bufferLabel: "~1 KiB prose",
      buffer: prose(1024),
      script: "10w10b3dw",
    },
    {
      name: "words-100k",
      bufferLabel: "~100 KiB repeated prose",
      buffer: prose(100 * 1024),
      script: "50w50b",
    },
    {
      name: "words-1m",
      bufferLabel: "~1 MiB repeated prose",
      buffer: prose(1024 * 1024),
      script: "50w50b",
    },
    {
      name: "delete-word",
      bufferLabel: "100 KiB prose",
      buffer: prose(100 * 1024),
      script: `gg${"dw".repeat(200)}`,
    },
    {
      name: "undo-storm",
      bufferLabel: "10 KiB prose",
      buffer: prose(10 * 1024),
      script: `${"ia<Esc>".repeat(200)}200u200<C-r>`,
    },
    {
      name: "macro",
      bufferLabel: "3-line sample",
      buffer: "hello world\nfoo bar baz\nthe quick brown fox\n",
      script: "qa~jq200@a",
    },
    {
      name: "search",
      bufferLabel: "100 KiB prose with a rare needle",
      buffer: proseWithNeedle(100 * 1024, "needle", 4),
      script: "/needle<CR>nnn",
    },
    {
      name: "operator-all",
      bufferLabel: "100 KiB prose",
      buffer: prose(100 * 1024),
      script: "ggdG",
    },
    {
      name: "edit-session",
      bufferLabel: `FEATURES.txt (${features.length} bytes)`,
      buffer: features,
      script: "ggjwcwSELECT<Esc>viwywpu",
    },
  ];
}
