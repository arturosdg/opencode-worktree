import { spawn, spawnSync } from "node:child_process";

export const isOpenCodeAvailable = (): boolean => {
  const result = spawnSync("opencode", ["--version"], {
    stdio: "ignore",
  });
  return result.status === 0;
};

export const launchOpenCode = (cwd: string): void => {
  const child = spawn("opencode", [], {
    cwd,
    stdio: "inherit",
  });

  child.on("exit", (code: number | null) => {
    const exitCode = typeof code === "number" ? code : 0;
    process.exit(exitCode);
  });
};

/**
 * Open a path in the system file manager (Finder on macOS, xdg-open on Linux, explorer on Windows)
 */
export const openInFileManager = (path: string): boolean => {
  const platform = process.platform;
  let command: string;
  let args: string[];

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
