import { spawn } from "node:child_process";

export type HookResult = {
  success: boolean;
  exitCode: number | null;
};

export type HookCallbacks = {
  onOutput: (data: string) => void;
  onComplete: (result: HookResult) => void;
};

/**
 * Run a post-create hook command with streaming output
 * Returns a function to abort the hook if needed
 */
export const runPostCreateHook = (
  worktreePath: string,
  command: string,
  callbacks: HookCallbacks
): (() => void) => {
  const shell = process.platform === "win32" ? "cmd" : "/bin/sh";
  const shellFlag = process.platform === "win32" ? "/c" : "-c";

  const child = spawn(shell, [shellFlag, command], {
    cwd: worktreePath,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Stream stdout
  child.stdout?.on("data", (data: Buffer) => {
    callbacks.onOutput(data.toString());
  });

  // Stream stderr
  child.stderr?.on("data", (data: Buffer) => {
    callbacks.onOutput(data.toString());
  });

  // Handle completion
  child.on("close", (code: number | null) => {
    callbacks.onComplete({
      success: code === 0,
      exitCode: code,
    });
  });

  // Handle errors
  child.on("error", (err: Error) => {
    callbacks.onOutput(`Error: ${err.message}\n`);
    callbacks.onComplete({
      success: false,
      exitCode: null,
    });
  });

  // Return abort function
  return () => {
    child.kill("SIGTERM");
  };
};
