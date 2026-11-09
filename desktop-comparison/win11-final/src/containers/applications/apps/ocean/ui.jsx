// Shared Fluent-style building blocks for the world-bound apps.
import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as FaSolid from "@fortawesome/free-solid-svg-icons";
import * as FaRegular from "@fortawesome/free-regular-svg-icons";
import { initials, useWorldPart } from "../../../../ocean/world-helpers";
import "./ocean.scss";

// Win11 accent palette: [light theme, dark theme].
export const ACCENTS = {
  blue: ["#0067c0", "#4cc2ff"],
  purple: ["#7a4fc4", "#c4a4ff"],
  pink: ["#c30079", "#ff8ad8"],
  red: ["#c42b1c", "#ff99a4"],
  orange: ["#bc4b09", "#ffb27a"],
  yellow: ["#9d7a00", "#ffd43b"],
  green: ["#0f7b0f", "#6ccb5f"],
  graphite: ["#5a6474", "#b4bccb"],
};

export const Fa = ({ i, reg, className, style, title }) => (
  <FontAwesomeIcon icon={(reg && FaRegular[i]) || FaSolid[i] || FaSolid.faCircle} className={className} style={style} title={title} />
);

// Root of every app: carries theme + accent from world.sys so a world swap restyles live.
export const OceanApp = ({ className = "", children, ...rest }) => {
  const theme = useWorldPart((w) => w.sys.theme);
  const accent = useWorldPart((w) => w.sys.accent);
  const pair = ACCENTS[accent] || ACCENTS.blue;
  const dark = theme === "dark";
  return (
    <div
      className={`oc-app ${className}`}
      data-theme={dark ? "dark" : "light"}
      style={{ "--oc-accent": pair[dark ? 1 : 0], "--oc-on-accent": dark ? "#000" : "#fff" }}
      {...rest}
    >
      {children}
    </div>
  );
};

const AVATAR_COLORS = ["#c239b3", "#0078d4", "#498205", "#ca5010", "#8764b8", "#038387", "#d13438", "#5c2e91"];
export const Avatar = ({ name, size = 32 }) => {
  const sum = [...String(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div className="oc-avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: AVATAR_COLORS[sum % AVATAR_COLORS.length] }}>
      {initials(name)}
    </div>
  );
};

export const NavItem = ({ icon, reg, label, count, active, onClick, onDrop, onDragOver, title }) => (
  <div className="oc-nav-item" data-active={!!active} onClick={onClick} onDrop={onDrop} onDragOver={onDragOver} title={title}>
    {icon ? <Fa i={icon} reg={reg} className="oc-nav-icon" /> : null}
    <span className="oc-nav-label">{label}</span>
    {count ? <span className="oc-count">{count}</span> : null}
  </div>
);

export const Btn = ({ icon, reg, children, primary, subtle, onClick, disabled, title, className = "" }) => (
  <button
    type="button"
    className={`oc-btn ${primary ? "primary" : ""} ${subtle ? "subtle" : ""} ${className}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {icon ? <Fa i={icon} reg={reg} /> : null}
    {children ? <span>{children}</span> : null}
  </button>
);

export const Toggle = ({ on, onChange, label }) => (
  <div className="oc-toggle" data-on={!!on} onClick={() => onChange(!on)} role="switch" aria-checked={!!on} aria-label={label}>
    <div className="oc-toggle-knob" />
  </div>
);

export const Empty = ({ icon = "faInbox", title, children }) => (
  <div className="oc-empty">
    <Fa i={icon} className="oc-empty-icon" />
    <div className="oc-empty-title">{title}</div>
    {children ? <div className="oc-empty-sub">{children}</div> : null}
  </div>
);

export const Pivot = ({ tabs, value, onChange }) => (
  <div className="oc-pivot">
    {tabs.map(([id, label, icon]) => (
      <div key={id} className="oc-pivot-item" data-active={value === id} onClick={() => onChange(id)}>
        {icon ? <Fa i={icon} /> : null}
        <span>{label}</span>
      </div>
    ))}
  </div>
);

// Context menu: items = [{ label, icon, onClick, disabled, sep }]. Closes on any outside click.
export const useContextMenu = () => {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);
  const open = (e, items) => {
    e.preventDefault();
    e.stopPropagation();
    const host = e.currentTarget.closest(".oc-app");
    const r = host ? host.getBoundingClientRect() : { left: 0, top: 0, width: 9999, height: 9999 };
    setMenu({ x: Math.min(e.clientX - r.left, r.width - 210), y: Math.min(e.clientY - r.top, r.height - items.length * 30 - 12), items });
  };
  const node = menu ? (
    <div className="oc-menu" style={{ left: Math.max(4, menu.x), top: Math.max(4, menu.y) }} onMouseDown={(e) => e.stopPropagation()}>
      {menu.items.map((it, i) =>
        it.sep ? (
          <div key={i} className="oc-menu-sep" />
        ) : (
          <div
            key={i}
            className="oc-menu-item"
            data-disabled={!!it.disabled}
            onClick={() => {
              if (it.disabled) return;
              setMenu(null);
              it.onClick && it.onClick();
            }}
          >
            <span className="oc-menu-icon">{it.icon ? <Fa i={it.icon} /> : null}</span>
            {it.label}
          </div>
        ),
      )}
    </div>
  ) : null;
  return [open, node];
};

// Modal dialog inside the app (never a browser popup).
export const Dialog = ({ title, children, onClose, actions }) => (
  <div className="oc-dialog-wrap" onMouseDown={onClose}>
    <div className="oc-dialog" onMouseDown={(e) => e.stopPropagation()}>
      <div className="oc-dialog-title">{title}</div>
      <div className="oc-dialog-body">{children}</div>
      {actions ? <div className="oc-dialog-actions">{actions}</div> : null}
    </div>
  </div>
);

// Short-lived in-app notice, e.g. "Links are disabled in this training desktop."
export const useNotice = () => {
  const [text, setText] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (t) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2600);
  };
  return [show, text ? <div className="oc-notice">{text}</div> : null];
};

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

// Text area / input whose value is committed to the world on blur (not per keystroke).
export const useDraft = (value, key) => {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [key]);
  useEffect(() => {
    if (!dirty) setDraft(value);
  }, [value]);
  return [draft, (v) => (setDraft(v), setDirty(true)), dirty, () => setDirty(false)];
};
