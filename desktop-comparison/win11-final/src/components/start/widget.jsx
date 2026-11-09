import React from "react";
import { useSelector } from "react-redux";
import { Icon } from "../../utils/general";
import { emit, formatTime, useWorld } from "../../utils/ocean";
import "./widget.scss";

// Offline, fictional widget data. Nothing is fetched.
const FORECAST = [
  ["Mon", "☀️", 19, 11],
  ["Tue", "⛅", 18, 12],
  ["Wed", "🌧️", 15, 10],
  ["Thu", "⛅", 17, 9],
  ["Fri", "☀️", 20, 12],
];
const STOCKS = [
  ["NWND", "Northwind Traders", 142.18, 1.24],
  ["FBRK", "Fabrikam", 87.4, -0.62],
  ["CNTS", "Contoso", 311.02, 0.35],
  ["TLSP", "Tailspin Toys", 23.77, -1.8],
];

export const WidPane = () => {
  const widget = useSelector((state) => state.widpane);
  const world = useWorld();
  const now = new Date();
  const events = [...(world.data.calendar || [])].sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, 3);
  const tasks = (world.data.reminders || []).filter((r) => !r.done).slice(0, 4);

  return (
    <div className="widPaneCont" data-hide={widget.hide} style={{ "--prefix": "WIDG" }} data-testid="widgets">
      <div className="WidPane win11Scroll">
        <div className="widTime">{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
        <div className="widGrid">
          <div className="widCard widWeather">
            <div className="widHead">
              <Icon src="weather" width={16} /> <span>Weather · Harbor City</span>
            </div>
            <div className="widBig">
              <span className="text-4xl">⛅</span>
              <span className="widTemp">18°</span>
              <div className="text-xs">
                <div>Partly cloudy</div>
                <div className="opacity-70">Offline sample forecast</div>
              </div>
            </div>
            <div className="widForecast">
              {FORECAST.map(([day, icon, hi, lo]) => (
                <div key={day}>
                  <div>{day}</div>
                  <div className="text-lg">{icon}</div>
                  <div>
                    {hi}° <span className="opacity-60">{lo}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="widCard">
            <div className="widHead">
              <Icon src="calendar" width={16} /> <span>Calendar</span>
            </div>
            {events.length ? (
              events.map((e) => (
                <div key={e.id} className="widRow">
                  <span className="calBar"></span>
                  <div>
                    <div className="font-semibold">{e.title}</div>
                    <div className="opacity-70">{formatTime(e.start)}{e.location ? " · " + e.location : ""}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="opacity-60 text-xs">No events</div>
            )}
          </div>
          <div className="widCard">
            <div className="widHead">
              <Icon src="todo" width={16} /> <span>To Do</span>
            </div>
            {tasks.length ? (
              tasks.map((r) => (
                <label key={r.id} className="widRow handcr">
                  <input
                    type="checkbox"
                    checked={!!r.done}
                    onChange={() => emit({ kind: "data", store: "reminders", op: "toggle", item: { id: r.id, done: !r.done } })}
                  />
                  <div>
                    <div>{r.title}</div>
                    {r.due ? <div className="opacity-70">Due {formatTime(r.due)}</div> : null}
                  </div>
                </label>
              ))
            ) : (
              <div className="opacity-60 text-xs">All done</div>
            )}
          </div>
          <div className="widCard">
            <div className="widHead">
              <Icon fafa="faChartLine" width={14} /> <span>Watchlist · simulated</span>
            </div>
            {STOCKS.map(([sym, name, price, change]) => (
              <div key={sym} className="widStock">
                <div>
                  <div className="font-semibold">{sym}</div>
                  <div className="opacity-70">{name}</div>
                </div>
                <div className="text-right">
                  <div>{price.toFixed(2)}</div>
                  <div className={change >= 0 ? "stockUp" : "stockDown"}>
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
