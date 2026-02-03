import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type UpdateInfo = {
  hasUpdate: boolean;
  current: string;
  latest: string;
};

type UpdateCache = {
  name: string; // Package name to verify cache matches
  latest: string;
  lastCheck: number;
};

const CACHE_DIR = path.join(os.homedir(), ".config", "configstore");
const CACHE_FILE = path.join(CACHE_DIR, "opencode-worktree-update.json");

// Check interval: 1 hour in milliseconds
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Read the cached update info from disk
 * Returns null if cache doesn't exist or package name doesn't match
 */
function readCache(packageName: string): UpdateCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CACHE_FILE, "utf-8");
    const cache = JSON.parse(content) as UpdateCache;
    
    // Verify the cache is for the correct package
    if (cache.name !== packageName) {
      return null;
    }
    
    return cache;
  } catch {
    return null;
  }
}

/**
 * Compare two semver version strings
 * Returns true if latest > current
 */
function isNewerVersion(current: string, latest: string): boolean {
  // Handle dev versions
  if (current === "dev" || current === "0.0.0") {
    return false;
  }

  const parseVersion = (v: string): number[] => {
    return v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  };

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Spawn a detached background process to fetch the latest version from npm
 * and write it to the cache file. This doesn't block the main process.
 */
function fetchLatestInBackground(packageName: string): void {
  // Create an inline script that fetches from npm and writes to cache
  const script = `
    const https = require('https');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const cacheDir = path.join(os.homedir(), '.config', 'configstore');
    const cacheFile = path.join(cacheDir, 'opencode-worktree-update.json');

    const url = 'https://registry.npmjs.org/${packageName}/latest';

    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          if (pkg.version) {
            if (!fs.existsSync(cacheDir)) {
              fs.mkdirSync(cacheDir, { recursive: true });
            }
            fs.writeFileSync(cacheFile, JSON.stringify({
              name: '${packageName}',
              latest: pkg.version,
              lastCheck: Date.now()
            }, null, 2));
          }
        } catch {}
      });
    }).on('error', () => {});
  `;

  try {
    // Spawn node to run the script
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });

    // Unref so the parent process can exit independently
    child.unref();
  } catch {
    // Silently fail - background fetch is best-effort
  }
}

/**
 * Check for updates. This is non-blocking:
 * 1. Reads the cached latest version (if available)
 * 2. Compares against current version
 * 3. Spawns a background process to refresh the cache for next time
 *
 * Returns null if no cache exists yet (first run)
 */
export function checkForUpdate(pkg: {
  name: string;
  version: string;
}): UpdateInfo | null {
  const cache = readCache(pkg.name);
  const now = Date.now();

  // Spawn background fetch if cache is stale or doesn't exist
  const shouldFetch =
    !cache || now - cache.lastCheck > CHECK_INTERVAL_MS;

  if (shouldFetch) {
    fetchLatestInBackground(pkg.name);
  }

  // If no cache, we can't determine if there's an update yet
  if (!cache) {
    return null;
  }

  return {
    hasUpdate: isNewerVersion(pkg.version, cache.latest),
    current: pkg.version,
    latest: cache.latest,
  };
}
