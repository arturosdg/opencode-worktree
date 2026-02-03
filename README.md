# opencode-worktree

Terminal UI for managing git worktrees and launching your preferred coding tool in the selected worktree.

## Features

- Lists all worktrees with branch, path, and metadata
- Worktree metadata display: last edited time, dirty status, remote tracking
- Status indicators: `[main]` for main worktree, `[*]` for uncommitted changes, `[local]` for local-only branches
- Create new worktrees directly from the TUI
- **Create branch from worktree**: create a new branch from any worktree's current commit, with optional checkout
- Post-create hooks: automatically run commands (e.g., `npm install`) after creating a worktree
- Open worktree folder in file manager or custom editor
- Unlink worktrees (remove directory, keep branch)
- Delete worktrees and local branches (never remote)
- Multi-select delete mode for batch deletion
- **Customizable launch command**: use `opencode`, `cursor`, `claude`, `code`, or any CLI tool
- **Global configuration**: settings stored in `~/.config/opencode-worktree/config.json` with per-repo overrides
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
- `b`: create a new branch from selected worktree's current commit
- `c`: edit configuration (hooks, open command, launch command)
- `r`: refresh list
- `q` or `Esc`: quit (or cancel dialogs/modes)

### Create branch from worktree

1. Select a worktree and press `b`
2. Enter a name for the new branch
3. The branch is created starting from the worktree's current commit
4. Choose whether to checkout the new branch in the worktree

### Multi-select delete mode

1. Press `d` to enter selection mode
2. Navigate with arrow keys and press `Enter` to toggle worktrees for deletion
3. Press `d` again to confirm and choose unlink/delete action
4. Press `Esc` to cancel and return to normal mode

## Configuration

Configuration is stored globally at `~/.config/opencode-worktree/config.json` with support for default settings and per-repository overrides. Press `c` in the TUI to edit settings.

Repositories are identified by their git remote URL (e.g., `github.com/user/repo`).

### Configuration structure

```json
{
  "default": {
    "postCreateHook": "",
    "openCommand": "",
    "launchCommand": "opencode"
  },
  "repos": {
    "github.com/user/repo": {
      "postCreateHook": "npm install",
      "launchCommand": "cursor"
    }
  }
}
```

### Configuration options

| Option | Description | Default |
|--------|-------------|---------|
| `postCreateHook` | Command to run after creating a worktree | none |
| `openCommand` | Command for opening worktree folders (`o` key) | system default |
| `launchCommand` | Command to launch when selecting a worktree (`Enter` key) | `opencode` |

### Example per-repo configuration

When you edit config in the TUI, settings are saved under the repo's key (derived from git remote URL):

```json
{
  "default": {
    "launchCommand": "opencode"
  },
  "repos": {
    "github.com/myorg/frontend": {
      "postCreateHook": "npm install",
      "openCommand": "code",
      "launchCommand": "cursor"
    },
    "github.com/myorg/backend": {
      "postCreateHook": "go mod download",
      "launchCommand": "zed"
    }
  }
}
```

### Editing configuration

Press `c` at any time to edit your configuration. The config editor title shows which repository you're configuring (e.g., "Config: github.com/user/repo"). Use `Tab` to switch between fields.

**Note:** Repositories without a git remote will use default settings. The TUI shows a warning when editing config for repos without a remote.

### Post-create hooks

Run a command automatically after creating a new worktree. Useful for installing dependencies.

The hook output is streamed to the TUI in real-time. If the hook fails, you can choose to open the tool anyway or cancel.

**Examples:** `npm install`, `bun install`, `npm install && npm run setup`

### Custom open command

Use a custom command when pressing `o` to open worktree folders. Useful for opening in your preferred IDE.

**Examples:** `code`, `webstorm`, `idea`

### Custom launch command

Use a different tool instead of `opencode` when pressing `Enter` to open a worktree. This allows you to use any CLI-based coding tool.

**Examples:** `cursor`, `claude`, `code`, `zed`

### Migration from v0.3.x

Previous versions stored config in `.opencode-worktree.json` files in each repository. These files are now ignored. Your settings will need to be reconfigured via the TUI (`c` key), which will save them to the new global config location.

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
