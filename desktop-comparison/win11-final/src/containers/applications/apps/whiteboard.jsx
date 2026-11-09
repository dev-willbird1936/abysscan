// Whiteboard over the shared data.whiteboard store (macOS Freeform): boards of sticky notes, text, shapes
// and pen strokes in canvas units. A stroke, drag or text edit stays local until it ends, then the whole
// board is sent once (board-upsert). Tool, colour, selection and scroll are local.
import React, { useRef, useState } from "react";
import { Mark } from "./assets";
import { newId } from "../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../ocean/synced";
import { Btn, Empty, Fa, OceanApp, useContextMenu } from "./ocean/ui";
import "./ocean/whiteboard.scss";

const PENS = ["#222222", "#e92a2a", "#2a52e9", "#12c629", "#e9a21e", "#911ee9"];
const SIZES = [2, 4, 8];
const STICKY = { yellow: "#fff3a6", pink: "#ffd0e4", blue: "#cfe6ff", green: "#d4f5cf", purple: "#e6d6ff", gray: "#ececec" };
const SIZE = { sticky: [160, 160], text: [200, 40], rect: [180, 110], ellipse: [130, 130], arrow: [180, 30] };
const round = (v) => Math.round(v);

const Shape = ({ it }) => {
  const c = it.color || "#0a84ff";
  if (it.shape === "ellipse") return <ellipse cx={it.x + it.w / 2} cy={it.y + it.h / 2} rx={it.w / 2} ry={it.h / 2} fill={`${c}33`} stroke={c} strokeWidth="2.5" />;
  if (it.shape === "arrow") {
    const y = it.y + it.h / 2;
    const end = it.x + it.w;
    return (
      <g stroke={c} strokeWidth="4" strokeLinecap="round" fill={c}>
        <line x1={it.x} y1={y} x2={end - 14} y2={y} />
        <path d={`M${end} ${y} L${end - 18} ${y - 10} L${end - 18} ${y + 10}Z`} strokeWidth="1" />
      </g>
    );
  }
  return <rect x={it.x} y={it.y} width={it.w} height={it.h} rx="6" fill={`${c}33`} stroke={c} strokeWidth="2.5" />;
};

const penPath = (pts) => pts.reduce((d, v, i) => (i % 2 ? d : `${d}${i ? "L" : "M"}${v} ${pts[i + 1]} `), "");

