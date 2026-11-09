// Strict authoring checks around the existing non-executable desktop scene language.
import { createRequire } from 'node:module';
import { compileScene, parseScene, sceneStartWorld } from './detonation/fish-scenes.mjs';

const Model = createRequire(import.meta.url)('../ui/desktop/world-model.js');
export const MAX_SOURCE_BYTES = 64 * 1024;
const RULES = {
  title: [1, Infinity, []], user: [1, Infinity, ['email']], theme: [1, 1, []], os: [1, 1, []],
  about: [0, 0, []], step: [1, Infinity, ['look']], lesson: [0, 0, []], attack: [1, 1, []],
  mail: [1, 1, ['from', 'to', 'subject', 'folder', 'attach', 'link']], text: [1, 1, ['from', 'with']],
  page: [2, 2, ['title', 'heading', 'brand', 'insecure', 'button']], file: [1, 1, []], open: [1, 1, []],
  run: [1, Infinity, ['cpu', 'mem', 'publisher']], startup: [1, Infinity, []], encrypt: [1, 2, []],
  delete: [1, 1, []], rename: [2, 2, []], homepage: [1, 1, []], wallpaper: [1, 1, []],
  notify: [2, Infinity, []], block: [1, 2, []], update: [1, Infinity, ['kb', 'size', 'status']],
};
const TEXT_COMMANDS = new Set(['about', 'step', 'lesson', 'attack', 'mail', 'text', 'page', 'file', 'wallpaper', 'notify']);
const CONFIG = new Set(['title', 'user', 'theme', 'os']);

export function compileAuthorScene(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_SOURCE_BYTES) throw new SyntaxError('Script must be text, at most 64 KiB.');
  const commands = parseScene(source, 'script');
  if (commands.length > 200) throw new SyntaxError('Script has more than 200 commands. Split it into shorter scenes.');
  const fail = (command, message) => { throw new SyntaxError(`${command.where}: ${message}`); };
  const seen = new Set();
  let started = false;
  for (const command of commands) {
    if (!Object.hasOwn(RULES, command.cmd)) fail(command, `unknown command "${command.cmd}". Use a command from the reference.`);
    const [min, max, props] = RULES[command.cmd];
    if (command.args.length < min || command.args.length > max) fail(command, `${command.cmd} has the wrong number of arguments.`);
    for (const [key, value] of command.props) {
      if (!props.includes(key)) fail(command, `unknown ${command.cmd} setting "${key}".`);
      if (!value && key !== 'insecure') fail(command, `${key} needs a value.`);
      if (key === 'insecure' && value) fail(command, 'insecure has no value.');
      if (!['attach', 'button'].includes(key) && command.props.filter(([other]) => other === key).length > 1) fail(command, `${key} is repeated.`);
    }
    if (command.text.length && !TEXT_COMMANDS.has(command.cmd)) fail(command, `${command.cmd} does not take | text.`);
    if (CONFIG.has(command.cmd)) {
      if (started) fail(command, `${command.cmd} belongs before about and the scene actions.`);
      if (seen.has(command.cmd)) fail(command, `${command.cmd} is repeated.`);
    } else started = true;
    if (['about', 'lesson'].includes(command.cmd) && seen.has(command.cmd)) fail(command, `${command.cmd} is repeated.`);
    if (seen.has('lesson') && command.cmd !== 'lesson') fail(command, 'lesson must be the last command.');
    seen.add(command.cmd);
  }
  if (!seen.has('about') || !commands.find(command => command.cmd === 'about')?.text.join('').trim()) throw new SyntaxError('Script needs about with | text.');
  if (!seen.has('step')) throw new SyntaxError('Script needs at least one step.');
  if (!seen.has('lesson')) throw new SyntaxError('Script needs a lesson with | text.');
  const { name, os, guide } = compileScene(source, { name: 'Untitled scenario' }, 'script');
  if (guide.steps.length > 30) throw new SyntaxError('Script has more than 30 steps.');
  for (const step of guide.steps) {
    if (!step.text.trim() || !step.look.trim()) throw new SyntaxError(`Step "${step.title}" needs | explanation and look guidance.`);
    if (!Object.keys(step.patch).length) throw new SyntaxError(`Step "${step.title}" changes nothing. Add a visible action.`);
  }
  const base = sceneStartWorld();
  const user = guide.setup?.user ?? base.user;
  const initialWorld = Model.createWorld(base, { user, sys: guide.setup?.sys ?? base.sys, fs: { nodes: { home: { name: user.short } } } });
  return { name, os, ...guide, initialWorld };
}

