// Teams-style chat over world.data.messages.threads (pinned chats: threads[].pinned). Sending appends locally only.
import React, { useEffect, useRef, useState } from "react";
import { emit, fmtTime, newId, pinThread, useWorld } from "../../../../ocean/world-helpers";
import { Avatar, Empty, Fa, OceanApp, useContextMenu } from "./ui";
import "./chat.scss";

const lastOf = (t) => t.items[t.items.length - 1] || null;

export const ChatApp = () => {
  const world = useWorld();
  const threads = [...world.data.messages.threads].sort((a, b) => ((lastOf(a) || {}).time < (lastOf(b) || {}).time ? 1 : -1));
  const [sel, setSel] = useState(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const endRef = useRef(null);
  const [openMenu, menu] = useContextMenu();
  const thread = threads.find((t) => t.id === sel) || threads[0] || null;
  const me = world.user.name;
  useEffect(() => {
    endRef.current && endRef.current.scrollIntoView({ block: "end" });
  }, [thread && thread.id, thread && thread.items.length]);

  const send = () => {
    if (!text.trim() || !thread) return;
    emit({ kind: "data", store: "messages", op: "append", item: { threadId: thread.id, id: newId("i"), text: text.trim() } });
    setText("");
  };

  const shown = threads.filter((t) => !query || t.with.toLowerCase().includes(query.toLowerCase()));

  return (
    <OceanApp className="ch-app">
      <div className="ch-rail">
        <div className="ch-rail-item" data-active="true" title="Chat">
          <Fa i="faComments" reg />
          <span>Chat</span>
        </div>
        {world.installed.includes("calendar") ? (
          <div className="ch-rail-item" title="Calendar" onClick={() => emit({ kind: "open-app", app: "calendar" })}>
            <Fa i="faCalendar" reg />
            <span>Calendar</span>
          </div>
        ) : null}
      </div>
      <div className="ch-threads oc-col">
        <div className="ch-threads-head">
          <div className="oc-h2">Chat</div>
          <div className="oc-search">
            <Fa i="faMagnifyingGlass" />
            <input className="oc-input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="oc-scroll oc-grow">
          {[["Pinned", shown.filter((t) => t.pinned)], ["Recent", shown.filter((t) => !t.pinned)]].map(([group, list]) =>
            list.length ? (
              <React.Fragment key={group}>
                <div className="ch-group oc-faint">{group}</div>
                {list.map((t) => {
            const last = lastOf(t);
            return (
              <div
                key={t.id}
                className="ch-thread"
                data-active={thread && t.id === thread.id}
                onClick={() => setSel(t.id)}
                onContextMenu={(e) => openMenu(e, [{ label: t.pinned ? "Unpin" : "Pin", icon: "faThumbtack", onClick: () => pinThread(t.id, !t.pinned) }])}
              >
                <Avatar name={t.with} size={36} />
                <div className="oc-col oc-grow">
                  <div className="oc-row">
                    <span className="oc-h3 oc-ellipsis oc-grow">{t.with}</span>
                    <span className="oc-faint">{last ? fmtTime(last.time, { month: "numeric", day: "numeric" }) : ""}</span>
                  </div>
                  <div className="oc-faint oc-ellipsis">{last ? `${last.from === me ? "You" : last.from.split(" ")[0]}: ${last.text}` : "No messages yet"}</div>
                </div>
              </div>
            );
                })}
              </React.Fragment>
            ) : null,
          )}
        </div>
      </div>
      {thread ? (
        <div className="ch-conv oc-col oc-grow">
          <div className="ch-conv-head oc-row">
            <Avatar name={thread.with} size={32} />
            <div className="oc-h2 oc-ellipsis">{thread.with}</div>
            <div className="oc-pivot-item" data-active="true">
              <span>Chat</span>
            </div>
            <div className="oc-grow" />
            <button type="button" className="oc-btn subtle icon ch-pin" data-on={!!thread.pinned} title={thread.pinned ? "Unpin" : "Pin"} onClick={() => pinThread(thread.id, !thread.pinned)}>
              <Fa i="faThumbtack" />
            </button>
          </div>
          <div className="ch-msgs oc-scroll oc-grow">
            {thread.items.map((m, i) => {
              const mine = m.from === me;
              const first = i === 0 || thread.items[i - 1].from !== m.from;
              return (
                <div key={m.id} className="ch-msg" data-mine={mine}>
                  {!mine && first ? <Avatar name={m.from} size={28} /> : <div className="ch-gap" />}
                  <div className="oc-col">
                    {first ? (
                      <div className="oc-faint ch-meta">
                        {mine ? "" : `${m.from}  `}
                        {fmtTime(m.time)}
                      </div>
                    ) : null}
                    <div className="ch-bubble">{m.text}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="ch-compose">
            <input
              className="oc-input oc-grow"
              placeholder="Type a message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button type="button" className="oc-btn subtle icon" onClick={send} disabled={!text.trim()} title="Send">
              <Fa i="faPaperPlane" />
            </button>
          </div>
        </div>
      ) : (
        <Empty icon="faComments" title="No chats yet" />
      )}
      {menu}
    </OceanApp>
  );
};
