// OneNote-style notes over world.data.notes (sticky notes use folder "stickies" and live in StickiesApp).
import React, { useState } from "react";
import { deleteItem, fmtTime, newId, notesIn, saveNote, useWorld } from "../../../../ocean/world-helpers";
import { Btn, Empty, Fa, OceanApp, useContextMenu, useDraft } from "./ui";
import "./notes.scss";

const SECTION_COLORS = ["#7a4fc4", "#0f7b8c", "#c4581d", "#2e7d32", "#b4005a", "#3b5bb5"];

const Page = ({ note }) => {
  const [title, setTitle, titleDirty, cleanTitle] = useDraft(note.title, note.id);
  const [body, setBody, bodyDirty, cleanBody] = useDraft(note.body, note.id);
  const commit = () => {
    if (!titleDirty && !bodyDirty) return;
    saveNote(note, { title: title.trim().slice(0, 120) || "Untitled page", body });
    cleanTitle();
    cleanBody();
  };
  return (
    <div className="nt-page oc-col oc-grow oc-scroll">
      <input className="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} placeholder="Page title" />
      <div className="nt-stamp oc-faint">{fmtTime(note.modified, { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
      <textarea className="nt-body oc-grow" value={body} onChange={(e) => setBody(e.target.value)} onBlur={commit} placeholder="Start typing…" />
    </div>
  );
};

export const NotesApp = () => {
  const world = useWorld();
  const all = notesIn(world);
  const sections = [...new Set(all.map((n) => n.folder))];
  const [section, setSection] = useState(null);
  const [sel, setSel] = useState(null);
  const [query, setQuery] = useState("");
  const [openMenu, menu] = useContextMenu();
  const cur = sections.includes(section) ? section : sections[0] || "notes";
  const pages = all.filter((n) => n.folder === cur && (!query || `${n.title} ${n.body}`.toLowerCase().includes(query.toLowerCase())));
  const note = pages.find((n) => n.id === sel) || pages[0] || null;

  const addPage = () => {
    const id = newId("n");
    saveNote({ id, folder: cur, title: "Untitled page", body: "", pinned: false });
    setSel(id);
  };
  const addSection = () => {
    const name = `section-${sections.length + 1}`;
    const id = newId("n");
    saveNote({ id, folder: name, title: "Untitled page", body: "", pinned: false });
    setSection(name);
    setSel(id);
  };
  const pageMenu = (e, n) =>
    openMenu(e, [
      { label: n.pinned ? "Unpin page" : "Pin page", icon: "faThumbtack", onClick: () => saveNote(n, { pinned: !n.pinned }) },
      { label: "Delete page", icon: "faTrashCan", onClick: () => deleteItem("notes", n.id) },
    ]);

  return (
    <OceanApp className="nt-app">
      <div className="nt-sections oc-col">
        <div className="nt-notebook oc-row">
          <Fa i="faBook" className="oc-accent-text" />
          <span className="oc-h3 oc-ellipsis">{world.user.name.split(" ")[0]}'s Notebook</span>
        </div>
        <div className="oc-scroll oc-grow">
          {sections.map((s, i) => (
            <div key={s} className="nt-section" data-active={s === cur} onClick={() => (setSection(s), setSel(null))}>
              <span className="nt-swatch" style={{ background: SECTION_COLORS[i % SECTION_COLORS.length] }} />
              <span className="oc-ellipsis">{s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ")}</span>
            </div>
          ))}
        </div>
        <Btn subtle icon="faPlus" onClick={addSection} className="nt-add">
          Add section
        </Btn>
      </div>
      <div className="nt-pages oc-col">
        <div className="nt-pages-head">
          <div className="oc-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="oc-scroll oc-grow">
          {pages.map((n) => (
            <div key={n.id} className="nt-page-item" data-active={note && n.id === note.id} onClick={() => setSel(n.id)} onContextMenu={(e) => pageMenu(e, n)}>
              <div className="oc-row">
                <span className="oc-ellipsis oc-grow">{n.title}</span>
                {n.pinned ? <Fa i="faThumbtack" className="nt-pin" /> : null}
              </div>
              <div className="oc-faint oc-ellipsis">{n.body.split("\n")[0] || "No additional text"}</div>
            </div>
          ))}
        </div>
        <Btn subtle icon="faPlus" onClick={addPage} className="nt-add">
          Add page
        </Btn>
      </div>
      {note ? <Page key={note.id} note={note} /> : <Empty icon="faNoteSticky" title="No pages in this section" />}
      {menu}
    </OceanApp>
  );
};
