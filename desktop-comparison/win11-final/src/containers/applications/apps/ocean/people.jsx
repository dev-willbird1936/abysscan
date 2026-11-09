// People over world.data.contacts.
import React, { useState } from "react";
import { deleteItem, emit, isFictionalEmail, mailIn, newId, saveContact, useWorld } from "../../../../ocean/world-helpers";
import { Avatar, Btn, Dialog, Empty, Fa, OceanApp } from "./ui";
import "./lists.scss";

const ContactForm = ({ contact, onClose }) => {
  const [f, setF] = useState({ name: "", email: "", phone: "", org: "", ...contact });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && isFictionalEmail(f.email.trim());
  const save = () => {
    if (!valid) return;
    const id = f.id || newId("p");
    saveContact({ ...f, id, name: f.name.trim(), email: f.email.trim() });
    onClose(id);
  };
  return (
    <Dialog
      title={contact.id ? "Edit contact" : "New contact"}
      onClose={() => onClose()}
      actions={
        <>
          <Btn primary onClick={save} disabled={!valid}>
            Save
          </Btn>
          <Btn onClick={() => onClose()}>Cancel</Btn>
        </>
      }
    >
      <input className="oc-input" placeholder="Name" value={f.name} onChange={set("name")} autoFocus />
      <input className="oc-input" placeholder="Email (name@company.example)" value={f.email} onChange={set("email")} />
      {f.email && !isFictionalEmail(f.email.trim()) ? <span className="oc-faint">Training contacts use .example addresses only.</span> : null}
      <input className="oc-input" placeholder="Phone" value={f.phone} onChange={set("phone")} />
      <input className="oc-input" placeholder="Company" value={f.org} onChange={set("org")} />
    </Dialog>
  );
};

export const PeopleApp = () => {
  const world = useWorld();
  const contacts = [...world.data.contacts].sort((a, b) => a.name.localeCompare(b.name));
  const [sel, setSel] = useState(null);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState(null);
  const shown = contacts.filter((c) => !query || `${c.name} ${c.email} ${c.org}`.toLowerCase().includes(query.toLowerCase()));
  const c = contacts.find((x) => x.id === sel) || shown[0] || null;
  const recent = c ? mailIn(world, "inbox").filter((m) => m.from.includes(c.email)).slice(0, 3) : [];
  let letter = null;

  return (
    <OceanApp className="ls-app pp-app">
      <div className="pp-list oc-col">
        <div className="pp-head oc-row">
          <div className="oc-h2 oc-grow">People</div>
          <Btn subtle icon="faUserPlus" onClick={() => setEdit({})} title="New contact" />
        </div>
        <div className="pp-search">
          <div className="oc-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="oc-scroll oc-grow">
          {shown.some((p) => p.favorite) ? <div className="pp-letter">Favourites</div> : null}
          {shown
            .filter((p) => p.favorite)
            .map((p) => (
              <div key={`fav-${p.id}`} className="pp-item" data-active={c && p.id === c.id} onClick={() => setSel(p.id)}>
                <Avatar name={p.name} size={32} />
                <span className="oc-ellipsis oc-grow">{p.name}</span>
                <Fa i="faStar" className="pp-fav" />
              </div>
            ))}
          {shown.map((p) => {
            const head = p.name[0].toUpperCase() !== letter ? (letter = p.name[0].toUpperCase()) : null;
            return (
              <React.Fragment key={p.id}>
                {head ? <div className="pp-letter">{head}</div> : null}
                <div className="pp-item" data-active={c && p.id === c.id} onClick={() => setSel(p.id)}>
                  <Avatar name={p.name} size={32} />
                  <div className="oc-col oc-grow">
                    <span className="oc-ellipsis">{p.name}</span>
                    <span className="oc-faint oc-ellipsis">{p.org}</span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {c ? (
        <div className="pp-card oc-col oc-grow oc-scroll">
          <div className="pp-hero oc-row">
            <Avatar name={c.name} size={84} />
            <div className="oc-col">
              <div className="oc-h1">{c.name}</div>
              <div className="oc-muted">{c.org}</div>
              <div className="oc-row pp-actions">
                <Btn icon="faEnvelope" reg onClick={() => emit({ kind: "open-app", app: "mail" })} disabled={!world.installed.includes("mail")}>
                  Email
                </Btn>
                <Btn icon="faComments" reg onClick={() => emit({ kind: "open-app", app: "messages" })} disabled={!world.installed.includes("messages")}>
                  Chat
                </Btn>
                <Btn icon="faPen" onClick={() => setEdit(c)}>
                  Edit
                </Btn>
                <Btn subtle icon="faStar" reg={!c.favorite} className={c.favorite ? "pp-fav" : ""} onClick={() => saveContact({ ...c, favorite: !c.favorite })} title={c.favorite ? "Remove from favourites" : "Add to favourites"} />
                <Btn className="danger" subtle icon="faTrashCan" reg onClick={() => deleteItem("contacts", c.id)} title="Delete contact" />
              </div>
            </div>
          </div>
          <div className="oc-card pp-section">
            <div className="oc-h3">Contact info</div>
            <div className="oc-kv">
              <span>Email</span>
              <span className="oc-accent-text">{c.email || "—"}</span>
              <span>Phone</span>
              <span>{c.phone || "—"}</span>
              <span>Company</span>
              <span>{c.org || "—"}</span>
            </div>
          </div>
          <div className="oc-card pp-section">
            <div className="oc-h3">Recent email</div>
            {recent.length ? (
              recent.map((m) => (
                <div key={m.id} className="pp-mail" onClick={() => emit({ kind: "open-app", app: "mail", payload: { messageId: m.id } })}>
                  <Fa i="faEnvelope" reg /> <span className="oc-ellipsis">{m.subject}</span>
                </div>
              ))
            ) : (
              <div className="oc-faint">No recent email</div>
            )}
          </div>
        </div>
      ) : (
        <Empty icon="faAddressBook" title="No contacts" />
      )}
      {edit ? <ContactForm contact={edit} onClose={(id) => (setEdit(null), id && setSel(id))} /> : null}
    </OceanApp>
  );
};
