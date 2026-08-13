// Drive both engines with identical scripts. Writes reports/bench.* and
// reports/size.*. Setup (`setText`) is not timed; `text()` is never called
// in the hot loop.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import { createEngine, keys } from "@beetle/vici-js";
import { createWasmEngine } from "@beetle/vici-wasm";
import type { Engine, Key } from "@beetle/contract";
import { do_not_optimize, measure } from "mitata";
import { build as esbuild } from "esbuild";

import { loadWorkloads, type Workload } from "./workloads.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const reportsDir = join(repoRoot, "reports");

type EngineName = "js" | "wasm";
type Mode = "bulk" | "per-key";

type Timing = {
  p50_ns: number;
  p95_ns: number;
  mean_ns: number;
  iters: number;
};

type BenchRow = Timing & {
  name: string;
  engine: EngineName;
  mode: Mode;
  bufferBytes: number;
  scriptKeys: number;
};

type ColdRow = Timing & {
  engine: EngineName;
};

type SizeRow = {
  artifact: string;
  path: string;
  raw: number;
  gzip: number;
  brotli: number;
};

type BenchReport = {
  meta: {
    generatedAt: string;
    node: string;
    cpu: string;
    platform: string;
    arch: string;
    simd: true;
    runtime: "node/v8";
    notes: string[];
  };
  coldStart: ColdRow[];
  benches: BenchRow[];
};

const SIMD = true as const;

const MEASURE_OPTS = {
  // Mutating editor state cannot be batched: one setText per typeKeys.
  batch_samples: 1,
  batch_threshold: 0,
  min_samples: 24,
  min_cpu_time: 800 * 1e6,
  warmup_samples: 8,
};

function cpuModel(): string {
  return cpus()[0]?.model ?? "unknown";
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const value = sorted[(p * (sorted.length - 1)) | 0];
  if (value === undefined) {
    return 0;
  }
  return value;
}

function fromMitata(stats: { avg: number; p50: number; samples: number[] }): Timing {
  const samples = stats.samples;
  return {
    p50_ns: stats.p50,
    p95_ns: pct(samples, 0.95),
    mean_ns: stats.avg,
    iters: samples.length,
  };
}

function fmtNs(ns: number): string {
  if (!Number.isFinite(ns)) {
    return "n/a";
  }
  if (ns < 1_000) {
    return `${ns.toFixed(0)} ns`;
  }
  if (ns < 1_000_000) {
    return `${(ns / 1_000).toFixed(2)} µs`;
  }
  if (ns < 1_000_000_000) {
    return `${(ns / 1_000_000).toFixed(2)} ms`;
  }
  return `${(ns / 1_000_000_000).toFixed(2)} s`;
}

function fmtBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KiB`;
  }
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function factory(engine: EngineName): (text: string) => Engine {
  return engine === "js" ? createEngine : createWasmEngine;
}

function ensureWasm(kind: "speed" | "size"): void {
  const dir = kind === "size" ? "pkg-size" : "pkg";
  const file = join(repoRoot, "packages/vici-wasm", dir, "vici_wasm_bg.wasm");
  if (existsSync(file)) {
    return;
  }
  const args = [join(repoRoot, "scripts/build-wasm.sh")];
  if (kind === "size") {
    args.push("--size");
  }
  console.error(`missing ${file}; running sh ${args.join(" ")}`);
  const result = spawnSync("sh", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`build-wasm (${kind}) failed with status ${result.status}`);
  }
}

async function timeHot(
  engine: Engine,
  buffer: string,
  run: (engine: Engine) => void,
): Promise<Timing> {
  const stats = await measure(
    function* () {
      yield {
        [0]() {
          engine.setText(buffer);
          return engine;
        },
        bench(ed: Engine) {
          run(ed);
        },
      };
    },
    MEASURE_OPTS,
  );
  return fromMitata(stats);
}

function smoke(engine: EngineName, workload: Workload, parsed: Key[]): void {
  const make = factory(engine);
  const bulk = make(workload.buffer);
  bulk.typeKeys(workload.script);
  const perKey = make(workload.buffer);
  for (const key of parsed) {
    perKey.handleKey(key);
  }
}

async function runSpeed(workloads: Workload[]): Promise<BenchReport> {
  const benches: BenchRow[] = [];
  const engines: EngineName[] = ["wasm", "js"];
  const modes: Mode[] = ["bulk", "per-key"];

  for (const workload of workloads) {
    const parsed = keys(workload.script);
    for (const engineName of engines) {
      smoke(engineName, workload, parsed);
    }
    for (const engineName of engines) {
      const engine = factory(engineName)(workload.buffer);
      for (const mode of modes) {
        const label = `${workload.name} ${engineName} ${mode}`;
        process.stderr.write(`bench ${label} … `);
        const run =
          mode === "bulk"
            ? (ed: Engine) => {
                do_not_optimize(ed.typeKeys(workload.script));
              }
            : (ed: Engine) => {
                for (const key of parsed) {
                  do_not_optimize(ed.handleKey(key));
                }
              };
        const timing = await timeHot(engine, workload.buffer, run);
        if (!(timing.p50_ns > 0) || timing.p50_ns > timing.p95_ns) {
          throw new Error(
            `insane timing for ${label}: p50=${timing.p50_ns} p95=${timing.p95_ns}`,
          );
        }
        benches.push({
          name: workload.name,
          engine: engineName,
          mode,
          bufferBytes: Buffer.byteLength(workload.buffer),
          scriptKeys: parsed.length,
          ...timing,
        });
        process.stderr.write(
          `${fmtNs(timing.p50_ns)} p50 / ${fmtNs(timing.p95_ns)} p95 ` +
            `(${timing.iters} iters)\n`,
        );
      }
    }
  }

  process.stderr.write("cold start …\n");
  const coldStart = runColdStarts();

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpu: cpuModel(),
      platform: process.platform,
      arch: process.arch,
      simd: SIMD,
      runtime: "node/v8",
      notes: [
        "Hot benches: mitata, warmup then ≥24 samples or 800ms. setText is a computed parameter and is not timed.",
        "text() is never called in the hot loop (wasm-bindgen copies UTF-8↔UTF-16 on text()/typeKeys).",
        "Bulk is typeKeys(script) inside the engine. Per-key is handleKey for each keys(script) token.",
        "Cold start is a fresh Node process: await import() + first constructor. Not mixed into hot benches.",
        "Speed wasm is the opt-level=3 / wasm-opt -O3 artefact in packages/vici-wasm/pkg. simd is on.",
      ],
    },
    coldStart,
    benches,
  };
}

function runColdStarts(): ColdRow[] {
  const specs: { engine: EngineName; specifier: string; exportName: string }[] =
    [
      { engine: "wasm", specifier: "@beetle/vici-wasm", exportName: "createWasmEngine" },
      { engine: "js", specifier: "@beetle/vici-js", exportName: "createEngine" },
    ];
  const discarded = 2;
  const kept = 12;
  const rows: ColdRow[] = [];
  for (const spec of specs) {
    const samples: number[] = [];
    for (let i = 0; i < discarded + kept; i++) {
      const ns = coldOnce(spec.specifier, spec.exportName);
      if (i >= discarded) {
        samples.push(ns);
      }
    }
    samples.sort((a, b) => a - b);
    const sum = samples.reduce((a, b) => a + b, 0);
    const row: ColdRow = {
      engine: spec.engine,
      p50_ns: pct(samples, 0.5),
      p95_ns: pct(samples, 0.95),
      mean_ns: sum / samples.length,
      iters: samples.length,
    };
    if (!(row.p50_ns > 0)) {
      throw new Error(`cold start ${spec.engine} produced a zero sample`);
    }
    rows.push(row);
    process.stderr.write(
      `  ${spec.engine}: ${fmtNs(row.p50_ns)} p50 (${row.iters} fresh processes)\n`,
    );
  }
  return rows;
}

function coldOnce(specifier: string, exportName: string): number {
  const source = `
    const t0 = performance.now();
    const mod = await import(${JSON.stringify(specifier)});
    mod[${JSON.stringify(exportName)}]("");
    process.stdout.write(String(1e6 * (performance.now() - t0)));
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", source],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `cold start ${specifier} failed:\n${result.stderr || result.stdout}`,
    );
  }
  const ns = Number(result.stdout);
  if (!Number.isFinite(ns) || ns <= 0) {
    throw new Error(`cold start ${specifier} produced ${result.stdout}`);
  }
  return ns;
}

