import { applyMiddleware, combineReducers, createStore } from "redux";

import wallReducer from "./wallpaper";
import taskReducer from "./taskbar";
import deskReducer from "./desktop";
import menuReducer from "./startmenu";
import paneReducer from "./sidepane";
import widReducer from "./widpane";
import appReducer from "./apps";
import menusReducer from "./menu";
import globalReducer from "./globals";
import settReducer from "./settings";
import worldReducer from "./world";
import { attachStore, oceanMiddleware } from "../ocean/adapter";

const allReducers = combineReducers({
  wallpaper: wallReducer,
  taskbar: taskReducer,
  desktop: deskReducer,
  startmenu: menuReducer,
  sidepane: paneReducer,
  widpane: widReducer,
  apps: appReducer,
  menus: menusReducer,
  globals: globalReducer,
  setting: settReducer,
  world: worldReducer,
});

const store = createStore(allReducers, applyMiddleware(oceanMiddleware));

// Exposes window.__win11, window.__oceanEmit and window.OceanWorldAdapter, then applies the seed world.
attachStore(store);

export default store;
