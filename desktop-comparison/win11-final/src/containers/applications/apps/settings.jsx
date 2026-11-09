import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { installedApps } from "../../../utils";
import { Icon } from "../../../utils/general";
import { getApp } from "../../../ocean/appRegistry";
import { cssUrl, DEPTH_WALLPAPERS, initials, setSys, useWorld, wallpaperOf } from "../../../utils/ocean";
import { ACCENTS } from "../../../ocean/adapter";
import "./assets/settings.scss";
import "../../../components/ocean/settings.scss";
import data from "./assets/settingsData.json";

const PAGES = [
  "System",
  "Bluetooth & devices",
  "Network & internet",
  "Personalisation",
  "Apps",
  "Accounts",
  "Time & language",
  "Accessibility",
  "Privacy & security",
  "Windows Update",
];

// Glyph from the SettingsIcons font, looked up by tile name in the upstream data file.
const glyph = (name) => {
  for (const page of Object.values(data)) {
    const tile = page.find((t) => t.name == name && t.icon);
    if (tile) return tile.icon;
  }
  return "";
};

const Toggle = ({ on, onChange, testid }) => (
  <button className="oceanToggle" data-on={!!on} data-testid={testid} onClick={() => onChange(!on)} role="switch" aria-checked={!!on}>
    <span className="toggleLabel">{on ? "On" : "Off"}</span>
    <span className="toggleTrack">
      <span className="toggleKnob"></span>
    </span>
  </button>
);

const Row = ({ name, desc, icon, children }) => (
  <div className="tile oceanRow">
    <span className="settingsIcon">{icon || glyph(name)}</span>
    <div className="tile_content">
      <p>{name}</p>
      {desc ? <p className="tile_desc">{desc}</p> : null}
    </div>
    {children ? <div className="rowControl">{children}</div> : null}
  </div>
);

const Slider = ({ value, min, max, onCommit, testid }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type="range"
      className="oceanSlider"
      data-testid={testid}
      min={min}
      max={max}
      value={v}
      onChange={(e) => setV(Number(e.target.value))}
      onPointerUp={() => onCommit(v)}
      onKeyUp={() => onCommit(v)}
    />
  );
};

