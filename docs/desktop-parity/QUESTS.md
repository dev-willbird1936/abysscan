# Quests: a fish scene the trainee plays

A **quest** is a fish scene (FISH-SCENES.md) written as a short game. The trainee is someone at work in a believable job,
does one ordinary task safely, then meets the malware inside the next task, the way its real victims did. They do every step
themselves on the Windows or macOS desktop; the guide (bottom left) always says what to press next and follows them. They
**flag** what looks wrong as they go, and the end card grades the flags. `data/fish-scenes/zeus.scene` is the reference quest.
The idea, the player's journey and the threat search bar are described in [../QUEST-GAME.md](../QUEST-GAME.md).

A quest is a scene with a `story`. Everything in FISH-SCENES.md still applies; this page adds the quest commands and rules.

## 1. Shape

| Part | What the trainee sees | Commands |
|---|---|---|
| Story card | Who they are, where, what they were doing, the task count so far. Then the flag rule. | `story`, `quota` |
| A safe task | One normal round of the job, start to finish (open the mail, follow the link, sign in, approve). It teaches what normal looks like. | `mail`, `page`, `field`, `signin`, `choose`, `quota +1` |
| The lure | The next task, with the malware inside it, looking like the real thing did. | `program`, `mail … attach`, `file`, `page` |
| What it does | The OS's own reactions: the warning, a busy pointer, a start-up notice, a process. Usually nothing obvious. | `answer`, `launch`, `run`, `startup` |
| The payoff | One more task, now under attack (a tampered page, a keylogger, locked files). Quota ends one past the malware, so the trainee goes back to work. | `signout`, a changed `page`, `keylog yes` |
| The reveal | The creature animation, built from what *this* trainee did (`{captured}`) over their own windows. | `attack` |
| Grade card | Hard flags found or missed, with why; bonus soft flags; the lesson. | `flag`, `lesson` |

Four to fourteen steps. Pick the job from what really happened: Zeus hit bank clerks and small-business accounts payable;
WannaCry hit hospital admin staff; ILOVEYOU hit office mail; a cryptocurrency stealer hits someone paying a contractor in
crypto. When the record is thin, invent a plausible victim and say so in `about`.

## 2. Flags, keys and cues

Every interactive thing on both desktops carries an **ocean key** (`data-ocean-key`). Hovering one shows a small flag
button; clicking it puts a flag on it (`world.data.flags`, shared across an OS swap, kept on Back).

| Key | What it is | `flag` line |
|---|---|---|
| `app:<app>` | taskbar / Dock icon | (not flagged) |
| `mail:<id>` / `link:<id>` | a message row / the link under it | `flag hard mail <id>`, `flag hard link <id>` |
| `file:<node>` | a desktop, Finder/Explorer or attachment icon | `flag hard file Downloads/x.pdf.exe` |
| `page:<id>` | a page's content (a flag on one of its sections that is not graded itself also counts) | `flag hard page <id>` |
| `section:<page>:<n>` | a page section (n from 0; the line counts from 1) | `flag hard section <page> 1` |
| `view:<id>` | a program window as a whole (a fake scan, a ransom note, a message box) | `flag hard view <id>` |
| `line:<view>:<page>.<n>` | one `line` of a program window (a console, a request log) | `flag hard line <view> <words in the line>` |
| `field:<page>:<n>` | a box on a page | `flag hard field <page> 2` |
| `choice:<choiceId>` | a page button | `flag hard choice <page> 1` |
| `dialog:<kind>:<program>` | an OS dialog (open-warning, reputation, elevation, detected, firewall) | `flag hard dialog open-warning zeus` |
| `process:<name>` / `startup:<name>` | a Task Manager / Activity Monitor row, a start-up item | `flag hard process sdra64.exe` |
| `net` | the network blip shown while a keylogger sends keys | `flag hard net` |
| `notification:<id>` | a notification banner the scene raised (`block`, `notify`, a start-up notice) | `flag hard notice taskmanager connection blocked` (app, then words of its title); placeable while the banner shows |
| `fav:<page>` | the page's item on the browser's favourites bar (a `favorite` page) | (cue only; `when visit` glows it when no mail links there) |
| `view-btn:<action>` | a program window's button (a wizard's `next` / `done`, an Office bar's button) | (cue only: `cue view-btn:done`) |

