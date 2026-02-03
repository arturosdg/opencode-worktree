# opencode-worktree

Terminal UI for managing git worktrees and launching your preferred coding tool in the selected worktree.

## Features

- Lists all worktrees with branch, path, and metadata
- Worktree metadata display: last edited time, dirty status, remote tracking
- Status indicators: `[main]` for main worktree, `[*]` for uncommitted changes, `[local]` for local-only branches
- Create new worktrees directly from the TUI
- Post-create hooks: automatically run commands (e.g., `npm install`) after creating a worktree
- Open worktree folder in file manager or custom editor
- Unlink worktrees (remove directory, keep branch)
- Delete worktrees and local branches (never remote)
- Multi-select delete mode for batch deletion
- **Customizable launch command**: use `opencode`, `cursor`, `claude`, `code`, or any CLI tool
- Refresh list on demand
- Update notifications when new versions are available

## Requirements

- Git
- A CLI tool available on your PATH (e.g., `opencode`, `cursor`, `claude`, `code`)

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
- `Enter`: open selected worktree in configured tool (or toggle selection in delete mode)
- `o`: open worktree folder in file manager or custom editor (configurable)
- `d`: enter multi-select delete mode (press again to confirm deletion)
- `n`: create new worktree
- `c`: edit configuration (hooks, open command, launch command)
- `r`: refresh list
- `q` or `Esc`: quit (or cancel dialogs/modes)

### Multi-select delete mode

1. Press `d` to enter selection mode
2. Navigate with arrow keys and press `Enter` to toggle worktrees for deletion
3. Press `d` again to confirm and choose unlink/delete action
4. Press `Esc` to cancel and return to normal mode

## Configuration

You can configure per-repository settings by creating a `.opencode-worktree.json` file in your repository root, or by pressing `c` in the TUI.

### Configuration options

| Option | Description | Default |
|--------|-------------|---------|
| `postCreateHook` | Command to run after creating a worktree | none |
| `openCommand` | Command for opening worktree folders (`o` key) | system default |
| `launchCommand` | Command to launch when selecting a worktree (`Enter` key) | `opencode` |

### Example configuration

```json
{
  "postCreateHook": "npm install",
  "openCommand": "code",
  "launchCommand": "cursor"
}
```

### First-time setup

When you first run `opencode-worktree` in a repository without a configuration file, you'll be prompted to configure settings. You can also skip this step and configure later by pressing `c`.

### Editing configuration

Press `c` at any time to edit your configuration. Use `Tab` to switch between fields.

### Post-create hooks

Run a command automatically after creating a new worktree. Useful for installing dependencies.

```json
{
  "postCreateHook": "npm install"
}
```

The hook output is streamed to the TUI in real-time. If the hook fails, you can choose to open the tool anyway or cancel.

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

### Custom open command

Use a custom command when pressing `o` to open worktree folders. Useful for opening in your preferred IDE.

```json
{
  "openCommand": "webstorm"
}
```

**Examples:**

```json
{
  "openCommand": "code"
}
```

### Custom launch command

Use a different tool instead of `opencode` when pressing `Enter` to open a worktree. This allows you to use any CLI-based coding tool.

```json
{
  "launchCommand": "cursor"
}
```

**Examples:**

```json
{
  "launchCommand": "claude"
}
```

```json
{
  "launchCommand": "code"
}
```

```json
{
  "launchCommand": "zed"
}
```

### Full configuration example

```json
{
  "postCreateHook": "npm install",
  "openCommand": "code",
  "launchCommand": "cursor"
}
```

## Update notifications

When a new version is published to npm, the TUI will show a non-intrusive update message in the title bar. The version check runs in the background and doesn't slow down startup.

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
