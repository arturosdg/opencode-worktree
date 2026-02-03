import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { basename } from "node:path";
import {
  createWorktree,
  deleteWorktree,
  getDefaultWorktreesDir,
  hasUncommittedChanges,
  isMainWorktree,
  listWorktrees,
  resolveRepoRoot,
  unlinkWorktree,
} from "./git.js";
import { isOpenCodeAvailable, launchOpenCode, openInFileManager } from "./opencode.js";
import { WorktreeInfo } from "./types.js";

type StatusLevel = "info" | "warning" | "error" | "success";

const statusColors: Record<StatusLevel, string> = {
  info: "#94A3B8",
  warning: "#F59E0B",
  error: "#EF4444",
  success: "#10B981",
};

const CREATE_NEW_WORKTREE_VALUE = Symbol("CREATE_NEW_WORKTREE");

type SelectionValue = WorktreeInfo | typeof CREATE_NEW_WORKTREE_VALUE;

type ConfirmAction = "unlink" | "delete" | "cancel";

const CONFIRM_UNLINK_VALUE: ConfirmAction = "unlink";
const CONFIRM_DELETE_VALUE: ConfirmAction = "delete";
const CONFIRM_CANCEL_VALUE: ConfirmAction = "cancel";

export const runApp = async (targetPath: string): Promise<void> => {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
  });

  renderer.setBackgroundColor("transparent");
  new WorktreeSelector(renderer, targetPath);
};

class WorktreeSelector {
  private selectElement: SelectRenderable;
  private statusText: TextRenderable;
  private instructions: TextRenderable;
  private title: TextRenderable;

  private inputContainer: BoxRenderable | null = null;
  private branchInput: InputRenderable | null = null;

  private confirmContainer: BoxRenderable | null = null;
  private confirmSelect: SelectRenderable | null = null;
  private confirmingWorktree: WorktreeInfo | null = null;
  private isConfirming = false;

  private opencodeAvailable = false;
  private repoRoot: string | null = null;
  private isCreatingWorktree = false;
  private worktreeOptions: SelectOption[] = [];

  // Multi-select delete mode
  private isSelectingForDelete = false;
  private selectedForDelete: Set<string> = new Set(); // Set of worktree paths