- **hard**: part of the attack; graded. Aim for 4–8, at least 3, spread over the lure, the OS's warnings and the effect.
- **soft**: odd only because this is a training desktop (passwords in a text file on the desktop). Rewarded as a bonus.
- Each `flag` needs a `| line` that says *why* in one sentence; the grade card shows it.
- `spotted <text>` renames what the grade card counts (default "signs of the attack spotted"). A test file or a hoax has
  no attack: say what its hard flags really are, e.g. `spotted signs it was only a test` or `spotted reasons not to panic`.
- Anything else the trainee flags is listed as "part of a normal day", never penalised.

**Cue.** The guide glows the next thing to press (amber outline): the mail icon, then the message, then the link, then the
first empty box, then the button. It is worked out from the next step's `when`; a step can name its own with
`cue <key> …` (most specific first; the first one on screen glows). A thing behind another window is skipped for the next
key (the app's dock or taskbar icon, which brings it forward); a box scrolled out of its page is scrolled into view.

## 3. Sign-in pages and typing

```
page bank-login lakeshore-bank.example/business/sign-in
  title Lakeshore Bank: sign in
  field User ID = dana.okafor
  field secret Password = Ledger-2026!
  button Sign in
page inv-2209 lakeshore-bank.example/business/payments/INV-2209
  title Approve payment: INV-2209
  requires bank-login
  button Approve and pay -> paid-2209
  button Reject and hold -> held-2209
```

- `field [secret] [reveal] <label> = <value>`: a box. There is no real input. Each key the trainee presses types the next
  letter of `value` (fictional, written by the scene), so nothing real can be typed. `secret` draws dots; `secret reveal`
  draws the password in plain text (a tampered page). Fields under a `section` belong to it (an injected section's
  boxes).
- The first button submits; it is refused until every box is full. Signing in opens the page (`requires`) the trainee came for.
- `button <label> -> <page>` moves the tab to that page (a confirmation). Define the target page first.
- A step that waits on `when done <view>` closes that window when Next plays it, as Finish does; do not `close` it again later.
- Put the details somewhere the trainee can find them: `file Desktop/bank-login.txt`, then a soft flag on it. `at <x> <y>`
  places a Desktop file (1000×600 work area); keep it clear of the top-right corner, where notifications land.
- `favorite` on a page puts it on the browser's favourites bar. A quest's bar holds only its favourites, so the bar never
  gives away a later page (the injected sign-in, the confirmation). A favourite is a way in: `when visit <page>` works
  without any mail linking there, and the guide glows the favourite.
- `signin <page>` (author side) types every box and submits it; `choose <page> [n]` presses a button; `signout <page>` ends
  the session and empties the boxes, so the next visit asks again.
- A process with `keylog yes` (on `program … process` or `run`) records every key: the network blip lights up on each one
  (bottom right on Windows, under the menu bar on macOS), and each full box is stored in `world.data.captured`.
  `attack … | {captured}` turns it into the animation's beats and cards.

## 4. Following the trainee

The step waits for the trainee's own gesture, its `when`:

| when | The trainee… |
|---|---|
| `mail <id>` | opens that message |
| `visit <page>` | gets that page in the browser (or the sign-in page in front of it) |
| `choose <page> <n>` / `choose <page> any` | presses button n / any button on the page |
| `prompt <program>`, `run`, `cancel`, `detected` | opens the file (its warning shows), runs it, cancels it, the antivirus catches it |
| `remove <program>` | presses Remove (macOS: Move to Trash) in the antivirus alert |
| `open <app>`, `open settings:startup` | opens that app (Task Manager to find the process; the start-up list) |
| `page <view> <n>`, `done <view>` | turns a program window's page / finishes it |

The step's commands are what the desktop does in answer: `open` the page a link leads to, `signin` the page they filled in,
`answer run` the warning they accepted. A step can override its "Your move" line with `move <text>`. Steps the malware does
by itself have no `when` and play with Next; keep them few. `check-quest` fails a quest where fewer than 60% of the middle
steps follow the trainee.

The trainee can run ahead: doing a later step's `when` plays the steps in between. So show a dialog (a firewall alert, a
message box) in the step whose gesture causes it, not in a `when`-less step of its own, which a jump skips past. Close it
with `answer <ok|cancel>` in a later step, so it never stays on top of what that step asks the trainee to find (Back
Orifice: the firewall alert comes with the game and is answered when Task Manager opens).

