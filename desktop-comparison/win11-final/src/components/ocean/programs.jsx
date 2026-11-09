// Program windows and OS dialogs (docs/desktop-parity/PROGRAMS.md). Both are drawn by the shared DOM module
// src/ocean/program-ui.js (vendored from ui/desktop/program-ui.js, the same code macOS uses); this file mounts them
// and turns their buttons into world intents. Nothing here keeps state the world does not have.
import React, { useEffect, useRef } from "react";
import { emit, useWorld } from "../../utils/ocean";

const UI = () => window.OceanProgramUI;

// The content of a program window: data.views[win.payload.view] at win.payload.page.
export const ProgramView = ({ win }) => {
  const world = useWorld();
  const ref = useRef(null);
  const view = world.data.views ? world.data.views[win.payload.view] : null;
  const page = win.payload.page || 0;
  const flips = win.payload.flips || [];
  const dark = world.sys.theme == "dark";
  const key = JSON.stringify([view, page, flips, dark]);
  useEffect(() => {
    UI().injectStyles(document);
  }, []);
  useEffect(() => {
    if (ref.current) UI().renderView(ref.current, { view, id: win.payload.view, page, flips, os: "windows", dark }, (action) => emit({ kind: "view-action", windowId: win.id, action }));
  }, [key, win.id]);
  return <div ref={ref} className="oceanProgram" data-testid="program-view" data-view={win.payload.view} />;
};

// What the window frame needs to know about a program window.
export const programMeta = (world, win) => {
  const view = (world.data.views || {})[win.payload && win.payload.view] || {};
  // A file's own app window (world-model docViewOf) reads like the app: "budget.xlsx - Excel", with the app's file icon.
  const docIcon = { Spreadsheet: "sheet", Presentation: "slides", Document: "word", PDF: "pdf", Browser: "web", Mail: "mail", Certificate: "certificate", Archive: "archive", Disc: "diskimage" }[view.app];
  const appLabel = docIcon ? UI().appName(view.app, "windows") : null;
  const app = appLabel && appLabel !== view.title && !/ - /.test(view.title || "") ? appLabel : null;
  return {
    name: app ? `${view.title} - ${app}` : view.title || "Program",
    layout: view.layout || "panel",
    iconSrc: UI().fileIcon(docIcon || "program", "windows"),
    component: ProgramView,
  };
};

const Dialog = ({ dialog, top }) => {
  const world = useWorld();
  const ref = useRef(null);
  const dark = world.sys.theme == "dark";
  const key = JSON.stringify([dialog, dark, world.fs.nodes[dialog.fileId], dialog.programId && (world.data.programs || {})[dialog.programId]]);
  useEffect(() => {
    if (ref.current) UI().renderDialog(ref.current, { dialog, world, os: "windows", dark }, (answer) => emit({ kind: "dialog-answer", id: dialog.id, answer }));
  }, [key]);
  const frame = UI().dialogFrame(dialog);
  return (
    <div className="oceanDialogSlot" data-corner={frame.corner} data-top={top} data-dialog={dialog.kind}>
      <div ref={ref} />
    </div>
  );
};

// world.dialogs, newest on top. The newest modal one blocks the desktop under it (a dimmed backdrop for UAC).
export const Dialogs = () => {
  const world = useWorld();
  const dialogs = world.dialogs || [];
  useEffect(() => {
    UI().injectStyles(document);
  }, []);
  if (world.phase != "desktop" || !dialogs.length) return null;
  const top = dialogs[dialogs.length - 1];
  const frame = UI().dialogFrame(top);
  return (
    <div className="oceanDialogs" data-testid="dialogs">
      {frame.modal ? <div className="oceanDialogBackdrop" data-dim={frame.dim} /> : null}
      {dialogs.map((d) => (
        <Dialog key={d.id} dialog={d} top={d === top} />
      ))}
    </div>
  );
};
