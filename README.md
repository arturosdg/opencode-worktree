# opencode-worktree

Terminal UI for managing git worktrees and launching `opencode` in the selected worktree.

## Features

- Lists all worktrees with branch, path, and metadata
- Worktree metadata display: last edited time, dirty status, remote tracking
- Status indicators: `[main]` for main worktree, `[*]` for uncommitted changes, `[local]` for local-only branches
- Create new worktrees directly from the TUI
- Post-create hooks: automatically run commands (e.g., `npm install`) after creating a worktree
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
- `c`: edit configuration (post-create hooks)
- `r`: refresh list
- `q` or `Esc`: quit (or cancel dialogs/modes)

### Multi-select delete mode

1. Press `d` to enter selection mode
2. Navigate with arrow keys and press `Enter` to toggle worktrees for deletion
3. Press `d` again to confirm and choose unlink/delete action
4. Press `Esc` to cancel and return to normal mode

## Configuration

You can configure per-repository settings by creating a `.opencode-worktree.json` file in your repository root.

### First-time setup

When you first run `opencode-worktree` in a repository without a configuration file, you'll be prompted to configure a post-create hook. You can also skip this step and configure it later by pressing `c`.

### Editing configuration

Press `c` at any time to edit your configuration. Currently, this allows you to set or modify the post-create hook command.

### Post-create hooks

Run a command automatically after creating a new worktree. Useful for installing dependencies.

```json
{
  "postCreateHook": "npm install"
}
```

The hook output is streamed to the TUI in real-time. If the hook fails, you can choose to open opencode anyway or cancel.

**Examples:**

```json
{
  "postCreateHook": "bun install"
}
```

```json
{
  "postCreateHook": "npm install && npm run setup"
}
```

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
