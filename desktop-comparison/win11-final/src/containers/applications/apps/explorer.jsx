// File Explorer over the shared world fs (world.fs.nodes). Mutations go through fs intents.
// Tabs, view mode, Preview pane and the Space-bar preview are view chrome and stay local (SYNC-AUDIT §3).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FIXED_FOLDERS,
  ancestry,
  childrenOf,
  emit,
  fileIconSrc,
  fileTypeLabel,
  fmtSize,
  fileText,
  fmtTime,
  getNode,
  isImage,
  isInstalled,
  newId,
  openNode,
  resolveWinPath,
  sceneChoice,
  shownName,
  trashedItems,
  uniqueName,
  useWorld,
  winPath,
} from "../../../ocean/world-helpers";
import { Btn, Dialog, Fa, OceanApp, useContextMenu, useNotice } from "./ocean/ui";
import { setSys } from "../../../utils/ocean";

const itemCount = (n) => `${n} ${n === 1 ? "item" : "items"}`;
import { imageSrc } from "./ocean/photos";
import "./ocean/explorer.scss";

const FOLDER_ICONS = { root: "win/thispc", home: "win/user", desktop: "win/desk", documents: "win/docs", downloads: "win/down", pictures: "win/pics", music: "win/music" };
const SIDEBAR = [
  ["home", "Home"],
  ["desktop", "Desktop"],
  ["documents", "Documents"],
  ["downloads", "Downloads"],
  ["pictures", "Pictures"],
  ["music", "Music"],
];
const MOVE_TYPE = "text/x-ocean-fs";

// The Type column: the registered type name (PROGRAMS.md §1), "Application" for invoice.pdf.exe.
const typeLabel = (n) => {
  if (n.kind === "app") return "Shortcut";
  return fileTypeLabel(n);
};

