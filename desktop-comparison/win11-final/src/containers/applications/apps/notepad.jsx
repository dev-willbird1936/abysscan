// Notepad over world fs text files: open, edit, save (fs write), save as (fs touch). A document (.doc, .docx, .docm, .rtf,
// .odt) opens in WordPad's view instead, the Windows idiom of TextEdit opening one as rich text on macOS (PARITY.md
// texteditor): a Home ribbon and a white page. The ribbon is view chrome (local); the text is the same shared file text.
import React, { useEffect, useRef, useState } from "react";
import { childrenOf, emit, fileText, getNode, isImage, newId, uniqueName, useWorld, winPath } from "../../../ocean/world-helpers";
import { Btn, Dialog, Fa, OceanApp, useContextMenu } from "./ocean/ui";
import "./ocean/notepad.scss";

const FilePicker = ({ world, mode, initialFolder, initialName, onPick, onClose }) => {
  const [folder, setFolder] = useState(initialFolder || "documents");
  const [name, setName] = useState(initialName || "Untitled.txt");
  const [picked, setPicked] = useState(null);
  const list = childrenOf(world, folder).filter((n) => n.kind === "folder" || (n.kind === "file" && !isImage(n)));
  const up = getNode(world, folder) && getNode(world, folder).parentId;
  const ok = () => {
    if (mode === "open") return picked && onPick(picked);
    const v = name.trim();
    if (!v || /[\\/:*?"<>|]/.test(v)) return;
    onPick({ folder, name: /\.[a-z0-9]+$/i.test(v) ? v : `${v}.txt` });
  };
  return (
    <Dialog
      title={mode === "open" ? "Open" : "Save as"}
      onClose={onClose}
      actions={
        <>
          <Btn primary onClick={ok} disabled={mode === "open" && !picked}>
            {mode === "open" ? "Open" : "Save"}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </>
      }
    >
      <div className="oc-row">
        <Btn subtle icon="faArrowUp" disabled={!up} onClick={() => setFolder(up)} title="Up" />
        <span className="np-path oc-ellipsis">{winPath(world, folder)}</span>
      </div>
      <div className="np-picker oc-scroll">
        {list.map((n) => (
          <div
            key={n.id}
            className="np-pick"
            data-sel={picked === n.id}
            onClick={() => (n.kind === "folder" ? setFolder(n.id) : (setPicked(n.id), setName(n.name)))}
            onDoubleClick={() => n.kind === "file" && onPick(n.id)}
          >
            <Fa i={n.kind === "folder" ? "faFolder" : "faFileLines"} reg={n.kind !== "folder"} className={n.kind === "folder" ? "np-folder" : "oc-accent-text"} />
            <span className="oc-ellipsis">{n.name}</span>
          </div>
        ))}
        {!list.length ? <div className="oc-faint np-none">No text files here</div> : null}
      </div>
      {mode === "save" ? <input className="oc-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" /> : null}
    </Dialog>
  );
};

const DOCUMENT = /\.(docx?|docm|rtf|odt)$/i;

// WordPad's Home ribbon. Bold, italic, underline and alignment restyle this view only.
const Ribbon = ({ look, setLook }) => {
  const toggle = (key) => setLook({ ...look, [key]: !look[key] });
  const Tool = ({ i, label, on, onClick }) => (
    <button type="button" className="wp-tool" data-on={!!on} title={label} aria-label={label} aria-pressed={on === undefined ? undefined : !!on} onClick={onClick}>
      <Fa i={i} />
    </button>
  );
  return (
    <div className="wp-ribbon oc-row">
      <div className="wp-group">
        <button type="button" className="wp-big" title="Paste">
          <Fa i="faPaste" />
          <span>Paste</span>
        </button>
        <span className="wp-label">Clipboard</span>
      </div>
      <div className="wp-group">
        <div className="oc-row wp-fontrow">
          <span className="wp-field wp-font">Calibri</span>
          <span className="wp-field wp-size">11</span>
        </div>
        <div className="oc-row">
          <Tool i="faBold" label="Bold" on={look.bold} onClick={() => toggle("bold")} />
          <Tool i="faItalic" label="Italic" on={look.italic} onClick={() => toggle("italic")} />
          <Tool i="faUnderline" label="Underline" on={look.underline} onClick={() => toggle("underline")} />
          <Tool i="faHighlighter" label="Text highlight colour" />
          <Tool i="faFont" label="Text colour" />
        </div>
        <span className="wp-label">Font</span>
      </div>
      <div className="wp-group">
        <div className="oc-row">
          <Tool i="faListUl" label="Start a list" />
          <Tool i="faIndent" label="Increase indent" />
        </div>
        <div className="oc-row">
          {["left", "center", "right"].map((a) => (
            <Tool key={a} i={`faAlign${a[0].toUpperCase()}${a.slice(1)}`} label={`Align ${a}`} on={look.align === a} onClick={() => setLook({ ...look, align: a })} />
          ))}
        </div>
        <span className="wp-label">Paragraph</span>
      </div>
      <div className="wp-group">
        <button type="button" className="wp-big" title="Picture">
          <Fa i="faImage" reg />
          <span>Picture</span>
        </button>
        <span className="wp-label">Insert</span>
      </div>
      <div className="wp-group">
        <div className="wp-edit">
          <Fa i="faMagnifyingGlass" /> Find
        </div>
        <div className="wp-edit">
          <Fa i="faRightLeft" /> Replace
        </div>
        <span className="wp-label">Editing</span>
      </div>
    </div>
  );
};

const NotepadApp = ({ win }) => {
  const world = useWorld();
  const [fileId, setFileId] = useState(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(null);
  const [wrap, setWrap] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [caret, setCaret] = useState([1, 1]);
  const [openMenu, menu] = useContextMenu();
  const [look, setLook] = useState({ bold: false, italic: false, underline: false, align: "left" });
  const ref = useRef(null);
  const node = fileId && getNode(world, fileId);
  const saved = node ? fileText(world, node) : "";
  const payloadFile = win && win.payload && win.payload.fileId;

  const load = (id) => {
    const n = getNode(world, id);
    if (!n) return;
    setFileId(id);
    setText(fileText(world, n));
    setDirty(false);
  };
  useEffect(() => {
    if (payloadFile) load(payloadFile);
  }, [payloadFile]);
  // Reflect external writes (another app, the parent or a scene) while there are no local edits.
  useEffect(() => {
    if (!dirty && node) setText(saved);
  }, [saved]);

  const save = () => {
    if (!node || node.trashed) return setPicker("save");
    emit({ kind: "fs", op: "write", id: node.id, text });
    setDirty(false);
  };
  const saveAs = ({ folder, name }) => {
    const id = newId("f");
    emit({ kind: "fs", op: "touch", id, parentId: folder, name: uniqueName(world, folder, name), mime: "text/plain", text });
    setFileId(id);
    setDirty(false);
    setPicker(null);
  };
  const fresh = () => (setFileId(null), setText(""), setDirty(false));
  const insert = (s) => {
    const el = ref.current;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    setText(text.slice(0, a) + s + text.slice(b));
    setDirty(true);
  };
  const trackCaret = (e) => {
    const before = e.target.value.slice(0, e.target.selectionStart).split("\n");
    setCaret([before.length, before[before.length - 1].length + 1]);
  };
  const keys = (e) => {
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") (e.preventDefault(), e.shiftKey ? setPicker("save") : save());
    else if (k === "o") (e.preventDefault(), setPicker("open"));
    else if (k === "n") (e.preventDefault(), fresh());
  };

  const fileName = node ? node.name : "Untitled";
  const document_ = !!node && DOCUMENT.test(node.name);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const menus = {
    File: [
      { label: "New", icon: "faFile", onClick: fresh },
      { label: "Open…", icon: "faFolderOpen", onClick: () => setPicker("open") },
      { label: "Save", icon: "faFloppyDisk", onClick: save },
      { label: "Save as…", icon: "faFloppyDisk", onClick: () => setPicker("save") },
      { sep: true },
      { label: "Show in File Explorer", icon: "faFolder", onClick: () => emit({ kind: "open-app", app: "files", payload: { fileId: node.id } }), disabled: !node || !world.installed.includes("files") },
    ],
    Edit: [
      { label: "Select all", icon: "faICursor", onClick: () => ref.current && (ref.current.focus(), ref.current.select()) },
      { label: "Time/Date", icon: "faClock", onClick: () => insert(new Date().toLocaleString("en-US")) },
    ],
    View: [
      { label: "Zoom in", icon: "faMagnifyingGlassPlus", onClick: () => setZoom(Math.min(300, zoom + 10)) },
      { label: "Zoom out", icon: "faMagnifyingGlassMinus", onClick: () => setZoom(Math.max(50, zoom - 10)) },
      { label: "Restore default zoom", icon: "faMagnifyingGlass", onClick: () => setZoom(100) },
      { label: wrap ? "Word wrap: on" : "Word wrap: off", icon: "faTextWidth", onClick: () => setWrap(!wrap) },
    ],
  };

  const picker_ = picker ? (
    <FilePicker
      world={world}
      mode={picker}
      initialFolder={node ? node.parentId : "documents"}
      initialName={node ? node.name : "Untitled.txt"}
      onClose={() => setPicker(null)}
      onPick={(v) => (picker === "open" ? (load(v), setPicker(null)) : saveAs(v))}
    />
  ) : null;

  if (document_)
    return (
      <OceanApp className="np-app wp-app" onKeyDown={keys}>
        <div className="oc-col oc-grow">
          <div className="wp-tabs oc-row">
            <div className="wp-tab wp-file" onClick={(e) => openMenu(e, menus.File)}>
              File
            </div>
            <div className="wp-tab" data-on="true">
              Home
            </div>
            <div className="wp-tab" onClick={(e) => openMenu(e, menus.View)}>
              View
            </div>
            <div className="oc-grow" />
            <span className="wp-name oc-ellipsis" title={winPath(world, node.id)}>
              {fileName}
              {dirty ? " •" : ""} - WordPad
            </span>
          </div>
          <Ribbon look={look} setLook={setLook} />
          <div className="wp-desk oc-grow oc-scroll">
            <textarea
              ref={ref}
              className="wp-page"
              aria-label={`${fileName}, document`}
              style={{
                fontSize: `${(15 * zoom) / 100}px`,
                fontWeight: look.bold ? 700 : 400,
                fontStyle: look.italic ? "italic" : "normal",
                textDecoration: look.underline ? "underline" : "none",
                textAlign: look.align,
              }}
              value={text}
              spellCheck={false}
              onChange={(e) => (setText(e.target.value), setDirty(true), trackCaret(e))}
              onKeyUp={trackCaret}
              onClick={trackCaret}
            />
          </div>
          <div className="np-status oc-row">
            <span>Page 1 of 1</span>
            <span>{words} words</span>
            <div className="oc-grow" />
            <span>{zoom}%</span>
          </div>
        </div>
        {picker_}
        {menu}
      </OceanApp>
    );

  return (
    <OceanApp className="np-app" onKeyDown={keys}>
      <div className="oc-col oc-grow">
        <div className="np-tabs oc-row">
          <div className="np-tab" title={node ? winPath(world, node.id) : "Untitled"}>
            <Fa i="faFileLines" reg />
            <span className="oc-ellipsis">{fileName}</span>
            {dirty ? <span className="np-dot" title="Unsaved changes" /> : null}
          </div>
          <button type="button" className="np-new" title="New tab" onClick={fresh}>
            <Fa i="faPlus" />
          </button>
        </div>
        <div className="np-menubar oc-row">
          {Object.entries(menus).map(([label, items]) => (
            <div key={label} className="np-menu" onClick={(e) => openMenu(e, items)}>
              {label}
            </div>
          ))}
        </div>
        <textarea
          ref={ref}
          className="np-text oc-grow"
          data-wrap={wrap}
          style={{ fontSize: `${(14 * zoom) / 100}px` }}
          value={text}
          spellCheck={false}
          onChange={(e) => (setText(e.target.value), setDirty(true), trackCaret(e))}
          onKeyUp={trackCaret}
          onClick={trackCaret}
        />
        <div className="np-status oc-row">
          <span>
            Ln {caret[0]}, Col {caret[1]}
          </span>
          <span>{text.length} characters</span>
          <div className="oc-grow" />
          <span>{zoom}%</span>
          <span>Windows (CRLF)</span>
          <span>UTF-8</span>
        </div>
      </div>
      {picker_}
      {menu}
    </OceanApp>
  );
};


export default NotepadApp;
