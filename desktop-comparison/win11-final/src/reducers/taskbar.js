const defState = {
  align: "center",
  search: true,
  widgets: true,
};

const taskReducer = (state = defState, action) => {
  switch (action.type) {
    case "TASKCEN":
      return { ...state, align: "center" };
    case "TASKLEF":
      return { ...state, align: "left" };
    case "TASKTOG":
      return { ...state, align: state.align == "left" ? "center" : "left" };
    case "TASKSRCH":
      return { ...state, search: action.payload == "true" };
    case "TASKWIDG":
      return { ...state, widgets: action.payload == "true" };
    default:
      return state;
  }
};

export default taskReducer;