const NodeIcon = ({ world, node, size }) => {
  // Archives and drives, and every file that is not a picture: the icon of its real (or disguised) type.
  if ((node.kind === "folder" && node.archive) || (node.kind === "file" && !isImage(node)))
    return <img className="fx-icon" src={fileIconSrc(node)} width={size} height={size} alt="" draggable={false} data-encrypted={node.encrypted || undefined} />;
  if (node.kind === "folder" || node.id === "trash") {
    const src = node.id === "trash" ? (trashedItems(world).length ? "win/bin" : "win/bin-em") : FOLDER_ICONS[node.id] || "win/folder";
    return <img className="fx-icon" src={`img/icon/${src}.png`} width={size} height={size} alt="" draggable={false} />;
  }
  // A file the sandbox replay found encrypted: the document icon with a padlock badge.
  if (node.encrypted)
    return (
      <span className="fx-fileicon fx-encrypted" data-encrypted="true" title="Encrypted" style={{ width: size, height: size }}>
        <Fa i="faFileLines" reg />
        <span className="fx-lockbadge" data-lock-badge="true">
          <Fa i="faLock" />
        </span>
      </span>
    );
  if (isImage(node)) return <img className="fx-thumb" src={imageSrc(world, node)} style={{ width: size, height: size * 0.78 }} alt="" draggable={false} />;
  // Same art as the desktop and Start for text documents.
  if (node.kind === "file" && /^text\//.test(node.mime || "text/")) return <img className="fx-icon" src="img/icon/notepad.png" width={size} height={size} alt="" draggable={false} />;
  const icon = /^(audio|video)\//.test(node.mime || "") ? "faFileAudio" : node.kind === "app" ? "faWindowRestore" : "faFileLines";
  return (
    <span className="fx-fileicon" style={{ width: size, height: size }}>
      <Fa i={icon} reg />
    </span>
  );
};

// Body of a file for the Preview pane and the Space-bar preview.
const Preview = ({ world, node, big }) => {
  if (!node) return <div className="fx-pv-empty oc-faint">Select a file to preview.</div>;
  if (isImage(node)) return <img className="fx-pv-img" src={imageSrc(world, node)} alt={node.name} draggable={false} />;
  if (node.kind === "file" && /^text\//.test(node.mime || "text/")) {
    const text = fileText(world, node);
    return <pre className="fx-pv-text" data-big={!!big}>{text ? text.slice(0, big ? 8000 : 2000) : "This file is empty."}</pre>;
  }
  return (
    <div className="fx-pv-empty">
      <NodeIcon world={world} node={node} size={64} />
      <div className="oc-faint">{node.kind === "folder" ? itemCount(childrenOf(world, node.id).length) : "No preview available."}</div>
    </div>
  );
};

let tabSeq = 1;

const FilesApp = ({ win }) => {
  const world = useWorld();
  const [tabs, setTabs] = useState(() => [{ id: tabSeq, hist: { list: ["home"], i: 0 } }]);
  const [tabId, setTabId] = useState(() => tabSeq++);
  const tab = tabs.find((t) => t.id === tabId) || tabs[0];
  const hist = tab.hist;
  const setHist = (next) => setTabs((list) => list.map((t) => (t.id === tab.id ? { ...t, hist: next } : t)));
  const [previewPane, setPreviewPane] = useState(false);
  const [peek, setPeek] = useState(null);
  const [selected, setSelected] = useState([]);
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [clip, setClip] = useState(null);
  const [props, setPropsLocal] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  // Properties of a file is a world dialog (it shows the type, publisher and signature on both OSes); folders keep the local panel.
  const setProps = (id) => {
    const n = id && id !== "trash" ? getNode(world, id) : null;
    if (n && n.kind === "file") emit({ kind: "file-properties", fileId: n.id });
    else setPropsLocal(id);
  };
  const [editPath, setEditPath] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [openMenu, menu] = useContextMenu();
  const [notice, noticeNode] = useNotice();
  const pendingSelect = useRef(null);

  const rawCwd = hist.list[hist.i];
  const cwd = rawCwd === "trash" || (getNode(world, rawCwd) && !getNode(world, rawCwd).trashed) ? rawCwd : "home";
  const inTrash = cwd === "trash";
  const payload = win && win.payload;

  const go = (id) => {
    if (id === cwd) return;
    setHist({ list: [...hist.list.slice(0, hist.i + 1), id], i: hist.i + 1 });
    setSelected([]);
    setQuery("");
    setRenaming(null);
  };

  useEffect(() => {
    if (!payload) return;
    const n = getNode(world, payload.folderId || payload.fileId);
    if (!n) return;
    if (n.kind === "folder") go(n.id);
    else {
      go(n.trashed ? "trash" : n.parentId);
      setSelected([n.id]);
    }
  }, [payload && (payload.folderId || payload.fileId)]);

  // Select a node created by this window once the world contains it.
  useEffect(() => {
    if (pendingSelect.current && getNode(world, pendingSelect.current)) {
      setSelected([pendingSelect.current]);
      setRenaming(pendingSelect.current);
      pendingSelect.current = null;
    }
  }, [world]);

  const items = useMemo(() => {
    // Shortcuts to apps that are not installed stay hidden (WORLD-CONTRACT §7).
    const list = (inTrash ? trashedItems(world) : childrenOf(world, cwd)).filter(
      (n) => (n.kind !== "app" || isInstalled(world, n.appId)) && (showHidden || !n.hidden) && (!query || n.name.toLowerCase().includes(query.toLowerCase())),
    );
    const key = { name: (n) => n.name.toLowerCase(), modified: (n) => n.modified, size: (n) => n.size || 0, type: (n) => typeLabel(n) }[sort];
    return [...list].sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || (key(a) < key(b) ? (sort === "name" || sort === "type" ? -1 : 1) : key(a) > key(b) ? (sort === "name" || sort === "type" ? 1 : -1) : 0));
  }, [world, cwd, query, sort, inTrash, showHidden]);

  const sel = selected.map((id) => getNode(world, id)).filter(Boolean);
  const one = sel.length === 1 ? sel[0] : null;
  const locked = (n) => FIXED_FOLDERS.includes(n.id);

  const create = (kind) => {
    if (inTrash) return;
    const id = newId(kind === "folder" ? "d" : "f");
    pendingSelect.current = id;
    emit({ kind: "fs", op: kind === "folder" ? "mkdir" : "touch", id, parentId: cwd, name: uniqueName(world, cwd, kind === "folder" ? "New folder" : "New Text Document.txt"), ...(kind === "file" ? { mime: "text/plain" } : {}) });
  };
  const trash = (nodes) =>
    nodes
      .filter((n) => !locked(n))
      .forEach((n) => (sceneChoice(world, "files", n.id, "delete"), emit({ kind: "fs", op: "trash", id: n.id })));
  const restore = (nodes) => nodes.forEach((n) => emit({ kind: "fs", op: "restore", id: n.id }));
  const move = (ids, parentId) =>
    ids.forEach((id) => {
      const n = getNode(world, id);
      if (!n || locked(n) || n.parentId === parentId || ancestry(world, parentId).some((a) => a.id === id)) return;
      emit({ kind: "fs", op: "move", id, parentId });
    });
  const paste = () => {
    if (!clip || inTrash) return;
    move(clip, cwd);
    setClip(null);
  };
  const open = (n, app) => {
    if (n.kind === "folder") return go(n.id);
    if (inTrash) return setProps(n.id);
    sceneChoice(world, "files", n.id, "run-file");
    if (!openNode(world, n, app)) notice("No installed app can open this file.");
  };
  const commitRename = (n, name) => {
    setRenaming(null);
    const v = name.trim();
    if (v && v !== n.name && !/[\\/:*?"<>|]/.test(v)) emit({ kind: "fs", op: "rename", id: n.id, name: uniqueName(world, n.parentId, v) });
  };

  const openWith = (n) =>
    n.kind === "file"
      ? [
          ["texteditor", "Notepad", "faFileLines"],
          ["photos", "Photos", "faImage"],
          ["media", "Media Player", "faCirclePlay"],
        ]
          .filter(([a]) => isInstalled(world, a))
          .map(([a, label, icon]) => ({ label: `Open with ${label}`, icon, onClick: () => open(n, a) }))
      : [];

  const itemMenu = (e, n) => {
    if (!selected.includes(n.id)) setSelected([n.id]);
    const targets = selected.includes(n.id) ? sel : [n];
    openMenu(
      e,
      inTrash
        ? [
            { label: "Restore", icon: "faRotateLeft", onClick: () => restore(targets) },
            { label: "Properties", icon: "faCircleInfo", onClick: () => setProps(n.id) },
          ]
        : [
            { label: "Open", icon: "faFolderOpen", onClick: () => open(n) },
            ...openWith(n),
            { label: "Preview (Space)", icon: "faEye", onClick: () => setPeek(n.id) },
            ...(n.kind === "folder" ? [{ label: "Open in new tab", icon: "faWindowRestore", onClick: () => addTab(n.id) }] : []),
            { sep: true },
            { label: "Cut", icon: "faScissors", onClick: () => setClip(targets.map((x) => x.id)), disabled: targets.some(locked) },
            { label: "Rename", icon: "faICursor", onClick: () => setRenaming(n.id), disabled: locked(n) },
            { label: "Delete", icon: "faTrashCan", onClick: () => trash(targets), disabled: targets.every(locked) },
            { sep: true },
            { label: "Properties", icon: "faCircleInfo", onClick: () => setProps(n.id) },
          ],
    );
  };
  const areaMenu = (e) => {
    setSelected([]);
    openMenu(
      e,
      inTrash
        ? [{ label: "Empty Recycle Bin", icon: "faTrashCan", onClick: () => emit({ kind: "fs", op: "empty-trash" }), disabled: !items.length }]
        : [
            { label: "View: Large icons", icon: "faTableCells", onClick: () => setView("grid") },
            { label: "View: Details", icon: "faList", onClick: () => setView("details") },
            { label: "Sort by name", icon: "faArrowDownAZ", onClick: () => setSort("name") },
            { label: "Sort by date modified", icon: "faClock", onClick: () => setSort("modified") },
            { sep: true },
            { label: "Paste", icon: "faPaste", onClick: paste, disabled: !clip },
            { label: "New folder", icon: "faFolderPlus", onClick: () => create("folder") },
            { label: "New text document", icon: "faFileCirclePlus", onClick: () => create("file") },
            { sep: true },
            { label: "Open in Terminal", icon: "faTerminal", onClick: () => emit({ kind: "open-app", app: "terminal", payload: { folderId: cwd } }), disabled: !isInstalled(world, "terminal") },
            { label: "Properties", icon: "faCircleInfo", onClick: () => setProps(cwd) },
          ],
    );
  };

  const clickItem = (e, n) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) setSelected(selected.includes(n.id) ? selected.filter((x) => x !== n.id) : [...selected, n.id]);
    else setSelected([n.id]);
  };
  const keyDown = (e) => {
    if (renaming || e.target.tagName === "INPUT") return;
    if (e.key === "Delete" && sel.length && !inTrash) trash(sel);
    else if (e.key === "F2" && one && !locked(one)) setRenaming(one.id);
    else if (e.key === "Enter" && one) open(one);
    else if (e.key === " " && one) (e.preventDefault(), setPeek(peek ? null : one.id));
    else if (e.key === "p" && e.altKey) (e.preventDefault(), setPreviewPane(!previewPane));
    else if (e.key === "t" && e.ctrlKey) (e.preventDefault(), addTab(cwd));
    else if (e.key === "w" && e.ctrlKey && tabs.length > 1) (e.preventDefault(), closeTab(tab.id));
    else if (e.key === "Backspace") hist.i > 0 && setHist({ ...hist, i: hist.i - 1 });
    else if (e.key === "a" && e.ctrlKey) (e.preventDefault(), setSelected(items.map((n) => n.id)));
  };

  const dragProps = (n) => ({
    draggable: !inTrash && !locked(n) && renaming !== n.id,
    onDragStart: (e) => {
      const ids = selected.includes(n.id) ? selected : [n.id];
      e.dataTransfer.setData(MOVE_TYPE, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "move";
    },
  });
  const dropProps = (targetId) => ({
    onDragOver: (e) => {
      if (![...e.dataTransfer.types].includes(MOVE_TYPE)) return;
      e.preventDefault();
      setDropTarget(targetId);
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const ids = JSON.parse(e.dataTransfer.getData(MOVE_TYPE) || "[]");
      if (targetId === "trash") trash(ids.map((id) => getNode(world, id)).filter(Boolean));
      else move(ids, targetId);
    },
    "data-drop": dropTarget === targetId,
  });

  const addTab = (folder = "home") => {
    const id = tabSeq++;
    setTabs([...tabs, { id, hist: { list: [folder], i: 0 } }]);
    setTabId(id);
    setSelected([]);
  };
  const closeTab = (id) => {
    const rest = tabs.filter((t) => t.id !== id);
    if (!rest.length) return win && emit({ kind: "close-window", id: win.id });
    setTabs(rest);
    if (id === tab.id) setTabId(rest[Math.max(0, tabs.findIndex((t) => t.id === id) - 1)].id);
  };
  const tabName = (t) => {
    const id = t.hist.list[t.hist.i];
    return id === "trash" ? "Recycle Bin" : id === "root" ? "This PC" : id === "home" ? world.user.name.split(" ")[0] : (getNode(world, id) || {}).name || "Home";
  };

  const crumbs = inTrash ? [{ id: "trash", name: "Recycle Bin" }] : ancestry(world, cwd).map((n) => ({ id: n.id, name: n.id === "root" ? "Users" : n.name }));
  const cwdName = crumbs[crumbs.length - 1].name;
  const propNode = props && (props === "trash" ? { id: "trash", name: "Recycle Bin", kind: "folder", modified: null, size: 0, parentId: "home" } : getNode(world, props));

  return (
    <OceanApp className="fx-app" tabIndex={-1} onKeyDown={keyDown}>
      <div className="oc-col oc-grow">
        <div className="fx-tabs oc-row" data-testid="explorer-tabs">
          {tabs.map((t) => (
            <div key={t.id} className="fx-tab" data-active={t.id === tab.id} onClick={() => (setTabId(t.id), setSelected([]))} onMouseDown={(e) => e.button === 1 && closeTab(t.id)}>
              <NodeIcon world={world} node={t.hist.list[t.hist.i] === "trash" ? { id: "trash", kind: "folder" } : getNode(world, t.hist.list[t.hist.i]) || { id: "home", kind: "folder" }} size={16} />
              <span className="oc-ellipsis oc-grow">{tabName(t)}</span>
              <span className="fx-tab-x" title="Close tab" onClick={(e) => (e.stopPropagation(), closeTab(t.id))}>
                <Fa i="faXmark" />
              </span>
            </div>
          ))}
          <button type="button" className="fx-tab-add" title="Add new tab (Ctrl+T)" onClick={() => addTab(cwd)} disabled={tabs.length >= 8}>
            <Fa i="faPlus" />
          </button>
        </div>
        <div className="fx-nav oc-row">
          <Btn subtle icon="faArrowLeft" disabled={hist.i === 0} onClick={() => setHist({ ...hist, i: hist.i - 1 })} title="Back" />
          <Btn subtle icon="faArrowRight" disabled={hist.i >= hist.list.length - 1} onClick={() => setHist({ ...hist, i: hist.i + 1 })} title="Forward" />
          <Btn subtle icon="faArrowUp" disabled={inTrash || cwd === "root"} onClick={() => go(getNode(world, cwd).parentId)} title="Up" />
          <div className="fx-address oc-grow" onClick={() => editPath == null && setEditPath(winPath(world, cwd))}>
            {editPath != null ? (
              <input
                className="fx-address-input"
                autoFocus
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
                onBlur={() => setEditPath(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditPath(null);
                  if (e.key !== "Enter") return;
                  const target = /^recycle bin$/i.test(editPath.trim()) ? "trash" : resolveWinPath(world, cwd, editPath);
                  const n = target && target !== "trash" && getNode(world, target);
                  if (target === "trash" || (n && n.kind === "folder")) go(target);
                  else if (n) open(n);
                  else notice(`Windows can't find '${editPath}'.`);
                  setEditPath(null);
                }}
              />
            ) : (
              <>
                <NodeIcon world={world} node={inTrash ? { id: "trash", kind: "folder" } : getNode(world, cwd)} size={16} />
                {crumbs.map((c, i) => (
                  <React.Fragment key={c.id}>
                    <Fa i="faChevronRight" className="fx-chev" />
                    <span className="fx-crumb" onClick={(e) => (e.stopPropagation(), go(c.id))} {...(inTrash ? {} : dropProps(c.id))}>
                      {c.name}
                    </span>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
          <div className="oc-search fx-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder={`Search ${cwdName}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="oc-toolbar fx-commands">
          {inTrash ? (
            <>
              <Btn subtle icon="faTrashCan" reg onClick={() => emit({ kind: "fs", op: "empty-trash" })} disabled={!items.length}>
                Empty Recycle Bin
              </Btn>
              <Btn subtle icon="faRotateLeft" onClick={() => restore(sel)} disabled={!sel.length}>
                Restore the selected items
              </Btn>
              <Btn subtle icon="faRotateLeft" onClick={() => restore(items)} disabled={!items.length}>
                Restore all items
              </Btn>
            </>
          ) : (
            <>
              <Btn subtle icon="faFolderPlus" onClick={() => create("folder")} title="New folder">
                New folder
              </Btn>
              <Btn subtle icon="faFileCirclePlus" onClick={() => create("file")} title="New text document" />
              <div className="oc-toolbar-sep" />
              <Btn subtle icon="faScissors" onClick={() => setClip(selected)} disabled={!sel.length || sel.some(locked)} title="Cut" />
              <Btn subtle icon="faPaste" onClick={paste} disabled={!clip} title="Paste" />
              <Btn subtle icon="faICursor" onClick={() => setRenaming(one.id)} disabled={!one || locked(one)} title="Rename" />
              <Btn subtle icon="faTrashCan" reg onClick={() => trash(sel)} disabled={!sel.length || sel.every(locked)} title="Delete" />
              <div className="oc-toolbar-sep" />
              <select className="fx-select" value={sort} onChange={(e) => setSort(e.target.value)} title="Sort">
                <option value="name">Sort: Name</option>
                <option value="modified">Sort: Date modified</option>
                <option value="type">Sort: Type</option>
                <option value="size">Sort: Size</option>
              </select>
              <select className="fx-select" value={view} onChange={(e) => setView(e.target.value)} title="View">
                <option value="grid">View: Large icons</option>
                <option value="medium">View: Medium icons</option>
                <option value="list">View: List</option>
                <option value="details">View: Details</option>
              </select>
              <div className="oc-grow" />
              <Btn subtle icon="faTableColumns" onClick={() => setPreviewPane(!previewPane)} title="Preview pane (Alt+P)" className={previewPane ? "fx-on" : ""} />
              <Btn subtle icon="faFileCode" onClick={() => setSys({ showExtensions: !world.sys.showExtensions })} title={world.sys.showExtensions ? "Hide file name extensions" : "Show file name extensions"} className={world.sys.showExtensions ? "fx-on" : ""} />
              <Btn subtle icon={showHidden ? "faEye" : "faEyeSlash"} onClick={() => setShowHidden(!showHidden)} title={showHidden ? "Hide hidden items" : "Show hidden items"} className={showHidden ? "fx-on" : ""} />
              <Btn subtle icon="faCircleInfo" onClick={() => setProps(one ? one.id : cwd)} title="Properties" />
            </>
          )}
        </div>
        <div className="oc-row fx-body oc-grow">
          <div className="oc-sidebar fx-side">
            {SIDEBAR.map(([id, label]) => (
              <div key={id} className="oc-nav-item fx-side-item" data-active={cwd === id} onClick={() => go(id)} {...dropProps(id)}>
                <img src={`img/icon/${FOLDER_ICONS[id]}-sm.png`} width={16} height={16} alt="" />
                <span className="oc-nav-label">{id === "home" ? world.user.name.split(" ")[0] : label}</span>
                {id !== "home" ? <Fa i="faThumbtack" className="fx-pin" /> : null}
              </div>
            ))}
            <div className="oc-sep" />
            <div className="oc-nav-item fx-side-item" data-active={cwd === "root"} onClick={() => go("root")}>
              <img src="img/icon/win/thispc-sm.png" width={16} height={16} alt="" />
              <span className="oc-nav-label">This PC</span>
            </div>
            {childrenOf(world, "root")
              .filter((d) => d.kind === "folder" && d.archive)
              .map((d) => (
                <div key={d.id} className="oc-nav-item fx-side-item" data-active={cwd === d.id} data-drive={d.archive} onClick={() => go(d.id)}>
                  <img src={fileIconSrc(d)} width={16} height={16} alt="" />
                  <span className="oc-nav-label">{d.name}</span>
                </div>
              ))}
            <div className="oc-nav-item fx-side-item" data-active={inTrash} onClick={() => go("trash")} {...dropProps("trash")}>
              <img src={`img/icon/${trashedItems(world).length ? "win/bin" : "win/bin-em"}.png`} width={16} height={16} alt="" />
              <span className="oc-nav-label">Recycle Bin</span>
            </div>
          </div>
          <div className="fx-content oc-grow oc-scroll" data-view={view} onClick={() => setSelected([])} onContextMenu={areaMenu} {...(inTrash ? {} : dropProps(cwd))} data-drop={false}>
            {view === "details" ? (
              <div className="fx-row fx-head">
                <span>Name</span>
                <span>{inTrash ? "Original location" : "Date modified"}</span>
                <span>Type</span>
                <span>Size</span>
              </div>
            ) : null}
            {items.map((n) => (
              <div
                key={n.id}
                className={view === "details" ? "fx-row fx-item" : "fx-tile fx-item"}
                data-node={n.id}
                data-sel={selected.includes(n.id)}
                data-cut={!!(clip && clip.includes(n.id))}
                onClick={(e) => clickItem(e, n)}
                onDoubleClick={() => open(n)}
                onContextMenu={(e) => itemMenu(e, n)}
                title={n.name}
                {...dragProps(n)}
                {...(n.kind === "folder" && !inTrash ? dropProps(n.id) : {})}
              >
                <span className="fx-name">
                  <NodeIcon world={world} node={n} size={view === "grid" ? 48 : view === "medium" ? 32 : 18} />
                  {renaming === n.id ? (
                    <input
                      className="fx-rename"
                      autoFocus
                      defaultValue={n.name}
                      onFocus={(e) => e.target.setSelectionRange(0, n.kind === "file" && n.name.lastIndexOf(".") > 0 ? n.name.lastIndexOf(".") : n.name.length)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitRename(n, e.target.value)}
                      onKeyDown={(e) => (e.key === "Enter" ? e.target.blur() : e.key === "Escape" ? setRenaming(null) : null)}
                    />
                  ) : (
                    <span className="fx-label" data-hidden-file={n.hidden || undefined}>{shownName(n, world)}</span>
                  )}
                </span>
                {view === "details" ? (
                  <>
                    <span className="oc-faint">{inTrash ? winPath(world, n.parentId) : fmtTime(n.modified, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    <span className="oc-faint">{typeLabel(n)}</span>
                    <span className="oc-faint">{n.kind === "file" ? fmtSize(n.size) : ""}</span>
                  </>
                ) : null}
              </div>
            ))}
            {!items.length ? <div className="fx-empty oc-faint">{query ? "No items match your search." : inTrash ? "Recycle Bin is empty." : "This folder is empty."}</div> : null}
          </div>
          {previewPane ? (
            <div className="fx-preview oc-col" data-testid="explorer-preview">
              <Preview world={world} node={one} />
            </div>
          ) : null}
        </div>
        <div className="fx-status oc-row">
          <span>{itemCount(items.length)}</span>
          {sel.length ? (
            <span>
              {sel.length} item{sel.length > 1 ? "s" : ""} selected {one && one.kind === "file" ? fmtSize(one.size) : ""}
            </span>
          ) : null}
          <div className="oc-grow" />
          <Btn subtle icon="faList" onClick={() => setView("details")} title="Details" className={view === "details" ? "fx-on" : ""} />
          <Btn subtle icon="faTableCells" onClick={() => setView("grid")} title="Large icons" className={view === "grid" ? "fx-on" : ""} />
        </div>
      </div>
      {propNode ? (
        <Dialog title={`${propNode.name} Properties`} onClose={() => setProps(null)} actions={<Btn primary onClick={() => setProps(null)}>OK</Btn>}>
          <div className="oc-row fx-prop-head">
            <NodeIcon world={world} node={propNode} size={40} />
            <span className="oc-h3">{propNode.name}</span>
          </div>
          <div className="oc-kv">
            <span>Type</span>
            <span>{propNode.id === "trash" ? "Recycle Bin" : typeLabel(propNode)}</span>
            <span>Location</span>
            <span>{propNode.id === "root" ? "This PC" : winPath(world, propNode.parentId)}</span>
            <span>Size</span>
            <span>{propNode.kind === "file" ? fmtSize(propNode.size) : itemCount((propNode.id === "trash" ? trashedItems(world) : childrenOf(world, propNode.id)).length)}</span>
            <span>Modified</span>
            <span>{fmtTime(propNode.modified, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) || "—"}</span>
            {propNode.trashed ? (
              <>
                <span>Status</span>
                <span>In Recycle Bin</span>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {peek && getNode(world, peek) ? (
        <Dialog
          title={getNode(world, peek).name}
          onClose={() => setPeek(null)}
          actions={
            <>
              {!inTrash ? (
                <Btn primary onClick={() => (setPeek(null), open(getNode(world, peek)))}>
                  Open
                </Btn>
              ) : null}
              <Btn onClick={() => setPeek(null)}>Close</Btn>
            </>
          }
        >
          <div className="fx-peek" data-testid="explorer-peek">
            <Preview world={world} node={getNode(world, peek)} big />
          </div>
        </Dialog>
      ) : null}
      {menu}
      {noticeNode}
    </OceanApp>
  );
};


export default FilesApp;
