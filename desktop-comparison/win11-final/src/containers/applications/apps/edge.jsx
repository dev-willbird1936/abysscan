// Edge over the shared data.browser store (SYNC-AUDIT §3, macOS Safari): tabs, favourites and history.
// Tab urls are 'start:', 'history:', 'unavailable:' or 'scene:<pageId>' (data.web pages); nothing else
// can load, so no real address enters the world. Back/forward per tab, the typed text of an unavailable
// address and Immersive Reader are local view state. Choices on scene pages emit scene-choice intents.
import React, { useEffect, useRef, useState } from "react";
import { emit, fmtTime, newId, sceneChoice, useWorld } from "../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../ocean/synced";
import { Btn, Fa, OceanApp } from "./ocean/ui";
import "./ocean/browser.scss";

const SCENE = /^scene:([a-z0-9-]{1,40})$/;
const pagesOf = (world) => (world.data.web && world.data.web.pages) || {};
const favoritesOf = (world) => (world.data.web && world.data.web.favorites) || [];
// The page a new tab and the Home button open: the world homepage (replay: a hijacked one), else the start page.
const homeOf = (world) => (world.data.web && world.data.web.homepage) || "start:";

// A page behind a sign-in shows its sign-in page until the trainee signs in there (world-model shownPage).
const pageFor = (world, url, typed) => {
  const m = SCENE.exec(url);
  if (m) {
    const id = window.OceanWorldModel.shownPage(world, m[1]) || m[1];
    const p = pagesOf(world)[id];
    return p ? { kind: "scene", ...p, id, display: p.url } : { kind: "unavailable", title: "Page unavailable", display: "" };
  }
  if (url === "history:") return { kind: "history", title: "History", display: "edge://history" };
  if (url === "unavailable:") return { kind: "unavailable", title: "Can't reach this page", display: typed || "" };
  return { kind: "start", title: "New tab", display: "" };
};

// A typed address opens the scene page whose display url matches, as on macOS; anything else is unavailable.
const resolveTyped = (world, text) => {
  const v = text.trim();
  if (SCENE.test(v)) return v;
  if (/^edge:\/\/history$/i.test(v)) return "history:";
  const bare = (u) => u.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const hit = Object.entries(pagesOf(world)).find(([, p]) => bare(p.url) === bare(v));
  return hit ? `scene:${hit[0]}` : "unavailable:";
};

