import { runApp } from "./ui.js";

// Accept optional path argument: opencode-worktree [path]
const targetPath = process.argv[2] || process.cwd();

runApp(targetPath).catch((error: unknown) => {
  console.error("Failed to start OpenTUI worktree selector.");
  console.error(error);
  process.exit(1);
});
