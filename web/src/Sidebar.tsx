import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import {
  autoOrganizeSessions,
  createFolder,
  deleteFolder,
  filterSessions,
  openSession,
  store,
  toast,
  useStore,
} from "./store";
import type { Filters } from "./store";
import type { Folder } from "./api";
import Icon from "./Icon";

const COLORS = ["#5b9dff", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#22d3ee"];

type DirectorySort = "latest" | "count" | "alpha";
type FolderNode = Folder & { children: FolderNode[] };

function buildFolderTree(folders: Folder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const folder of folders) nodes.set(folder.id, { ...folder, children: [] });
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

function flattenFolderTree(nodes: FolderNode[], depth = 0, out: { node: FolderNode; depth: number }[] = []) {
  for (const node of nodes) {
    out.push({ node, depth });
    flattenFolderTree(node.children, depth + 1, out);
  }
  return out;
}

function readDirectorySort(): DirectorySort {
  try {
    const saved = localStorage.getItem("oc_directory_sort");
    if (saved === "latest" || saved === "count" || saved === "alpha") return saved;
  } catch {}
  return "latest";
}

function readDirectoriesOpen(): boolean {
  try {
    return localStorage.getItem("oc_sidebar_directories_open") !== "0";
  } catch {
    return true;
  }
}

function shortAgo(ms: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ms).toLocaleDateString();
}

