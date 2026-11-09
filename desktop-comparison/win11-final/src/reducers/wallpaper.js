// Phase (boot/lock/desktop/sleep/off) and wallpaper now live in the world (world.phase,
// world.sys.wallpaper / wallpaperUrl). This stub keeps the upstream key for old readers.
const defState = { src: "default/img0.jpg", locked: false, booted: true };

const wallReducer = (state = defState) => state;

export default wallReducer;
