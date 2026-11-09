// Finding creatures, families and Twilight signals for the job view. Order of FINDINGS is the design's table order
// (docs/DETONATION-DESIGN.md §5): when two findings share the deepest tier, the first row here eats the fish.
// tests/detonation-job-view.test.mjs checks names, depths and sprites against data/creatures.json.

const SHEETS = '/ui/abyss/pixel/creatures/';

export const FINDINGS = {
  'steal-credentials': { creature: 'Cookiecutter shark', label: 'Reads credentials, keys or wallets', depth: 'midnight', sprite: `${SHEETS}cookiecutter-midnight-spritesheet.png` },
  'steal-browser': { creature: 'Black swallower', label: 'Reads saved browser passwords or sessions', depth: 'midnight', sprite: `${SHEETS}black-swallower-spritesheet.png` },
  'steal-documents': { creature: 'Megamouth shark', label: 'Gathers documents into an archive', depth: 'midnight', sprite: `${SHEETS}megamouth-shark-spritesheet.png` },
  keylog: { creature: 'Barreleye', label: 'Records keystrokes', depth: 'midnight', sprite: `${SHEETS}barreleye-spritesheet.png` },
  capture: { creature: 'Telescopefish', label: 'Captures the screen, microphone or camera', depth: 'midnight', sprite: `${SHEETS}telescopefish-spritesheet.png` },
  'clipboard-swap': { creature: 'Cuckoo wrasse', label: 'Swaps clipboard contents', depth: 'midnight', sprite: `${SHEETS}cuckoo-wrasse-spritesheet.png` },
  'fake-login': { creature: 'Anglerfish', label: 'Fake login form captures typed text', depth: 'midnight', sprite: `${SHEETS}anglerfish-midnight-spritesheet.png` },
  'exfil-attempt': { creature: 'Snipe eel', label: 'Tries to send data out (blocked)', depth: 'midnight', sprite: `${SHEETS}snipe-eel-spritesheet.png` },
  'self-copy': { creature: 'Hydra', label: 'Writes a copy of itself into the user area', depth: 'midnight', sprite: `${SHEETS}hydra-spritesheet.png` },
  'privilege-escalation': { creature: 'Viperfish', label: 'Tries to gain higher privileges', depth: 'abyss', sprite: `${SHEETS}viperfish-abyss-spritesheet.png` },
  persistence: { creature: 'Tripod fish', label: 'Plants itself to run again', depth: 'abyss', sprite: `${SHEETS}tripod-fish-spritesheet.png` },
  'defence-tamper': { creature: 'Hatchetfish', label: 'Disables security tools or clears logs', depth: 'abyss', sprite: `${SHEETS}hatchetfish-spritesheet.png` },
  'traffic-redirect': { creature: 'Lanternfish', label: 'Redirects network traffic', depth: 'abyss', sprite: `${SHEETS}lanternfish-spritesheet.png` },
  'browser-hijack': { creature: 'Sea lamprey', label: 'Hijacks the browser', depth: 'abyss', sprite: `${SHEETS}sea-lamprey-spritesheet.png` },
  'remote-control': { creature: 'Siphonophore', label: 'Remote control or botnet activity', depth: 'abyss', sprite: `${SHEETS}siphonophore-abyss-spritesheet.png` },
  injection: { creature: 'Tongue-eating isopod', label: 'Injects into other processes', depth: 'abyss', sprite: `${SHEETS}isopod-host-abyss-spritesheet.png` },
  'second-stage': { creature: 'Gulper eel', label: 'Downloads or drops a second stage', depth: 'abyss', sprite: `${SHEETS}gulper-eel-spritesheet.png` },
  'resource-hijack': { creature: 'Vampire squid', label: 'Hijacks resources (fork bomb or mining)', depth: 'abyss', sprite: `${SHEETS}vampire-squid-spritesheet.png` },
  'system-wipe': { creature: 'Jörmungandr', label: 'Tries to wipe the system', depth: 'trench', sprite: `${SHEETS}jormungandr-spritesheet.png` },
  encrypt: { creature: 'Kraken', label: 'Encrypts files or drops a ransom note', depth: 'trench', sprite: `${SHEETS}kraken-spritesheet.png` },
  'destroy-files': { creature: 'Leviathan', label: 'Deletes or overwrites user files', depth: 'trench', sprite: `${SHEETS}leviathan-spritesheet.png` },
  spread: { creature: 'Hydra', label: 'Spreads to other hosts', depth: 'trench', sprite: `${SHEETS}hydra-spritesheet.png` },
  'other-harm': { creature: 'Giant squid', label: 'Unclassified harmful behaviour', depth: 'variable', sprite: `${SHEETS}giant-squid-spritesheet.png` },
};

export const FINDING_ORDER = Object.keys(FINDINGS);

