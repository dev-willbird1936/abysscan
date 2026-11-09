# Abyss quests: search a threat, play it as a game

Abyss turns famous malware into short training games. A visitor searches for a threat by name. If Abyss has it, the visitor
plays it as a **quest** on a simulated Windows or macOS desktop: they do an ordinary job, the attack arrives as part of that
job, the desktop reacts the way a real one would, and they flag the signs. A grade card shows what they spotted and how to
stay safe. Everything is simulated and fictional. No malware file is downloaded, uploaded or run.

This file describes the idea and how it works. The rules for writing a quest are in
[desktop-parity/QUESTS.md](desktop-parity/QUESTS.md); the scene language is in
[desktop-parity/FISH-SCENES.md](desktop-parity/FISH-SCENES.md); the planned live search is specified in
[threat-search/CONTRACT.md](threat-search/CONTRACT.md).

## The idea

Most people meet malware only as a headline. They never see what an attack looks like on their own screen while it happens,
so they cannot recognise it. A quest puts them in the victim's chair at the moment it struck, then lets them catch it.

| Game element | What it teaches |
|---|---|
| A job and a task counter ("9 of 10 statements matched") | Attacks arrive during real work, when people are busy |
| One safe round first | What normal looks like: a known sender, a real site, a signed program |
| The lure as more of the same work | Why the attack works: it looks like the next task |
| The desktop's real reactions | The signs an attack actually leaves on Windows and macOS |
| Flags and a grade card | Spotting the signs, not memorising rules |

## The player's journey

### 1. Search

