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