const StartPage = ({ world, links, go }) => {
  const [q, setQ] = useState("");
  const hour = new Date().getHours();
  return (
    <div className="br-newtab">
      <div className="br-greet">
        Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {world.user.name.split(" ")[0]}
      </div>
      <div className="br-bigsearch oc-row">
        <Fa i="faMagnifyingGlass" />
        <input className="oc-grow" placeholder="Search the web" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && go(resolveTyped(world, q), q.trim())} />
      </div>
      <div className="br-tiles">
        {links.map((f) => (
          <div key={f.url} className="br-tile" onClick={() => go(f.url)}>
            <div className="br-tile-icon">{f.title.charAt(0)}</div>
            <span className="oc-ellipsis">{f.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HistoryPage = ({ history, go }) => (
  <div className="br-history">
    <div className="oc-row br-history-head">
      <div className="oc-h1 oc-grow">History</div>
      <Btn subtle icon="faTrashCan" reg disabled={!history.length} onClick={() => syncedOp("browser", "clear-history", {})}>
        Clear browsing data
      </Btn>
    </div>
    {history.length ? (
      history.map((h) => (
        <div key={h.id} className="br-history-row oc-row" onClick={() => go(h.url)}>
          <Fa i="faGlobe" className="oc-faint" />
          <span className="oc-ellipsis oc-grow">{h.title}</span>
          <span className="oc-faint">{fmtTime(h.time)}</span>
          <button type="button" className="br-x" title="Delete" onClick={(e) => (e.stopPropagation(), syncedOp("browser", "history-delete", { id: h.id }))}>
            <Fa i="faXmark" />
          </button>
        </div>
      ))
    ) : (
      <div className="oc-faint br-history-empty">Pages you visit appear here.</div>
    )}
  </div>
);

// A shared page part (toolbars and issuer strip, sections, or the full-page warning), drawn by OceanProgramUI so
// Safari shows the same thing (docs/desktop-parity/PROGRAMS.md §3b).
const PagePart = ({ part, page, dark, onProceed, typed }) => {
  const ref = useRef(null);
  const key = JSON.stringify([part, page, dark, typed]);
  useEffect(() => {
    if (ref.current) window.OceanProgramUI.renderPagePart(ref.current, part, { page, os: "windows", dark, pageId: page.id, typed, onType: (field) => emit({ kind: "page-type", page: page.id, field }) }, onProceed);
  }, [key]);
  return <div ref={ref} data-testid={"page-" + part} />;
};

// Scene page: { title, url, body, choices: [{ label, choiceId, style? }], brand?, heading?, insecure?, sections?,
// toolbars?, issuer?, warning? }. No inputs: choices are buttons only. Proceeding past a warning is per tab view state.
const ScenePage = ({ page, onChoice, reader, dark, typed }) => {
  const [proceeded, setProceeded] = useState(null);
  if (page.warning && proceeded !== page.url) {
    return (
      <div className="br-site br-warning">
        <PagePart part="warning" page={page} dark={dark} onProceed={() => setProceeded(page.url)} />
      </div>
    );
  }
  return (
  <div className="br-site" data-reader={reader}>
    {page.toolbars || page.issuer ? <PagePart part="top" page={page} dark={dark} /> : null}
    <div className="br-site-bar oc-row">
      <b>{page.brand || page.title}</b>
    </div>
    <div className="br-site-body br-scene">
      <div className="oc-card br-scene-card" data-ocean-key={"page:" + page.id} data-ocean-label={"The page " + page.url}>
        <h1>{page.heading || page.title}</h1>
        {String(page.body || "")
          .split(/\n\n+/)
          .map((p, i) => (
            <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>
          ))}
        {page.fields ? <PagePart part="form" page={page} dark={dark} typed={typed} /> : null}
        {page.sections ? <PagePart part="sections" page={page} dark={dark} typed={typed} /> : null}
        <div className="oc-row br-choices">
          {page.choices.map((c) => (
            <button key={c.choiceId} type="button" data-ocean-key={"choice:" + c.choiceId} data-ocean-label={"The “" + c.label + "” button"} className={`br-choice ${c.style === "secondary" ? "secondary" : ""}`} onClick={() => onChoice(c.choiceId)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="oc-faint br-foot">Simulated page · training desktop</div>
    </div>
  </div>
  );
};

const ErrorPage = ({ page }) => (
  <div className="br-error">
    <Fa i="faPlugCircleXmark" className="br-error-icon" />
    <h2>Hmm… can't reach this page</h2>
    <p>{page.display ? `${page.display} is outside this training desktop. Nothing was loaded.` : "The page you asked for is not part of the current scene."}</p>
  </div>
);

const tabTitle = (page) => page.title.slice(0, 120);

const BrowserApp = ({ win }) => {
  const world = useWorld();
  const browser = useSynced("browser");
  const [nav, setNav] = useState({}); // tabId -> { list: [url], i }; back/forward stays local
  const [typedFor, setTypedFor] = useState({}); // tabId -> text typed for an unavailable address
  const [typed, setTyped] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reader, setReader] = useState(false);
  const started = useRef(false);
  const { tabs } = browser;
  const tab = tabs.find((t) => t.id === browser.activeTabId) || tabs[0] || null;
  // The window's {url} payload is shown until the world has a tab for it; once a tab showed it,
  // its absence means the trainee closed it.
  const payloadUrl = win && win.payload && win.payload.url;
  const seen = useRef(new Set());
  if (payloadUrl && tabs.some((t) => t.url === payloadUrl)) seen.current.add(payloadUrl);
  const pending = payloadUrl && !seen.current.has(payloadUrl) ? payloadUrl : null;
  const page = pageFor(world, pending || (tab ? tab.url : "start:"), tab && !pending && typedFor[tab.id]);
  const links = [...favoritesOf(world), ...browser.bookmarks.filter((b) => !favoritesOf(world).some((f) => f.url === b.url))];
  const shownUrl = pending || (tab && tab.url);
  const bookmark = shownUrl && browser.bookmarks.find((b) => b.url === shownUrl);

  // A window whose {url} payload no tab shows (a world written directly, not through open-app) gets that
  // tab once; a window with no tabs at all starts with one start tab, as a new Safari window does.
  useEffect(() => {
    if (payloadUrl && started.current !== payloadUrl && !tabs.some((t) => t.url === payloadUrl)) {
      started.current = payloadUrl;
      const id = newId("tab");
      syncedOp("browser", "set-tabs", { tabs: [...tabs, { id, url: payloadUrl, title: tabTitle(pageFor(world, payloadUrl)) }].slice(-16), activeTabId: id });
    } else if (!tabs.length && !started.current) {
      started.current = true;
      const id = newId("tab");
      syncedOp("browser", "set-tabs", { tabs: [{ id, url: homeOf(world), title: tabTitle(pageFor(world, homeOf(world))) }], activeTabId: id });
    }
  }, [tabs.length, payloadUrl]);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, [loading, tab && tab.url]);
  // Record scene pages in the shared history when a tab shows one.
  const visited = useRef(null);
  useEffect(() => {
    if (!shownUrl || page.kind !== "scene" || visited.current === shownUrl) return;
    visited.current = shownUrl;
    if ((browser.history[0] || {}).url !== shownUrl) syncedOp("browser", "visit", { id: newId("h"), url: shownUrl, title: tabTitle(page) });
  }, [shownUrl, page.kind]);

  const setTabs = (list, activeTabId) =>
    syncedOp("browser", "set-tabs", { tabs: list.slice(-16), activeTabId: list.length ? activeTabId || list[list.length - 1].id : null });
  const stackOf = (t) => (nav[t.id] && nav[t.id].list[nav[t.id].i] === t.url ? nav[t.id] : { list: [t.url], i: 0 });
  const show = (t, url, stack) => {
    setNav({ ...nav, [t.id]: stack });
    setTabs(tabs.map((x) => (x.id === t.id ? { ...x, url, title: tabTitle(pageFor(world, url)) } : x)), t.id);
    setLoading(true);
    setReader(false);
  };
  const go = (url, text) => {
    if (!tab) return;
    const st = stackOf(tab);
    if (text) setTypedFor({ ...typedFor, [tab.id]: text });
    setTyped(null);
    show(tab, url, { list: [...st.list.slice(0, st.i + 1), url], i: st.i + 1 });
  };
  const step = (d) => {
    const st = stackOf(tab);
    const i = st.i + d;
    if (i >= 0 && i < st.list.length) show(tab, st.list[i], { ...st, i });
  };
  const addTab = (url = homeOf(world)) => {
    const t = { id: newId("tab"), url, title: tabTitle(pageFor(world, url)) };
    setTabs([...tabs, t], t.id);
  };
  const close = (id, chosen) => {
    const closing = tabs.find((t) => t.id === id);
    if (!chosen && closing && SCENE.test(closing.url)) sceneChoice(world, "browser", undefined, "close-tab");
    const rest = tabs.filter((t) => t.id !== id);
    if (!rest.length) return win ? emit({ kind: "close-window", id: win.id }) : setTabs([{ id: newId("tab"), url: homeOf(world), title: tabTitle(pageFor(world, homeOf(world))) }]);
    const at = tabs.findIndex((t) => t.id === id);
    setTabs(rest, id === (tab && tab.id) ? rest[Math.max(0, at - 1)].id : tab.id);
  };
  const toggleBookmark = () =>
    bookmark
      ? syncedOp("browser", "bookmark-delete", { id: bookmark.id })
      : syncedOp("browser", "bookmark-upsert", { id: newId("bm"), title: page.title.slice(0, 80), url: shownUrl });
  const submit = () => {
    const v = (typed || "").trim();
    if (v) go(resolveTyped(world, v), v);
  };
  const secure = page.kind === "scene" ? !page.insecure && !/^http:/i.test(page.display) : page.kind !== "unavailable";
  const st = tab ? stackOf(tab) : { list: [], i: 0 };

  return (
    <OceanApp className="br-app">
      <div className="oc-col oc-grow">
        <div className="br-tabs oc-row">
          {tabs.map((t) => {
            const p = pageFor(world, t.url);
            return (
              <div key={t.id} className="br-tab" data-active={t.id === (tab && tab.id)} data-testid="browser-tab" onClick={() => t.id !== tab.id && setTabs(tabs, t.id)} onMouseDown={(e) => e.button === 1 && close(t.id)}>
                <Fa i={p.kind === "start" ? "faTableColumns" : p.kind === "history" ? "faClockRotateLeft" : p.kind === "scene" ? "faGlobe" : "faTriangleExclamation"} className="br-fav" />
                <span className="oc-ellipsis oc-grow">{p.title}</span>
                <span className="br-x" onClick={(e) => (e.stopPropagation(), close(t.id))} title="Close tab">
                  <Fa i="faXmark" />
                </span>
              </div>
            );
          })}
          <button type="button" className="br-plus" title="New tab" onClick={() => addTab()} disabled={tabs.length >= 16}>
            <Fa i="faPlus" />
          </button>
        </div>
        <div className="br-bar oc-row">
          <Btn subtle icon="faArrowLeft" disabled={st.i === 0} onClick={() => step(-1)} title="Back" />
          <Btn subtle icon="faArrowRight" disabled={st.i >= st.list.length - 1} onClick={() => step(1)} title="Forward" />
          <Btn subtle icon={loading ? "faXmark" : "faRotateRight"} onClick={() => setLoading(!loading)} title="Refresh" />
          <Btn subtle icon="faHouse" onClick={() => go(homeOf(world))} title="Home" />
          <div className="br-address oc-row oc-grow">
            {page.kind === "start" ? <Fa i="faMagnifyingGlass" className="oc-faint" /> : <Fa i={secure ? "faLock" : "faCircleExclamation"} className={secure ? "oc-faint" : "br-insecure"} title={secure ? "Connection is secure" : "Not secure"} />}
            {!secure ? <span className="br-insecure-text">Not secure</span> : null}
            <input
              className="oc-grow"
              value={typed != null ? typed : page.display}
              placeholder="Search or enter web address"
              onFocus={(e) => (setTyped(page.display), setTimeout(() => e.target.select(), 0))}
              onBlur={() => setTyped(null)}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? (submit(), e.target.blur()) : e.key === "Escape" ? e.target.blur() : null)}
            />
            {page.kind === "scene" ? (
              <>
                <button type="button" className="br-addr-btn" data-on={reader} title="Immersive Reader" onClick={() => setReader(!reader)}>
                  <Fa i="faBookOpen" />
                </button>
                <button type="button" className="br-addr-btn" data-on={!!bookmark} title={bookmark ? "Remove from favourites" : "Add this page to favourites"} onClick={toggleBookmark} data-testid="browser-star">
                  <Fa i="faStar" reg={!bookmark} />
                </button>
              </>
            ) : null}
          </div>
          <Btn subtle icon="faClockRotateLeft" onClick={() => go("history:")} title="History" />
        </div>
        <div className="br-favbar oc-row">
          {links.length ? (
            links.map((f) => (
              <span key={f.url} className="br-favitem" onClick={() => go(f.url)} data-ocean-key={SCENE.test(f.url) ? "fav:" + f.url.slice(6) : undefined} data-ocean-label={"The favourite \u201c" + f.title + "\u201d"}>
                <Fa i="faGlobe" /> {f.title}
              </span>
            ))
          ) : (
            <span className="oc-faint br-favempty">For quick access, place your favourites here on the favourites bar.</span>
          )}
        </div>
        {loading ? <div className="br-progress" /> : null}
        <div className="br-view oc-scroll oc-grow">
          {page.kind === "start" ? (
            <StartPage world={world} links={links} go={go} />
          ) : page.kind === "history" ? (
            <HistoryPage history={browser.history} go={go} />
          ) : page.kind === "scene" ? (
            <ScenePage page={page} reader={reader} dark={world.sys.theme == "dark"} typed={window.OceanWorldModel.typedOf(world, page.id)} onChoice={(c) => (emit({ kind: "scene-choice", choiceId: c }), c === "close-tab" && tab && close(tab.id, true))} />
          ) : (
            <ErrorPage page={page} />
          )}
        </div>
      </div>
    </OceanApp>
  );
};

export default BrowserApp;
