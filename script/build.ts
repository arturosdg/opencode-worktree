#!/usr/bin/env bun

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
};

const buildBinary = async (target: Target) => {
  const name = `${packageName}-${target.packagePlatform}-${target.arch}`;
  const outDir = path.join(distDir, name, "bin");
  fs.mkdirSync(outDir, { recursive: true });

  const parserWorker = fs.realpathSync(
    path.join(rootDir, "node_modules/@opentui/core/parser.worker.js"),
  );
  const bunfsRoot = target.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/";
  const workerRelativePath = path
    .relative(rootDir, parserWorker)
    .replaceAll("\\", "/");

  const result = await Bun.build({
    entrypoints: [path.join(rootDir, "src/cli.ts"), parserWorker],
    minify: true,
    compile: {
      target: target.bunTarget as Bun.Build.Target,
      outfile: path.join(outDir, target.binaryName),
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

  if (!result.success) {
    const logs = result.logs
      .map((log) => `${log.level}: ${log.message}`)
      .join("\n");
    throw new Error(`Bundle failed for ${name}:\n${logs}`);
  }

  const packageJson = {
    name,
    version,
    os: [target.os],
    cpu: [target.arch],
    bin: {
      [packageName]: `./bin/${target.binaryName}`,
    },
    files: ["bin"],
    license: "MIT",
  };

  await Bun.write(
    path.join(distDir, name, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  return name;
};

const buildWrapper = async (binaryPackages: string[]) => {
  const wrapperDir = path.join(distDir, packageName);
  const wrapperBinDir = path.join(wrapperDir, "bin");

  fs.mkdirSync(wrapperBinDir, { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, "bin/opencode-worktree"),
    path.join(wrapperBinDir, "opencode-worktree"),
  );
  fs.copyFileSync(
    path.join(rootDir, "script/postinstall.mjs"),
    path.join(wrapperDir, "postinstall.mjs"),
  );

  const optionalDependencies = Object.fromEntries(
    binaryPackages.map((name) => [name, version]),
  );

  const wrapperPackageJson = {
    name: packageName,
    version,
    description: pkg.description,
    license: "MIT",
    author: pkg.author,
    repository: pkg.repository,
    bugs: pkg.bugs,
    homepage: pkg.homepage,
    bin: {
      [packageName]: "./bin/opencode-worktree",
    },
    scripts: {
      postinstall: "node ./postinstall.mjs",
    },
    dependencies: {
      "update-notifier": "^7.3.1",
    },
    optionalDependencies,
    files: ["bin", "postinstall.mjs"],
    engines: {
      node: ">=18",
    },
  };

  await Bun.write(
    path.join(wrapperDir, "package.json"),
    JSON.stringify(wrapperPackageJson, null, 2),
  );
};

export const buildAll = async ({ single = false } = {}) => {
  ensureCleanDist();

  const selectedTargets = single
    ? targets.filter(
        (item) => item.os === process.platform && item.arch === process.arch,
      )
    : targets;

  const binaryPackages: string[] = [];
  for (const target of selectedTargets) {
    const name = await buildBinary(target);
    binaryPackages.push(name);
  }

  await buildWrapper(binaryPackages);
};

if (import.meta.main) {
  const single = process.argv.includes("--single");
  await buildAll({ single });
}
