// Legacy Win11React settings tree, kept read-only for upstream components.
// The source of truth is world.sys / world.user; the adapter refreshes this with SETTLOAD.
export const settingFromWorld = (world) => ({
  system: {
    power: { saver: { state: !!world.sys.lowPower }, battery: world.sys.battery },
    display: {
      brightness: world.sys.brightness,
      nightlight: { state: !!world.sys.nightLight },
      connect: false,
    },
  },
  person: { name: world.user.name, theme: world.sys.theme, color: world.sys.accent },
  devices: { bluetooth: !!world.sys.bluetooth },
  network: { wifi: { state: !!world.sys.wifi }, airplane: false },
  privacy: { location: { state: false } },
});

const defState = {
  system: {
    power: { saver: { state: false }, battery: 100 },
    display: { brightness: 100, nightlight: { state: false }, connect: false },
  },
  person: { name: "", theme: "light", color: "blue" },
  devices: { bluetooth: false },
  network: { wifi: { state: true }, airplane: false },
  privacy: { location: { state: false } },
};

const settReducer = (state = defState, action) =>
  action.type === "SETTLOAD" ? action.payload : state;

export default settReducer;
