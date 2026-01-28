#!/usr/bin/env bun

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

type Target = {
  os: "darwin" | "linux" | "win32";
  arch: "arm64" | "x64";
  bunTarget: string;
  packagePlatform: "darwin" | "linux" | "windows";
  binaryName: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const releaseDir = path.join(distDir, "release");

const pkg = JSON.parse(
  await Bun.file(path.join(rootDir, "package.json")).text(),
);

const packageName = "opencode-worktree";
const version = pkg.version as string;

export const targets: Target[] = [
  {
    os: "darwin",
    arch: "arm64",
    bunTarget: "bun-darwin-arm64",
    packagePlatform: "darwin",
    binaryName: "opencode-worktree",
  },
  {
    os: "darwin",
    arch: "x64",
    bunTarget: "bun-darwin-x64",
    packagePlatform: "darwin",
    binaryName: "opencode-worktree",
  },
  {
    os: "linux",
    arch: "x64",
    bunTarget: "bun-linux-x64",
    packagePlatform: "linux",
    binaryName: "opencode-worktree",
  },
  {
    os: "linux",
    arch: "arm64",
    bunTarget: "bun-linux-arm64",
    packagePlatform: "linux",
    binaryName: "opencode-worktree",
  },
  {
    os: "win32",
    arch: "x64",
    bunTarget: "bun-windows-x64",
    packagePlatform: "windows",
    binaryName: "opencode-worktree.exe",
  },
];

const ensureCleanDist = () => {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });
};

const installPlatformDependencies = async () => {
  const opentuiVersion = pkg.dependencies?.["@opentui/core"] ?? "^0.1.75";
  await $`bun install --os="*" --cpu="*" @opentui/core@${opentuiVersion}`;
};

const buildBinary = async (target: Target) => {
  const name = `${packageName}-${target.packagePlatform}-${target.arch}`;
  const outDir = path.join(releaseDir);

  const parserWorker = fs.realpathSync(
    path.join(rootDir, "node_modules/@opentui/core/parser.worker.js"),
  );
  const bunfsRoot = target.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/";
  const workerRelativePath = path
    .relative(rootDir, parserWorker)
    .replace(/\\/g, "/");

  let result: Bun.BuildOutput;
  try {
    result = await Bun.build({
      entrypoints: [path.join(rootDir, "src/cli.ts"), parserWorker],
      minify: true,
      compile: {
        target: target.bunTarget as Bun.Build.Target,
        outfile: path.join(
          outDir,
          name + (target.os === "win32" ? ".exe" : ""),
        ),
        autoloadBunfig: false,
        autoloadDotenv: false,
        autoloadPackageJson: true,
        autoloadTsconfig: true,
      },
      define: {
        OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(
          bunfsRoot + workerRelativePath,
        ),
      },
    });
  } catch (error) {
    console.error(`Bundle threw for ${name}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
    throw error;
  }

  if (!result.success) {
    const logs = result.logs
      .map((log) => `${log.level}: ${log.message}`)
      .join("\n");
    throw new Error(`Bundle failed for ${name}:\n${logs}`);
  }

  return name;
};

export const buildAll = async ({ single = false } = {}) => {
  await installPlatformDependencies();
  ensureCleanDist();

  const selectedTargets = single
    ? targets.filter(
        (item) => item.os === process.platform && item.arch === process.arch,
      )
    : targets;

  for (const target of selectedTargets) {
    await buildBinary(target);
  }
};

if (import.meta.main) {
  const single = process.argv.includes("--single");
  await buildAll({ single });
}