## 5. Effects and sounds

Training bar → **Effects: off / low / high** (remembered per browser).

- **off**: only what the OS does: its notification, mail, warning, error and trash sounds (Windows and macOS each their own,
  synthesised, played by the parent for the OS on screen). No glow pulse, no game sounds.
- **low**: the cue pulses; game cues (flag click, a soft key tick, a brighter tick when a keylogger sends, the task chime,
  the quota pop, the score count-up); the threat sting when the creature arrives.
- **high**: as low, stronger: sparkles on a new flag, a bigger quota pop with a glow ring, a short screen shake on the
  reveal, a slower score count-up.

Built from `Playbooks/Games/Game Polish`: juicy_button_feel (flag click down/up), coin_pickup_feel (rising pitch, sparkle
burst), satisfying_level_up_and_xp_bar (count-up, pop), resource_bar_state_readability (counter pop 120–180 ms),
screenshake_and_trauma (small, fast decay), audio_strong_attack_and_mix (peak at once, short tails, 40 ms retrigger
cooldown, 4 voices). Reduced motion turns every animation off.

## 6. Rules

Checked by `node tools/check-quest.mjs <file.scene>` (any path) and `node tools/check-fish-scenes.mjs` (every quest):

- a `story`; at least 4 steps; no `attack` in the first step;
- at least 3 hard flags, every flag with a why, every flagged process, start-up item, dialog and `net` actually happens;
- at least 60% of the middle steps have a `when`;
- everything in FISH-SCENES.md (valid worlds, reachable `when`s, each step changes the desktop, a lesson).

Not checked, but required:

- **Fictional only**: people, banks, sites (`.example`, `.invalid`), IPs (`192.0.2.x`, `203.0.113.x`), card numbers in
  test ranges (4000 0012 …), phone numbers with 555. Name the malware; never a real company or brand in a lure.
- The safe task and the infected task look the same except for the malware's tells: that is the lesson.
- The lure looks like the real one did (a PDF icon on an .exe, a "secure attachment", a fake update), not like a cartoon.
- Plain words. `| ` lines of one or two sentences. Say what to look at, not what to think.

## 7. What worked and what did not (Zeus)

- **Worked:** a believable job and counter ("8 of 10 invoices") makes the trainee act like the victim; the safe round makes
  the injected boxes obvious on the second sign-in; typing your own password and seeing it in plain text lands harder than
  being told; the network blip on every key; the grade card naming each tell with its reason.
- **Did not:** a scene where the guide opens windows for the trainee (they stop looking); a banner with no next step; a
  page button that does nothing; Next as the only way on. Do not give a mail and a page the same id: `open <id>` finds the
  mail first.
- Keep notifications for things the OS would announce (new mail, a start-up item, a blocked connection).

## 8. Write one

1. Copy `zeus.scene`; keep the shape, change the job, the lure and the effect to the real malware's.
2. `node tools/check-quest.mjs your.scene` until it passes.
3. `node tools/check-fish-scenes.mjs <scene>`, then `node tools/e2e/fish-scenes-e2e.mjs <scene>` (Next through every
   step, both OSes).
4. `QUEST_TRACE=1 node tools/e2e/quest-play-e2e.mjs <scene> both`: plays the quest by clicking whatever the cue glows on
   (typing into boxes, double-clicking files, following the guide's activity chips to Task Manager and Login Items) and
   flags every hard flag it can see. It fails unless the grade card is reached, at least 60% of the `when` steps were played
   by gestures, every hard flag could be placed and nothing errored. The trace names the turn where the cue pointed at
   nothing clickable: fix the scene there. Each parallel run needs its own `E2E_PARENT_PORT` / `E2E_SHELLS_PORT`.
5. Play it yourself: `/desktop.html?job=fish-b<n>&os=windows`, then on macOS. Do every step yourself; flag everything you
   think is wrong; check the cue always points somewhere and the grade card is fair.
6. Scenes for uploaded files are written the same way by the serverless model: see BACKEND.md "Quest generation".
