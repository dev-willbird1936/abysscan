import React, { useEffect, useState } from "react";
import { AvatarFace } from "../../components/ocean/avatar";
import Battery from "../../components/shared/Battery";
import { Icon } from "../../utils/general";
import { cssUrl, setPhase, useWorld, wallpaperOf } from "../../utils/ocean";
import { playSound } from "../../utils/sounds";
import "./back.scss";

export const Background = () => {
  const sys = useWorld().sys;
  return (
    <div className="background" style={{ backgroundImage: cssUrl(wallpaperOf(sys)) }}></div>
  );
};

const useClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

// Boot: logo + spinner, then hands over to the lock screen. The parent may drive phase itself.
export const BootScreen = () => {
  useEffect(() => {
    const timer = setTimeout(() => setPhase("lock"), 3200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bootscreen" data-testid="boot-screen">
      <div>
        <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Starting">
          <defs>
            <linearGradient id="bootPane" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4cc2ff" />
              <stop offset="1" stopColor="#0067c0" />
            </linearGradient>
          </defs>
          {[[0, 0], [62, 0], [0, 62], [62, 62]].map(([x, y]) => (
            <rect key={x + "-" + y} x={x} y={y} width="58" height="58" rx="4" fill="url(#bootPane)" />
          ))}
        </svg>
        <div className="mt-48" id="loader">
          <svg className="progressRing" height={48} width={48} viewBox="0 0 16 16">
            <circle cx="8px" cy="8px" r="7px"></circle>
          </svg>
        </div>
      </div>
    </div>
  );
};

export const LockScreen = () => {
  const world = useWorld();
  const [reveal, setReveal] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const now = useClock();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key == "Enter" && reveal) signIn();
      else setReveal(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const signIn = () => {
    if (unlocking) return;
    setUnlocking(true);
    playSound("unlock", world.sys);
    setTimeout(() => setPhase("desktop"), 550);
  };

  return (
    <div
      className="lockscreen"
      data-testid="lock-screen"
      data-unlock={unlocking}
      data-blur={reveal}
      style={{ backgroundImage: cssUrl(wallpaperOf(world.sys)) }}
      onClick={() => setReveal(true)}
    >
      <div className="lockShade"></div>
      <div className="splashScreen" data-faded={reveal}>
        <div className="lockTime">
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}
        </div>
        <div className="lockDate">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>
      <div className="lockHint" data-faded={reveal}>
        Click or press any key to sign in
      </div>
      <div className="fadeinScreen" data-faded={!reveal} data-unlock={unlocking}>
        <div
          className="lockUser"
          data-testid="lock-user"
          onClick={(e) => {
            e.stopPropagation();
            signIn();
          }}
        >
          <div className="lockAvatar">
            <AvatarFace user={world.user} />
          </div>
          <div className="mt-4 text-2xl font-medium text-gray-100">{world.user.name}</div>
          <div className="text-xs text-gray-300 mt-1">{world.user.email}</div>
        </div>
        <button
          className="signInBtn mt-6"
          onClick={(e) => {
            e.stopPropagation();
            signIn();
          }}
        >
          Sign in
        </button>
        <div className="lockNote">Fictional training account. No password is needed.</div>
      </div>
      <div className="bottomInfo flex">
        <Icon className={"mx-2" + (world.sys.wifi ? "" : " opacity-40")} src="wifi" ui width={16} invert />
        <Battery invert />
      </div>
    </div>
  );
};

export const SleepScreen = () => (
  <div className="powerscreen" data-testid="sleep-screen" onClick={() => setPhase("lock")}>
    <div className="powerHint">Sleeping. Click to wake.</div>
  </div>
);

export const OffScreen = () => (
  <div className="powerscreen" data-testid="off-screen">
    <button className="powerBtn" onClick={() => setPhase("boot")} aria-label="Power on">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <path
          d="M8.204 4.82a.75.75 0 0 1 .634 1.36A7.51 7.51 0 0 0 4.5 12.991c0 4.148 3.358 7.51 7.499 7.51s7.499-3.362 7.499-7.51a7.51 7.51 0 0 0-4.323-6.804.75.75 0 1 1 .637-1.358 9.01 9.01 0 0 1 5.186 8.162c0 4.976-4.029 9.01-9 9.01C7.029 22 3 17.966 3 12.99a9.01 9.01 0 0 1 5.204-8.17ZM12 2.496a.75.75 0 0 1 .743.648l.007.102v7.5a.75.75 0 0 1-1.493.102l-.007-.102v-7.5a.75.75 0 0 1 .75-.75Z"
          fill="currentColor"
        />
      </svg>
    </button>
    <div className="powerHint">This PC is off. Press the power button to start it.</div>
  </div>
);
