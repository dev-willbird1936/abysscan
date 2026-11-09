// Calendar over world.data.calendar: month grid, agenda, new event, invite responses.
import React, { useState } from "react";
import { deleteItem, fmtTime, newId, saveEvent, useWorld } from "../../../../ocean/world-helpers";
import { Btn, Dialog, Fa, OceanApp, useDraft } from "./ui";
import "./calendar.scss";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const pad = (n) => String(n).padStart(2, "0");
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso) => fmtTime(iso, { hour: "numeric", minute: "2-digit" });

const startMonth = (events) => {
  const now = new Date();
  const next = events.map((e) => new Date(e.start)).filter((d) => !isNaN(d)).sort((a, b) => a - b);
  const hasNow = next.some((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
  const base = hasNow || !next.length ? now : next.find((d) => d >= now) || next[next.length - 1];
  return new Date(base.getFullYear(), base.getMonth(), 1);
};

const NewEvent = ({ day, onClose }) => {
  const [f, setF] = useState({ title: "", date: toDateInput(day), from: "09:00", to: "09:30", location: "", allDay: false, notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const start = new Date(`${f.date}T${f.allDay ? "00:00" : f.from}`);
    const end = new Date(`${f.date}T${f.allDay ? "23:59" : f.to}`);
    if (isNaN(start)) return;
    saveEvent({
      id: newId("e"), title: f.title.trim().slice(0, 120) || "New event", start: start.toISOString(), end: (isNaN(end) || end < start ? start : end).toISOString(),
      location: f.location.trim().slice(0, 120), allDay: f.allDay, ...(f.notes.trim() ? { notes: f.notes.slice(0, 2000) } : {}),
    });
    onClose();
  };
  return (
    <Dialog
      title="New event"
      onClose={onClose}
      actions={
        <>
          <Btn primary onClick={save}>
            Save
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </>
      }
    >
      <input className="oc-input" autoFocus placeholder="Add a title" value={f.title} onChange={set("title")} />
      <div className="oc-row">
        <input className="oc-input oc-grow" type="date" value={f.date} onChange={set("date")} />
        {f.allDay ? null : (
          <>
            <input className="oc-input" type="time" value={f.from} onChange={set("from")} />
            <span className="oc-faint">to</span>
            <input className="oc-input" type="time" value={f.to} onChange={set("to")} />
          </>
        )}
      </div>
      <label className="oc-row cl-allday">
        <input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> All day
      </label>
      <input className="oc-input" placeholder="Location" value={f.location} onChange={set("location")} />
      <textarea className="oc-input cl-notes" placeholder="Add a description" value={f.notes} onChange={set("notes")} />
    </Dialog>
  );
};

const EventNotes = ({ ev }) => {
  const [notes, setNotes, dirty, clean] = useDraft(ev.notes || "", ev.id);
  return (
    <textarea
      className="oc-input cl-notes"
      placeholder="Add a description"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => dirty && (saveEvent({ ...ev, notes: notes.slice(0, 2000) }), clean())}
    />
  );
};

export const CalendarApp = () => {
  const world = useWorld();
  const events = [...world.data.calendar].sort((a, b) => (a.start < b.start ? -1 : 1));
  const [month, setMonth] = useState(() => startMonth(events));
  const [day, setDay] = useState(() => new Date());
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);
  const today = dayKey(new Date());

  const byDay = {};
  events.forEach((e) => {
    const d = new Date(e.start);
    if (!isNaN(d)) (byDay[dayKey(d)] = byDay[dayKey(d)] || []).push(e);
  });

  const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const dayEvents = byDay[dayKey(day)] || [];
  const upcoming = events.filter((e) => new Date(e.end || e.start) >= new Date()).slice(0, 6);
  const ev = detail && events.find((e) => e.id === detail);

  return (
    <OceanApp className="cl-app">
      <div className="oc-sidebar cl-side">
        <Btn primary icon="faPlus" onClick={() => setAdding(true)} className="cl-new">
          New event
        </Btn>
        <div className="oc-sidebar-title">{day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        {dayEvents.length ? (
          dayEvents.map((e) => (
            <div key={e.id} className="cl-agenda" onClick={() => setDetail(e.id)}>
              <div className="cl-bar" />
              <div className="oc-col oc-grow">
                <span className="oc-ellipsis">{e.title}</span>
                <span className="oc-faint">
                  {e.allDay ? "All day" : `${timeOf(e.start)} – ${timeOf(e.end)}`}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="oc-faint cl-none">Nothing planned</div>
        )}
        <div className="oc-sidebar-title">Upcoming</div>
        {upcoming.length ? (
          upcoming.map((e) => (
            <div key={e.id} className="cl-agenda" onClick={() => (setDay(new Date(e.start)), setMonth(new Date(new Date(e.start).getFullYear(), new Date(e.start).getMonth(), 1)))}>
              <div className="cl-date">
                <span>{new Date(e.start).toLocaleDateString("en-US", { month: "short" })}</span>
                <b>{new Date(e.start).getDate()}</b>
              </div>
              <div className="oc-col oc-grow">
                <span className="oc-ellipsis">{e.title}</span>
                <span className="oc-faint oc-ellipsis">{e.location || timeOf(e.start)}</span>
              </div>
              {e.invite ? <span className="oc-badge accent">Invite</span> : null}
            </div>
          ))
        ) : (
          <div className="oc-faint cl-none">No upcoming events</div>
        )}
      </div>
      <div className="cl-main oc-col oc-grow">
        <div className="cl-head oc-row">
          <Btn subtle onClick={() => (setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), setDay(new Date()))}>
            Today
          </Btn>
          <Btn subtle icon="faChevronUp" onClick={() => shift(-1)} title="Previous month" />
          <Btn subtle icon="faChevronDown" onClick={() => shift(1)} title="Next month" />
          <div className="oc-h2">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
        </div>
        <div className="cl-dow">
          {DAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cl-grid oc-grow">
          {cells.map((d) => {
            const k = dayKey(d);
            const list = byDay[k] || [];
            return (
              <div key={k} className="cl-cell" data-out={d.getMonth() !== month.getMonth()} data-sel={k === dayKey(day)} onClick={() => setDay(d)} onDoubleClick={() => (setDay(d), setAdding(true))}>
                <span className="cl-num" data-today={k === today}>
                  {d.getDate() === 1 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.getDate()}
                </span>
                {list.slice(0, 2).map((e) => (
                  <div key={e.id} className="cl-chip" data-invite={!!e.invite} onClick={(x) => (x.stopPropagation(), setDetail(e.id))}>
                    {e.allDay ? "" : timeOf(e.start)} {e.title}
                  </div>
                ))}
                {list.length > 2 ? <span className="oc-faint">+{list.length - 2} more</span> : null}
              </div>
            );
          })}
        </div>
      </div>
      {adding ? <NewEvent day={day} onClose={() => setAdding(false)} /> : null}
      {ev ? (
        <Dialog
          title={ev.title}
          onClose={() => setDetail(null)}
          actions={
            <>
              <Btn className="danger" icon="faTrashCan" reg onClick={() => (deleteItem("calendar", ev.id), setDetail(null))}>
                Delete
              </Btn>
              <Btn onClick={() => setDetail(null)}>Close</Btn>
            </>
          }
        >
          <div className="oc-kv">
            <span>When</span>
            <span>
              {ev.allDay
                ? `${fmtTime(ev.start, { weekday: "long", month: "long", day: "numeric" })} · All day`
                : `${fmtTime(ev.start, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} – ${timeOf(ev.end)}`}
            </span>
            <span>All day</span>
            <span>
              <input type="checkbox" checked={!!ev.allDay} onChange={(e) => saveEvent({ ...ev, allDay: e.target.checked })} aria-label="All day" />
            </span>
            <span>Where</span>
            <span>{ev.location || "—"}</span>
            {ev.invite ? (
              <>
                <span>Invitation</span>
                <span>{ev.invite}</span>
              </>
            ) : null}
          </div>
          <EventNotes ev={ev} />
        </Dialog>
      ) : null}
    </OceanApp>
  );
};
