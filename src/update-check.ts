import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";

export type UpdateInfo = {
  hasUpdate: boolean;
  current: string;
  latest: string;
};

type UpdateCache = {
  name: string;
  latest: string;
  lastCheck: number;
};

const CACHE_DIR = path.join(os.homedir(), ".config", "configstore");
const CACHE_FILE = path.join(CACHE_DIR, "opencode-worktree-update.json");
const REQUEST_TIMEOUT_MS = 4000;

function readCache(packageName: string): UpdateCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CACHE_FILE, "utf-8");
    const cache = JSON.parse(content) as UpdateCache;
    if (cache.name !== packageName) {
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

function writeCache(packageName: string, latestVersion: string): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(
        {
          name: packageName,
          latest: latestVersion,
          lastCheck: Date.now(),
        },
        null,
        2,
      ),
    );
  } catch {
    // Best-effort cache write.
  }
}

function isNewerVersion(current: string, latest: string): boolean {
  if (current === "dev" || current === "0.0.0") {
    return false;
  }

  const parseVersion = (version: string): number[] =>
    version
      .replace(/^v/, "")
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

function fetchLatestVersion(packageName: string): void {
  const url = `https://registry.npmjs.org/${packageName}/latest`;

  const request = https.get(
    url,
    { headers: { Accept: "application/json" } },
    (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return;
      }

      let data = "";
      response.on("data", (chunk: Buffer) => {
        data += chunk.toString("utf-8");
      });
      response.on("end", () => {
        try {
          const payload = JSON.parse(data) as { version?: string };
          if (payload.version) {
            writeCache(packageName, payload.version);
          }
        } catch {
          // Ignore invalid response payloads.
        }
      });
    },
  );

  request.setTimeout(REQUEST_TIMEOUT_MS, () => {
    request.destroy();
  });
  request.on("error", () => {
    // Best-effort network check.
  });
}

export function getCachedUpdateNotice(pkg: {
  name: string;
  version: string;
}): UpdateInfo | null {
  const cache = readCache(pkg.name);
  if (!cache) {
    return null;
  }

  return {
    hasUpdate: isNewerVersion(pkg.version, cache.latest),
    current: pkg.version,
    latest: cache.latest,
  };
}

export function checkForUpdatesOnLaunch(pkg: { name: string }): void {
  fetchLatestVersion(pkg.name);
}
