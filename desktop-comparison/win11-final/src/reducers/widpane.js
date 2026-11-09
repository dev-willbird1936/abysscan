// Widgets board visibility. Card data is offline: world.data plus fixed fictional values.
const defState = { hide: true };

const widReducer = (state = defState, action) => {
  switch (action.type) {
    case "WIDGTOGG":
      return { hide: !state.hide };
    case "WIDGHIDE":
      return state.hide ? state : { hide: true };
    default:
      return state;
  }
};

export default widReducer;
