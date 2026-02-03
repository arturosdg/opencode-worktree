import { spawn, spawnSync } from "node:child_process";

/**
 * Check if a command is available in PATH
 */
export const isCommandAvailable = (command: string): boolean => {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });
  return result.status === 0;
};

/**
 * @deprecated Use isCommandAvailable instead
 */
export const isOpenCodeAvailable = (): boolean => {
  return isCommandAvailable("opencode");
};

/**
 * Launch a command in a worktree directory
 * If customCommand is provided, uses that instead of opencode
 */
export const launchCommand = (cwd: string, customCommand?: string): void => {
  const command = customCommand || "opencode";
  
  const child = spawn(command, [], {
    cwd,
    stdio: "inherit",
  });

  child.on("exit", (code: number | null) => {
    const exitCode = typeof code === "number" ? code : 0;
    process.exit(exitCode);
  });
};

/**
 * @deprecated Use launchCommand instead
 */
export const launchOpenCode = (cwd: string): void => {
  launchCommand(cwd);
};

/**
 * Open a path in the system file manager or with a custom command
 * If customCommand is provided, uses that instead of the system default
 */
export const openInFileManager = (path: string, customCommand?: string): boolean => {
  let command: string;
  let args: string[];

  if (customCommand) {
    // Use custom command (e.g., "webstorm", "code")
    command = customCommand;
    args = [path];
  } else {
    // Use system default
    const platform = process.platform;

    if (platform === "darwin") {
      command = "open";
      args = [path];
    } else if (platform === "win32") {
      command = "explorer";
      args = [path];
    } else {
      // Linux and others
      command = "xdg-open";
      args = [path];
    }
  }

  try {
    spawn(command, args, {
      detached: true,
      stdio: "ignore",
    }).unref();
    return true;
  } catch {
    return false;
  }
};
