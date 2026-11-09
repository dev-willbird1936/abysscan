// Windows are rendered from world.windows (components/ocean/windows.jsx). This key only
// remembers which Settings page the next Settings window should show.
const defState = { settingsPage: null, settingsSeq: 0 };

const appReducer = (state = defState, action) =>
  action.type == "SETTINGSPAGE"
    ? { settingsPage: action.payload, settingsSeq: state.settingsSeq + 1 }
    : state;

export default appReducer;
