// Sticky Notes over world.data.stickies (macOS Stickies): plain text, colour, position and size in the
// notes surface (pixels), collapsed state; list order is the stacking order (last on top).
// Drag, resize and typing stay local until they end, then one upsert is sent.
import React, { useState } from "react";
import { newId } from "../../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../../ocean/synced";
import { Empty, Fa, OceanApp, useContextMenu, useDraft } from "./ui";
import "./stickies.scss";

const COLORS = ["yellow", "green", "pink", "purple", "blue", "gray"];
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const save = (note, patch = {}) => {
  const n = { ...note, ...patch };
  syncedOp("stickies", "upsert", {
    id: n.id, text: n.text.slice(0, 4000), color: n.color, x: clampInt(n.x, 0, 2000), y: clampInt(n.y, 0, 2000),
    w: clampInt(n.w, 60, 2000), h: clampInt(n.h, 60, 2000), collapsed: !!n.collapsed,
  });
};
const firstLine = (text) => text.split("\n").find((l) => l.trim()) || "Empty note";

const Sticky = ({ note, active, onFocus, openMenu }) => {
  const [text, setText, dirty, clean] = useDraft(note.text, note.id);
  const [live, setLive] = useState(null); // {x, y, w, h} while dragging or resizing
  const [editing, setEditing] = useState(false);
  const box = live || note;
  const gesture = (e, mode) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    onFocus(null);
    const start = { x: e.clientX, y: e.clientY };
    let cur = { x: note.x, y: note.y, w: note.w, h: note.h };
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      cur = mode === "move" ? { ...cur, x: Math.max(0, note.x + dx), y: Math.max(0, note.y + dy) } : { ...cur, w: Math.max(140, note.w + dx), h: Math.max(80, note.h + dy) };
      setLive(cur);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      const moved = cur.x !== note.x || cur.y !== note.y || cur.w !== note.w || cur.h !== note.h;
      onFocus(moved ? { ...cur, text } : {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const commit = () => {
    setEditing(false);
    if (!dirty) return;
    save(note, { text });
    clean();
  };
  return (
    <div className="sn-float" data-color={note.color} data-active={active} data-collapsed={note.collapsed} data-testid="sticky" style={{ left: box.x, top: box.y, width: box.w, height: note.collapsed ? 32 : box.h }}>
      <div className="sn-bar oc-row" onPointerDown={(e) => gesture(e, "move")} onDoubleClick={() => save(note, { text, collapsed: !note.collapsed })}>
        <button type="button" className="sn-ib" title="New note" onClick={() => save({ ...note, id: newId("stk"), text: "", x: note.x + 24, y: note.y + 24, collapsed: false })}>
          <Fa i="faPlus" />
        </button>
        <span className="oc-grow sn-bar-title oc-ellipsis">{note.collapsed ? firstLine(note.text) : ""}</span>
        <button type="button" className="sn-ib" title="Menu" onClick={(e) => openMenu(e, note)}>
          <Fa i="faEllipsis" />
        </button>
        <button type="button" className="sn-ib" title="Delete note" onClick={() => syncedOp("stickies", "delete", { id: note.id })}>
          <Fa i="faXmark" />
        </button>
      </div>
      {note.collapsed ? null : (
        <>
          {editing ? (
            <textarea className="sn-text" autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="Take a note…" />
          ) : (
            <div className="sn-text sn-rich" onClick={() => (onFocus({}), setEditing(true))}>
              {text || <span className="sn-ph">Take a note…</span>}
            </div>
          )}
          <div className="sn-format oc-row">
            <div className="oc-grow" />
            <div className="sn-grip" onPointerDown={(e) => gesture(e, "resize")} title="Resize" />
          </div>
        </>
      )}
    </div>
  );
};

export const StickiesApp = () => {
  const notes = useSynced("stickies");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const [openMenu, menu] = useContextMenu();
  const q = query.trim().toLowerCase();
  const add = () => {
    const n = notes.length;
    const id = newId("stk");
    save({ id, text: "", color: COLORS[n % COLORS.length], x: 300 + (n % 6) * 26, y: 60 + (n % 6) * 26, w: 200, h: 170, collapsed: false });
    setActive(id);
  };
  // Raising a note moves it to the end of the list (last = on top).
  // patch null only marks the note active (a gesture is starting); {} raises it without changes.
  const raise = (note, patch = {}) => {
    setActive(note.id);
    if (!patch) return;
    const onTop = notes[notes.length - 1] && notes[notes.length - 1].id === note.id;
    if (onTop && !Object.keys(patch).length) return;
    if (!onTop) syncedOp("stickies", "delete", { id: note.id });
    save(note, patch);
  };
  const noteMenu = (e, note) =>
    openMenu(e, [
      ...COLORS.map((c) => ({ label: c.charAt(0).toUpperCase() + c.slice(1), icon: c === note.color ? "faCheck" : "faCircle", onClick: () => save(note, { color: c }) })),
      { sep: true },
      { label: note.collapsed ? "Expand" : "Collapse", icon: "faChevronUp", onClick: () => save(note, { collapsed: !note.collapsed }) },
      { label: "Delete note", icon: "faTrashCan", onClick: () => syncedOp("stickies", "delete", { id: note.id }) },
    ]);
  return (
    <OceanApp className="sn-app">
      <div className="sn-hub oc-col">
        <div className="sn-head oc-row">
          <button type="button" className="sn-ib" onClick={add} title="New note" data-testid="sticky-new">
            <Fa i="faPlus" />
          </button>
          <div className="oc-h2 oc-grow">Sticky Notes</div>
        </div>
        <div className="sn-search">
          <div className="oc-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="sn-list oc-scroll oc-grow">
          {[...notes]
            .reverse()
            .filter((n) => !q || n.text.toLowerCase().includes(q))
            .map((n) => (
              <div key={n.id} className="sn-card" data-color={n.color} data-active={n.id === active} onClick={() => raise(n)} onContextMenu={(e) => noteMenu(e, n)}>
                <div className="sn-card-text">{n.text.split("\n").slice(0, 4).join("\n") || "Empty note"}</div>
              </div>
            ))}
        </div>
      </div>
      <div className="sn-surface oc-grow">
        {notes.length ? (
          notes.map((n) => <Sticky key={n.id} note={n} active={n.id === active} onFocus={(patch) => raise(n, patch)} openMenu={noteMenu} />)
        ) : (
          <Empty icon="faNoteSticky" title="No notes">
            Select + to add a sticky note.
          </Empty>
        )}
      </div>
      {menu}
    </OceanApp>
  );
};
