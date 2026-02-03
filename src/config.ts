import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Config = {
  postCreateHook?: string;
  openCommand?: string; // Custom command to open worktree folder (e.g., "webstorm", "code")
};

const CONFIG_FILENAME = ".opencode-worktree.json";

/**
 * Get the path to the config file for a repo
 */
export const getConfigPath = (repoRoot: string): string => {
  return join(repoRoot, CONFIG_FILENAME);
};

/**
 * Check if a config file exists for the repo
 */
export const configExists = (repoRoot: string): boolean => {
  return existsSync(getConfigPath(repoRoot));
};

/**
 * Load per-repo configuration from .opencode-worktree.json in the repo root
 */
export const loadRepoConfig = (repoRoot: string): Config => {
  const configPath = getConfigPath(repoRoot);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(content);

    // Validate the config structure
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const config: Config = {};

    if (typeof parsed.postCreateHook === "string") {
      config.postCreateHook = parsed.postCreateHook;
    }

    if (typeof parsed.openCommand === "string") {
      config.openCommand = parsed.openCommand;
    }

    return config;
  } catch {
    // If we can't read or parse the config, return empty
    return {};
  }
};

/**
 * Save configuration to .opencode-worktree.json in the repo root
 */
export const saveRepoConfig = (repoRoot: string, config: Config): boolean => {
  const configPath = getConfigPath(repoRoot);

  try {
    const content = JSON.stringify(config, null, 2) + "\n";
    writeFileSync(configPath, content, "utf8");
    return true;
  } catch {
    return false;
  }
};