const UpdatePage = ({ world }) => {
  const [status, setStatus] = useState("idle");
  const [checked, setChecked] = useState(null);
  const check = () => {
    setStatus("checking");
    setTimeout(() => {
      setStatus("idle");
      setChecked(new Date());
    }, 1800);
  };
  return (
    <>
      <div className="updateTop">
        <div className="left">
          <img src="img/settings/update.png" width={90} alt="" />
          <div>
            <h2>{status == "checking" ? "Checking for updates…" : "You're up to date"}</h2>
            <p>
              Last checked:{" "}
              {checked ? checked.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Today"}
            </p>
          </div>
        </div>
        <div className="right">
          <button className="btn" data-testid="check-updates" onClick={check} disabled={status == "checking"}>
            {status == "checking" ? "Checking…" : "Check for updates"}
          </button>
        </div>
      </div>
      {status == "checking" ? <div className="oceanProgress"><span></span></div> : null}
      <div className="subHeading">More options</div>
      <Row name="Pause updates" desc="Updates are managed by Northwind IT" />
      <Row name="Update history" desc="2026-10 Cumulative update for Windows (training build) — installed" />
      <Row name="Advanced options" desc="Delivery optimisation, optional updates, active hours" />
      <div className="updateNote">
        Real updates only come from Windows Update in Settings. A web page or an email that says your PC needs an
        update is a warning sign.
      </div>
    </>
  );
};

// Fictional networks for the Wi-Fi name (sys.wifiNetwork, shared with macOS Control Center).
const WIFI_NETWORKS = ["NORTHWIND-CORP", "Northwind-Guest", "Harbor Cafe"];

const PageBody = ({ page, world, win }) => {
  const sys = world.sys;
  const [customUrl, setCustomUrl] = useState(sys.wallpaperUrl || "");
  // Same rule as the world model: same-origin absolute path or inline image only.
  const customOk = !customUrl.trim() || (/^(\/(?!\/)[A-Za-z0-9._~\/-]{1,200}|data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+)$/.test(customUrl.trim()) && !customUrl.includes(".."));
  switch (page) {
    case "System":
      return (
        <>
          <div className="sysTop">
            <div className="left">
              <div className="device_img oceanDevice" style={{ backgroundImage: cssUrl(wallpaperOf(sys)) }}></div>
              <div className="column_device">
                <p className="device_name">NORTHWIND-LT042</p>
                <p className="device_model">Training laptop (fictional)</p>
              </div>
            </div>
          </div>
          <Row name="Display" desc="Brightness">
            <Slider value={sys.brightness} min={20} max={100} onCommit={(v) => setSys({ brightness: v })} testid="settings-brightness" />
          </Row>
          <Row name="Night light" desc="Warmer colours to help you sleep" icon={"\uF08C"}>
            <Toggle on={sys.nightLight} onChange={(v) => setSys({ nightLight: v })} />
          </Row>
          <Row name="Sound" desc={sys.muted ? "Muted" : `Volume ${sys.volume}`}>
            <Slider value={sys.volume} min={0} max={100} onCommit={(v) => setSys({ volume: v, muted: false })} />
          </Row>
          <Row name="Focus Assist" desc="Hide notification banners">
            <Toggle on={sys.focus} onChange={(v) => setSys({ focus: v })} />
          </Row>
          <Row name="Power & battery" desc={`Battery ${sys.battery}% · battery saver`}>
            <Toggle on={sys.lowPower} onChange={(v) => setSys({ lowPower: v })} />
          </Row>
          <Row name="Battery percentage" desc="Show the battery percentage on the taskbar">
            <Toggle on={!!sys.showBatteryPercent} onChange={(v) => setSys({ showBatteryPercent: v })} testid="settings-battery-percent" />
          </Row>
          <Row name="About" desc="Windows 11 Pro · Training build · Everything on this PC is fictional" />
        </>
      );
    case "Bluetooth & devices":
      return (
        <>
          <Row name="Bluetooth" desc={sys.bluetooth ? "Discoverable as NORTHWIND-LT042" : "Off"}>
            <Toggle on={sys.bluetooth} onChange={(v) => setSys({ bluetooth: v })} testid="settings-bluetooth" />
          </Row>
          <Row name="Devices" desc="Mouse, keyboard, pen, audio, displays and docks" />
          <Row name="Printers & scanners" desc="Northwind-Floor3 (fictional)" />
        </>
      );
    case "Network & internet":
      return (
        <>
          <div className="netTop">
            <div>
              <img src="img/settings/wifi.png" alt="" height={100} />
              <div>
                <h2 className="font-medium text-lg">Wi-Fi</h2>
                <p>{sys.wifi ? `Connected to ${sys.wifiNetwork || "Wi-Fi"}, secured` : "Not connected"}</p>
              </div>
            </div>
          </div>
          <Row name="WiFi" desc="Connect, manage known networks">
            <Toggle on={sys.wifi} onChange={(v) => setSys({ wifi: v })} testid="settings-wifi" />
          </Row>
          <Row name="Network" desc="Known networks on this training PC" icon={glyph("WiFi")}>
            <select className="oceanInput" value={sys.wifiNetwork || ""} disabled={!sys.wifi} onChange={(e) => setSys({ wifiNetwork: e.target.value })} data-testid="settings-wifi-network">
              {[...new Set([sys.wifiNetwork, ...WIFI_NETWORKS].filter(Boolean))].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Row>
          <Row name="VPN" desc="Northwind VPN (managed)" />
          <Row name="Proxy" desc="Managed by your organisation" />
        </>
      );
    case "Personalisation":
      return (
        <>
          <div className="personaliseTop">
            <div className="mainImg oceanPreview" style={{ backgroundImage: cssUrl(wallpaperOf(sys)) }}>
              <div className="previewWin" />
              <div className="previewBar" />
            </div>
          </div>
          <div className="subHeading">Background</div>
          <div className="wallGrid" data-testid="wallpaper-grid">
            {DEPTH_WALLPAPERS.map((w) => (
              <button
                key={w.id}
                className="wallPick"
                data-selected={!sys.wallpaperUrl && sys.wallpaper == w.id}
                data-testid={"wall-" + w.id}
                onClick={() => setSys({ wallpaper: w.id, wallpaperUrl: null })}
              >
                <span style={{ backgroundImage: cssUrl(wallpaperOf({ ...sys, wallpaperUrl: null, wallpaper: w.id })) }}></span>
                <em>{w.name}</em>
              </button>
            ))}
          </div>
          <Row
            name="Custom picture"
            desc={customOk ? "Same-origin path (/…) or data:image URL from the training backend" : "Only same-origin paths (/…) or data:image URLs are allowed"}
          >
            <input className="oceanInput" value={customUrl} placeholder="/api/desktop/wallpaper.jpg" onChange={(e) => setCustomUrl(e.target.value)} />
            <button className="oceanBtn" disabled={!customOk || !customUrl.trim()} onClick={() => setSys({ wallpaperUrl: customUrl.trim() })}>
              Apply
            </button>
            {sys.wallpaperUrl ? (
              <button className="oceanBtn" onClick={() => setSys({ wallpaperUrl: null })}>
                Clear
              </button>
            ) : null}
          </Row>
          <div className="subHeading">Colours</div>
          <Row name="Themes" desc="Choose your mode">
            <div className="segmented">
              {["light", "dark"].map((t) => (
                <button key={t} data-on={sys.theme == t} data-testid={"theme-" + t} onClick={() => setSys({ theme: t })}>
                  {t == "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </Row>
          <Row name="Colours" desc="Accent colour">
            <div className="swatches" data-testid="accent-swatches">
              {Object.keys(ACCENTS).map((a) => (
                <button
                  key={a}
                  className="swatch"
                  title={a}
                  data-testid={"accent-" + a}
                  data-on={sys.accent == a}
                  style={{ background: ACCENTS[a][sys.theme == "dark" ? 1 : 0] }}
                  onClick={() => setSys({ accent: a })}
                />
              ))}
            </div>
          </Row>
          <Row name="Lock screen" desc="Uses your desktop background" />
          <Row name="Taskbar behaviours" desc="Automatically hide the taskbar">
            <Toggle on={!!sys.dockAutohide} onChange={(v) => setSys({ dockAutohide: v })} testid="settings-taskbar-autohide" />
          </Row>
        </>
      );
    case "Apps":
      return (
        <>
          {/* Settings > Apps > Startup: what starts when the user signs in (world.data.startup, shared with macOS Login Items). */}
          <div className="subHeading" data-testid="settings-startup">Startup</div>
          <Row name="Startup apps" desc="Apps can be configured to start when you sign in. Turn off what you do not recognise." />
          {(world.data.startup || []).length ? (
            world.data.startup.map((item) => (
              <div key={item.id} className="tile oceanRow" data-testid="settings-startup-item" data-ocean-key={"startup:" + item.name} title={item.location || ""}>
                <div className="tile_content">
                  <p>{item.name}</p>
                  <p className="tile_desc">{item.publisher || "Unknown publisher"} · {item.command}</p>
                </div>
                <span className="tile_desc">On · High impact</span>
              </div>
            ))
          ) : (
            <Row name="No startup apps" desc="Nothing extra starts when you sign in." />
          )}
          <div className="subHeading">Installed apps</div>
          {installedApps(world).map((app) => (
            <div key={app.id} className="tile oceanRow">
              <span className="settingsIcon appGlyph">
                <Icon src={app.icon} width={22} />
              </span>
              <div className="tile_content">
                <p>{app.name}</p>
                <p className="tile_desc">Managed by your organisation</p>
              </div>
            </div>
          ))}
        </>
      );
    case "Accounts":
      return (
        <>
          <div className="accountsTop">
            <div className="accountAvatar big">{initials(world.user.name)}</div>
            <div>
              <p data-testid="account-name">{world.user.name}</p>
              <p>{world.user.email}</p>
              <p>Local account · Administrator</p>
            </div>
          </div>
          <Row name="Your info" desc={`Signed in as ${world.user.short}`} />
          <Row name="Sign-in options" desc="Training account: no password, PIN or face sign-in" />
          <Row name="Email & accounts" desc={world.user.email} />
          <Row name="Access work or school" desc="Northwind (fictional organisation)" />
        </>
      );
    case "Time & language":
      return (
        <>
          <div className="timeTop">
            <h1>{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</h1>
          </div>
          <Row name="Date & time" desc="Set automatically" />
          <Row name="Language & region" desc="English (United States) · the training desktop is English only" />
        </>
      );
    case "Accessibility":
      return (
        <>
          <Row name="Visual effects" desc="Animation effects">
            <Toggle on={!sys.reduceMotion} onChange={(v) => setSys({ reduceMotion: !v })} />
          </Row>
          <Row name="Transparency effects" desc="Acrylic and Mica surfaces" icon={glyph("Visual effects")}>
            <Toggle on={!sys.reduceTransparency} onChange={(v) => setSys({ reduceTransparency: !v })} />
          </Row>
          <Row name="Contrast themes" desc="Higher contrast for text and edges">
            <Toggle on={!!sys.increaseContrast} onChange={(v) => setSys({ increaseContrast: v })} testid="settings-contrast" />
          </Row>
          <Row name="Text size" desc="100%" />
        </>
      );
    case "Privacy & security":
      return (
        <>
          <Row name="Windows Security" desc="Antivirus, firewall and device protection (simulated)" />
          <div className="subHeading">Windows permissions</div>
          <Row name="General" desc="Let apps show me personalised ads by using my advertising ID">
            <Toggle on={!!sys.personalizedAds} onChange={(v) => setSys({ personalizedAds: v })} testid="settings-ads" />
          </Row>
          <Row name="Diagnostics & feedback" desc="Send optional diagnostic data" icon={glyph("Windows Security")}>
            <Toggle on={!!sys.shareAnalytics} onChange={(v) => setSys({ shareAnalytics: v })} testid="settings-analytics" />
          </Row>
          <div className="subHeading">App permissions</div>
          <Row name="Location" desc="Location services (simulated; no real location is read)">
            <Toggle on={!!sys.locationServices} onChange={(v) => setSys({ locationServices: v })} testid="settings-location" />
          </Row>
          <Row name="Camera" desc="Off · not available on the training desktop" />
          <Row name="Microphone" desc="Off · not available on the training desktop" />
          <Row name="Notification" desc="Apps can show notifications" />
        </>
      );
    case "Windows Update": {
      // The canonical `updates` app (win-apps) when registered; otherwise the built-in page.
      const updates = getApp("updates");
      return updates && updates.component ? (
        <div className="embeddedUpdates">
          <updates.component win={{ ...win, app: "updates" }} />
        </div>
      ) : (
        <UpdatePage world={world} />
      );
    }
    default:
      return null;
  }
};

// Frame-less Settings content; the shell window frame (components/ocean/windows.jsx) draws the
// title bar. The win-apps registry renders it as the `settings` app.
export const SettingsContent = ({ win }) => {
  const request = useSelector((state) => state.apps);
  const world = useWorld();
  // A world pane (payload { pane }, shared with macOS) picks the page: start-up items live under Apps on Windows 11.
  const panePage = { startup: "Apps", privacy: "Privacy & security", network: "Network & internet" }[(win && win.payload && win.payload.pane) || ""];
  const [page, setPage] = useState(panePage || request.settingsPage || "System");
  const [nav, setNav] = useState("");

  useEffect(() => {
    if (panePage) setPage(panePage);
  }, [panePage]);

  useEffect(() => {
    if (request.settingsPage && PAGES.includes(request.settingsPage)) setPage(request.settingsPage);
  }, [request.settingsSeq]);

  const visiblePages = PAGES.filter((p) => p != "Windows Update" || world.installed.includes("updates"));

  return (
    <div className="settingsApp oceanSettings" data-testid="settings-window">
      <div className="restWindow flex-grow flex flex-col">
        <nav className={nav}>
          <div className="nav_top">
            <div className="account" onClick={() => setPage("Accounts")}>
              <div className="accountAvatar">{initials(world.user.name)}</div>
              <div>
                <p>{world.user.name}</p>
                <p>Local Account</p>
              </div>
            </div>
          </div>
          <div className="nav_bottom win11Scroll">
            {visiblePages.map((e) => (
              <div
                key={e}
                className={`navLink ${e === page ? "selected" : ""}`}
                data-testid={"settings-nav-" + e.split(" ")[0].toLowerCase()}
                onClick={() => {
                  setPage(e);
                  setNav("");
                }}
              >
                <img src={`img/settings/${e}.webp`} alt="" height={16} width={16} />
                {e}
              </div>
            ))}
            <div className="marker"></div>
          </div>
        </nav>
        <main key={page}>
          <h1>{page}</h1>
          <div className="tilesCont win11Scroll">
            <PageBody page={page} world={world} win={win} />
          </div>
        </main>
        <div className="navMenuBtn" onClick={() => setNav(nav ? "" : "open")}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 48 48" width={24} height={24}>
            <path d="M5.5 9a1.5 1.5 0 1 0 0 3h37a1.5 1.5 0 1 0 0-3h-37zm0 13.5a1.5 1.5 0 1 0 0 3h37a1.5 1.5 0 1 0 0-3h-37zm0 13.5a1.5 1.5 0 1 0 0 3h37a1.5 1.5 0 1 0 0-3h-37z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
