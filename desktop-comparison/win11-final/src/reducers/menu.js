// Context menus. `action` names in lowerCamel call src/actions (payload, menuState);
// UPPERCASE names are dispatched as Redux actions. The `taskapp` menu is built per app in
// components/menu.
const defState = {
  hide: true,
  top: 80,
  left: 360,
  opts: "desk",
  dataset: null,
  data: {
    desk: { width: "310px", secwid: "200px" },
    task: { width: "220px", secwid: "120px", ispace: false },
    file: { width: "240px", secwid: "160px" },
    bin: { width: "240px", secwid: "160px" },
    taskapp: { width: "240px", secwid: "160px" },
  },
  menus: {
    desk: [
      {
        name: "View",
        icon: "view",
        type: "svg",
        opts: [
          { name: "Large icons", action: "changeIconSize", payload: "large" },
          { name: "Medium icons", action: "changeIconSize", payload: "medium" },
          { name: "Small icons", action: "changeIconSize", payload: "small", dot: true },
          { type: "hr" },
          { name: "Show desktop icons", action: "deskHide", check: true },
        ],
      },
      {
        name: "Sort by",
        icon: "sort",
        type: "svg",
        opts: [
          { name: "Name", action: "changeSort", payload: "name" },
          { name: "Size", action: "changeSort", payload: "size" },
          { name: "Date modified", action: "changeSort", payload: "date" },
        ],
      },
      { name: "Refresh", action: "refresh", type: "svg", icon: "refresh" },
      { type: "hr" },
      {
        name: "New",
        icon: "New",
        type: "svg",
        opts: [
          { name: "Folder", action: "newItem", payload: "folder", icon: "win/folder-sm" },
          { name: "Text Document", action: "newItem", payload: "text", icon: "notepad" },
        ],
      },
      { type: "hr" },
      { name: "Display settings", icon: "display", type: "svg", action: "displaySettings" },
      { name: "Personalize", icon: "personalize", type: "svg", action: "personalize" },
      { type: "hr" },
      { name: "Next desktop background", action: "nextWallpaper" },
      { name: "Open in Terminal", icon: "terminal", type: "svg", action: "terminalHere" },
    ],
    task: [
      {
        name: "Align icons",
        opts: [
          { name: "Left", action: "changeTaskAlign", payload: "left" },
          { name: "Center", action: "changeTaskAlign", payload: "center", dot: true },
        ],
      },
      { type: "hr" },
      {
        name: "Search",
        opts: [
          { name: "Show", action: "TASKSRCH", payload: true },
          { name: "Hide", action: "TASKSRCH", payload: false },
        ],
      },
      {
        name: "Widgets",
        opts: [
          { name: "Show", action: "TASKWIDG", payload: true },
          { name: "Hide", action: "TASKWIDG", payload: false },
        ],
      },
      { type: "hr" },
      { name: "Task view", action: "taskView" },
      { name: "Show desktop", action: "showDesktop" },
    ],
    file: [
      { name: "Open", action: "fileOpen" },
      { type: "hr" },
      { name: "Rename", action: "fileRename", icon: "rename", ui: true },
      { name: "Delete", action: "fileTrash", icon: "dustbin", ui: true },
      { type: "hr" },
      { name: "Properties", dsb: true },
    ],
    bin: [
      { name: "Open", action: "binOpen" },
      { name: "Empty Recycle Bin", action: "binEmpty", icon: "dustbin", ui: true },
    ],
    taskapp: [],
  },
};

const menusReducer = (state = defState, action) => {
  if (action.type == "MENUHIDE") {
    return state.hide ? state : { ...state, hide: true };
  } else if (action.type == "MENUSHOW") {
    const p = action.payload || {};
    return {
      ...state,
      hide: false,
      top: p.top || 272,
      left: p.left || 430,
      opts: p.menu in state.menus ? p.menu : "desk",
      dataset: p.dataset || null,
    };
  } else if (action.type == "MENUCHNG") {
    return { ...action.payload };
  }
  return state;
};

export default menusReducer;
