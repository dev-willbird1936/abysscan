// Whole parent-owned world (WORLD-CONTRACT §1). Initial state is the seed (a copy of
// data/desktop-world-seed.json kept in sync by src/ocean/sync-world-model.mjs). The parent or the
// standalone adapter replaces it with OCEAN_WORLD_APPLY; apps never mutate it directly.
import seed from "../containers/applications/apps/ocean/world-seed.json";

export const OCEAN_WORLD_APPLY = "OCEAN_WORLD_APPLY";

const worldReducer = (state = seed, action) =>
  action.type === OCEAN_WORLD_APPLY && action.world && action.world.v === 3 ? action.world : state;

export default worldReducer;
