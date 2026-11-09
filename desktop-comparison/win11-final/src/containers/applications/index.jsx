// App windows are drawn by the shell frame (components/ocean/windows.jsx) from world.windows;
// window content comes from the win-apps registry (src/ocean/appRegistry.js).
// Culled upstream apps (Camera, Discord, Get Started, Spotify, About) are not imported.
import "./tabs.scss";
import "./tabs2.scss";
import "./wnapp.scss";

export { WindowLayer as AppWindows } from "../../components/ocean/windows";
