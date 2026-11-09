// Desktop icons come from world.fs (folder `desktop`); this holds view options only.
const defState = {
  hide: false,
  size: 1,
  sort: "none",
  renaming: null,
};

const deskReducer = (state = defState, action) => {
  switch (action.type) {
    case "DESKHIDE":
      return { ...state, hide: true };
    case "DESKSHOW":
      return { ...state, hide: false };
    case "DESKTOGG":
      return { ...state, hide: !state.hide };
    case "DESKSIZE":
      return { ...state, size: action.payload };
    case "DESKRENAME":
      return { ...state, renaming: action.payload || null };
    case "DESKSORT":
      return { ...state, sort: action.payload || "none" };
    default:
      return state;
  }
};

export default deskReducer;
