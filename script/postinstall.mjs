#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const detectPlatformAndArch = () => {
  let platform;
  switch (os.platform()) {
    case "darwin":
      platform = "darwin";
      break;
    case "linux":
      platform = "linux";
      break;
    case "win32":
      platform = "windows";
      break;
    default:
      platform = os.platform();
      break;
  }

  let arch;
  switch (os.arch()) {
    case "x64":
      arch = "x64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    default:
      arch = os.arch();
      break;
  }

  return { platform, arch };
};

const verifyBinary = () => {
  const { platform, arch } = detectPlatformAndArch();
  const packageName = `opencode-worktree-${platform}-${arch}`;
  const binaryName =
    platform === "windows" ? "opencode-worktree.exe" : "opencode-worktree";

  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageDir = path.dirname(packageJsonPath);
  const binaryPath = path.join(packageDir, "bin", binaryName);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}`);
  }

  return binaryPath;
};

try {
  const binaryPath = verifyBinary();
  console.log(`opencode-worktree binary verified at: ${binaryPath}`);
} catch (error) {
  console.error("Failed to setup opencode-worktree binary.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
