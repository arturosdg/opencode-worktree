import { execFileSync } from "node:child_process";
import { WorktreeInfo } from "./types.js";

export const resolveRepoRoot = (cwd: string): string | null => {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return output.trim() || null;
  } catch {
    return null;
  }
};

export const parseWorktreeList = (output: string): WorktreeInfo[] => {
  const lines = output.split(/\r?\n/);
  const worktrees: WorktreeInfo[] = [];
  let current: WorktreeInfo | null = null;

  const pushCurrent = (): void => {
    if (current?.path) {
      worktrees.push(current);
    }
  };

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      pushCurrent();
      current = {
        path: line.slice("worktree ".length).trim(),
        head: "",
        branch: null,
        isDetached: false,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      if (ref.startsWith("refs/heads/")) {
        current.branch = ref.replace("refs/heads/", "");
      }
      continue;
    }

    if (line.trim() === "detached") {
      current.isDetached = true;
      continue;
    }
  }

  pushCurrent();
  return worktrees;
};

export const listWorktrees = (cwd: string): WorktreeInfo[] => {
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return [];

  const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  return parseWorktreeList(output);
};

export type CreateWorktreeResult =
  | { success: true; path: string }
  | { success: false; error: string };

export const createWorktree = (
  repoRoot: string,
  branchName: string,
  worktreesDir: string,
): CreateWorktreeResult => {
  const worktreePath = `${worktreesDir}/${branchName}`;

  try {
    // Try to create worktree with new branch
    execFileSync("git", ["worktree", "add", "-b", branchName, worktreePath], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { success: true, path: worktreePath };
  } catch {
    // Branch might already exist, try without -b
    try {
      execFileSync("git", ["worktree", "add", worktreePath, branchName], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      return { success: true, path: worktreePath };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { success: false, error };
    }
  }
};

export const getDefaultWorktreesDir = (repoRoot: string): string => {
  // Place worktrees in a sibling 'worktrees' folder
  const parentDir = repoRoot.replace(/\/[^/]+$/, "");
  const repoName = repoRoot.split("/").pop() || "repo";
  return `${parentDir}/${repoName}-worktrees`;
};

/**
 * Check if a worktree has uncommitted changes (dirty state)
 */
export const hasUncommittedChanges = (worktreePath: string): boolean => {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], {
      cwd: worktreePath,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return output.trim().length > 0;
  } catch {
    // If we can't check, assume it's clean to avoid blocking
    return false;
  }
};

/**
 * Check if a worktree is the main worktree (the original repo clone)
 */
export const isMainWorktree = (
  repoRoot: string,
  worktreePath: string,
): boolean => {
  // The main worktree path matches the repo root
  return repoRoot === worktreePath;
};

export type UnlinkResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Unlink a worktree - removes the worktree directory but keeps the branch
 */
export const unlinkWorktree = (
  repoRoot: string,
  worktreePath: string,
  force: boolean = false,
): UnlinkResult => {
  try {
    const args = ["worktree", "remove"];
    if (force) {
      args.push("--force");
    }
    args.push(worktreePath);

    execFileSync("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { success: false, error };
  }
};

export type DeleteResult =
  | { success: true }
  | { success: false; error: string; step: "unlink" | "branch" };

/**
 * Delete a worktree AND its local branch (never touches remote)
 */
export const deleteWorktree = (
  repoRoot: string,
  worktreePath: string,
  branchName: string,
  force: boolean = false,
): DeleteResult => {
  // First unlink the worktree
  const unlinkResult = unlinkWorktree(repoRoot, worktreePath, force);
  if (!unlinkResult.success) {
    return { success: false, error: unlinkResult.error, step: "unlink" };
  }

  // Then delete the local branch (never remote!)
  try {
    execFileSync("git", ["branch", "-D", branchName], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { success: false, error, step: "branch" };
  }
};