export default function Sidebar() {
  const s = useStore();
  const [newFolder, setNewFolder] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("oc_collapsed_folders") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const newFolderRef = useRef<HTMLInputElement>(null);
  const [dirSort, setDirSort] = useState<DirectorySort>(readDirectorySort);
  const [directoriesOpen, setDirectoriesOpen] = useState(readDirectoriesOpen);
  const [organizing, setOrganizing] = useState(false);

  const folderTree = useMemo(() => buildFolderTree(s.folders), [s.folders]);
  const flatFolders = useMemo(() => flattenFolderTree(folderTree), [folderTree]);

  const counts = useMemo(() => {
    const base = s.sessions;
    const direct = new Map<string, number>();
    for (const session of base) {
      if (session.timeArchived != null || !session.folderId) continue;
      direct.set(session.folderId, (direct.get(session.folderId) ?? 0) + 1);
    }
    const childIds = new Map<string, string[]>();
    for (const folder of s.folders) {
      if (!folder.parent_id) continue;
      const list = childIds.get(folder.parent_id) ?? [];
      list.push(folder.id);
      childIds.set(folder.parent_id, list);
    }
    const totals = new Map<string, number>();
    const total = (id: string): number => {
      const cached = totals.get(id);
      if (cached != null) return cached;
      let n = direct.get(id) ?? 0;
      for (const child of childIds.get(id) ?? []) n += total(child);
      totals.set(id, n);
      return n;
    };
    for (const folder of s.folders) total(folder.id);
    return {
      all: base.filter((x) => x.timeArchived == null).length,
      pinned: base.filter((x) => x.timeArchived == null && x.pinned).length,
      archived: base.filter((x) => x.timeArchived != null).length,
      folders: total,
    };
  }, [s.sessions, s.folders]);

  const directoryRows = useMemo(() => {
    const stats = new Map<string, { path: string; count: number; latest: number }>();
    for (const dir of s.directories) stats.set(dir, { path: dir, count: 0, latest: 0 });
    for (const session of s.sessions) {
      if (session.timeArchived != null) continue;
      const row =
        stats.get(session.directory) ?? { path: session.directory, count: 0, latest: 0 };
      row.count += 1;
      row.latest = Math.max(row.latest, session.timeUpdated);
      stats.set(session.directory, row);
    }

    const rows = [...stats.values()];
    const byName = (a: { path: string }, b: { path: string }) =>
      a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
    rows.sort((a, b) => {
      if (dirSort === "alpha") return byName(a, b);
      if (dirSort === "count") return b.count - a.count || b.latest - a.latest || byName(a, b);
      return b.latest - a.latest || b.count - a.count || byName(a, b);
    });
    return rows;
  }, [s.directories, s.sessions, dirSort]);

  const changeDirectorySort = (value: string) => {
    const next: DirectorySort =
      value === "count" || value === "alpha" || value === "latest" ? value : "latest";
    setDirSort(next);
    try {
      localStorage.setItem("oc_directory_sort", next);
    } catch {}
  };

  const toggleDirectories = () => {
    setDirectoriesOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem("oc_sidebar_directories_open", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const sidebarSessions = useMemo(() => {
    return filterSessions(s.sessions, s.filters, s.folders)
      .filter((session) => !session.parentId)
      .slice(0, 60);
  }, [s.sessions, s.filters, s.folders]);

  const apply = (patch: Partial<Filters>) =>
    store.set({ filters: { ...s.filters, ...patch }, activeSessionId: null, view: "chat" });

  const smart = (which: "all" | "pinned" | "archived") => {
    if (which === "archived") apply({ archived: "1", folder: null, directory: null });
    else if (which === "pinned") apply({ archived: "0", folder: null, directory: null, sort: "updated" });
    else apply({ archived: "0", folder: null, directory: null });
  };

  const activeSmart =
    s.filters.archived === "1" && !s.filters.folder && !s.filters.directory
      ? "archived"
      : s.filters.archived === "0" && !s.filters.folder && !s.filters.directory
        ? "all"
        : null;

  const saveCollapsed = (next: Set<string>) => {
    try {
      localStorage.setItem("oc_collapsed_folders", JSON.stringify([...next]));
    } catch {}
  };

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  };

  const startSubfolder = (parentId: string) => {
    setNewFolderParent(parentId);
    setNewFolder("");
    setCollapsedFolders((prev) => {
      if (!prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.delete(parentId);
      saveCollapsed(next);
      return next;
    });
    requestAnimationFrame(() => newFolderRef.current?.focus());
  };

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    await createFolder(name, COLORS[s.folders.length % COLORS.length]!, newFolderParent);
    setNewFolder("");
    if (newFolderParent) {
      setCollapsedFolders((prev) => {
        if (!prev.has(newFolderParent)) return prev;
        const next = new Set(prev);
        next.delete(newFolderParent);
        saveCollapsed(next);
        return next;
      });
    }
  };

  const isAdmin = !!s.auth.user?.is_admin;

  const organizeAll = async () => {
    if (organizing) return;
    setOrganizing(true);
    toast("Auto-organizing sessions with Claude…");
    try {
      const result = await autoOrganizeSessions({
        model: s.model,
        variant: s.variant,
        agent: s.agent,
      });
      if (result.sessionId) {
        toast(
          `Organized ${result.assigned} session${result.assigned === 1 ? "" : "s"}` +
            (result.foldersCreated
              ? ` · ${result.foldersCreated} new folder${result.foldersCreated === 1 ? "" : "s"}`
              : ""),
        );
      } else {
        toast("No sessions to organize");
      }
    } catch (e) {
      toast(`Auto-organize failed: ${e}`);
    } finally {
      setOrganizing(false);
    }
  };

  function renderFolder(folder: FolderNode, depth: number): ReactNode {
    const hasChildren = folder.children.length > 0;
    const open = !collapsedFolders.has(folder.id);
    return (
      <Fragment key={folder.id}>
        <div
          className={"nav-item folder-row" + (s.filters.folder === folder.id ? " active" : "")}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={folder.name}
          onClick={() => apply({ archived: "0", folder: folder.id, directory: null })}
        >
          {hasChildren ? (
            <button
              type="button"
              className="session-expand"
              title={open ? "Collapse folder" : "Expand folder"}
              onClick={(event) => {
                event.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
            </button>
          ) : (
            <span className="folder-expand-spacer" />
          )}
          <span className="swatch" style={{ background: folder.color ?? "var(--muted)" }} />
          <span className="folder-name">{folder.name}</span>
          <span className="count">{counts.folders(folder.id)}</span>
          <button
            type="button"
            className="btn ghost sm folder-action"
            title="Add subfolder"
            onClick={(event) => {
              event.stopPropagation();
              startSubfolder(folder.id);
            }}
          >
            <Icon name="plus" size={12} />
          </button>
          <button
            type="button"
            className="btn ghost sm folder-action"
            title="Delete folder and its subfolders"
            onClick={(event) => {
              event.stopPropagation();
              if (
                confirm(
                  `Delete folder "${folder.name}"${hasChildren ? " and its subfolders" : ""}? Sessions are kept.`,
                )
              )
                deleteFolder(folder.id);
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
        {hasChildren && open && folder.children.map((child) => renderFolder(child, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <button
          className="btn primary full ignition-capsule-btn"
          onClick={() => store.set({ activeSessionId: "__new__", view: "chat" })}
        >
          <Icon name="plus" /> New session
        </button>
      </div>
      <div className="sidebar-scroll">
        <div className="nav-item" onClick={() => smart("all")} style={activeSmart === "all" ? { background: "var(--bg-3)" } : {}}>
          <span>All sessions</span>
          <span className="count">{counts.all}</span>
        </div>
        <div className="nav-item" onClick={() => smart("pinned")}>
          <span><Icon name="pin" /> Pinned</span>
          <span className="count">{counts.pinned}</span>
        </div>
        <div className="nav-item" onClick={() => smart("archived")}>
          <span><Icon name="archive" /> Archived</span>
          <span className="count">{counts.archived}</span>
        </div>

        <div className="section-title folders-title">
          <span>Folders</span>
          {isAdmin && !s.readOnly && (
            <button
              type="button"
              className="btn ghost sm folder-organize"
              onClick={organizeAll}
              disabled={organizing}
              title="Use opencode to build a folder tree and file unfiled sessions"
            >
              <Icon name={organizing ? "refresh" : "style"} size={12} />
              {organizing ? "Organizing…" : "Auto-organize"}
            </button>
          )}
        </div>
        {folderTree.map((folder) => renderFolder(folder, 0))}
        <div className="nav-item" onClick={() => apply({ archived: "0", folder: "none", directory: null })}>
          <span className="muted">Unfiled</span>
        </div>

        <div className="folder-new">
          <input
            ref={newFolderRef}
            className="input"
            placeholder={newFolderParent ? "New subfolder…" : "New folder…"}
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addFolder();
            }}
          />
          <div className="folder-new-row">
            <select
              className="input"
              value={newFolderParent ?? ""}
              onChange={(e) => setNewFolderParent(e.target.value || null)}
              title="Parent folder"
              aria-label="Parent folder"
            >
              <option value="">Root folder</option>
              {flatFolders.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {"— ".repeat(depth)}
                  {node.name}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={addFolder} disabled={!newFolder.trim()}>
              <Icon name="plus" /> Add
            </button>
          </div>
        </div>

        <div
          className={
            "sidebar-directory-block" +
            (directoriesOpen ? " lcd kjofol-lcd-screen xeno3000-paper-lcd" : "")
          }
        >
        <div className="section-title dir-section-title">
          <button
            type="button"
            className="section-toggle"
            onClick={toggleDirectories}
            aria-expanded={directoriesOpen}
            title={directoriesOpen ? "Collapse directories" : "Expand directories"}
          >
            <Icon name={directoriesOpen ? "chevronDown" : "chevronRight"} size={12} />
            <span>Directories</span>
          </button>
          {directoriesOpen && (
            <select
              className="input dir-sort"
              value={dirSort}
              onChange={(e) => changeDirectorySort(e.target.value)}
              title="Sort directories"
              aria-label="Sort directories"
            >
              <option value="latest">Latest</option>
              <option value="count">Most sessions</option>
              <option value="alpha">A–Z</option>
            </select>
          )}
        </div>
        {directoriesOpen ? (
          directoryRows.slice(0, 40).map((dir) => (
            <div
              key={dir.path}
              className={"nav-item dir-row" + (s.filters.directory === dir.path ? " active" : "")}
              title={dir.path}
              onClick={() => apply({ archived: "0", directory: dir.path, folder: null })}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }}>
                {dir.path}
              </span>
              <span className="count">{dir.count}</span>
            </div>
          ))
        ) : (
          <>
            <div className="section-title sidebar-sessions-title">Sessions</div>
            <div className="sidebar-sessions">
              {sidebarSessions.length === 0 && (
                <div className="muted small" style={{ padding: "4px 8px" }}>No sessions here.</div>
              )}
              {sidebarSessions.map((session) => (
                <div
                  key={session.id}
                  className={"nav-item sidebar-session" + (s.activeSessionId === session.id ? " active" : "")}
                  title={`${session.title || "(untitled)"}\n${session.directory}`}
                  onClick={() => openSession(session.id)}
                >
                  <span className="sidebar-session-title">{session.title || "(untitled)"}</span>
                  <span className="sidebar-session-meta">{shortAgo(session.timeUpdated)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
