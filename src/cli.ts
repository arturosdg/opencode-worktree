import { runApp } from "./ui.js";

// Build-time injected constants (defined in script/build.ts)
// Use typeof check to provide fallbacks for dev mode (bun run dev)
declare const __PACKAGE_VERSION__: string | undefined;
declare const __PACKAGE_NAME__: string | undefined;

const pkg = {
  name: typeof __PACKAGE_NAME__ !== "undefined" ? __PACKAGE_NAME__ : "opencode-worktree",
  version: typeof __PACKAGE_VERSION__ !== "undefined" ? __PACKAGE_VERSION__ : "dev",
};

// Accept optional path argument: opencode-worktree [path]
const targetPath = process.argv[2] || process.cwd();

runApp(targetPath, pkg).catch((error: unknown) => {
  console.error("Failed to start OpenTUI worktree selector.");
  console.error(error);
  process.exit(1);
});
