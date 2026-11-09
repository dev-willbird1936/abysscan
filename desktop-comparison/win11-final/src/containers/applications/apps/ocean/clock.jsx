// Clock: alarms (world.data.alarms), timer, stopwatch and world clocks (world.data.clock). Only the open tab is local.
import React, { useEffect, useRef, useState } from "react";
import { dataOp, deleteItem, newId, useWorld } from "../../../../ocean/world-helpers";
import { sinceAt, syncedOp, useSynced } from "../../../../ocean/synced";
import { playSound } from "../../../../utils/sounds";
import { Btn, Empty, Fa, NavItem, OceanApp, Toggle, useNow } from "./ui";
import "./clock.scss";

const two = (n) => String(Math.floor(n)).padStart(2, "0");
const hms = (ms) => `${two(ms / 3600000)}:${two((ms / 60000) % 60)}:${two((ms / 1000) % 60)}`;

const Alarms = ({ alarms }) => {
  const [time, setTime] = useState("07:30");
  const [label, setLabel] = useState("");
  const upsert = ({ id, time, label, enabled }) => dataOp("alarms", "upsert", { id, time, label, enabled });
  return (
    <div className="ck-pane oc-col oc-grow">
      <div className="oc-row ck-add">
        <input className="oc-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <input className="oc-input oc-grow" placeholder="Alarm name" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Btn primary icon="faPlus" onClick={() => (upsert({ id: newId("a"), time, label: label.trim().slice(0, 60) || "Alarm", enabled: true }), setLabel(""))}>
          Add alarm
        </Btn>
      </div>
      {alarms.length ? (
        <div className="ck-cards oc-scroll">
          {alarms.map((a) => (
            <div key={a.id} className="oc-card ck-alarm" data-on={a.enabled}>
              <div className="oc-row">
                <div className="ck-alarm-time oc-grow">{a.time}</div>
                <Toggle on={a.enabled} onChange={(v) => upsert({ ...a, enabled: v })} label={`Alarm ${a.label}`} />
              </div>
              <div className="oc-row">
                <Fa i="faBell" reg className="oc-faint" />
                <span className="oc-ellipsis oc-grow">{a.label}</span>
                <button type="button" className="oc-btn subtle icon" title="Delete alarm" onClick={() => deleteItem("alarms", a.id)}>
                  <Fa i="faTrashCan" reg />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="faBell" title="No alarms">
          Add one above.
        </Empty>
      )}
    </div>
  );
};

// Timer: data.clock.timer. remainingMs is true at `at`; while running subtract (now - at).
const timerLeft = (t, now) => (!t ? 0 : t.running ? Math.max(0, t.remainingMs - sinceAt(t.at, now)) : t.remainingMs);

const Timer = ({ timer }) => {
  const now = useNow(timer && timer.running ? 200 : 100000);
  const [pickMin, setPickMin] = useState(5);
  const [label, setLabel] = useState("Timer");
  const ended = useRef(null);
  const world = useWorld();
  const left = timerLeft(timer, now);
  const set = (t) => syncedOp("clock", "set-timer", { timer: t });
  // A running timer that reaches zero stops once (keyed by its start stamp) and chimes.
  useEffect(() => {
    if (!timer || !timer.running || left > 0 || ended.current === timer.at) return;
    ended.current = timer.at;
    playSound("chime", world.sys);
    set({ label: timer.label, durationMs: timer.durationMs, remainingMs: 0, running: false });
  }, [left, timer]);
  const total = timer ? timer.durationMs : pickMin * 60000;
  const frac = timer ? left / total : 1;
  const start = () =>
    !timer || left === 0
      ? set({ label: (timer && timer.label) || label.trim().slice(0, 60) || "Timer", durationMs: total, remainingMs: total, running: true })
      : set({ label: timer.label, durationMs: timer.durationMs, remainingMs: left, running: !timer.running });
  return (
    <div className="ck-pane oc-col oc-grow ck-center" data-testid="clock-timer">
      <div className="ck-ring">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" className="ck-ring-bg" />
          <circle cx="60" cy="60" r="52" className="ck-ring-fg" style={{ strokeDasharray: 326.7, strokeDashoffset: 326.7 * (1 - frac) }} />
        </svg>
        <div className="ck-big">{timer && left === 0 ? "Done" : hms(timer ? left : total)}</div>
        <div className="oc-faint ck-ring-label">{timer ? timer.label : ""}</div>
      </div>
      {!timer || !timer.running ? (
        <div className="oc-row">
          {[1, 3, 5, 10, 25].map((m) => (
            <Btn key={m} subtle className={!timer && m === pickMin ? "ck-on" : ""} onClick={() => (setPickMin(m), timer && set(null))}>
              {m} min
            </Btn>
          ))}
          {!timer ? <input className="oc-input ck-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Timer name" /> : null}
        </div>
      ) : null}
      <div className="oc-row">
        <Btn primary icon={timer && timer.running ? "faPause" : "faPlay"} onClick={start}>
          {timer && timer.running ? "Pause" : "Start"}
        </Btn>
        <Btn icon="faRotateLeft" onClick={() => set(null)} disabled={!timer}>
          Reset
        </Btn>
      </div>
    </div>
  );
};

// Stopwatch: data.clock.stopwatch. elapsedMs is true at `at`; while running add (now - at). Laps are totals.
const Stopwatch = ({ sw }) => {
  const now = useNow(sw.running ? 50 : 100000);
  const elapsed = sw.elapsedMs + (sw.running ? sinceAt(sw.at, now) : 0);
  const set = (patch) => syncedOp("clock", "set-stopwatch", { running: sw.running, elapsedMs: Math.round(elapsed), laps: sw.laps, ...patch });
  const laps = sw.laps.map((t, i) => [i + 1, t - (sw.laps[i - 1] || 0), t]).reverse();
  return (
    <div className="ck-pane oc-col oc-grow ck-center" data-testid="clock-stopwatch">
      <div className="ck-big ck-watch">
        {hms(elapsed)}
        <span className="ck-cs">.{two((elapsed / 10) % 100)}</span>
      </div>
      <div className="oc-row">
        <Btn primary icon={sw.running ? "faPause" : "faPlay"} onClick={() => set({ running: !sw.running })}>
          {sw.running ? "Pause" : "Start"}
        </Btn>
        <Btn icon="faFlag" reg onClick={() => set({ laps: [...sw.laps, Math.round(elapsed)].slice(-100) })} disabled={!sw.running}>
          Lap
        </Btn>
        <Btn icon="faRotateLeft" onClick={() => syncedOp("clock", "set-stopwatch", { running: false, elapsedMs: 0, laps: [] })}>
          Reset
        </Btn>
      </div>
      <div className="ck-laps oc-scroll">
        {laps.map(([n, split, total]) => (
          <div key={n} className="oc-row ck-lap">
            <span className="oc-grow">Lap {n}</span>
            <span className="oc-faint">{hms(split)}</span>
            <span>{hms(total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ZONES = [
  ["New York", "America/New_York"], ["Chicago", "America/Chicago"], ["Los Angeles", "America/Los_Angeles"], ["São Paulo", "America/Sao_Paulo"],
  ["London", "Europe/London"], ["Paris", "Europe/Paris"], ["Berlin", "Europe/Berlin"], ["Dubai", "Asia/Dubai"], ["Mumbai", "Asia/Kolkata"],
  ["Singapore", "Asia/Singapore"], ["Tokyo", "Asia/Tokyo"], ["Sydney", "Australia/Sydney"], ["Auckland", "Pacific/Auckland"],
];
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// World clock: data.clock.worldClocks. tz 'local' is this device's zone.
const World = ({ cities }) => {
  const now = useNow(1000);
  const [pick, setPick] = useState("");
  const free = ZONES.filter(([name]) => !cities.some((c) => c.name === name));
  const localOffset = -new Date(now).getTimezoneOffset();
  const offset = (tz) => {
    if (tz === "local") return localOffset;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(now);
    const v = Object.fromEntries(parts.map((p) => [p.type, +p.value]));
    return Math.round((Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) - now) / 60000);
  };
  return (
    <div className="ck-pane oc-col oc-grow" data-testid="clock-world">
      <div className="oc-row ck-add">
        <select className="oc-input oc-grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a city">
          <option value="">Add a new city…</option>
          {free.map(([name]) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Btn primary icon="faPlus" disabled={!pick || cities.length >= 24} onClick={() => {
          const [name, tz] = ZONES.find((z) => z[0] === pick);
          syncedOp("clock", "city-upsert", { id: slug(name), name, tz });
          setPick("");
        }}>
          Add
        </Btn>
      </div>
      {cities.length ? (
        <div className="ck-cards oc-scroll">
          {cities.map((c) => {
            const tz = c.tz === "local" ? undefined : c.tz;
            const d = new Date(now);
            const diff = Math.round((offset(c.tz) - localOffset) / 60);
            return (
              <div key={c.id} className="oc-card ck-city">
                <div className="oc-row">
                  <div className="ck-alarm-time oc-grow">{d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</div>
                  <button type="button" className="oc-btn subtle icon" title={`Remove ${c.name}`} onClick={() => syncedOp("clock", "city-delete", { id: c.id })}>
                    <Fa i="faTrashCan" reg />
                  </button>
                </div>
                <div className="oc-h3">{c.name}</div>
                <div className="oc-faint">
                  {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })}
                  {c.tz === "local" ? " · Local time" : ` · ${diff >= 0 ? "+" : ""}${diff} hr`}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon="faGlobe" title="No world clocks">
          Add a city above.
        </Empty>
      )}
    </div>
  );
};

export const ClockApp = () => {
  const world = useWorld();
  const clock = useSynced("clock");
  const [tab, setTab] = useState("world");
  const tabs = [
    ["world", "World clock", "faGlobe"],
    ["alarm", "Alarm", "faBell"],
    ["stopwatch", "Stopwatch", "faStopwatch"],
    ["timer", "Timer", "faHourglassHalf"],
  ];
  return (
    <OceanApp className="ck-app">
      <div className="oc-sidebar ck-side">
        {tabs.map(([id, label, icon]) => (
          <NavItem key={id} icon={icon} label={label} active={tab === id} onClick={() => setTab(id)} />
        ))}
      </div>
      <div className="oc-col oc-grow ck-main">
        <div className="oc-h1">{tabs.find((t) => t[0] === tab)[1]}</div>
        {tab === "alarm" ? <Alarms alarms={world.data.alarms || []} /> : tab === "timer" ? <Timer timer={clock.timer} /> : tab === "stopwatch" ? <Stopwatch sw={clock.stopwatch} /> : <World cities={clock.worldClocks} />}
      </div>
    </OceanApp>
  );
};
