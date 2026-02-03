import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoKey } from "./git.js";
import type { Config, GlobalConfig, LoadRepoConfigResult } from "./types.js";

// Re-export Config type for backwards compatibility
export type { Config } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "opencode-worktree");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Get the path to the global config directory
 */
export const getGlobalConfigDir = (): string => {
  return CONFIG_DIR;
};

/**
 * Get the path to the global config file
 */
export const getGlobalConfigPath = (): string => {
  return CONFIG_FILE;
};

/**
 * Get the default configuration values
 */
export const getDefaultConfig = (): Config => {
  return {
    postCreateHook: "",
    openCommand: "",
    launchCommand: "opencode",
  };
};

/**
 * Create an empty global config structure
 */
const createEmptyGlobalConfig = (): GlobalConfig => {
  return {
    default: getDefaultConfig(),
    repos: {},
  };
};

/**
 * Ensure the config directory exists
 */
const ensureConfigDir = (): boolean => {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Load the entire global config file
 */
export const loadGlobalConfig = (): GlobalConfig => {
  if (!existsSync(CONFIG_FILE)) {
    return createEmptyGlobalConfig();
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(content);

    // Validate and normalize the config structure
    if (typeof parsed !== "object" || parsed === null) {
      return createEmptyGlobalConfig();
    }

    const globalConfig: GlobalConfig = {
      default: { ...getDefaultConfig() },
      repos: {},
    };

    // Parse default config
    if (typeof parsed.default === "object" && parsed.default !== null) {
      if (typeof parsed.default.postCreateHook === "string") {
        globalConfig.default.postCreateHook = parsed.default.postCreateHook;
      }
      if (typeof parsed.default.openCommand === "string") {
        globalConfig.default.openCommand = parsed.default.openCommand;
      }
      if (typeof parsed.default.launchCommand === "string") {
        globalConfig.default.launchCommand = parsed.default.launchCommand;
      }
    }

    // Parse repos config
    if (typeof parsed.repos === "object" && parsed.repos !== null) {
      for (const [key, value] of Object.entries(parsed.repos)) {
        if (typeof value === "object" && value !== null) {
          const repoConfig: Partial<Config> = {};
          const v = value as Record<string, unknown>;

          if (typeof v.postCreateHook === "string") {
            repoConfig.postCreateHook = v.postCreateHook;
          }
          if (typeof v.openCommand === "string") {
            repoConfig.openCommand = v.openCommand;
          }
          if (typeof v.launchCommand === "string") {
            repoConfig.launchCommand = v.launchCommand;
          }

          // Only add if there are actual values
          if (Object.keys(repoConfig).length > 0) {
            globalConfig.repos[key] = repoConfig;
          }
        }
      }
    }

    return globalConfig;
  } catch {
    // If we can't read or parse the config, return empty
    return createEmptyGlobalConfig();
  }
};

/**
 * Save the entire global config file
 */
export const saveGlobalConfig = (config: GlobalConfig): boolean => {
  if (!ensureConfigDir()) {
    return false;
  }

  try {
    const content = JSON.stringify(config, null, 2) + "\n";
    writeFileSync(CONFIG_FILE, content, "utf8");
    return true;
  } catch {
    return false;
  }
};

/**
 * Load configuration for a specific repository
 * Merges default config with repo-specific overrides
 * Returns the config and the repo key (null if no remote)
 */
export const loadRepoConfig = (repoRoot: string): LoadRepoConfigResult => {
  const repoKey = getRepoKey(repoRoot);
  const globalConfig = loadGlobalConfig();

  // Start with default config
  const config: Config = { ...globalConfig.default };

  // If we have a repo key, merge in repo-specific config
  if (repoKey && globalConfig.repos[repoKey]) {
    const repoConfig = globalConfig.repos[repoKey];

    if (repoConfig.postCreateHook !== undefined) {
      config.postCreateHook = repoConfig.postCreateHook;
    }
    if (repoConfig.openCommand !== undefined) {
      config.openCommand = repoConfig.openCommand;
    }
    if (repoConfig.launchCommand !== undefined) {
      config.launchCommand = repoConfig.launchCommand;
    }
  }

  return { config, repoKey };
};

/**
 * Save configuration for a specific repository
 * Only saves values that differ from the default
 * Returns false if there's no remote (can't save repo-specific config)
 */
export const saveRepoConfig = (repoRoot: string, config: Config): boolean => {
  const repoKey = getRepoKey(repoRoot);

  if (!repoKey) {
    // No remote - can't save repo-specific config
    return false;
  }

  const globalConfig = loadGlobalConfig();

  // Calculate which values differ from default
  const repoConfig: Partial<Config> = {};

  if (config.postCreateHook !== globalConfig.default.postCreateHook) {
    repoConfig.postCreateHook = config.postCreateHook;
  }
  if (config.openCommand !== globalConfig.default.openCommand) {
    repoConfig.openCommand = config.openCommand;
  }
  if (config.launchCommand !== globalConfig.default.launchCommand) {
    repoConfig.launchCommand = config.launchCommand;
  }

  // Update or remove the repo entry
  if (Object.keys(repoConfig).length > 0) {
    globalConfig.repos[repoKey] = repoConfig;
  } else {
    // All values match default, remove the entry
    delete globalConfig.repos[repoKey];
  }

  return saveGlobalConfig(globalConfig);
};
