// Store: install/uninstall canonical apps through install/uninstall intents (world.installed).
import React, { useState } from "react";
import { CANONICAL_APPS, getApp } from "../../../ocean/appRegistry";
import { emit, useWorld } from "../../../ocean/world-helpers";
import { Btn, Fa, OceanApp } from "./ocean/ui";
import "./ocean/store.scss";

const CORE = ["files", "settings", "store"];
const CATALOG = {
  files: ["Utilities", "Browse, organise and preview the files on this PC."],
  browser: ["Productivity", "Browse the training web with tabs and favourites."],
  mail: ["Productivity", "Read, flag and file your work email."],
  messages: ["Social", "Chat with your team in one place."],
  mfa: ["Security", "Approve sign-ins and view one-time codes for your work account."],
  updates: ["Utilities", "Keep this PC up to date."],
  settings: ["Utilities", "Personalise the desktop and manage accounts."],
  terminal: ["Developer tools", "Command Prompt with tabs."],
  notes: ["Productivity", "Capture notes in sections and pages."],
  texteditor: ["Productivity", "A fast, simple text editor."],
  calendar: ["Productivity", "Plan meetings and respond to invitations."],
  reminders: ["Productivity", "Lists and tasks that keep you on track."],
  contacts: ["Productivity", "Everyone you work with, in one list."],
  photos: ["Photo & video", "View and organise your pictures."],
  media: ["Music", "Play your local music and videos."],
  calculator: ["Utilities", "Standard calculator with history."],
  clock: ["Utilities", "Alarms, timers, stopwatch and world clock."],
  store: ["Utilities", "Get apps for this PC."],
  taskmanager: ["Utilities", "See what is running and end tasks."],
  stickies: ["Productivity", "Quick notes on the desktop."],
  whiteboard: ["Productivity", "Sketch ideas on a freeform canvas."],
};
const rating = (id) => (4 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 9) / 10).toFixed(1);

const Action = ({ world, id, big }) => {
  const installed = world.installed.includes(id);
  return installed ? (
    <div className="oc-row">
      <Btn primary={big} onClick={() => emit({ kind: "open-app", app: id })}>
        Open
      </Btn>
      {big && !CORE.includes(id) ? (
        <Btn onClick={() => emit({ kind: "uninstall", app: id })} icon="faTrashCan" reg>
          Uninstall
        </Btn>
      ) : null}
    </div>
  ) : (
    <Btn primary onClick={() => emit({ kind: "install", app: id })}>
      {big ? "Install" : "Get"}
    </Btn>
  );
};

const StoreApp = () => {
  const world = useWorld();
  const [page, setPage] = useState("home");
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const apps = CANONICAL_APPS.map(getApp).filter((a) => !query || `${a.name} ${CATALOG[a.id][0]}`.toLowerCase().includes(query.toLowerCase()));
  const notInstalled = apps.filter((a) => !world.installed.includes(a.id));
  const d = detail && getApp(detail);

  const Card = ({ a }) => (
    <div className="st-card oc-card" onClick={() => setDetail(a.id)}>
      <img src={a.iconSrc} width={52} height={52} alt="" className="st-card-icon" />
      <div className="oc-h3 oc-ellipsis">{a.name}</div>
      <div className="oc-faint">{CATALOG[a.id][0]}</div>
      <div className="oc-row st-card-foot">
        <span className="oc-faint">
          {rating(a.id)} <Fa i="faStar" className="st-star" />
        </span>
        <div className="oc-grow" />
        <span onClick={(e) => e.stopPropagation()}>
          <Action world={world} id={a.id} />
        </span>
      </div>
    </div>
  );

  return (
    <OceanApp className="st-app">
      <div className="st-rail">
        {[
          ["home", "Home", "faHouse"],
          ["apps", "Apps", "faTableCellsLarge"],
          ["library", "Library", "faBookOpen"],
        ].map(([id, label, icon]) => (
          <div key={id} className="st-rail-item" data-active={page === id && !d} onClick={() => (setPage(id), setDetail(null))}>
            <Fa i={icon} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="oc-col oc-grow st-main">
        <div className="st-top oc-row">
          <div className="oc-search st-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search apps" value={query} onChange={(e) => (setQuery(e.target.value), setDetail(null), e.target.value && setPage("apps"))} />
          </div>
        </div>
        <div className="oc-scroll oc-grow st-body">
          {d ? (
            <div className="st-detail">
              <div className="oc-card st-detail-head oc-row">
                <img src={d.iconSrc} width={96} height={96} alt="" />
                <div className="oc-col oc-grow">
                  <div className="oc-h1">{d.name}</div>
                  <div className="oc-accent-text">Northwind IT</div>
                  <div className="oc-faint">
                    {CATALOG[d.id][0]} · {rating(d.id)} <Fa i="faStar" className="st-star" /> · Free
                  </div>
                  <div className="st-detail-act">
                    <Action world={world} id={d.id} big />
                  </div>
                </div>
              </div>
              <div className="oc-card st-desc">
                <div className="oc-h3">Description</div>
                <p>{CATALOG[d.id][1]}</p>
                <p className="oc-faint">Approved for the Northwind training desktop. Installs instantly and works offline.</p>
              </div>
            </div>
          ) : page === "library" ? (
            <>
              <div className="oc-h1 st-title">Library</div>
              {CANONICAL_APPS.filter((id) => world.installed.includes(id)).map((id) => {
                const a = getApp(id);
                return (
                  <div key={id} className="oc-card st-lib oc-row">
                    <img src={a.iconSrc} width={32} height={32} alt="" />
                    <div className="oc-col oc-grow">
                      <span>{a.name}</span>
                      <span className="oc-faint">{CATALOG[id][0]}</span>
                    </div>
                    <Btn onClick={() => emit({ kind: "open-app", app: id })}>Open</Btn>
                    <Btn subtle icon="faTrashCan" reg onClick={() => emit({ kind: "uninstall", app: id })} disabled={CORE.includes(id)} title={CORE.includes(id) ? "Required app" : "Uninstall"} />
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {page === "home" && !query ? (
                <div className="st-hero">
                  <div className="st-hero-text">
                    <div className="st-hero-kicker">Featured</div>
                    <div className="st-hero-title">Get organised for security awareness week</div>
                    <div className="st-hero-sub">Notes, To Do and Authenticator, approved by Northwind IT.</div>
                  </div>
                  <div className="st-hero-icons">
                    {["notes", "reminders", "mfa"].map((id) => (
                      <img key={id} src={getApp(id).iconSrc} alt="" onClick={() => setDetail(id)} />
                    ))}
                  </div>
                </div>
              ) : null}
              {page === "home" && !query && notInstalled.length ? (
                <>
                  <div className="oc-h2 st-title">Available to install</div>
                  <div className="st-grid">
                    {notInstalled.map((a) => (
                      <Card key={a.id} a={a} />
                    ))}
                  </div>
                </>
              ) : null}
              <div className="oc-h2 st-title">{query ? `Results for “${query}”` : "Essential apps"}</div>
              <div className="st-grid">
                {apps.map((a) => (
                  <Card key={a.id} a={a} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </OceanApp>
  );
};


export default StoreApp;
