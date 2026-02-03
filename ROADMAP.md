# opencode-worktree-tui Roadmap

## v0.2 - Core Improvements

### Worktree Management

- [x] **Delete worktrees** - Remove worktrees directly from the TUI with confirmation prompt
- [x] **Unlink worktrees** - Remove worktree directory but keep branch for later use
- [x] **Multi-select delete mode** - Press `d` to enter selection mode, use Enter to toggle worktrees for deletion, confirm to batch delete
- [ ] **Prune stale worktrees** - Clean up worktrees whose branches have been deleted

### UX Improvements

- [x] **Worktree metadata display** - Show branch name, last commit date, dirty status, ahead/behind remote
- [x] **Color coding** - Highlight dirty worktrees, stale branches, or the main worktree
- [x] **Keyboard shortcuts help** - Show available commands at the bottom of the screen
- [x] **Open in file manager** - Press `o` to open worktree folder in Finder/Explorer
- [x] **Preselect new worktree** - After creating a worktree, return to list with new worktree preselected

---

## v0.3 - Enhanced Navigation & Configuration

### Configuration

- [x] **Post-create hooks** - Run custom commands after creating a worktree (e.g., `npm install`) with streaming output and failure handling
- [x] **Config editor** - Press `c` to edit configuration, with first-time setup prompt

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
