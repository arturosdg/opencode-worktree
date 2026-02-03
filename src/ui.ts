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
import { checkForUpdate } from "./update-check.js";
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
import { isCommandAvailable, launchCommand, openInFileManager } from "./opencode.js";
import { WorktreeInfo } from "./types.js";
import { loadRepoConfig, saveRepoConfig, configExists, type Config } from "./config.js";
import { runPostCreateHook, type HookResult } from "./hooks.js";

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

export type PackageInfo = {
  name: string;
  version: string;
};

export const runApp = async (
  targetPath: string,
  pkg?: PackageInfo,
): Promise<void> => {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
  });

  renderer.setBackgroundColor("transparent");
  new WorktreeSelector(renderer, targetPath, pkg);
};

class WorktreeSelector {
  private selectElement: SelectRenderable;
  private statusText: TextRenderable;
  private instructions: TextRenderable;
  private title: TextRenderable;
  private versionNotice: TextRenderable | null = null;

  private inputContainer: BoxRenderable | null = null;
  private branchInput: InputRenderable | null = null;

  private confirmContainer: BoxRenderable | null = null;
  private confirmSelect: SelectRenderable | null = null;
  private confirmingWorktree: WorktreeInfo | null = null;
  private isConfirming = false;

  private opencodeAvailable = false;
  private repoRoot: string | null = null;
  private repoConfig: Config = {};
  private isCreatingWorktree = false;
  private worktreeOptions: SelectOption[] = [];

  // Multi-select delete mode
  private isSelectingForDelete = false;
  private selectedForDelete: Set<string> = new Set(); // Set of worktree paths

  // Hook execution state
  private isRunningHook = false;
  private hookOutputContainer: BoxRenderable | null = null;
  private hookOutputText: TextRenderable | null = null;
  private hookOutput: string[] = [];
  private hookAbortFn: (() => void) | null = null;
  private pendingWorktreePath: string | null = null;
  private hookFailed = false;
  private hookFailureSelect: SelectRenderable | null = null;

  // Config editor state
  private isEditingConfig = false;
  private configContainer: BoxRenderable | null = null;
  private configHookInput: InputRenderable | null = null;
  private configOpenInput: InputRenderable | null = null;
  private configLaunchInput: InputRenderable | null = null;
  private configActiveField: "hook" | "open" | "launch" = "hook";
  private isFirstTimeSetup = false;

  constructor(
    private renderer: CliRenderer,
    private targetPath: string,
    private pkg?: PackageInfo,
  ) {
    // Load worktrees first to get initial options
    this.repoRoot = resolveRepoRoot(this.targetPath);
    this.repoConfig = this.repoRoot ? loadRepoConfig(this.repoRoot) : {};
    this.opencodeAvailable = isCommandAvailable(this.repoConfig.launchCommand || "opencode");
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

    // Display version or update notification in title line
    if (this.pkg) {
      const updateInfo = checkForUpdate(this.pkg);

      let noticeContent: string;
      let noticeColor: string;

      if (updateInfo?.hasUpdate) {
        // Update available
        noticeContent = `Update: ${updateInfo.current} → ${updateInfo.latest} (npm i -g)`;
        noticeColor = "#F59E0B"; // Amber
      } else {
        // On latest version (or no cache yet)
        noticeContent = `v${this.pkg.version}`;
        noticeColor = "#64748B"; // Subtle gray
      }

      this.versionNotice = new TextRenderable(renderer, {
        id: "version-notice",
        position: "absolute",
        left: 78 - noticeContent.length,
        top: 1,
        content: noticeContent,
        fg: noticeColor,
      });
      this.renderer.root.add(this.versionNotice);
    }

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
        "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit",
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

    // Check for first-time setup
    if (this.repoRoot && !configExists(this.repoRoot)) {
      this.showFirstTimeSetup();
    }
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
      // If running hook, abort it first
      if (this.isRunningHook && this.hookAbortFn) {
        this.hookAbortFn();
        this.hookAbortFn = null;
        this.setStatus("Hook aborted by user.", "warning");
        this.hideHookOutput();
        this.loadWorktrees(this.pendingWorktreePath || undefined);
        this.selectElement.visible = true;
        this.selectElement.focus();
        this.instructions.content =
          "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
        return;
      }
      this.cleanup(true);
      return;
    }

