import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { appById } from "../../utils/apps";
import { Icon } from "../../utils/general";
import "./menu.scss";

import * as Actions from "../../actions";

// Taskbar jump list for one app, built from world state.
const taskAppMenu = (world, apps, id) => {
  const app = appById(id);
  if (!app) return [];
  const pinned = world.dock.pins.includes(id);
  const win = world.windows.find((w) => w.app == id);
  const items = [
    { name: app.name, action: "taskOpen", icon: app.icon },
    { type: "hr" },
    pinned ? { name: "Unpin from taskbar", action: "taskUnpin" } : { name: "Pin to taskbar", action: "taskPin" },
  ];
  if (win) {
    items.push({ name: win.mode == "fullscreen" ? "Exit full screen" : "Full screen", action: "taskFullscreen" });
    items.push({ name: "Close window", action: "taskClose" });
  }
  return items;
};

export const ActMenu = () => {
  const menu = useSelector((state) => state.menus);
  const world = useSelector((state) => state.world);
  const apps = useSelector((state) => state.apps);
  const menudata = menu.data[menu.opts];
  const items =
    menu.opts == "taskapp"
      ? taskAppMenu(world, apps, menu.dataset && menu.dataset.app)
      : menu.menus[menu.opts];

  const abpos = { top: menu.top, left: menu.left };
  const ewidth = parseInt(menudata.width) || 312;
  const eheight = items.length * 30 + 12;
  const isLeft = window.innerWidth - abpos.left > ewidth * 2;
  if (window.innerWidth - abpos.left < ewidth) abpos.left = window.innerWidth - ewidth - 4;
  if (window.innerHeight - abpos.top < eheight) {
    abpos.bottom = window.innerHeight - abpos.top;
    abpos.top = null;
  }

  const dispatch = useDispatch();

  const clickDispatch = (event) => {
    event.stopPropagation();
    const action = {
      type: event.target.dataset.action,
      payload: event.target.dataset.payload,
    };

    if (action.type) {
      if (action.type != action.type.toUpperCase()) {
        Actions[action.type](action.payload, menu);
      } else {
        dispatch(action);
      }
      dispatch({ type: "MENUHIDE" });
    }
  };

  const menuobj = (data) =>
    data.map((opt, i) => {
      if (opt.type == "hr") return <div key={i} className="menuhr"></div>;
      return (
        <div
          key={i}
          className="menuopt"
          data-dsb={opt.dsb}
          onClick={clickDispatch}
          data-action={opt.action}
          data-payload={opt.payload}
        >
          {menudata.ispace != false ? (
            <div className="spcont">
              {opt.icon && opt.type == "svg" ? <Icon icon={opt.icon} width={16} /> : null}
              {opt.icon && opt.type == null ? <Icon src={opt.icon} ui={opt.ui} width={16} /> : null}
            </div>
          ) : null}
          <div className="nopt">{opt.name}</div>
          {opt.opts ? (
            <Icon className="micon rightIcon" fafa="faChevronRight" width={10} color="#999" />
          ) : null}
          {opt.dot ? <Icon className="micon dotIcon" fafa="faCircle" width={4} height={4} /> : null}
          {opt.check ? <Icon className="micon checkIcon" fafa="faCheck" width={8} height={8} /> : null}
          {opt.opts ? (
            <div className="minimenu" style={{ minWidth: menudata.secwid }}>
              {menuobj(opt.opts)}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div
      className="actmenu"
      id="actmenu"
      data-testid="context-menu"
      style={{ ...abpos, "--prefix": "MENU", width: menudata.width }}
      data-hide={menu.hide}
      data-left={isLeft}
    >
      {menuobj(items)}
    </div>
  );
};

export default ActMenu;
