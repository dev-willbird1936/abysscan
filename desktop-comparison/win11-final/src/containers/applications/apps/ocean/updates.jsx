// Windows Update page over world.data.updates (optional): [{ id, title, kb, size, status, choiceId? }].
// choiceId is scene-provided: installing such an update is also that scene choice (fake-update lure).
import React, { useEffect, useState } from "react";
import { dataOp, emit, fmtTime, sceneChoice, useWorld } from "../../../../ocean/world-helpers";
import { Btn, Fa, OceanApp } from "./ui";
import "./lists.scss";
import "./updates.scss";

const install = ({ id, title, kb, size, choiceId }) => {
  if (choiceId) emit({ kind: "scene-choice", choiceId });
  dataOp("updates", "upsert", { id, title, kb, size, status: "installed" });
};

export const UpdatesApp = () => {
  const world = useWorld();
  const updates = world.data.updates || [];
  const pending = updates.filter((u) => u.status !== "installed");
  const done = updates.filter((u) => u.status === "installed");
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(null);

  useEffect(() => {
    if (!checking) return;
    const t = setTimeout(() => (setChecking(false), setChecked(new Date().toISOString())), 1400);
    return () => clearTimeout(t);
  }, [checking]);

  const status = checking ? "Checking for updates…" : pending.length ? "Updates available" : "You're up to date";
  return (
    <OceanApp className="up-app">
      <div className="oc-col oc-grow oc-scroll up-main">
        <div className="oc-h1">Windows Update</div>
        <div className="oc-card up-hero oc-row">
          <div className="up-icon" data-state={checking ? "busy" : pending.length ? "pending" : "ok"}>
            <Fa i={checking ? "faRotate" : pending.length ? "faArrowsRotate" : "faCircleCheck"} className={checking ? "up-spin" : ""} />
          </div>
          <div className="oc-col oc-grow">
            <div className="oc-h2">{status}</div>
            <div className="oc-faint">Last checked: {checked ? fmtTime(checked) : "Today"}</div>
          </div>
          {pending.length ? (
            <Btn primary onClick={() => pending.forEach(install)}>
              Download &amp; install all
            </Btn>
          ) : (
            <Btn primary onClick={() => (sceneChoice(world, "updates", undefined, "check-updates"), setChecking(true))} disabled={checking}>
              Check for updates
            </Btn>
          )}
        </div>
        {pending.map((u) => (
          <div key={u.id} className="oc-card up-item oc-row">
            <Fa i="faDownload" className="oc-accent-text" />
            <div className="oc-col oc-grow">
              <span className="oc-ellipsis">{u.title}</span>
              <span className="oc-faint">{[u.kb, u.size, "Ready to install"].filter(Boolean).join(" · ")}</span>
            </div>
            <Btn onClick={() => install(u)}>Install</Btn>
          </div>
        ))}
        <div className="oc-h3 up-section">More options</div>
        <div className="oc-card up-item oc-row">
          <Fa i="faClockRotateLeft" />
          <div className="oc-col oc-grow">
            <span>Update history</span>
            <span className="oc-faint">{done.length ? `${done.length} installed on this desktop` : "No updates installed yet"}</span>
          </div>
        </div>
        {done.map((u) => (
          <div key={u.id} className="up-hist oc-row">
            <Fa i="faCheck" className="oc-faint" />
            <span className="oc-ellipsis oc-grow">{u.title}</span>
            <span className="oc-faint">Successfully installed</span>
          </div>
        ))}
      </div>
    </OceanApp>
  );
};
