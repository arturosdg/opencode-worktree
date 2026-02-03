export type WorktreeInfo = {
  path: string;
  head: string;
  branch: string | null;
  isDetached: boolean;
  // Metadata
  isDirty: boolean;
  isOnRemote: boolean;
  lastModified: Date | null;
};
