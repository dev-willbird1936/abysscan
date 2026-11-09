// Start and the search flyout share one pane: `menu` true = Start, false = search.
const defState = {
  hide: true,
  menu: false,
  showAll: false,
  alpha: false,
  pwctrl: false,
  curAlpha: "A",
};

const menuReducer = (state = defState, action) => {
  switch (action.type) {
    case "STARTSHW":
      return { ...state, menu: true, hide: false, pwctrl: false };
    case "STARTHID":
      if (state.hide && !state.pwctrl && !state.showAll) return state;
      return { ...state, hide: true, showAll: false, pwctrl: false };
    case "STARTOGG":
      return {
        ...state,
        hide: !(state.hide || !state.menu),
        menu: true,
        alpha: false,
        curAlpha: "A",
        pwctrl: false,
        showAll: false,
      };
    case "STARTALL":
      return { ...state, showAll: !state.showAll, alpha: false, pwctrl: false, curAlpha: "A" };
    case "STARTALPHA":
      return { ...state, alpha: !state.alpha, pwctrl: false, curAlpha: action.payload || "A" };
    case "STARTSRC":
      return { ...state, hide: !(state.hide || state.menu), menu: false, pwctrl: false };
    case "SEARCHSHW":
      return { ...state, hide: false, menu: false, pwctrl: false };
    case "STARTPWC":
      return { ...state, pwctrl: !state.pwctrl };
    default:
      return state;
  }
};

export default menuReducer;