function weigh(buf: Buffer): { raw: number; gzip: number; brotli: number } {
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

async function runSize(): Promise<{ meta: BenchReport["meta"]; artifacts: SizeRow[] }> {
  ensureWasm("speed");
  ensureWasm("size");

  const jsOut = join(tmpdir(), "beetle-vici-js.min.mjs");
  await esbuild({
    absWorkingDir: repoRoot,
    entryPoints: [join(repoRoot, "packages/vici-js/src/index.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    outfile: jsOut,
    logLevel: "warning",
  });

  const files: { artifact: string; path: string }[] = [
    {
      artifact: "vici.wasm speed (opt-level=3, LTO, wasm-opt -O3)",
      path: join(repoRoot, "packages/vici-wasm/pkg/vici_wasm_bg.wasm"),
    },
    {
      artifact: "vici.wasm size (release-size / opt-level=z, wasm-opt -Oz)",
      path: join(repoRoot, "packages/vici-wasm/pkg-size/vici_wasm_bg.wasm"),
    },
    {
      artifact: "wasm glue JS (vici_wasm.cjs)",
      path: join(repoRoot, "packages/vici-wasm/pkg/vici_wasm.cjs"),
    },
    {
      artifact: "vici-js esbuild minify ESM",
      path: jsOut,
    },
  ];

  const artifacts: SizeRow[] = files.map((file) => {
    const buf = readFileSync(file.path);
    return { artifact: file.artifact, path: file.path, ...weigh(buf) };
  });

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpu: cpuModel(),
      platform: process.platform,
      arch: process.arch,
      simd: SIMD,
      runtime: "node/v8",
      notes: [
        "Speed-build wasm is the binary the benches actually ran.",
        "Size-build wasm lives in packages/vici-wasm/pkg-size and is not loaded by tests or benches.",
        "vici-js row is esbuild --bundle --minify --format=esm of packages/vici-js/src/index.ts. contract parse/render is not included; Mods is.",
        "simd is on (ropey simd feature; both wasm profiles).",
      ],
    },
    artifacts,
  };
}

function writeBenchMarkdown(report: BenchReport, workloads: Workload[]): string {
  const lines: string[] = [];
  lines.push("# Beetle speed");
  lines.push("");
  lines.push(`Generated: ${report.meta.generatedAt}`);
  lines.push("");
  lines.push(`- Node: ${report.meta.node} (${report.meta.runtime})`);
  lines.push(`- CPU: ${report.meta.cpu}`);
  lines.push(`- Platform: ${report.meta.platform}/${report.meta.arch}`);
  lines.push(`- simd: on`);
  lines.push("");
  lines.push("## Protocol");
  lines.push("");
  for (const note of report.meta.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("## Cold start");
  lines.push("");
  lines.push("| Engine | p50 | p95 | mean | iters |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of report.coldStart) {
    lines.push(
      `| ${row.engine} | ${fmtNs(row.p50_ns)} | ${fmtNs(row.p95_ns)} | ${fmtNs(row.mean_ns)} | ${row.iters} |`,
    );
  }
  lines.push("");
  lines.push("## Workloads");
  lines.push("");
  lines.push("| Name | Buffer | Script |");
  lines.push("| --- | --- | --- |");
  for (const w of workloads) {
    const script =
      w.script.length > 48 ? `\`${w.script.slice(0, 40)}…\` (${w.script.length} chars)` : `\`${w.script}\``;
    lines.push(`| \`${w.name}\` | ${w.bufferLabel} | ${script} |`);
  }
  lines.push("");
  lines.push("## Hot");
  lines.push("");
  lines.push("| Name | Engine | Mode | p50 | p95 | mean | iters |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: |");
  for (const row of report.benches) {
    lines.push(
      `| \`${row.name}\` | ${row.engine} | ${row.mode} | ${fmtNs(row.p50_ns)} | ${fmtNs(row.p95_ns)} | ${fmtNs(row.mean_ns)} | ${row.iters} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeSizeMarkdown(report: { meta: BenchReport["meta"]; artifacts: SizeRow[] }): string {
  const lines: string[] = [];
  lines.push("# Beetle size");
  lines.push("");
  lines.push(`Generated: ${report.meta.generatedAt}`);
  lines.push("");
  lines.push(`- Node: ${report.meta.node}`);
  lines.push(`- simd: on`);
  lines.push("");
  for (const note of report.meta.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("| Artifact | raw | gzip | brotli |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of report.artifacts) {
    lines.push(
      `| ${row.artifact} | ${fmtBytes(row.raw)} (${row.raw}) | ${fmtBytes(row.gzip)} (${row.gzip}) | ${fmtBytes(row.brotli)} (${row.brotli}) |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  ensureWasm("speed");
  const workloads = loadWorkloads(repoRoot);
  mkdirSync(reportsDir, { recursive: true });

  process.stderr.write("size …\n");
  const size = await runSize();
  writeFileSync(join(reportsDir, "size.json"), `${JSON.stringify(size, null, 2)}\n`);
  writeFileSync(join(reportsDir, "size.md"), writeSizeMarkdown(size));

  process.stderr.write("speed …\n");
  const bench = await runSpeed(workloads);
  writeFileSync(join(reportsDir, "bench.json"), `${JSON.stringify(bench, null, 2)}\n`);
  writeFileSync(join(reportsDir, "bench.md"), writeBenchMarkdown(bench, workloads));

  process.stderr.write(
    `wrote ${join(reportsDir, "bench.md")}, ${join(reportsDir, "bench.json")}, ${join(reportsDir, "size.md")}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
