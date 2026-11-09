// Authenticator: fictional rotating codes and sign-in prompts from world.data.mfa
// ({ accounts: [{id, issuer, label}], prompts: [{id, app, account, location, device, time, number}] }).
// Approve/deny emits the V2 scene choice, then deletes the answered prompt. Codes are not TOTP and protect nothing.
import React, { useState } from "react";
import { deleteItem, emit, fmtTime, useWorld } from "../../../../ocean/world-helpers";
import { Avatar, Btn, Fa, OceanApp, useNow } from "./ui";
import "./authenticator.scss";

const PERIOD = 30000;
const codeFor = (seed, step) => {
  let h = 2166136261;
  for (const c of `${seed}:${step}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return String(h % 1000000).padStart(6, "0");
};

const accountsOf = (world) => {
  const mfa = world.data.mfa || {};
  if (mfa.accounts && mfa.accounts.length) return mfa.accounts;
  const domain = (world.user.email.split("@")[1] || "work.example").split(".")[0];
  return [{ id: "acct-work", issuer: domain.charAt(0).toUpperCase() + domain.slice(1), label: world.user.email }];
};

export const AuthenticatorApp = () => {
  const world = useWorld();
  const now = useNow(1000);
  const [shown, setShown] = useState({});
  // The answer is shown until the next prompt arrives (UI-only; the prompt itself is deleted from the world).
  const [last, setLast] = useState(null);
  const accounts = accountsOf(world);
  const prompts = (world.data.mfa || {}).prompts || [];
  const step = Math.floor(now / PERIOD);
  const left = Math.ceil((PERIOD - (now % PERIOD)) / 1000);
  const p = prompts[0];

  const decide = (approve) => {
    emit({ kind: "scene-choice", choiceId: approve ? "approve" : "deny" });
    deleteItem("mfa", p.id);
    setLast({ app: p.app, status: approve ? "approved" : "denied" });
  };

  return (
    <OceanApp className="au-app">
      <div className="oc-col oc-grow">
        <div className="au-head oc-row">
          <Fa i="faShieldHalved" className="oc-accent-text" />
          <span className="oc-h2 oc-grow">Authenticator</span>
        </div>
        {p ? (
          <div className="au-prompt oc-card">
            <div className="oc-h2">Approve sign-in?</div>
            <div className="oc-faint">{p.account}</div>
            {p.number != null ? (
              <div className="oc-col au-number-wrap">
                <span className="oc-faint">Does your sign-in screen show this number?</span>
                <div className="au-number">{p.number}</div>
              </div>
            ) : null}
            <div className="oc-kv au-kv">
              <span>App</span>
              <span>{p.app}</span>
              <span>Location</span>
              <span>{p.location}</span>
              <span>Device</span>
              <span>{p.device}</span>
              <span>Time</span>
              <span>{fmtTime(p.time) || "Just now"}</span>
            </div>
            <div className="oc-row au-actions">
              <Btn className="oc-grow" onClick={() => decide(false)} icon="faXmark">
                Deny
              </Btn>
              <Btn primary className="oc-grow" onClick={() => decide(true)} icon="faCheck">
                Approve
              </Btn>
            </div>
            <div className="oc-faint au-hint">Didn't try to sign in? Deny it.</div>
          </div>
        ) : last ? (
          <div className="au-done oc-row">
            <Fa i={last.status === "approved" ? "faCircleCheck" : "faCircleXmark"} />
            <span>
              {last.app}: sign-in {last.status}.
            </span>
          </div>
        ) : null}
        <div className="au-list oc-scroll oc-grow">
          {accounts.map((a) => {
            const code = codeFor(a.id, step);
            return (
              <div key={a.id} className="au-acct" onClick={() => setShown({ ...shown, [a.id]: !shown[a.id] })}>
                <Avatar name={a.issuer} size={36} />
                <div className="oc-col oc-grow">
                  <span className="oc-h3 oc-ellipsis">{a.issuer}</span>
                  <span className="oc-faint oc-ellipsis">{a.label}</span>
                  {shown[a.id] ? (
                    <span className="au-code">
                      {code.slice(0, 3)} {code.slice(3)}
                    </span>
                  ) : (
                    <span className="oc-faint">Select to show one-time code</span>
                  )}
                </div>
                {shown[a.id] ? (
                  <div className="au-timer" style={{ "--p": `${(left / 30) * 360}deg` }} title={`${left}s`}>
                    <span>{left}</span>
                  </div>
                ) : (
                  <Fa i="faChevronRight" className="oc-faint" />
                )}
              </div>
            );
          })}
        </div>
        <div className="oc-faint au-foot">Training codes · fictional accounts only</div>
      </div>
    </OceanApp>
  );
};
