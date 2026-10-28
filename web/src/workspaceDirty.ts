let dirty = false;
const listeners = new Set<(value: boolean) => void>();

export function setWorkspaceDirty(value: boolean): void {
  if (dirty === value) return;
  dirty = value;
  for (const listener of listeners) listener(value);
}

export function isWorkspaceDirty(): boolean {
  return dirty;
}

export function confirmDiscardWorkspace(
  message = "Discard unsaved changes in this section?",
): boolean {
  return !dirty || confirm(message);
}

export function subscribeWorkspaceDirty(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
