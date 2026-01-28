#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

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

const downloadFile = async (url, targetPath) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
};

const installBinary = async () => {
  const { platform, arch } = detectPlatformAndArch();
  const isWindows = platform === "windows";
  const binaryName = isWindows
    ? "opencode-worktree.exe"
    : "opencode-worktree-bin";
  const downloadName = `opencode-worktree-${platform}-${arch}${isWindows ? ".exe" : ""}`;
  const version = pkg.version;
  const downloadUrl = `https://github.com/arturosdg/opencode-worktree/releases/download/v${version}/${downloadName}`;

  const binDir = path.join(__dirname, "..", "bin");
  const binaryPath = path.join(binDir, binaryName);

  fs.mkdirSync(binDir, { recursive: true });
  await downloadFile(downloadUrl, binaryPath);

  if (!isWindows) {
    fs.chmodSync(binaryPath, 0o755);
  }

  return binaryPath;
};

try {
  const binaryPath = await installBinary();
  console.log(`opencode-worktree binary installed at: ${binaryPath}`);
} catch (error) {
  console.error("Failed to install opencode-worktree binary.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