    // Handle hook running mode (only allow Ctrl+C which is handled above)
    if (this.isRunningHook && !this.hookFailed) {
      return;
    }

    // Handle hook failure mode - let the select handle input
    if (this.isRunningHook && this.hookFailed) {
      if (key.name === "escape") {
        this.handleHookFailureChoice("cancel");
      }
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

    // Handle config editing mode
    if (this.isEditingConfig) {
      if (key.name === "escape") {
        this.hideConfigEditor();
        return;
      }
      if (key.name === "return") {
        this.handleConfigSave();
        return;
      }
      if (key.name === "tab") {
        // Cycle between fields: hook -> open -> launch -> hook
        if (this.configActiveField === "hook") {
          this.configActiveField = "open";
          this.configHookInput?.blur();
          this.configOpenInput?.focus();
        } else if (this.configActiveField === "open") {
          this.configActiveField = "launch";
          this.configOpenInput?.blur();
          this.configLaunchInput?.focus();
        } else {
          this.configActiveField = "hook";
          this.configLaunchInput?.blur();
          this.configHookInput?.focus();
        }
        this.renderer.requestRender();
        return;
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

    // 'c' for editing config
    if (key.name === "c") {
      this.showConfigEditor();
      return;
    }
  }

  private handleSelection(value: SelectionValue): void {
    if (value === CREATE_NEW_WORKTREE_VALUE) {
      this.showCreateWorktreeInput();
      return;
    }

    const worktree = value as WorktreeInfo;
    const cmdName = this.repoConfig.launchCommand || "opencode";
    if (!this.opencodeAvailable) {
      this.setStatus(`${cmdName} is not available on PATH.`, "error");
      return;
    }

    this.cleanup(false);
    launchCommand(worktree.path, this.repoConfig.launchCommand);
  }

  private openWorktreeInFileManager(): void {
    const worktree = this.getSelectedWorktree();
    if (!worktree) {
      this.setStatus("Select a worktree to open in file manager.", "warning");
      return;
    }

    // Load config to check for custom open command
    const config = this.repoRoot ? loadRepoConfig(this.repoRoot) : {};
    const customCommand = config.openCommand;

    const success = openInFileManager(worktree.path, customCommand);
    if (success) {
      if (customCommand) {
        this.setStatus(`Opened ${worktree.path} with ${customCommand}.`, "success");
      } else {
        this.setStatus(`Opened ${worktree.path} in file manager.`, "success");
      }
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
      "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
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
      
      // Check for post-create hook
      const config = loadRepoConfig(this.repoRoot);
      if (config.postCreateHook) {
        this.pendingWorktreePath = result.path;
        this.runHook(result.path, config.postCreateHook);
      } else {
        // No hook, launch command directly
        this.hideCreateWorktreeInput();
        this.cleanup(false);
        launchCommand(result.path, this.repoConfig.launchCommand);
      }
    } else {
      this.setStatus(`Failed to create worktree: ${result.error}`, "error");
    }
  }

  private runHook(worktreePath: string, command: string): void {
    this.isRunningHook = true;
    this.hookFailed = false;
    this.hookOutput = [];

    // Hide create input if still visible
    if (this.inputContainer) {
      this.renderer.root.remove(this.inputContainer.id);
      this.inputContainer = null;
      this.branchInput = null;
    }
    this.isCreatingWorktree = false;
    this.selectElement.visible = false;

    // Create hook output container
    this.hookOutputContainer = new BoxRenderable(this.renderer, {
      id: "hook-output-container",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: 14,
      borderStyle: "single",
      borderColor: "#38BDF8",
      title: `Running: ${command}`,
      titleAlignment: "left",
      backgroundColor: "#0F172A",
      border: true,
    });
    this.renderer.root.add(this.hookOutputContainer);

    this.hookOutputText = new TextRenderable(this.renderer, {
      id: "hook-output-text",
      position: "absolute",
      left: 1,
      top: 1,
      content: "Starting...\n",
      fg: "#94A3B8",
    });
    this.hookOutputContainer.add(this.hookOutputText);

    this.instructions.content = "Hook running... (Ctrl+C to abort)";
    this.setStatus(`Executing post-create hook...`, "info");
    this.renderer.requestRender();

    // Run the hook with streaming output
    this.hookAbortFn = runPostCreateHook(worktreePath, command, {
      onOutput: (data: string) => {
        this.hookOutput.push(data);
        this.updateHookOutput();
      },
      onComplete: (result: HookResult) => {
        this.hookAbortFn = null;
        if (result.success) {
          this.onHookSuccess();
        } else {
          this.onHookFailure(result.exitCode);
        }
      },
    });
  }

  private updateHookOutput(): void {
    if (!this.hookOutputText) return;

    // Join all output and take the last N lines that fit in the container
    const fullOutput = this.hookOutput.join("");
    const lines = fullOutput.split("\n");
    const maxLines = 11; // Container height minus borders and padding
    const visibleLines = lines.slice(-maxLines);
    
    this.hookOutputText.content = visibleLines.join("\n");
    this.renderer.requestRender();
  }

  private onHookSuccess(): void {
    this.setStatus("Hook completed successfully!", "success");
    this.renderer.requestRender();

    // Brief delay to show success, then launch command
    setTimeout(() => {
      this.hideHookOutput();
      if (this.pendingWorktreePath) {
        this.cleanup(false);
        launchCommand(this.pendingWorktreePath, this.repoConfig.launchCommand);
      }
    }, 1000);
  }

  private onHookFailure(exitCode: number | null): void {
    this.hookFailed = true;
    const exitMsg = exitCode !== null ? ` (exit code: ${exitCode})` : "";
    this.setStatus(`Hook failed${exitMsg}`, "error");

    // Add failure options to the container
    if (this.hookOutputContainer) {
      this.hookFailureSelect = new SelectRenderable(this.renderer, {
        id: "hook-failure-select",
        position: "absolute",
        left: 1,
        top: 12,
        width: 72,
        height: 2,
        options: [
          {
            name: "Open in opencode anyway",
            description: "Launch opencode despite hook failure",
            value: "open",
          },
          {
            name: "Cancel",
            description: "Return to worktree list",
            value: "cancel",
          },
        ],
        backgroundColor: "#0F172A",
        focusedBackgroundColor: "#1E293B",
        selectedBackgroundColor: "#1E3A5F",
        textColor: "#E2E8F0",
        selectedTextColor: "#38BDF8",
        descriptionColor: "#94A3B8",
        selectedDescriptionColor: "#E2E8F0",
        showDescription: false,
        wrapSelection: true,
      });
      this.hookOutputContainer.add(this.hookFailureSelect);

      this.hookFailureSelect.on(
        SelectRenderableEvents.ITEM_SELECTED,
        (_index: number, option: SelectOption) => {
          this.handleHookFailureChoice(option.value as string);
        }
      );

      this.hookFailureSelect.focus();
    }

    this.instructions.content = "↑/↓ select • Enter confirm";
    this.renderer.requestRender();
  }

  private handleHookFailureChoice(choice: string): void {
    if (choice === "open" && this.pendingWorktreePath) {
      this.hideHookOutput();
      this.cleanup(false);
      launchCommand(this.pendingWorktreePath, this.repoConfig.launchCommand);
    } else {
      // Cancel - return to list
      this.hideHookOutput();
      this.loadWorktrees(this.pendingWorktreePath || undefined);
      this.selectElement.visible = true;
      this.selectElement.focus();
      this.instructions.content =
        "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
    }
  }

  private hideHookOutput(): void {
    this.isRunningHook = false;
    this.hookFailed = false;
    this.hookOutput = [];
    this.pendingWorktreePath = null;

    if (this.hookFailureSelect) {
      this.hookFailureSelect.blur();
      this.hookFailureSelect = null;
    }

    if (this.hookOutputContainer) {
      this.renderer.root.remove(this.hookOutputContainer.id);
      this.hookOutputContainer = null;
      this.hookOutputText = null;
    }
  }

  // ========== Config Editor Methods ==========

  private showFirstTimeSetup(): void {
    this.isFirstTimeSetup = true;
    this.showConfigEditor();
  }

  private showConfigEditor(): void {
    if (!this.repoRoot) {
      this.setStatus("No git repository found.", "error");
      return;
    }

    this.isEditingConfig = true;
    this.configActiveField = "hook";
    this.selectElement.visible = false;
    this.selectElement.blur();

    // Load existing config to pre-fill
    const existingConfig = loadRepoConfig(this.repoRoot);

    const title = this.isFirstTimeSetup
      ? "First-time Setup: Project Configuration"
      : "Edit Project Configuration";

    this.configContainer = new BoxRenderable(this.renderer, {
      id: "config-container",
      position: "absolute",
      left: 2,
      top: 3,
      width: 76,
      height: 15,
      borderStyle: "single",
      borderColor: "#38BDF8",
      title,
      titleAlignment: "center",
      backgroundColor: "#0F172A",
      border: true,
    });
    this.renderer.root.add(this.configContainer);

    // Post-create hook field
    const hookLabel = new TextRenderable(this.renderer, {
      id: "config-hook-label",
      position: "absolute",
      left: 1,
      top: 1,
      content: "Post-create hook (e.g., npm install):",
      fg: "#94A3B8",
    });
    this.configContainer.add(hookLabel);

    this.configHookInput = new InputRenderable(this.renderer, {
      id: "config-hook-input",
      position: "absolute",
      left: 1,
      top: 2,
      width: 72,
      placeholder: "npm install",
      value: existingConfig.postCreateHook || "",
      focusedBackgroundColor: "#1E293B",
      backgroundColor: "#1E293B",
    });
    this.configContainer.add(this.configHookInput);

    // Open folder command field
    const openLabel = new TextRenderable(this.renderer, {
      id: "config-open-label",
      position: "absolute",
      left: 1,
      top: 4,
      content: "Open folder command (e.g., code, webstorm):",
      fg: "#94A3B8",
    });
    this.configContainer.add(openLabel);

    this.configOpenInput = new InputRenderable(this.renderer, {
      id: "config-open-input",
      position: "absolute",
      left: 1,
      top: 5,
      width: 72,
      placeholder: "open (default)",
      value: existingConfig.openCommand || "",
      focusedBackgroundColor: "#1E293B",
      backgroundColor: "#1E293B",
    });
    this.configContainer.add(this.configOpenInput);

    // Launch command field (instead of opencode)
    const launchLabel = new TextRenderable(this.renderer, {
      id: "config-launch-label",
      position: "absolute",
      left: 1,
      top: 7,
      content: "Launch command (e.g., cursor, claude, code):",
      fg: "#94A3B8",
    });
    this.configContainer.add(launchLabel);

    this.configLaunchInput = new InputRenderable(this.renderer, {
      id: "config-launch-input",
      position: "absolute",
      left: 1,
      top: 8,
      width: 72,
      placeholder: "opencode (default)",
      value: existingConfig.launchCommand || "",
      focusedBackgroundColor: "#1E293B",
      backgroundColor: "#1E293B",
    });
    this.configContainer.add(this.configLaunchInput);

    // Help text
    const helpText = new TextRenderable(this.renderer, {
      id: "config-help",
      position: "absolute",
      left: 1,
      top: 10,
      content: "Tab to switch fields • Leave empty to use defaults",
      fg: "#64748B",
    });
    this.configContainer.add(helpText);

    this.instructions.content = "Tab switch • Enter save • Esc cancel";
    this.setStatus(
      this.isFirstTimeSetup
        ? "Welcome! Configure your project settings."
        : "Edit project configuration.",
      "info"
    );

    // Delay focus to prevent the triggering keypress from being captured
    setTimeout(() => {
      this.configHookInput?.focus();
      this.renderer.requestRender();
    }, 0);
  }

  private hideConfigEditor(): void {
    this.isEditingConfig = false;
    this.isFirstTimeSetup = false;

    if (this.configHookInput) {
      this.configHookInput.blur();
    }
    if (this.configOpenInput) {
      this.configOpenInput.blur();
    }
    if (this.configLaunchInput) {
      this.configLaunchInput.blur();
    }

    if (this.configContainer) {
      this.renderer.root.remove(this.configContainer.id);
      this.configContainer = null;
      this.configHookInput = null;
      this.configOpenInput = null;
      this.configLaunchInput = null;
    }

    this.selectElement.visible = true;
    this.instructions.content =
      "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
    
    // Delay focus to prevent the Enter keypress from triggering a selection
    setTimeout(() => {
      this.selectElement.focus();
      this.renderer.requestRender();
    }, 0);
  }

  private handleConfigSave(): void {
    if (!this.repoRoot) {
      this.setStatus("No git repository found.", "error");
      this.hideConfigEditor();
      return;
    }

    const hookValue = (this.configHookInput?.value || "").trim();
    const openValue = (this.configOpenInput?.value || "").trim();
    const launchValue = (this.configLaunchInput?.value || "").trim();
    const config: Config = {};

    if (hookValue) {
      config.postCreateHook = hookValue;
    }
    if (openValue) {
      config.openCommand = openValue;
    }
    if (launchValue) {
      config.launchCommand = launchValue;
    }

    const success = saveRepoConfig(this.repoRoot, config);

    if (success) {
      // Update the in-memory config
      this.repoConfig = config;
      
      // Re-check if the launch command is available
      const cmdName = config.launchCommand || "opencode";
      this.opencodeAvailable = isCommandAvailable(cmdName);

      const changes: string[] = [];
      if (hookValue) changes.push(`hook: "${hookValue}"`);
      if (openValue) changes.push(`open: "${openValue}"`);
      if (launchValue) changes.push(`launch: "${launchValue}"`);
      
      if (changes.length > 0) {
        this.setStatus(`Config saved: ${changes.join(", ")}`, "success");
      } else {
        this.setStatus("Config cleared.", "success");
      }
    } else {
      this.setStatus("Failed to save config.", "error");
    }

    this.hideConfigEditor();
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

    const cmdName = this.repoConfig.launchCommand || "opencode";
    this.opencodeAvailable = isCommandAvailable(cmdName);
    if (!this.opencodeAvailable) {
      this.setStatus(`${cmdName} is not available on PATH.`, "error");
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

    // Restore original title and colors (in case we came from delete mode)
    this.title.content = "OPENCODE WORKTREES";
    this.title.fg = "#E2E8F0";
    this.selectElement.backgroundColor = "#0F172A";
    this.selectElement.focusedBackgroundColor = "#1E293B";
    this.selectElement.selectedBackgroundColor = "#1E3A5F";
    this.selectElement.textColor = "#E2E8F0";
    this.selectElement.selectedTextColor = "#38BDF8";
    this.selectElement.descriptionColor = "#94A3B8";
    this.selectElement.selectedDescriptionColor = "#E2E8F0";

    this.selectElement.visible = true;
    this.instructions.content =
      "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
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

    // Change title to indicate delete mode
    this.title.content = "DELETE WORKTREES";
    this.title.fg = "#EF4444"; // Red

    // Change select element colors to danger theme
    this.selectElement.backgroundColor = "#1C1917";
    this.selectElement.focusedBackgroundColor = "#292524";
    this.selectElement.selectedBackgroundColor = "#44403C";
    this.selectElement.textColor = "#E7E5E4";
    this.selectElement.selectedTextColor = "#F87171";
    this.selectElement.descriptionColor = "#A8A29E";
    this.selectElement.selectedDescriptionColor = "#E7E5E4";

    // Rebuild options to show checkboxes (only deletable worktrees)
    this.selectElement.options = this.buildOptions(deletableWorktrees);
    this.instructions.content =
      "Enter toggle selection • d confirm delete • Esc cancel";
    this.setStatus("Select worktrees to delete, then press 'd' to confirm.", "info");
    this.renderer.requestRender();
  }

  private exitSelectMode(): void {
    this.isSelectingForDelete = false;
    this.selectedForDelete.clear();

    // Restore original title
    this.title.content = "OPENCODE WORKTREES";
    this.title.fg = "#E2E8F0";

    // Restore original select element colors
    this.selectElement.backgroundColor = "#0F172A";
    this.selectElement.focusedBackgroundColor = "#1E293B";
    this.selectElement.selectedBackgroundColor = "#1E3A5F";
    this.selectElement.textColor = "#E2E8F0";
    this.selectElement.selectedTextColor = "#38BDF8";
    this.selectElement.descriptionColor = "#94A3B8";
    this.selectElement.selectedDescriptionColor = "#E2E8F0";

    this.loadWorktrees();
    this.instructions.content =
      "↑/↓ navigate • Enter open • o folder • d delete • n new • c config • q quit";
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

    // Rebuild options to update checkboxes (only deletable worktrees)
    if (this.repoRoot) {
      const worktrees = listWorktrees(this.repoRoot);
      const deletableWorktrees = worktrees.filter(
        (wt) => !isMainWorktree(this.repoRoot!, wt.path)
      );
      this.selectElement.options = this.buildOptions(deletableWorktrees);
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