const Board = ({ board }) => {
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState(PENS[0]);
  const [size, setSize] = useState(4);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [live, setLive] = useState(null); // {items} while a gesture is in progress
  const inner = useRef(null);
  const items = live || board.items;
  const commit = (next) => syncedOp("whiteboard", "board-upsert", { id: board.id, name: board.name, items: next.slice(-300) });
  const point = (e) => {
    const r = inner.current.getBoundingClientRect();
    return [round(e.clientX - r.left), round(e.clientY - r.top)];
  };

  const down = (e) => {
    if (e.button !== 0 || editing) return;
    const [x, y] = point(e);
    const hitId = e.target.closest("[data-item]") && e.target.closest("[data-item]").dataset.item;
    if (tool === "erase") {
      if (hitId) commit(board.items.filter((it) => it.id !== hitId));
      return;
    }
    if (tool === "pen") {
      e.preventDefault();
      const stroke = { id: newId("wb"), type: "pen", x, y, w: 0, h: 0, color, width: size, points: [x, y] };
      let list = [...board.items, stroke];
      setLive(list);
      const move = (ev) => {
        const [px, py] = point(ev);
        const pts = stroke.points;
        if (pts.length >= 2000 || Math.hypot(px - pts[pts.length - 2], py - pts[pts.length - 1]) < 3) return;
        stroke.points = [...pts, px, py];
        list = [...board.items, { ...stroke }];
        setLive(list);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setLive(null);
        const pts = stroke.points.length >= 4 ? stroke.points : [...stroke.points, stroke.points[0] + 1, stroke.points[1]];
        const xs = pts.filter((_, i) => i % 2 === 0);
        const ys = pts.filter((_, i) => i % 2 === 1);
        commit([...board.items, { ...stroke, points: pts, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }]);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (tool !== "select") {
      // Keep focus on the new item's editor (the board would take it on mousedown).
      e.preventDefault();
      const kind = ["rect", "ellipse", "arrow"].includes(tool) ? "shape" : tool;
      const [w, h] = SIZE[tool];
      const it = { id: newId("wb"), type: kind, x: x - w / 2, y: y - h / 2, w, h };
      if (kind === "shape") Object.assign(it, { shape: tool, color: tool === "arrow" ? "#0a84ff" : color === PENS[0] ? "#0a84ff" : color });
      else Object.assign(it, { text: "", ...(kind === "sticky" ? { color: "yellow" } : {}) });
      it.x = round(Math.max(0, it.x));
      it.y = round(Math.max(0, it.y));
      commit([...board.items, it]);
      setSel(it.id);
      if (kind !== "shape") setEditing(it.id);
      setTool("select");
      return;
    }
    setSel(hitId || null);
    if (!hitId) return;
    e.preventDefault();
    const start = [x, y];
    let moved = false;
    let list = board.items;
    const move = (ev) => {
      const [px, py] = point(ev);
      const dx = px - start[0];
      const dy = py - start[1];
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      list = board.items.map((it) =>
        it.id !== hitId ? it : { ...it, x: it.x + dx, y: it.y + dy, ...(it.points ? { points: it.points.map((v, i) => v + (i % 2 ? dy : dx)) } : {}) },
      );
      setLive(list);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      if (moved) commit(list);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const setText = (id, text) => {
    setEditing(null);
    const it = board.items.find((x) => x.id === id);
    if (!it) return;
    if (!text.trim() && it.type === "text") return commit(board.items.filter((x) => x.id !== id));
    if (text !== it.text) commit(board.items.map((x) => (x.id === id ? { ...x, text: text.slice(0, 2000) } : x)));
  };
  const keyDown = (e) => {
    if (editing || !sel || (e.key !== "Delete" && e.key !== "Backspace")) return;
    commit(board.items.filter((it) => it.id !== sel));
    setSel(null);
  };
  const recolor = (c) => sel && commit(board.items.map((it) => (it.id === sel ? { ...it, color: c } : it)));
  const selected = items.find((it) => it.id === sel);

  return (
    <div className="wb-board oc-col oc-grow" tabIndex={-1} onKeyDown={keyDown}>
      <div className="wb-canvas oc-grow" data-tool={tool}>
        <div className="wb-inner" ref={inner} onPointerDown={down} data-testid="wb-canvas">
          <svg className="wb-svg" width="2400" height="1600">
            {items.map((it) =>
              it.type === "pen" ? (
                <path key={it.id} data-item={it.id} d={penPath(it.points || [])} fill="none" stroke={it.color || "#222"} strokeWidth={it.width || 4} strokeLinecap="round" strokeLinejoin="round" className="wb-hit" data-sel={it.id === sel} />
              ) : it.type === "shape" ? (
                <g key={it.id} data-item={it.id} className="wb-hit" data-sel={it.id === sel}>
                  <Shape it={it} />
                </g>
              ) : null,
            )}
          </svg>
          {items
            .filter((it) => it.type === "sticky" || it.type === "text")
            .map((it) => (
              <div
                key={it.id}
                data-item={it.id}
                className={`wb-item wb-${it.type}`}
                data-sel={it.id === sel}
                style={{ left: it.x, top: it.y, width: it.w, minHeight: it.h, background: it.type === "sticky" ? STICKY[it.color] || STICKY.yellow : undefined }}
                onDoubleClick={() => setEditing(it.id)}
              >
                {editing === it.id ? (
                  <textarea autoFocus defaultValue={it.text} onBlur={(e) => setText(it.id, e.target.value)} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && e.target.blur()} />
                ) : (
                  it.text || <span className="wb-ph">{it.type === "sticky" ? "Double-click to type" : "Text"}</span>
                )}
              </div>
            ))}
        </div>
      </div>
      <div className="wb-tools">
        <button type="button" className="wb-tool" data-active={tool === "select"} onClick={() => setTool("select")} title="Select">
          <Fa i="faArrowPointer" />
        </button>
        {PENS.map((p) => (
          <button key={p} type="button" className="wb-tool" data-active={tool === "pen" && color === p} onClick={() => (setColor(p), setTool("pen"))} title="Pen">
            <Mark color={p} />
          </button>
        ))}
        <div className="wb-sep" />
        {SIZES.map((s) => (
          <button key={s} type="button" className="wb-size" data-active={size === s} onClick={() => setSize(s)} title={`Size ${s}`}>
            <span style={{ width: s * 2 + 2, height: s * 2 + 2 }} />
          </button>
        ))}
        <div className="wb-sep" />
        {[["sticky", "faNoteSticky", "Sticky note"], ["text", "faFont", "Text"], ["rect", "faSquare", "Rectangle"], ["ellipse", "faCircle", "Ellipse"], ["arrow", "faArrowRightLong", "Arrow"], ["erase", "faEraser", "Eraser"]].map(([id, icon, label]) => (
          <button key={id} type="button" className="wb-tool" data-active={tool === id} onClick={() => setTool(id)} title={label} data-tool={id}>
            <Fa i={icon} reg={["sticky", "rect", "ellipse"].includes(id)} />
          </button>
        ))}
        {selected && selected.type === "sticky" ? (
          <>
            <div className="wb-sep" />
            {Object.keys(STICKY).map((c) => (
              <button key={c} type="button" className="wb-swatch" style={{ background: STICKY[c] }} data-active={selected.color === c} onClick={() => recolor(c)} title={c} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
};

const WhiteboardApp = () => {
  const wb = useSynced("whiteboard");
  const [naming, setNaming] = useState(null);
  const [openMenu, menu] = useContextMenu();
  const board = wb.boards.find((b) => b.id === wb.activeId) || wb.boards[0] || null;
  const add = () => {
    const id = newId("board");
    syncedOp("whiteboard", "board-upsert", { id, name: `Board ${wb.boards.length + 1}`, items: [] });
    syncedOp("whiteboard", "set-active", { id });
    setNaming(id);
  };
  const rename = (b, name) => {
    setNaming(null);
    if (name.trim() && name.trim() !== b.name) syncedOp("whiteboard", "board-upsert", { id: b.id, name: name.trim().slice(0, 80), items: b.items });
  };
  return (
    <OceanApp className="wb-app">
      <div className="oc-sidebar wb-side">
        <div className="oc-row wb-side-head">
          <span className="oc-h3 oc-grow">Boards</span>
          <Btn subtle icon="faPlus" title="New board" onClick={add} />
        </div>
        {wb.boards.map((b) => (
          <div
            key={b.id}
            className="oc-nav-item"
            data-active={board && b.id === board.id}
            onClick={() => b.id !== (board && board.id) && syncedOp("whiteboard", "set-active", { id: b.id })}
            onDoubleClick={() => setNaming(b.id)}
            onContextMenu={(e) =>
              openMenu(e, [
                { label: "Rename", icon: "faICursor", onClick: () => setNaming(b.id) },
                { label: "Delete board", icon: "faTrashCan", onClick: () => syncedOp("whiteboard", "board-delete", { id: b.id }) },
              ])
            }
          >
            <Fa i="faChalkboard" className="oc-nav-icon" />
            {naming === b.id ? (
              <input className="oc-input" autoFocus defaultValue={b.name} onBlur={(e) => rename(b, e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
            ) : (
              <span className="oc-nav-label">{b.name}</span>
            )}
            <span className="oc-count">{b.items.length}</span>
          </div>
        ))}
      </div>
      {board ? (
        <Board key={board.id} board={board} />
      ) : (
        <Empty icon="faChalkboard" title="No boards">
          Select + to create a board.
        </Empty>
      )}
      {menu}
    </OceanApp>
  );
};

export default WhiteboardApp;
