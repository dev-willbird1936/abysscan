// Canonical app definitions for the Windows shell (WORLD-CONTRACT §1, PARITY.md app matrix).
// Each component renders window *content* only and receives { win } (the world window
// object: { id, app, title, rect, mode, tile, payload }). The shell draws the frame.
// Sizes are in the virtual 1000×600 work area.
import { SettingsContent } from "../containers/applications/apps/settings";
import CalculatorApp from "../containers/applications/apps/calculator";
import BrowserApp from "../containers/applications/apps/edge";
import FilesApp from "../containers/applications/apps/explorer";
import NotepadApp from "../containers/applications/apps/notepad";
import StoreApp from "../containers/applications/apps/store";
import TaskManagerApp from "../containers/applications/apps/taskmanager";
import TerminalApp from "../containers/applications/apps/terminal";
import WhiteboardApp from "../containers/applications/apps/whiteboard";
import {
  AuthenticatorApp,
  CalendarApp,
  ChatApp,
  ClockApp,
  MailApp,
  MediaApp,
  NotesApp,
  PeopleApp,
  PhotosApp,
  StickiesApp,
  TodoApp,
  UpdatesApp,
} from "../containers/applications/apps/ocean";
import { TODO_ICON } from "../containers/applications/apps/ocean/art";

export const CANONICAL_APPS = ["files", "browser", "mail", "messages", "mfa", "updates", "settings", "terminal", "notes", "texteditor", "calendar", "reminders", "contacts", "photos", "media", "calculator", "clock", "store", "taskmanager", "stickies", "whiteboard"];

// Plain data (no components) so world-helpers can use it without rendering concerns.
// icon: Win11React asset name under public/img/icon (null when iconSrc is inline art).
// native: the Win11React app key the canonical id maps onto.
export const APP_META = {
  files: { id: "files", name: "File Explorer", icon: "explorer", native: "explorer", size: { w: 660, h: 420 } },
  browser: { id: "browser", name: "Browser", icon: "edge", native: "edge", size: { w: 740, h: 470 } },
  mail: { id: "mail", name: "Mail", icon: "mail", native: "mail", size: { w: 780, h: 470 } },
  messages: { id: "messages", name: "Chat", icon: "teams", native: "teams", size: { w: 640, h: 430 } },
  mfa: { id: "mfa", name: "Authenticator", icon: "security", native: "authenticator", size: { w: 340, h: 460 } },
  updates: { id: "updates", name: "Windows Update", icon: "update", native: "winupdate", size: { w: 620, h: 430 } },
  settings: { id: "settings", name: "Settings", icon: "settings", native: "settings", size: { w: 720, h: 470 } },
  terminal: { id: "terminal", name: "Terminal", icon: "terminal", native: "terminal", size: { w: 620, h: 380 } },
  notes: { id: "notes", name: "Notes", icon: "onenote", native: "onenote", size: { w: 680, h: 430 } },
  texteditor: { id: "texteditor", name: "Notepad", icon: "notepad", native: "notepad", size: { w: 580, h: 390 } },
  calendar: { id: "calendar", name: "Calendar", icon: "calendar", native: "calendar", size: { w: 720, h: 450 } },
  reminders: { id: "reminders", name: "To Do", icon: null, native: "todo", size: { w: 580, h: 410 } },
  contacts: { id: "contacts", name: "People", icon: "people", native: "people", size: { w: 640, h: 410 } },
  photos: { id: "photos", name: "Photos", icon: "photos", native: "photos", size: { w: 700, h: 450 } },
  media: { id: "media", name: "Media Player", icon: "groove", native: "mediaplayer", size: { w: 620, h: 410 } },
  calculator: { id: "calculator", name: "Calculator", icon: "calculator", native: "calculator", size: { w: 320, h: 470 } },
  clock: { id: "clock", name: "Clock", icon: "alarm", native: "clock", size: { w: 580, h: 410 } },
  store: { id: "store", name: "Store", icon: "store", native: "store", size: { w: 780, h: 470 } },
  taskmanager: { id: "taskmanager", name: "Task Manager", icon: "taskmanager", native: "taskmanager", size: { w: 660, h: 430 } },
  stickies: { id: "stickies", name: "Sticky Notes", icon: "notes", native: "stickynotes", size: { w: 320, h: 360 } },
  whiteboard: { id: "whiteboard", name: "Whiteboard", icon: "board", native: "whiteboard", size: { w: 700, h: 450 } },
};

const COMPONENTS = {
  files: FilesApp,
  browser: BrowserApp,
  mail: MailApp,
  messages: ChatApp,
  mfa: AuthenticatorApp,
  updates: UpdatesApp,
  settings: SettingsContent,
  terminal: TerminalApp,
  notes: NotesApp,
  texteditor: NotepadApp,
  calendar: CalendarApp,
  reminders: TodoApp,
  contacts: PeopleApp,
  photos: PhotosApp,
  media: MediaApp,
  calculator: CalculatorApp,
  clock: ClockApp,
  store: StoreApp,
  taskmanager: TaskManagerApp,
  stickies: StickiesApp,
  whiteboard: WhiteboardApp,
};

export const appRegistry = CANONICAL_APPS.map((id) => ({
  ...APP_META[id],
  iconSrc: APP_META[id].icon ? `img/icon/${APP_META[id].icon}.png` : TODO_ICON,
  component: COMPONENTS[id],
}));

export const getApp = (id) => appRegistry.find((a) => a.id === id) || null;
export const appIdFromNative = (native) => (Object.values(APP_META).find((m) => m.native === native) || {}).id || null;
