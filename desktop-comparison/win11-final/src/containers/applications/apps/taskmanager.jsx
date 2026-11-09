// Task Manager: apps from world.windows, background processes from world.data.processes
// (scene-provided, read-only: {id, name, cpu?, mem?, publisher?, suspicious?, endChoice?}) plus fixed
// OS processes. The Startup apps tab lists world.data.startup ({id, name, command}, read-only) first.
// End task closes an app's windows, or emits the process's endChoice scene choice.
import React, { useEffect, useRef, useState } from "react";
import { APP_META, getApp } from "../../../ocean/appRegistry";
import { emit, useWorld } from "../../../ocean/world-helpers";
import { Btn, Fa, NavItem, OceanApp, useNotice, useNow } from "./ocean/ui";
import "./ocean/taskmanager.scss";

const SYSTEM = [
  ["System", 0.1, 0.1],
  ["Registry", 0, 8.2],
  ["Desktop Window Manager", 0.8, 42.6],
  ["Windows Explorer", 0.4, 61.3],
  ["Service Host: Local System", 0.2, 18.4],
  ["Antimalware Service Executable", 0.6, 96.1],
  ["Runtime Broker", 0, 6.7],
  ["Windows Search Indexer", 0.1, 21.9],
];
const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 3);
const jitter = (key, tick, base, spread) => Math.max(0, base + (((seedOf(key) + tick * 7919) % 1000) / 1000 - 0.5) * spread);
const pidOf = (key) => 1000 + (seedOf(key) % 30000);

const Spark = ({ data, max = 100 }) => (
  <svg viewBox={`0 0 ${data.length - 1} 100`} preserveAspectRatio="none" className="tk-spark">
    <polyline points={data.map((v, i) => `${i},${100 - (v / max) * 100}`).join(" ")} />
    <polygon points={`0,100 ${data.map((v, i) => `${i},${100 - (v / max) * 100}`).join(" ")} ${data.length - 1},100`} />
  </svg>
);