// What a person should do about each finding, for the report's "What to do now" block. Plain words, one step each;
// "below" points at the indicators the report lists under the steps. Every finding needs one (job-view test).
export const ACTIONS = {
  'steal-credentials': 'Treat every password, key and token on a machine that opened it as stolen: change them and sign out other sessions.',
  'steal-browser': 'Change the passwords saved in that browser and sign out of those sites everywhere.',
  'steal-documents': 'Assume the documents it gathered have leaked, and tell the people they concern.',
  keylog: 'Assume anything typed since it ran is known. Change passwords from a different, clean device.',
  capture: 'Assume the screen, microphone or camera were recorded while it ran.',
  'clipboard-swap': 'Check recent payments and wallet transfers: the destination may have been swapped.',
  'fake-login': 'Anyone who typed into this page gave that password away. Change it and turn on two-step sign-in.',
  'exfil-attempt': 'Block the hosts below. The sandbox stopped the send; a real machine would not.',
  'self-copy': 'Delete the copies it wrote (files below) as well as the original.',
  'privilege-escalation': 'Update the machine and review its admin accounts: it tried to get admin rights.',
  persistence: 'Remove the startup entries it wrote (files below), or it runs again after the next restart.',
  'defence-tamper': 'Check that antivirus, firewall and logging are still on: it tried to turn them off.',
  'traffic-redirect': 'Reset the proxy, DNS and hosts-file settings: it tried to redirect traffic.',
  'browser-hijack': 'Reset the browser: remove unknown extensions and restore the home page and search engine.',
  'remote-control': 'Block the hosts below and take any machine that opened it off the network: it waits for remote commands.',
  injection: 'Restart the machine and run a full security scan: it put code into other programs.',
  'second-stage': 'Block the hosts below and look for the extra files it fetched or dropped.',
  'resource-hijack': 'Check processor use and running programs on any machine that opened it.',
  'system-wipe': 'Do not open it anywhere. A machine that did needs restoring from a backup taken before.',
  encrypt: 'Do not pay. Take the machine off the network and restore the files below from a backup.',
  'destroy-files': 'Restore the files below from a backup.',
  spread: 'Check the other machines on the same network: it tries to spread.',
  'other-harm': 'Do not open it outside a sandbox. Send this report to your IT or security contact.',
};

// Species with swim-cycle art (`sprite` in data/fish.json); every other species keeps the code-drawn fish.
const SWIMMERS = ['pufferfish', 'flounder', 'leafy-seadragon', 'boxfish', 'barracuda', 'mandarin-dragonet', 'flying-fish', 'pilot-fish', 'torpedo-ray', 'snake-eel', 'jack', 'coelacanth', 'lionfish', 'ribbonfish', 'remora', 'picasso-triggerfish', 'batfish', 'archerfish', 'sea-bass', 'goblin-shark', 'jawfish', 'pocket-shark', 'mackerel', 'java-rabbitfish', 'sole', 'butterflyfish', 'plaice'];
export const fishSprite = species => (SWIMMERS.includes(species) ? `/ui/abyss/pixel/fish/${species}-swim.png` : null);

export const OCTOPUS_SPRITE = `${SHEETS}octopus-sunlight-spritesheet.png`;

// The octopus sheet is drawn facing right; every other sheet faces left.
export const spriteFacesRight = url => typeof url === 'string' && url.includes('/octopus-');

export const FAMILIES = {
  disguise: { neutral: 'Disguise', attack: 'Deception' },
  access: { neutral: 'Access', attack: 'Intrusion' },
  network: { neutral: 'Network', attack: 'Coordinated abuse' },
  loader: { neutral: 'Loader', attack: 'Trusted-source compromise' },
  'data-access': { neutral: 'Data access', attack: 'Theft / surveillance' },
  'file-changes': { neutral: 'File changes', attack: 'Extortion / destruction' },
  drifter: { neutral: 'Drifter', attack: 'Drifter' },
  unclassified: { neutral: 'Unclassified', attack: 'Unclassified' },
};

export const SIGNALS = {
  'exploit-unproven': 'Exploit document, harm unproven',
  'phishing-unproven': 'Phishing link or scareware page, harm unproven',
  'anti-analysis': 'Tries to detect or evade the sandbox',
  'type-mismatch': 'File type does not match its extension',
  adware: 'Adds itself to startup or bundles extra software',
  'admin-request': 'Asks for admin rights',
  'unknown-hosts': 'Contacts unknown hosts (blocked)',
  'system-survey': 'Surveys the system',
  'hidden-commands': 'Runs system tools with hidden or encoded commands',
  obfuscated: 'Obfuscated, encoded or packed',
  unsigned: 'Unsigned or invalid signature',
  incomplete: 'Incomplete run: not every check could finish',
  'other-suspicious': 'Other suspicious behaviour',
};

const normalise = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A verdict carries the *attack* name from Midnight down (`theft-surveillance`), not the family key (`data-access`), so the
// display has to resolve both or it shows the raw slug the engine used.
const ATTACK_ALIASES = Object.fromEntries(Object.entries(FAMILIES).map(([key, entry]) => [normalise(entry.attack), entry]));

export function familyName(family, depth) {
  const key = normalise(family);
  const entry = FAMILIES[key] ?? ATTACK_ALIASES[key];
  if (!entry) return String(family ?? 'Unknown');
  return ['midnight', 'abyss', 'trench'].includes(depth) ? entry.attack : entry.neutral;
}

// Display facts for a finding event or report finding. The id picks the entry; the event's `creature` is the fallback.
export function findingFacts(finding) {
  const known = FINDINGS[finding?.id];
  return {
    id: String(finding?.id ?? ''),
    creature: known?.creature ?? String(finding?.creature ?? 'Unknown creature'),
    label: known?.label ?? String(finding?.id ?? 'Finding'),
    depth: finding?.depth ?? known?.depth ?? 'midnight',
    sprite: known ? known.sprite : null,
  };
}

export const signalLabel = id => SIGNALS[id] ?? String(id);
