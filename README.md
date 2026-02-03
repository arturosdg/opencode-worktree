# opencode-worktree

Terminal UI for managing git worktrees and launching `opencode` in the selected worktree.

## Features

- Lists all worktrees with branch, path, and metadata
- Worktree metadata display: last edited time, dirty status, remote tracking
- Status indicators: `[main]` for main worktree, `[*]` for uncommitted changes, `[local]` for local-only branches
- Create new worktrees directly from the TUI (returns to list with new worktree preselected)
- Open worktree folder in file manager
- Unlink worktrees (remove directory, keep branch)
- Delete worktrees and local branches (never remote)
- Multi-select delete mode for batch deletion
- Launches `opencode` in the selected worktree
- Refresh list on demand

## Requirements

- Git
- `opencode` available on your PATH

## Install (npm)

```bash
npm i -g opencode-worktree
```

## Run

```bash
opencode-worktree
```

Or specify a repo path:

```bash
opencode-worktree /path/to/your/repo
```

## Keybindings

- `Up`/`Down` or `j`/`k`: navigate
- `Enter`: open selected worktree in opencode (or toggle selection in delete mode)
- `o`: open worktree folder in file manager (Finder/Explorer)
- `d`: enter multi-select delete mode (press again to confirm deletion)
- `n`: create new worktree
- `r`: refresh list
- `q` or `Esc`: quit (or cancel dialogs/modes)

### Multi-select delete mode

1. Press `d` to enter selection mode
2. Navigate with arrow keys and press `Enter` to toggle worktrees for deletion
3. Press `d` again to confirm and choose unlink/delete action
4. Press `Esc` to cancel and return to normal mode

## Update notifications

When a new version is published to npm, the CLI will show a non-intrusive update message on the next run.

## Development

```bash
bun install
bun run dev
```

## Build (local)

```bash
bun run build:single
```

Build all platforms (release only):

```bash
bun run build:all
```