  constructor(
    private renderer: CliRenderer,
    private targetPath: string,
  ) {
    // Load worktrees first to get initial options
    this.repoRoot = resolveRepoRoot(this.targetPath);
    this.opencodeAvailable = isOpenCodeAvailable();
    this.worktreeOptions = this.buildInitialOptions();

    this.title = new TextRenderable(renderer, {
      id: "worktree-title",
      position: "absolute",
      left: 2,
      top: 1,
      content: "OPENCODE WORKTREES",
      fg: "#E2E8F0",
    });
    this.renderer.root.add(this.title);

    this.selectElement = new SelectRenderable(renderer, {
      id: "worktree-selector",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: 15,
      options: this.worktreeOptions,
      backgroundColor: "#0F172A",
      focusedBackgroundColor: "#1E293B",
      selectedBackgroundColor: "#1E3A5F",
      textColor: "#E2E8F0",
      selectedTextColor: "#38BDF8",
      descriptionColor: "#94A3B8",
      selectedDescriptionColor: "#E2E8F0",
      showScrollIndicator: true,
      wrapSelection: true,
      showDescription: true,
      fastScrollStep: 5,
    });
    this.renderer.root.add(this.selectElement);

    this.statusText = new TextRenderable(renderer, {
      id: "worktree-status",
      position: "absolute",
      left: 2,
      top: 19,
      content: this.getInitialStatusMessage(),
      fg: this.getInitialStatusColor(),
    });
    this.renderer.root.add(this.statusText);

    this.instructions = new TextRenderable(renderer, {
      id: "worktree-instructions",
      position: "absolute",
      left: 2,
      top: 20,
      content:
        "↑/↓ navigate • Enter open • o open folder • d delete • n new • r refresh • q quit",
      fg: "#64748B",
    });
    this.renderer.root.add(this.instructions);

    this.selectElement.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        // Ignore if we're in another mode
        if (this.isConfirming || this.isCreatingWorktree || this.isSelectingForDelete) {
          return;
        }
        this.handleSelection(option.value as SelectionValue);
      },
    );

    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      this.handleKeypress(key);
    });

    this.selectElement.focus();
  }

  private getInitialStatusMessage(): string {
    if (!this.repoRoot) {
      return "No git repository found in this directory.";
    }
    if (!this.opencodeAvailable) {
      return "opencode is not available on PATH.";
    }
    const count = this.worktreeOptions.length - 1; // subtract create option
    if (count === 0) {
      return "No worktrees detected. Select 'Create new worktree' to add one.";
    }
    return `Found ${count} worktree${count === 1 ? "" : "s"}.`;
  }

  private getInitialStatusColor(): string {
    if (!this.repoRoot || !this.opencodeAvailable) {
      return statusColors.error;
    }
    return statusColors.info;
  }

  private buildInitialOptions(): SelectOption[] {
    if (!this.repoRoot) {
      return [];
    }

    const worktrees = listWorktrees(this.repoRoot);
    return this.buildOptions(worktrees);
  }

  private handleKeypress(key: KeyEvent): void {
    if (key.ctrl && key.name === "c") {
      this.cleanup(true);
      return;
    }

    // Handle confirmation mode
    if (this.isConfirming) {
      if (key.name === "escape") {
        this.hideConfirmDialog();
      }
      return;
    }

    if (this.isCreatingWorktree) {
      if (key.name === "escape") {
        this.hideCreateWorktreeInput();
      }
      return;
    }

    // Handle multi-select delete mode
    if (this.isSelectingForDelete) {
      if (key.name === "escape") {
        this.exitSelectMode();
        return;
      }
      if (key.name === "return") {
        this.toggleWorktreeSelection();
        return;
      }
      if (key.name === "d") {
        // Confirm deletion of selected worktrees
        this.confirmBatchDelete();
        return;
      }
      if (key.name === "q") {
        this.exitSelectMode();
        return;
      }
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      this.cleanup(true);
      return;
    }

    if (key.name === "r") {
      this.loadWorktrees();
      return;
    }

    // 'n' for new worktree
    if (key.name === "n") {
      this.showCreateWorktreeInput();
      return;
    }

    // 'd' for entering delete selection mode
    if (key.name === "d") {
      this.enterSelectMode();
      return;
    }

    // 'o' for opening worktree path in file manager
    if (key.name === "o") {
      this.openWorktreeInFileManager();
      return;
    }
  }

  private handleSelection(value: SelectionValue): void {
    if (value === CREATE_NEW_WORKTREE_VALUE) {
      this.showCreateWorktreeInput();
      return;
    }

    const worktree = value as WorktreeInfo;
    if (!this.opencodeAvailable) {
      this.setStatus("opencode is not available on PATH.", "error");
      return;
    }

    this.cleanup(false);
    launchOpenCode(worktree.path);
  }

  private openWorktreeInFileManager(): void {
    const worktree = this.getSelectedWorktree();
    if (!worktree) {
      this.setStatus("Select a worktree to open in file manager.", "warning");
      return;
    }

    const success = openInFileManager(worktree.path);
    if (success) {
      this.setStatus(`Opened ${worktree.path} in file manager.`, "success");
    } else {
      this.setStatus("Failed to open file manager.", "error");
    }
  }

  private showCreateWorktreeInput(): void {
    this.isCreatingWorktree = true;
    this.selectElement.visible = false;
    this.selectElement.blur();

    this.inputContainer = new BoxRenderable(this.renderer, {
      id: "worktree-input-container",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: 5,
      borderStyle: "single",
      borderColor: "#38BDF8",
      title: "Create New Worktree",
      titleAlignment: "center",
      backgroundColor: "#0F172A",
      border: true,
    });
    this.renderer.root.add(this.inputContainer);

    const inputLabel = new TextRenderable(this.renderer, {
      id: "worktree-input-label",
      position: "absolute",
      left: 1,
      top: 1,
      content: "Branch name:",
      fg: "#E2E8F0",
    });
    this.inputContainer.add(inputLabel);

    this.branchInput = new InputRenderable(this.renderer, {
      id: "worktree-branch-input",
      position: "absolute",
      left: 14,
      top: 1,
      width: 58,
      placeholder: "feature/my-new-branch",
      focusedBackgroundColor: "#1E293B",
      backgroundColor: "#1E293B",
    });
    this.inputContainer.add(this.branchInput);

    this.branchInput.on(InputRenderableEvents.CHANGE, (value: string) => {
      this.handleCreateWorktree(value);
    });

    this.instructions.content = "Enter to create - Esc to cancel";
    this.setStatus("Enter a branch name for the new worktree.", "info");

    this.branchInput.focus();
    this.renderer.requestRender();
  }

  private hideCreateWorktreeInput(selectWorktreePath?: string): void {
    this.isCreatingWorktree = false;

    if (this.branchInput) {
      this.branchInput.blur();
    }

    if (this.inputContainer) {
      this.renderer.root.remove(this.inputContainer.id);
      this.inputContainer = null;
      this.branchInput = null;
    }

    this.selectElement.visible = true;
    this.instructions.content =
      "↑/↓ navigate • Enter open • o open folder • d delete • n new • r refresh • q quit";
    this.selectElement.focus();
    this.loadWorktrees(selectWorktreePath);
  }

  private handleCreateWorktree(branchName: string): void {
    const trimmed = branchName.trim();
    if (!trimmed) {
      this.setStatus("Branch name cannot be empty.", "error");
      return;
    }

    if (!this.repoRoot) {
      this.setStatus("No git repository found.", "error");
      return;
    }

    const worktreesDir = getDefaultWorktreesDir(this.repoRoot);
    this.setStatus(`Creating worktree for branch '${trimmed}'...`, "info");
    this.renderer.requestRender();

    const result = createWorktree(this.repoRoot, trimmed, worktreesDir);

    if (result.success) {
      this.setStatus(`Worktree created at ${result.path}`, "success");
      // Return to list with the new worktree preselected
      this.hideCreateWorktreeInput(result.path);
    } else {
      this.setStatus(`Failed to create worktree: ${result.error}`, "error");
    }
  }

  private loadWorktrees(selectWorktreePath?: string): void {
    this.repoRoot = resolveRepoRoot(this.targetPath);
    if (!this.repoRoot) {
      this.setStatus("No git repository found in this directory.", "error");
      this.selectElement.options = [];
      this.renderer.requestRender();
      return;
    }

    const worktrees = listWorktrees(this.repoRoot);
    this.selectElement.options = this.buildOptions(worktrees);

    // Preselect a specific worktree if path is provided
    if (selectWorktreePath) {
      const index = this.selectElement.options.findIndex((opt: SelectOption) => {
        if (opt.value === CREATE_NEW_WORKTREE_VALUE) return false;
        return (opt.value as WorktreeInfo).path === selectWorktreePath;
      });
      if (index >= 0) {
        this.selectElement.setSelectedIndex(index);
      }
    }

    if (worktrees.length === 0) {
      this.setStatus(
        "No worktrees detected. Select 'Create new worktree' to add one.",
        "info",
      );
    } else {
      this.setStatus(
        `Found ${worktrees.length} worktree${worktrees.length === 1 ? "" : "s"}.`,
        "info",
      );
    }

    this.opencodeAvailable = isOpenCodeAvailable();
    if (!this.opencodeAvailable) {
      this.setStatus("opencode is not available on PATH.", "error");
    }

    this.renderer.requestRender();
  }

  private buildOptions(worktrees: WorktreeInfo[]): SelectOption[] {
    const createOption: SelectOption = {
      name: "+ Create new worktree",
      description: "Create a new worktree from a branch",
      value: CREATE_NEW_WORKTREE_VALUE,
    };

    const worktreeOptions = worktrees.map((worktree) => {
      const baseName = basename(worktree.path);
      const isMain = this.repoRoot && isMainWorktree(this.repoRoot, worktree.path);
      
      // Build base label
      let label = worktree.branch
        ? worktree.branch
        : worktree.isDetached
          ? `${baseName} (detached)`
          : baseName;

      // Add status indicators
      const indicators: string[] = [];
      if (isMain) {
        indicators.push("main");
      }
      if (worktree.isDirty) {
        indicators.push("*");
      }
      if (!worktree.isOnRemote && worktree.branch && !isMain) {
        indicators.push("local");
      }
      
      if (indicators.length > 0) {
        label = `${label} [${indicators.join(" ")}]`;
      }

      // Add checkbox prefix in selection mode
      let displayName = label;
      if (this.isSelectingForDelete) {
        const isSelected = this.selectedForDelete.has(worktree.path);
        if (isMain) {
          displayName = `  [main] ${worktree.branch || baseName}`;
        } else {
          displayName = isSelected ? `[x] ${label}` : `[ ] ${label}`;
        }
      }

      // Build description with metadata
      const descParts: string[] = [];
      
      // Last modified date
      if (worktree.lastModified) {
        descParts.push(this.formatRelativeDate(worktree.lastModified));
      }
      
      // Path (shortened if too long)
      const maxPathLen = 45;
      const pathDisplay = worktree.path.length > maxPathLen
        ? "..." + worktree.path.slice(-maxPathLen + 3)
        : worktree.path;
      descParts.push(pathDisplay);

      return {
        name: displayName,
        description: descParts.join(" | "),
        value: worktree,
      };
    });

    // Don't show create option in delete selection mode
    if (this.isSelectingForDelete) {
      return worktreeOptions;
    }

    return [createOption, ...worktreeOptions];
  }

  private formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  private setStatus(message: string, level: StatusLevel): void {
    this.statusText.content = message;
    this.statusText.fg = statusColors[level];
  }

  private getSelectedWorktree(): WorktreeInfo | null {
    const selectedIndex = this.selectElement.getSelectedIndex();
    const option = this.selectElement.options[selectedIndex];
    if (!option || option.value === CREATE_NEW_WORKTREE_VALUE) {
      return null;
    }
    return option.value as WorktreeInfo;
  }

  private showDeleteConfirmation(): void {
    const worktree = this.getSelectedWorktree();
    if (!worktree) {
      this.setStatus("Select a worktree to delete.", "warning");
      return;
    }

    if (!this.repoRoot) {
      this.setStatus("No git repository found.", "error");
      return;
    }

    // Check if this is the main worktree
    if (isMainWorktree(this.repoRoot, worktree.path)) {
      this.setStatus("Cannot delete the main worktree.", "error");
      return;
    }

    this.isConfirming = true;
    this.confirmingWorktree = worktree;
    this.selectElement.visible = false;
    this.selectElement.blur();

    // Check for uncommitted changes
    const isDirty = hasUncommittedChanges(worktree.path);
    const branchDisplay = worktree.branch || basename(worktree.path);

    // Build dialog title
    const title = `Remove: ${branchDisplay}`;

    this.confirmContainer = new BoxRenderable(this.renderer, {
      id: "confirm-container",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: isDirty ? 10 : 8,
      borderStyle: "single",
      borderColor: "#F59E0B",
      title,
      titleAlignment: "center",
      backgroundColor: "#0F172A",
      border: true,
    });
    this.renderer.root.add(this.confirmContainer);

    // Warning for dirty worktree
    let yOffset = 1;
    if (isDirty) {
      const warningText = new TextRenderable(this.renderer, {
        id: "confirm-warning",
        position: "absolute",
        left: 1,
        top: yOffset,
        content: "⚠ This worktree has uncommitted changes!",
        fg: "#F59E0B",
      });
      this.confirmContainer.add(warningText);
      yOffset += 2;
    }

    const pathText = new TextRenderable(this.renderer, {
      id: "confirm-path",
      position: "absolute",
      left: 1,
      top: yOffset,
      content: `Path: ${worktree.path}`,
      fg: "#94A3B8",
    });
    this.confirmContainer.add(pathText);
    yOffset += 2;

    // Build options - Unlink is default (first)
    const options: SelectOption[] = [
      {
        name: "Unlink (default)",
        description: "Remove worktree directory, keep branch for later use",
        value: CONFIRM_UNLINK_VALUE,
      },
      {
        name: "Delete",
        description: "Remove worktree AND delete local branch (never remote)",
        value: CONFIRM_DELETE_VALUE,
      },
      {
        name: "Cancel",
        description: "Go back without changes",
        value: CONFIRM_CANCEL_VALUE,
      },
    ];

    this.confirmSelect = new SelectRenderable(this.renderer, {
      id: "confirm-select",
      position: "absolute",
      left: 1,
      top: yOffset,
      width: 72,
      height: 4,
      options,
      backgroundColor: "#0F172A",
      focusedBackgroundColor: "#1E293B",
      selectedBackgroundColor: "#1E3A5F",
      textColor: "#E2E8F0",
      selectedTextColor: "#38BDF8",
      descriptionColor: "#94A3B8",
      selectedDescriptionColor: "#E2E8F0",
      showDescription: true,
      wrapSelection: true,
    });
    this.confirmContainer.add(this.confirmSelect);

    this.confirmSelect.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        this.handleConfirmAction(option.value as ConfirmAction, isDirty);
      },
    );

    this.instructions.content =
      "↑/↓ select action • Enter confirm • Esc cancel";
    this.setStatus(
      isDirty
        ? "Warning: Uncommitted changes will be lost!"
        : "Choose how to remove this worktree.",
      isDirty ? "warning" : "info",
    );

    this.confirmSelect.focus();
    this.renderer.requestRender();
  }

  private hideConfirmDialog(): void {
    this.isConfirming = false;
    this.confirmingWorktree = null;

    if (this.confirmSelect) {
      this.confirmSelect.blur();
    }

    if (this.confirmContainer) {
      this.renderer.root.remove(this.confirmContainer.id);
      this.confirmContainer = null;
      this.confirmSelect = null;
    }

    this.selectElement.visible = true;
    this.instructions.content =
      "↑/↓ navigate • Enter open • o open folder • d delete • n new • r refresh • q quit";
    this.selectElement.focus();
    this.loadWorktrees();
  }

  private handleConfirmAction(action: ConfirmAction, isDirty: boolean): void {
    if (action === CONFIRM_CANCEL_VALUE) {
      this.hideConfirmDialog();
      return;
    }

    if (!this.confirmingWorktree || !this.repoRoot) {
      this.hideConfirmDialog();
      return;
    }

    const worktree = this.confirmingWorktree;
    const branchName = worktree.branch || basename(worktree.path);

    if (action === CONFIRM_UNLINK_VALUE) {
      // Unlink: remove worktree, keep branch
      this.setStatus(`Unlinking worktree '${branchName}'...`, "info");
      this.renderer.requestRender();

      const result = unlinkWorktree(this.repoRoot, worktree.path, isDirty);
      if (result.success) {
        this.setStatus(
          `Worktree unlinked. Branch '${branchName}' is still available.`,
          "success",
        );
      } else {
        this.setStatus(`Failed to unlink: ${result.error}`, "error");
      }
    } else if (action === CONFIRM_DELETE_VALUE) {
      // Delete: remove worktree AND local branch
      if (!worktree.branch) {
        this.setStatus("Cannot delete branch: detached HEAD.", "error");
        this.hideConfirmDialog();
        return;
      }

      this.setStatus(`Deleting worktree and branch '${branchName}'...`, "info");
      this.renderer.requestRender();

      const result = deleteWorktree(
        this.repoRoot,
        worktree.path,
        worktree.branch,
        isDirty,
      );
      if (result.success) {
        this.setStatus(
          `Worktree and local branch '${branchName}' deleted.`,
          "success",
        );
      } else {
        const stepMsg =
          result.step === "unlink"
            ? "Failed to remove worktree"
            : "Worktree removed but failed to delete branch";
        this.setStatus(`${stepMsg}: ${result.error}`, "error");
      }
    }

    this.hideConfirmDialog();
  }

  // ========== Multi-select delete mode methods ==========

  private enterSelectMode(): void {
    if (!this.repoRoot) {
      this.setStatus("No git repository found.", "error");
      return;
    }

    const worktrees = listWorktrees(this.repoRoot);
    // Filter out main worktree
    const deletableWorktrees = worktrees.filter(
      (wt) => !isMainWorktree(this.repoRoot!, wt.path)
    );

    if (deletableWorktrees.length === 0) {
      this.setStatus("No worktrees available for deletion.", "warning");
      return;
    }

    this.isSelectingForDelete = true;
    this.selectedForDelete.clear();

    // Rebuild options to show checkboxes
    this.selectElement.options = this.buildOptions(worktrees);
    this.instructions.content =
      "Enter toggle selection • d confirm delete • Esc cancel";
    this.setStatus("Select worktrees to delete, then press 'd' to confirm.", "info");
    this.renderer.requestRender();
  }

  private exitSelectMode(): void {
    this.isSelectingForDelete = false;
    this.selectedForDelete.clear();
    this.loadWorktrees();
    this.instructions.content =
      "↑/↓ navigate • Enter open • o open folder • d delete • n new • r refresh • q quit";
    this.renderer.requestRender();
  }

  private toggleWorktreeSelection(): void {
    const selectedIndex = this.selectElement.getSelectedIndex();
    const option = this.selectElement.options[selectedIndex];
    if (!option) return;

    const worktree = option.value as WorktreeInfo;
    if (!worktree.path) return;

    // Prevent selecting main worktree
    if (this.repoRoot && isMainWorktree(this.repoRoot, worktree.path)) {
      this.setStatus("Cannot delete the main worktree.", "warning");
      return;
    }

    if (this.selectedForDelete.has(worktree.path)) {
      this.selectedForDelete.delete(worktree.path);
    } else {
      this.selectedForDelete.add(worktree.path);
    }

    // Rebuild options to update checkboxes
    if (this.repoRoot) {
      const worktrees = listWorktrees(this.repoRoot);
      this.selectElement.options = this.buildOptions(worktrees);
      // Restore selection index
      this.selectElement.setSelectedIndex(selectedIndex);
    }

    const count = this.selectedForDelete.size;
    this.setStatus(
      count === 0
        ? "Select worktrees to delete, then press 'd' to confirm."
        : `${count} worktree${count === 1 ? "" : "s"} selected for deletion.`,
      "info"
    );
    this.renderer.requestRender();
  }

  private confirmBatchDelete(): void {
    if (this.selectedForDelete.size === 0) {
      this.setStatus("No worktrees selected. Use Enter to select.", "warning");
      return;
    }

    // Get the worktree info for selected paths
    if (!this.repoRoot) return;

    const worktrees = listWorktrees(this.repoRoot);
    const toDelete = worktrees.filter((wt) =>
      this.selectedForDelete.has(wt.path)
    );

    // Show batch confirmation dialog
    this.showBatchDeleteConfirmation(toDelete);
  }

  private showBatchDeleteConfirmation(worktrees: WorktreeInfo[]): void {
    this.isConfirming = true;
    this.isSelectingForDelete = false;
    this.selectElement.visible = false;
    this.selectElement.blur();

    // Check if any have uncommitted changes
    const dirtyWorktrees = worktrees.filter((wt) =>
      hasUncommittedChanges(wt.path)
    );
    const hasDirty = dirtyWorktrees.length > 0;

    const count = worktrees.length;
    const title = `Delete ${count} worktree${count === 1 ? "" : "s"}`;

    this.confirmContainer = new BoxRenderable(this.renderer, {
      id: "confirm-container",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: hasDirty ? 12 : 10,
      borderStyle: "single",
      borderColor: "#F59E0B",
      title,
      titleAlignment: "center",
      backgroundColor: "#0F172A",
      border: true,
    });
    this.renderer.root.add(this.confirmContainer);

    let yOffset = 1;

    // Warning for dirty worktrees
    if (hasDirty) {
      const warningText = new TextRenderable(this.renderer, {
        id: "confirm-warning",
        position: "absolute",
        left: 1,
        top: yOffset,
        content: `⚠ ${dirtyWorktrees.length} worktree${dirtyWorktrees.length === 1 ? " has" : "s have"} uncommitted changes!`,
        fg: "#F59E0B",
      });
      this.confirmContainer.add(warningText);
      yOffset += 2;
    }

    // List worktrees to be deleted
    const branchNames = worktrees
      .map((wt) => wt.branch || basename(wt.path))
      .slice(0, 3);
    const displayList =
      branchNames.join(", ") + (worktrees.length > 3 ? `, +${worktrees.length - 3} more` : "");

    const listText = new TextRenderable(this.renderer, {
      id: "confirm-list",
      position: "absolute",
      left: 1,
      top: yOffset,
      content: `Worktrees: ${displayList}`,
      fg: "#94A3B8",
    });
    this.confirmContainer.add(listText);
    yOffset += 2;

    // Build options
    const options: SelectOption[] = [
      {
        name: "Unlink all (default)",
        description: "Remove worktree directories, keep branches for later use",
        value: CONFIRM_UNLINK_VALUE,
      },
      {
        name: "Delete all",
        description: "Remove worktrees AND delete local branches (never remote)",
        value: CONFIRM_DELETE_VALUE,
      },
      {
        name: "Cancel",
        description: "Go back without changes",
        value: CONFIRM_CANCEL_VALUE,
      },
    ];

    this.confirmSelect = new SelectRenderable(this.renderer, {
      id: "confirm-select",
      position: "absolute",
      left: 1,
      top: yOffset,
      width: 72,
      height: 4,
      options,
      backgroundColor: "#0F172A",
      focusedBackgroundColor: "#1E293B",
      selectedBackgroundColor: "#1E3A5F",
      textColor: "#E2E8F0",
      selectedTextColor: "#38BDF8",
      descriptionColor: "#94A3B8",
      selectedDescriptionColor: "#E2E8F0",
      showDescription: true,
      wrapSelection: true,
    });
    this.confirmContainer.add(this.confirmSelect);

    // Store worktrees for batch deletion
    const worktreesToDelete = worktrees;

    this.confirmSelect.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        this.handleBatchConfirmAction(
          option.value as ConfirmAction,
          worktreesToDelete,
          hasDirty
        );
      }
    );

    this.instructions.content =
      "↑/↓ select action • Enter confirm • Esc cancel";
    this.setStatus(
      hasDirty
        ? "Warning: Some worktrees have uncommitted changes!"
        : `Ready to remove ${count} worktree${count === 1 ? "" : "s"}.`,
      hasDirty ? "warning" : "info"
    );

    this.confirmSelect.focus();
    this.renderer.requestRender();
  }

  private handleBatchConfirmAction(
    action: ConfirmAction,
    worktrees: WorktreeInfo[],
    hasDirty: boolean
  ): void {
    if (action === CONFIRM_CANCEL_VALUE) {
      this.selectedForDelete.clear();
      this.hideConfirmDialog();
      return;
    }

    if (!this.repoRoot) {
      this.selectedForDelete.clear();
      this.hideConfirmDialog();
      return;
    }

    const count = worktrees.length;
    let successCount = 0;
    let failCount = 0;

    for (const worktree of worktrees) {
      const branchName = worktree.branch || basename(worktree.path);
      const isDirty = hasUncommittedChanges(worktree.path);

      if (action === CONFIRM_UNLINK_VALUE) {
        const result = unlinkWorktree(this.repoRoot, worktree.path, isDirty);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } else if (action === CONFIRM_DELETE_VALUE) {
        if (!worktree.branch) {
          // Can't delete branch for detached HEAD, just unlink
          const result = unlinkWorktree(this.repoRoot, worktree.path, isDirty);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          const result = deleteWorktree(
            this.repoRoot,
            worktree.path,
            worktree.branch,
            isDirty
          );
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        }
      }
    }

    this.selectedForDelete.clear();

    if (failCount === 0) {
      const actionWord = action === CONFIRM_UNLINK_VALUE ? "unlinked" : "deleted";
      this.setStatus(
        `Successfully ${actionWord} ${successCount} worktree${successCount === 1 ? "" : "s"}.`,
        "success"
      );
    } else {
      this.setStatus(
        `Completed with ${successCount} success, ${failCount} failed.`,
        "warning"
      );
    }

    this.hideConfirmDialog();
  }

  private cleanup(shouldExit: boolean): void {
    this.selectElement.blur();
    if (this.branchInput) {
      this.branchInput.blur();
    }
    if (this.confirmSelect) {
      this.confirmSelect.blur();
    }
    this.renderer.destroy();
    if (shouldExit) {
      process.exit(0);
    }
  }
}
