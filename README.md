# opencode-worktree

Terminal UI for managing git worktrees and launching `opencode` in the selected worktree.

## Features

- Lists all worktrees with branch, path, and short HEAD
- Create new worktrees directly from the TUI
- Unlink worktrees (remove directory, keep branch)
- Delete worktrees and local branches (never remote)
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
- `Enter`: open selected worktree
- `d`: unlink/delete menu
- `n`: create new worktree
- `r`: refresh list
- `q` or `Esc`: quit (or cancel dialogs)

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
