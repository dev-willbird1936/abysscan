import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useStore } from "react-redux";
import "./utils/i18n";
import "./index.css";
import "./components/ocean/ocean.scss";

import ActMenu from "./components/menu";
import { DesktopApp, SidePane, StartMenu, WidPane } from "./components/start";
import {
  Banners,
  NotificationCentre,
  Switcher,
  TaskView,
} from "./components/ocean";
import { Creature } from "./components/ocean/creature";
import { Dialogs } from "./components/ocean/programs";
import Taskbar from "./components/taskbar";
import {
  Background,
  BootScreen,
  LockScreen,
  OffScreen,
  SleepScreen,
} from "./containers/background";
import { AppWindows } from "./containers/applications";
import { showDesktop } from "./actions";
import { emit, toggleOverlay, setPhase, useWorld } from "./utils/ocean";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="bsod">
      <h1>:(</h1>
      <h2>The training desktop ran into a problem.</h2>
      <p>Stop code: {String(error && error.message)}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

// Flyouts close on any click outside them; each declares its prefix in --prefix or data-action.
const FLYOUTS = [
  ["START", "STARTHID"],
  ["PANE", "PANEHIDE"],
  ["WIDG", "WIDGHIDE"],
  ["MENU", "MENUHIDE"],
];

const prefixOf = (target) => {
  let action = "";
  try {
    action = (target.dataset && target.dataset.action) || "";
  } catch (err) {}
  const css = target instanceof Element ? getComputedStyle(target).getPropertyValue("--prefix").trim() : "";
  return [action, css];
};

const topWindowId = (world) => {
  if (world.focusedId) return world.focusedId;
  const order = world.order || [];
  return order.length ? order[order.length - 1] : null;
};

function useShortcuts(world) {
  const dispatch = useDispatch();
  useEffect(() => {
    const onKey = (e) => {
      if (world.phase != "desktop") return;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const top = topWindowId(world);
      const win = world.windows.find((w) => w.id == top);
      let handled = true;
      // Ctrl+Shift+Esc opens Task Manager, as on Windows (the guide offers it to find a running program).
      if (e.ctrlKey && e.shiftKey && key == "escape") emit({ kind: "open-app", app: "taskmanager" });
      else if (ctrl && key == "escape") dispatch({ type: "STARTOGG" });
      else if (e.altKey && key == "s") dispatch({ type: "STARTSRC" });
      else if ((ctrl || e.altKey) && (key == "tab" || key == "`")) {
        if (!world.overlays.switcher) toggleOverlay("switcher", true);
        else window.dispatchEvent(new CustomEvent("ocean-switcher-step", { detail: e.shiftKey ? -1 : 1 }));
      } else if (ctrl && key == "arrowup") toggleOverlay("taskView", !world.overlays.taskView);
      else if ((ctrl || e.altKey) && key == "d") showDesktop();
      else if ((ctrl || e.altKey) && key == "l") setPhase("lock");
      else if (ctrl && key == "q" && win) emit({ kind: "close-window", id: win.id });
      else if (ctrl && key == "m" && win) emit({ kind: "minimize", id: win.id });
      else if (((e.altKey && key == "enter") || key == "f11") && win)
        emit({ kind: win.mode == "fullscreen" ? "restore" : "fullscreen", id: win.id });
      else if (key == "escape") {
        if (win && win.mode == "fullscreen") emit({ kind: "restore", id: win.id });
        else if (world.overlays.taskView) toggleOverlay("taskView", false);
        else if (world.overlays.centre) toggleOverlay("centre", false);
        else handled = false;
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [world, dispatch]);
}

function App() {
  const world = useWorld();
  const dispatch = useDispatch();
  const store = useStore();
  const fullscreen = world.windows.some((w) => w.mode == "fullscreen" && (world.installed.includes(w.app) || w.app == "program"));
  useShortcuts(world);

  useEffect(() => {
    const afterMath = (event) => {
      const [action, css] = prefixOf(event.target);
      const state = store.getState();
      for (const [prefix, hide] of FLYOUTS) {
        if (!action.startsWith(prefix) && !css.startsWith(prefix)) dispatch({ type: hide });
      }
      const w = state.world;
      if (w.overlays.centre && !action.startsWith("CENTRE") && !css.startsWith("CENTRE"))
        toggleOverlay("centre", false);
    };
    const onContext = (e) => {
      if (e.defaultPrevented) return;
      afterMath(e);
      e.preventDefault();
      const target = e.target;
      if (target.dataset && target.dataset.menu != null) {
        dispatch({
          type: "MENUSHOW",
          payload: {
            top: e.clientY,
            left: e.clientX,
            menu: target.dataset.menu,
            dataset: { ...target.dataset },
          },
        });
      }
    };
    window.addEventListener("click", afterMath);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("click", afterMath);
      window.removeEventListener("contextmenu", onContext);
    };
  }, [dispatch, store]);

  useEffect(() => {
    document.body.dataset.fullscreen = fullscreen;
  }, [fullscreen]);

  return (
    <div className="App" data-phase={world.phase}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {world.phase == "boot" ? <BootScreen /> : null}
        {world.phase == "lock" ? <LockScreen /> : null}
        {world.phase == "sleep" ? <SleepScreen /> : null}
        {world.phase == "off" ? <OffScreen /> : null}
        <div className="appwrap" inert={world.phase != "desktop" ? "" : undefined}>
          <Background />
          <Creature />
          <div className="desktop" data-menu="desk">
            <DesktopApp />
            <AppWindows />
            <StartMenu />
            <SidePane />
            <WidPane />
            <NotificationCentre />
          </div>
          <Taskbar />
          <TaskView />
          <Switcher />
          <Banners />
          <Dialogs />
          <ActMenu />
        </div>
      </ErrorBoundary>
    </div>
  );
}

export default App;