The main menu has a search bar: "Try: Zeus, WannaCry, recent Binance hack". The visitor names a malware family, an exploit or a
hacking incident. (The flow below is the search built in this repository; the live site reports it switched on. See
[Status](#status-2026-11-08).)

- **Already in the ocean.** The result is badged **In the ocean** and opens its quest.
- **New.** The result shows the threat's name, date, kind, family, depth and a short summary with its sources, and asks
  "Create a simulated environment for <name>?". Create writes a new quest from public reporting (see
  [How a quest is made](#how-a-quest-is-made)).
- **Not a real threat, or a request for attack instructions.** The search says plainly that no documented threat matched.

### 2. The story card

The quest opens on a card in the guide, bottom left: who you are, your job, and where you are in the day. For example:
"You are Dana Okafor, accounts assistant at Northwind Traders. You have matched 9 of 10 supplier statements." A task counter
sits at the top of the guide.

### 3. One safe round

The first task is ordinary and safe: a colleague's email, a link to a site you know, a signed program. The trainee plays it
end to end. This is the baseline the lure is compared against.

### 4. The lure

The attack arrives as the next task: an invoice attachment, a video a friend shared, an update prompt, a text message. Nothing
says "attack".

### 5. What the malware really did

The desktop reacts as the real OS would, in its own windows:

- the open-file warning ("unknown publisher" on Windows, Gatekeeper on macOS) and the antivirus alert;
- new rows in Task Manager or Activity Monitor, and programs working hard;
- start-up items and login items;
- locked files, a ransom window with a countdown, a changed wallpaper;
- a hijacked browser home page, an added toolbar, adverts injected into pages;
- installers with offers already ticked, mail sent in the victim's name, blocked connections.

Files open in a working app of their type (spreadsheet, presentation, document, PDF, image, archive, certificate, calendar
invite), never in a text editor, so a lure looks the way it would on a real desktop.

### 6. Flag the signs

The trainee hovers over anything and clicks the flag on it: a sender, a link, a file, a process, a page or a box on a page, a
line in a program window, a notification. A counter in the guide shows how many are flagged.

- **Hard flags** are the real signs of this attack. They are graded.
- **Soft flags** are shortcuts the training takes, such as a password kept in a text file on the desktop. Spotting one earns a
  bonus.

### 7. The reveal and the grade card

After the last task the guide shows what the attacker gained, with the creature animation for that kind of attack. The
grade card then lists every hard sign, found or missed. A missed sign says why it mattered. It ends with how to stay safe.

## How the guide works

The guide is what makes a quest playable without a teacher.

- **It says what to do next.** Each step has a **Look at** line (where the change is) and a **Your move** line (the gesture
  that plays the next step, in the words of the OS on screen). The thing to click glows.
- **It follows the trainee.** When the trainee does the move themselves (opens the mail, runs the file, presses Finish,
  clicks a chip) the step plays by itself. Running ahead plays the steps in between. Next always works too.
- **It explains choices off the path.** Cancelling a warning, letting the antivirus remove the file, pressing "No thanks" or
  unticking an installer offer gets a note: on a real computer that is the safe choice. The training then shows what happens to
  someone who goes on.
- **It shows the damage so far.** Chips under each step count what changed since sign-in: programs running or working hard,
  start-up items, files locked, deleted or added, mail sent, connections blocked, the home page or wallpaper. A chip opens
  the place that shows it.
- **It speaks each OS.** One quest plays on both desktops. Guide text written as `{Task Manager|Activity Monitor}` shows each
  OS its own word.

## How a quest is made

Every quest is a plain-text `.scene` script. It is compiled into desktop changes and checked by the same world model that
both desktops use, so a quest that passes the checks plays on both.

| Source | Where | How |
|---|---|---|
| Historical quests | `data/fish-scenes/*.scene` (59) | Written by a writer agent, reviewed by an independent advisor, fixed, then replayed on both OSes |
| Uploaded files | `data/generated-quests/<behaviour>-<type>.scene` | `backend/detonation/quest-writer.mjs` asks Vultr Serverless Inference for a quest for that kind of file, checks it and sends problems back up to three times. Off unless `QUEST_WRITER_ENABLED=true` |
| Searched threats | `${THREAT_DIR}/<slug>.scene` | Parallel Decisions confirms the threat; Parallel Search researches it; DeepSeek V4.1 Flash on Vultr Serverless Inference writes the scene from that research. Every step must cite a research entry, or the checker drops it |

A generated quest passes the same checks as a hand-written one:

```sh
node tools/check-quest.mjs <file.scene>          # compiles; story, quota, safe round, cues, flags and lesson present
node tools/check-fish-scenes.mjs <scene>          # every step changes the desktop; every `when` can be done by the trainee
node tools/e2e/quest-play-e2e.mjs <scene> both    # a browser plays it on Windows and macOS by clicking what glows
```

`quest-play-e2e` must reach the grade card on both OSes, play most steps by the trainee's own gestures, and place every hard
flag.

## Safety

- Everything on the desktop is fictional: people, companies and sites use `.example` or `.invalid`, addresses use the
  documentation ranges, phone numbers use 555.
- No real payload, exploit code, working command, attacker domain or hash appears in a quest.
- A searched threat is described only as its cited sources describe it. The debrief says "Illustration based on public
  reporting, not observed malware." and lists each source with its date.
- A search that asks how to build or deploy an attack is declined.
- Search and generation calls have per-IP rate limits and daily caps. Keys live only in the server's environment.

## Status (2026-11-08)

| Part | State |
|---|---|
| 59 historical quests | All are quests that compile and pass the quest rules. About half have been through review and fixes; the rest are in progress. Every one replayed so far plays through on both OSes with every hard flag placed |
| Guide, flags, grade card, chips, per-OS wording | Built and tested on both desktops |
| Live search and scene writer | Built (`backend/threats/`, `ui/abyss/threat-search.js`) to [threat-search/CONTRACT.md](threat-search/CONTRACT.md) and tested on mocked services. The live site reports search and create switched on (`/api/threats/config`); deployment notes: [threat-search/DEPLOY.md](threat-search/DEPLOY.md) |
| Quests for uploaded files | Built (`quest-writer.mjs`), off by default; file upload itself is retired on the live site |
| Deployment | All 59 historical quests are deployed on the live site (quests-batch4, 2026-11-09) |

## Open gaps

- macOS Safari has no favourites bar, only start-page tiles; a quest must not rely on one.
- A mailbox rule (an attacker forwarding mail out of a stolen account) cannot be shown yet.
- An installer checkbox can be unticked, but the quest plays on as written; the guide says so.