const TaskManagerApp = () => {
  const world = useWorld();
  const tick = Math.floor(useNow(1500) / 1500);
  const [tab, setTab] = useState("processes");
  const [selKey, setSelKey] = useState(null);
  const [notice, noticeNode] = useNotice();
  const hist = useRef({ cpu: Array(40).fill(8), mem: Array(40).fill(42) });

  const appRows = Object.values(
    world.windows.reduce((acc, w) => {
      // A program window is its own app row, named by its view (docs/desktop-parity/PROGRAMS.md).
      const view = w.app === "program" ? (world.data.views || {})[w.payload.view] || {} : null;
      const id = view ? `program:${w.payload.view}` : w.app;
      (acc[id] = acc[id] || { key: `app:${id}`, name: view ? view.title || "Program" : (APP_META[w.app] || {}).name || w.app, app: w.app,
        iconSrc: view ? window.OceanProgramUI.fileIcon("program", "windows") : (getApp(w.app) || {}).iconSrc, wins: [] }).wins.push(w);
      return acc;
    }, {}),
  ).map((r) => ({ ...r, cpu: jitter(r.key, tick, r.wins.some((w) => w.mode !== "minimized") ? 1.6 : 0.1, 2), mem: jitter(r.key, 0, 60, 80), status: r.wins.every((w) => w.mode === "minimized") ? "Suspended" : "" }));
  const sceneRows = (world.data.processes || []).map((p) => ({ key: `proc:${p.id}`, id: p.id, name: p.name, cpu: jitter(p.id, tick, p.cpu != null ? p.cpu : 2, 3), mem: p.mem != null ? p.mem : jitter(p.id, 0, 40, 30), suspicious: !!p.suspicious, publisher: p.publisher, endChoice: p.endChoice, parent: p.parent, command: p.command, net: p.net }));
  const sysRows = SYSTEM.map(([name, cpu, mem]) => ({ key: `sys:${name}`, name, cpu: jitter(name, tick, cpu, 0.6), mem, system: true }));
  const all = [...appRows, ...sceneRows, ...sysRows];
  const cpuTotal = Math.min(100, all.reduce((a, r) => a + r.cpu, 0) + 3);
  const memTotal = Math.min(100, 28 + all.reduce((a, r) => a + r.mem, 0) / 160);

  useEffect(() => {
    const h = hist.current;
    h.cpu = [...h.cpu.slice(1), cpuTotal];
    h.mem = [...h.mem.slice(1), memTotal];
  }, [tick]);

  const sel = all.find((r) => r.key === selKey);
  const endTask = (r) => {
    if (!r) return;
    if (r.app) r.wins.forEach((w) => emit({ kind: "close-window", id: w.id }));
    else if (r.endChoice) emit({ kind: "scene-choice", choiceId: r.endChoice });
    else return notice("Access is denied.");
    setSelKey(null);
  };

  const Row = ({ r }) => (
    <div className="tk-row" data-sel={r.key === selKey} data-suspicious={!!r.suspicious} data-ocean-key={r.app ? undefined : "process:" + r.name} onClick={() => setSelKey(r.key)} onDoubleClick={() => r.app && emit({ kind: "focus-window", id: r.wins[0].id })} title={r.name}>
      <span className="tk-name oc-row">
        {r.app ? <img src={r.iconSrc} width={16} height={16} alt="" /> : <Fa i={r.suspicious ? "faTriangleExclamation" : "faGear"} className="tk-picon" />}
        <span className="oc-ellipsis">
          {r.name}
          {r.app && r.wins.length > 1 ? ` (${r.wins.length})` : ""}
        </span>
      </span>
      <span className="tk-status">{r.status || (r.suspicious ? r.publisher || "Unknown publisher" : "")}</span>
      <span className="tk-num" style={{ "--heat": Math.min(1, r.cpu / 20) }}>
        {r.cpu.toFixed(1)}%
      </span>
      <span className="tk-num" style={{ "--heat": Math.min(1, r.mem / 400) }}>
        {r.mem.toFixed(1)} MB
      </span>
      <span className="tk-num">0 MB/s</span>
      <span className="tk-num">0 Mbps</span>
    </div>
  );

  const NAV = [
    ["processes", "Processes", "faTableCellsLarge"],
    ["performance", "Performance", "faWaveSquare"],
    ["startup", "Startup apps", "faGaugeHigh"],
    ["users", "Users", "faUser"],
    ["details", "Details", "faList"],
  ];

  return (
    <OceanApp className="tk-app">
      <div className="oc-sidebar tk-side">
        {NAV.map(([id, label, icon]) => (
          <NavItem key={id} icon={icon} label={label} active={tab === id} onClick={() => setTab(id)} />
        ))}
      </div>
      <div className="oc-col oc-grow tk-main">
        <div className="tk-head oc-row">
          <div className="oc-h2 oc-grow">{NAV.find((n) => n[0] === tab)[1]}</div>
          {tab === "processes" || tab === "details" ? (
            <Btn icon="faBan" onClick={() => endTask(sel)} disabled={!sel}>
              End task
            </Btn>
          ) : null}
        </div>
        {tab === "processes" ? (
          <div className="oc-scroll oc-grow">
            <div className="tk-row tk-colhead">
              <span>Name</span>
              <span>Status</span>
              <span className="tk-num">
                <b>{Math.round(cpuTotal)}%</b>CPU
              </span>
              <span className="tk-num">
                <b>{Math.round(memTotal)}%</b>Memory
              </span>
              <span className="tk-num">
                <b>0%</b>Disk
              </span>
              <span className="tk-num">
                <b>0%</b>Network
              </span>
            </div>
            <div className="tk-group">Apps ({appRows.length})</div>
            {appRows.map((r) => (
              <Row key={r.key} r={r} />
            ))}
            <div className="tk-group">Background processes ({sceneRows.length + sysRows.length})</div>
            {[...sceneRows, ...sysRows].map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </div>
        ) : tab === "performance" ? (
          <div className="tk-perf oc-scroll oc-grow">
            <div className="oc-card tk-chart">
              <div className="oc-row">
                <span className="oc-h3 oc-grow">CPU</span>
                <span className="oc-faint">{Math.round(cpuTotal)}% · 2.40 GHz</span>
              </div>
              <Spark data={hist.current.cpu} />
            </div>
            <div className="oc-card tk-chart tk-mem">
              <div className="oc-row">
                <span className="oc-h3 oc-grow">Memory</span>
                <span className="oc-faint">{((16 * memTotal) / 100).toFixed(1)}/16.0 GB ({Math.round(memTotal)}%)</span>
              </div>
              <Spark data={hist.current.mem} />
            </div>
            <div className="oc-card tk-chart">
              <div className="oc-row">
                <span className="oc-h3 oc-grow">Wi-Fi</span>
                <span className="oc-faint">{world.sys.wifi ? "Connected (training network, offline)" : "Not connected"}</span>
              </div>
            </div>
          </div>
        ) : tab === "startup" ? (
          <div className="oc-scroll oc-grow">
            <div className="tk-row tk-colhead tk-3">
              <span>Name</span>
              <span>Status</span>
              <span>Startup impact</span>
            </div>
            {(world.data.startup || []).map((s) => (
              <div key={s.id} className="tk-row tk-3 tk-startup" data-suspicious="true" data-startup-id={s.id} data-ocean-key={"startup:" + s.name} title={s.command}>
                <span className="tk-name oc-row">
                  <Fa i="faTriangleExclamation" className="tk-picon" />
                  <span className="oc-col oc-ellipsis">
                    <span className="oc-ellipsis">{s.name}</span>
                    <span className="oc-faint tk-sub oc-ellipsis">{s.publisher || "Unknown publisher"} · {s.command}</span>
                    {s.location ? <span className="oc-faint tk-sub oc-ellipsis">{s.location}</span> : null}
                  </span>
                </span>
                <span>Enabled</span>
                <span className="oc-faint">High</span>
              </div>
            ))}
            {world.dock.pins.map((a) => (
              <div key={a} className="tk-row tk-3">
                <span className="tk-name oc-row">
                  <img src={(getApp(a) || {}).iconSrc} width={16} height={16} alt="" />
                  {(APP_META[a] || {}).name || a}
                </span>
                <span>Enabled</span>
                <span className="oc-faint">Low</span>
              </div>
            ))}
          </div>
        ) : tab === "users" ? (
          <div className="oc-scroll oc-grow">
            <div className="tk-row tk-colhead tk-3">
              <span>User</span>
              <span>Status</span>
              <span>Apps</span>
            </div>
            <div className="tk-row tk-3">
              <span className="tk-name oc-row">
                <Fa i="faUser" className="tk-picon" />
                {world.user.name} ({world.user.short})
              </span>
              <span>Active</span>
              <span>{world.windows.length}</span>
            </div>
          </div>
        ) : (
          <div className="oc-scroll oc-grow">
            <div className="tk-row tk-colhead tk-5">
              <span>Name</span>
              <span>PID</span>
              <span>Status</span>
              <span>User name</span>
              <span>Memory</span>
            </div>
            {all.map((r) => (
              <div key={r.key} className="tk-row tk-5" data-sel={r.key === selKey} data-suspicious={!!r.suspicious} data-ocean-key={r.app ? undefined : "process:" + r.name} onClick={() => setSelKey(r.key)}>
                <span className="oc-ellipsis">{r.app ? `${r.app}.exe` : r.name}</span>
                <span>{pidOf(r.key)}</span>
                <span>{r.status === "Suspended" ? "Suspended" : "Running"}</span>
                <span>{r.system ? "SYSTEM" : world.user.short}</span>
                <span>{Math.round(r.mem * 1024).toLocaleString("en-US")} K</span>
              </div>
            ))}
            {sel && (sel.parent || sel.command || sel.net) ? (
              <div className="oc-card tk-detail" data-testid="process-detail">
                <div className="oc-h3">{sel.name}</div>
                {sel.parent ? <div><span className="oc-faint">Parent process</span> {sel.parent}</div> : null}
                {sel.command ? <div><span className="oc-faint">Command line</span> <code>{sel.command}</code></div> : null}
                {sel.net ? <div><span className="oc-faint">Network</span> {sel.net}</div> : null}
                <div><span className="oc-faint">Publisher</span> {sel.publisher || "Unknown publisher"}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {noticeNode}
    </OceanApp>
  );
};


export default TaskManagerApp;