export const STARTERS = [
  { id: 'attachment', name: 'Suspicious attachment', source: `title The unexpected invoice
os windows
user Alex Rivera
  email alex@northwind.example
theme dark

about
  | An unexpected invoice arrives. This is a fictional illustration, not a real malware run.

step The message arrives
  look Mail: the unexpected invoice
  | A sender asks Alex to open an attachment. An unexpected file deserves a second check.
mail invoice
  from Accounts <accounts@billing.example>
  subject Your invoice is ready
  attach Downloads/invoice.txt
  | Training message: please review the attached invoice.
open invoice

step A program tries to call home
  look Activity Monitor or Task Manager
  | The attachment starts a suspicious process and tries to contact another computer. No program actually runs here.
run invoice-helper
  cpu 68
  mem 140
block collector.invalid 443
open taskmanager

lesson
  | Check an unexpected invoice with the sender using contact details you already trust.
` },
  { id: 'ransomware', name: 'Files become locked', source: `title A ransomware illustration
os windows
user Morgan Chen
theme dark

about
  | Watch fictional files become locked. This script changes the simulated desktop only.

step Documents become unreadable
  look Documents: the new .locked endings
  | A suspicious process locks the documents. The real files on this computer are untouched.
run locker-demo
  cpu 74
encrypt Documents .locked
open Documents

step A ransom note appears
  look The note on the desktop
  | A demand replaces the wallpaper and opens a note. Both are fictional training content.
file Desktop/READ-ME.txt
  | Training simulation. These fictional files were locked. No payment is requested.
wallpaper #4a0000
  | FICTIONAL RANSOMWARE DEMO
  | No real files changed
open Desktop/READ-ME.txt

lesson
  | Keep tested backups and install security updates. Disconnect a suspected infected device and ask for help.
` },
  { id: 'browser', name: 'Browser home page changes', source: `title An unwanted browser helper
os macos
user Jamie Brooks
theme light

about
  | A fictional browser helper changes the home page. No real browser settings change.

step The helper appears
  look Activity Monitor or Task Manager
  | The new helper runs in the background and adds a login item.
run search-helper
startup SearchHelper search-helper
open taskmanager

step The home page changes
  look The browser: a different start page
  | Opening the browser now shows the helper's search page, supplied entirely by the scene.
page unwanted https://search.example
  title Unwanted search page
  heading Your home page changed
  | Fictional training page. No external website is loaded.
homepage unwanted
open unwanted

lesson
  | Review browser extensions and login items. Remove helpers you did not choose to install.
` },
];

export const SNIPPETS = [
  ['Step', 'step A visible change\n  look Where to look on the desktop\n  | Explain what happened and why it matters.\n'],
  ['Mail', 'mail message\n  from Colleague <colleague@northwind.example>\n  subject A fictional message\n  | Training content only.\nopen message\n'],
  ['File', 'file Desktop/example.txt\n  | Fictional file content.\nopen Desktop/example.txt\n'],
  ['Web page', 'page example https://portal.example\n  title Example portal\n  | Fictional page hosted inside this desktop.\nopen example\n'],
  ['Process', 'run demo-helper\n  cpu 45\n  mem 80\nopen taskmanager\n'],
  ['Notification', 'notify files Something changed\n  | Explain the visible change.\n'],
  ['Lock files', 'encrypt Documents .locked\nopen Documents\n'],
  ['Wallpaper', 'wallpaper #173b54\n  | FICTIONAL DESKTOP\n'],
];
