# opencode-worktree-tui Roadmap

## v0.2 - Core Improvements

### Worktree Management

- [x] **Delete worktrees** - Remove worktrees directly from the TUI with confirmation prompt
- [x] **Unlink worktrees** - Remove worktree directory but keep branch for later use
- [ ] **Prune stale worktrees** - Clean up worktrees whose branches have been deleted

### UX Improvements

- [ ] **Worktree metadata display** - Show branch name, last commit date, dirty status, ahead/behind remote
- [ ] **Color coding** - Highlight dirty worktrees, stale branches, or the main worktree
- [x] **Keyboard shortcuts help** - Show available commands at the bottom of the screen

---

## v0.3 - Enhanced Navigation & Configuration

### Navigation

- [ ] **Search/filter worktrees** - Type to filter when you have many worktrees
- [ ] **Switch between worktrees** - Open a new terminal/tmux pane in the selected worktree instead of launching opencode

### Configuration

- [ ] **Custom worktrees directory** - Allow specifying where new worktrees are created via config file or flag
- [ ] **Default branch prefix** - Configure a prefix for new branches (e.g., `feature/`, `fix/`)
- [ ] **Post-create hooks** - Run custom commands after creating a worktree (e.g., `npm install`)

---

## v0.4 - Integrations

### Terminal Multiplexer Support

- [ ] **tmux integration** - Open worktree in new tmux window/pane
- [ ] **Terminal tab support** - Open in new terminal tab (iTerm2, Warp, etc.)

### Git Platform Integration

- [ ] **GitHub integration** - Create worktree from PR number
- [ ] **GitLab integration** - Create worktree from MR number

---

## Future

### Distribution

- [ ] **npm/bun publish** - Package for global installation via `npm install -g` or `bun add -g`
- [ ] **Homebrew formula** - Easy installation on macOS via `brew install`
- [ ] **Binary releases** - Standalone executables via `bun compile`
- [ ] **Shell alias installer** - Generate shell alias for quick access (e.g., `wt` command)

### Advanced Features

- [ ] **Multi-repo support** - Manage worktrees across multiple repositories
- [ ] **Worktree templates** - Pre-configured setups for different worktree types
- [ ] **Session persistence** - Remember last used worktree per repository
