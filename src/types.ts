export type WorktreeInfo = {
  path: string;
  head: string;
  branch: string | null;
  isDetached: boolean;
  // Metadata
  isDirty: boolean;
  isOnRemote: boolean;
  lastModified: Date | null;
};

/**
 * Per-repo configuration options
 */
export type Config = {
  postCreateHook?: string;
  openCommand?: string; // Custom command to open worktree folder (e.g., "webstorm", "code")
  launchCommand?: string; // Custom command to launch instead of opencode (e.g., "cursor", "claude")
};

/**
 * Global configuration structure stored at ~/.config/opencode-worktree/config.json
 * Contains default settings and per-repo overrides keyed by normalized git remote URL
 */
export type GlobalConfig = {
  default: Config;
  repos: Record<string, Partial<Config>>;
};

/**
 * Result of loading repo config, includes the repo key for display purposes
 */
export type LoadRepoConfigResult = {
  config: Config;
  repoKey: string | null; // null means no remote origin configured
};
