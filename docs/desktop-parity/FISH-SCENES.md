# Fish scenes: a short script per famous file

A fish scene acts out what a well-known file did, on the Windows and macOS training desktops. Each scene is one text file,
`data/fish-scenes/<name>.scene`, linked from its entry in `data/ocean-base.json` (`"scene": "<name>"`). In the ocean,
clicking a creature or school opens its panel; "Load into Windows / macOS" plays the scene at
`/desktop.html?job=fish-b<n>&os=<os>` (local build only: the desktops are private assets).

The visitor is walked through the scene by a **guide** (bottom left): after sign-in it explains what the file did, then each
**Next** plays one `step` and says where to look.

The guide also follows the visitor, so they can play the attack on the desktop instead of pressing Next:

- **Your move.** Under each step the guide says what to do to play the next one, in the words of the OS on screen
  ("Double-click “invoice.pdf” in Downloads", "In the warning, click Run" / "click Open"). When the malware acts by itself,
  it says so and asks for Next.
- **Following.** A step plays itself when the visitor does its thing: its `when`, or, for a step without one, the last
  gesture the step makes (open the file, answer the warning, press the view's button) when it can be made as the step
  starts. The visitor may run ahead: a later step with its own trigger plays at once, with the steps before it.
- **Off the path.** Cancelling a warning, letting the antivirus catch the file, or pressing the other button on a lure page
  ("No thanks") gets a note: on a real computer the attack stops there; press Next to see what happens to someone who goes on.
- **What it has done so far.** Chips under the step count what changed since sign-in: programs running, start-up entries,
  files locked, deleted or added, mail sent, connections blocked, the home page or wallpaper. A chip opens the place that
  shows it (Task Manager, Login Items, the folder, Mail). **Back** undoes a step, **Show it all** plays the rest, **Hide** (or the
**Guide** button in the training bar) puts it away, and the end card shows the `lesson`. The page fetches the guide from
`GET /api/desktop/guide?run=fish-…`; a run without one (an uploaded fish's illustration) still gets one step per change,
titled by its notification.

`backend/detonation/fish-scenes.mjs` compiles a scene into desktop world patches. It checks every step with the world model
(`ui/desktop/world-model.js`), so a scene that compiles is one both desktops accept.

**Uploaded fish.** A fish a visitor uploaded keeps no link to its job, so it has no authored scene. `backend/detonation/upload-scenes.mjs`
writes one from what is known, in this same language: how a file of its type arrives and opens (an Office macro document,
a PDF with a "secure attachment", a script, a program in a zip or disc image, a Mac app, a program disguised as its type),
then what its creature's behaviour does (encrypt, wipe, spread, steal, keylog, remote control with a firewall alert, …).
A Sunlight fish opens as a harmless document; a Twilight fish is adware. Every combination plays with the same guide.

A scene can also be a **quest** the trainee plays (a job, a safe task, flags, a grade card): see **[QUESTS.md](QUESTS.md)**.

For a browser editor, use **[Scene Studio](SCENE-STUDIO.md)** (`start-scene-studio.bat`). It can preview a new script without adding it to the fish catalogue.

## Write a scene

```
# WannaCry (May 2017). Comments start with #.
os windows
about
  | WannaCry arrived over the network with no click.
  | It encrypted the documents and demanded bitcoin.

step It encrypts the files
  look Documents: every file now ends in .WNCRY
  | tasksche.exe encrypts the documents and the desktop files.
run tasksche.exe
  cpu 64
encrypt Documents .WNCRY
open Documents

step The ransom demand
  look the note and the wallpaper
  | A note asks for 300 USD in bitcoin.
file Desktop/@Please_Read_Me@.txt
  | Ooops, your important files are encrypted.
wallpaper #4a0000
  | Ooops, your important files are encrypted.
open Desktop/@Please_Read_Me@.txt

lesson
  | Install security updates: the flaw had been fixed two months before.
```

- A **command** starts at the beginning of a line. **Indented lines** belong to the command above: `key value`, or
  `| text` (one line of body text).
- Commands run in order. Commands before the first `step` play at sign-in; each `step` groups the commands after it.
- Each `| ` line of a `step`, `about` or `lesson` is one paragraph in the guide: do not wrap a sentence over two lines.
- A scene plays on both desktops, so guide text (step text, `look`, `move`, `story`, `lesson`, flag reasons) that names an
OS thing says it each OS's way: `{Task Manager|Activity Monitor}`, `{File Explorer|Finder}`, `{Recycle Bin|Trash}`,
`{Ctrl+Shift+Esc|Cmd+Option+Esc}`. The Windows wording comes first; either side may be empty.
- A file that is a program behaves like one: give it a `program` (PROGRAMS.md), so opening it shows the OS warning and its
  effects, never a text editor.
- Write `about` once: the guide's introduction and the first notification, `<fish name>: an illustration`.
- The attack's creature is the one that ate the fish in the ocean (`ui/job/creatures.mjs` by `findingId`), or the fish's own
  species for a school fish, drawn lit from its pixel sheet (`PixelLit`, with its normal map). The animation's badge says
  "simulated".
- A document (`.doc`, `.docx`, `.docm`, `.rtf`, `.odt`) opens as a document: TextEdit's rich view on macOS, WordPad on Windows.
- **Each step must show its own change**: open what it is about (`open taskmanager` for a process, `open Documents` for locked
  files, the mail or page itself). A process or start-up item nobody opens is invisible. Notifications show by themselves.

## Commands

| Command | Indented lines | What it does |
|---|---|---|
| `title <name…>` | | Optional display title for authoring previews. |
| `user <fictional name…>` | `email name@team.example` (optional) | Sets the fictional user; omitted email gets an `.example` address. |
| `theme light` or `theme dark` | | Sets the desktop theme. |
| `os windows` or `os macos` | | The desktop the scene starts on: the OS its victims used. Default `windows`. |
| `about` | `\| text` | Required. What the illustration shows: the guide's introduction and the first notification. |
| `step <title…>` | `look <where to look>`, `when …` ([PROGRAMS.md §6](PROGRAMS.md#6-scene-commands); `when page <view> <n>` counts pages from 1), `\| text` (one or two short sentences) | Required; historical fish use two or more (Studio accepts one). One guide step: the commands after it, up to the next `step`. Write what happened and why it matters; `look` names what on screen shows it. |
| `lesson` | `\| text` | Required. The guide's last card, "How to stay safe": what would have stopped it. |
| `attack <kind>` | `\| beat` (up to 8, 60 characters each) | Optional, inside a step, one per step. When the visitor reaches the step, the fish's creature breaks through the glass and plays that attack (`OceanFx.playAttack`); each beat appears in turn on its counter. Kinds: `scareware credential-phish mfa-fatigue oauth-consent mass-mail-worm macro-dropper ransomware-encrypt data-exfil money-transfer wallet-drain supply-chain-update network-worm botnet-ddos account-takeover-post sim-swap spyware-surveillance server-exploit-leak`. Leave it out when no kind fits. |
| `mail <id>` | `from Name <a@x.example>`, `subject …`, `to …` (default: the configured user), `folder inbox\|sent\|junk`, `attach <path>` (repeatable), `link <page-id>`, `read yes`, `sent <YYYY-MM-DD> <HH:MM>` (when it arrived; default: the scene's minute clock from 2 November 2026 09:01), `\| body` | A message in Mail. `attach` creates the file. `link` needs the page defined first. |
| `text <thread-id>` | `from <name or 555 number>`, `with <thread name>` (default: `from`; set once), `sent <YYYY-MM-DD> <HH:MM>`, `\| text` | A text message in Messages (macOS) / Chat (Windows): an SMS lure, a colleague's chat. The same id adds to one thread; a banner shows unless `from` is the user. `open messages` to show it. |
| `page <id> <address>` | `title …`, `heading …`, `brand …`, `insecure`, `favorite` (on the favourites bar), `button Label` (repeatable, up to 6), `\| body`; also `toolbar`, `issuer`, `warning` and `section` lines ([PROGRAMS.md §3b](PROGRAMS.md)) | A web page for the browser. The address must end in `.example` or `.invalid`. A button does nothing by itself; the next step can wait for it with `when choose <id> [n]` (button n, 1 = first) and then open what the button led to. |
| `file <path>` | `icon <kind>`, `program <id>`, `hidden`, `size <bytes>`, `at <x> <y>` (a Desktop icon's place in the 1000×600 work area), `\| text` | Creates a file. A path is `<Desktop\|Documents\|Downloads\|Pictures\|Music\|Home\|drive alias>/[folder/…]<name>`. A program file needs `program` (see [PROGRAMS.md](PROGRAMS.md)). |
| `open <target>` | | Opens a window the way the OS does: an app with one window (Mail, the browser, Task Manager, Settings…) is brought forward with the new item, and a page opens as the browser's active tab. Targets: a mail id, a page id, a home folder (`Documents`), any of the 21 canonical apps (including `taskmanager`, `updates`, `settings`, `mail`, `browser`, `photos`, `notes`, `calculator`), a view, a drive, or a file path. Opening a file does what a double-click does: a program shows its prompts or runs, a PDF opens read-only, a locked or unknown file cannot open, text files open in the text editor. |
| `run <program name>` | `cpu <0-100>`, `mem <MB>`, `publisher …`, `parent …`, `command …`, `net …`, `disk …` | A suspicious process in Task Manager / Activity Monitor. `open taskmanager` to show it. |
| `startup <name> <command…>` | `location …`, `publisher …` | A start-up / login item, with its registry key or folder. |
| `encrypt <folder or path> [.ext]` | | Locks the files (padlock icon) and appends the extension, if given. |
| `delete <folder or path>` | | Moves the files to the Recycle Bin / Trash. |
| `rename <path> <new name>` | | Renames one file. |
| `homepage <page-id>` | | Hijacks the browser's home page. |
| `wallpaper #rrggbb` | `\| line` (up to 8) | Replaces the wallpaper with a plain colour and centred text: a ransom or error screen. |
| `notify <app> <title…>` | `\| body` | A notification banner from that app (`files`, `mail`, `browser`, `settings`, `taskmanager`, `photos`, `texteditor`, …). |
| `block <host> [port]` | | A "Connection blocked" banner: the desktop has no network. |
| `update <title…>` | `kb …`, `size …`, `status available\|installed` | An item in Software Update. |
| `program`, `view`, `folder`, `drive`, `answer`, `launch`, `show`, `press`, `close`, `dialog` | | Programs, their windows and the OS dialogs: see **[PROGRAMS.md](PROGRAMS.md)**. A `step` can also wait for the trainee with `when`. |

The desktop starts as Dana Okafor's (`data/desktop-profiles/detonation-replay.json`), furnished so it looks lived in
(`furnish` in `fish-scenes.mjs`, applied with the scene's first change). Her documents are `Q3-report.docx`, `budget.xlsx`,
`notes.txt`, `photos-list.csv`, `Client contacts.xlsx`, `Team offsite.pptx`, `Invoice INV-1042.pdf` and
`Contract draft.docx`, all with fictional content; her pictures are `holiday-01.png` and `holiday-02.png`; her desktop has
`todo.txt` and `Expenses October.xlsx`; her inbox has three ordinary read messages (Priya, Marcus, IT). Her colleagues are `Priya Shah <priya.shah@northwind.example>` and
`Marcus Lee <marcus.lee@northwind.example>`.

## Rules

- **Fictional only:** people, senders and websites use `.example` or `.invalid`; IP addresses use `192.0.2.x` or
  `203.0.113.x`; phone numbers use `555`. Name the malware and the incident; do not impersonate a real brand in a lure.
- **No real payloads or credentials.** Ransom notes and lures are training copies, and they say so.
- **Show the effect.** Each scene must leave something visible: a window, changed files, a wallpaper or banners. If a
  file's effect cannot be shown on a desktop (servers, phones, firmware, DOS), give its base entry `"noDesktop": "<why>"`
  instead of a scene; the panel shows that reason.
- Write for a newcomer: plain words, one idea per sentence, no jargon without a gloss ("DNS: the phone book that turns names
  into addresses"). Two to five steps is right; the guide shows one at a time.
- A scene of more than 30 commands still plays: the streamed copy merges neighbouring commands to fit the event hub's 32 events.

## Check it

```sh
node tools/check-fish-scenes.mjs              # every scene compiles, has 2+ steps (each with text, look and a change) and a lesson;
                                              # every `when` can be done by the visitor when its step starts (else the guide could not follow);
                                              # every base fish has a scene or a noDesktop reason
node tools/check-fish-scenes.mjs wannacry     # one scene
node tools/e2e/fish-scenes-e2e.mjs [scene …]  # walks each guide (Next, Back) on its own OS, then checks both desktops; screenshots in SHOTS_DIR
node tools/e2e/guide-follow-e2e.mjs            # the guide follows the visitor: own gestures play steps, running ahead, Cancel / "No thanks" notes, activity chips
```

Errors name the file and line, for example `wannacry:12: open: no file Desktop/x.txt (create it first …)`.
Look at the screenshots too: compiling proves the desktops accept the scene, not that it shows what you meant.
