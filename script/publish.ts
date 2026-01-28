#!/usr/bin/env bun

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { $ } from "bun";
import { buildAll, targets } from "./build.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const packageName = "opencode-worktree";

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    throw new Error(`Missing directory: ${dir}`);
  }
};

const publishPackage = async (dir: string) => {
  ensureDir(dir);
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(dir);
  }
  await $`bun pm pack`.cwd(dir);
  await $`npm publish *.tgz --access public`.cwd(dir);
};

try {
  await buildAll();

  const binaryPackages = targets.map(
    (target) => `${packageName}-${target.packagePlatform}-${target.arch}`,
  );

  for (const name of binaryPackages) {
    await publishPackage(path.join(distDir, name));
  }

  await publishPackage(path.join(distDir, packageName));
} catch (error) {
  console.error("Publish failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
