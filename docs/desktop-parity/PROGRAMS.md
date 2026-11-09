# Programs, file types and OS dialogs

A file on the training desktops behaves the way its operating system would treat it. A program disguised as a PDF shows a
PDF icon and hides `.exe` on Windows. Opening it raises the OS warning. If the trainee runs it, it starts a process, adds a
start-up entry, deletes itself or opens its own window. Neither desktop opens a program in a text editor.

All of this lives in the shared world (`ui/desktop/world-model.js`), so both desktops show the same state and it survives
an OS switch. `ui/desktop/program-ui.js` (`window.OceanProgramUI`) draws every program window and dialog in the idiom of
each OS:

- **Windows** mounts it in `src/components/ocean/programs.jsx`.
- **macOS** registers the hidden `oceanprogram` app in `src/bundle-hook.js` and draws the dialog layer in `src/adapter.js`.

Scenes declare programs, views and dialogs in their script (see [Scene commands](#scene-commands)). The commands are compiled
by `backend/detonation/fish-scenes.mjs` and replayed through the same reducer that handles the trainee's clicks.

## 1. File types

`fileTypeOf(node)` maps a file's extension to a type and a label. A folder marked as an archive or drive maps to
`archive` or `diskimage`.

| Type | Extensions (examples) | Double-click |
|---|---|---|
| `program` | exe com scr pif | Its scene program, else the OS warning if it is in Downloads, else it "starts" |
| `script` | vbs js jse wsf bat cmd ps1 hta sh reg | Its scene program. Else: `.ps1` opens in the text editor (Windows never runs one on a double-click); `.bat` `.cmd` `.sh` `.command` show a console that echoes each command (nothing runs); `.reg` shows Registry Editor's "Are you sure you want to continue?" with the keys it would add, then its success message (nothing changes); the rest "start" silently, as Windows Script Host does |
| `installer` / `macapp` / `java` | msi pkg / app / jar | As `program` |
| `pdf` | pdf | Read-only document view (Edge / Preview) |
| `word` (+ `-macro`) | doc docx docm rtf odt | From Downloads or a mail: Word's Protected View (Enable Editing, then Enable Content for a macro file). Else the text editor (WordPad / TextEdit rich view) |
| `sheet` (+ `-macro`) | xls xlsx xlsm csv | Spreadsheet window (Excel / Numbers): a grid built from the file's CSV text, or a fictional table that fits the file name. Downloaded: Protected View bar; macro file: Enable Content bar |
| `slides` | ppt pptx | Presentation window (PowerPoint / Keynote): one slide per blank-line block of the file's text (first line the title) |
| `web` | html htm mht | Read-only saved page (Edge / Safari): its title and text; scripts are dropped |
| `mail` | eml | Read-only message (Outlook / Mail): From, To, Date, Subject and body |
| `certificate` | cer crt pem | Certificate viewer: an untrusted, self-issued root, with Install Certificate… |
| `archive` / `diskimage` (a file) | zip rar 7z, iso img dmg | The compressed folder / mounted disc. An archive *folder* (`archive` on a folder) opens in the file manager |
| `text` | txt log md ini … | Text editor |
| `image` / `audio` / `video` | png jpg …, mp3 wav …, mp4 mov … | Photos / Media |
| `library` `data` `unknown` | dll sys ocx, dat bin tmp, anything else | "Can't open this file" |
| (any) encrypted | | "Can't open this file" |

A file's app window is a read-only program window (`data.views['doc-<file id>']`), drawn by `program-ui.js`. The view stores
a neutral app name (`Spreadsheet`, `Presentation`, `Document`, `Browser`, `Mail`, `Console`, …); each shell shows its own
(`appName`: Excel or Numbers, PowerPoint or Keynote, Command Prompt or Terminal). Any address in the file outside the
fictional domains is defused (`name at domain`).

What each desktop shows:

- **Name**: `displayName(node, os)`. Windows hides a known extension, so `invoice.pdf.exe` reads `invoice.pdf`. macOS
  hides only `.app`, as Finder does by default.
- **Icon**: `iconTypeOf(node)`. A file with `icon` set shows that icon (the disguise); otherwise it shows its real type.
- **Properties / Get Info**: shows the real type ("Application"), the location, the size, the publisher, the digital
  signature, and whether the file is hidden.

Optional fields on a world file:

| Field | Meaning |
|---|---|
| `icon` | One of `FILE_KINDS`: the icon the file pretends to have |
| `program` | The id of a `data.programs` entry: what opening the file does |
| `hidden` | A hidden or system file. File Explorer shows it only with *Hidden items* on |
| `archive` | On a folder: zip, rar, iso, img, dmg, usb, cd or share |
| `drive` | On a top-level archive folder of kind usb, cd or share: the drive's alias in scene paths |

## 2. Programs (`data.programs`)

```js
{ name, publisher|null, signed, prompts: ['open-warning'|'reputation'|'elevation', …≤3],
  view?, process?: { name, cpu?, mem?, parent?, command?, net? }, startup?: { name, command, location? },
  selfDelete?, notify?: { app, title, body }, detected?, description? }
```

Opening a file whose `program` is set:

1. Each prompt in `prompts` appears in order:
   - **`open-warning`**: on Windows, "Open File – Security Warning" (Name, Publisher, Type, From; Run / Cancel). On macOS,
     the Gatekeeper sheet. A Windows program on macOS says "is a Windows program… Show what it does".
   - **`reputation`**: on Windows, the SmartScreen "Windows protected your PC" screen (More info → Run anyway). On macOS,
     "Not Opened" (Open Anyway).
   - **`elevation`**: on Windows, UAC, yellow for an unknown publisher and blue for a verified one. On macOS, the admin
     password sheet; the password is shown, never typed.
2. If the trainee cancels, the program stops (`program-cancelled`).
3. If the program is `detected`, Defender or XProtect reports the threat. Its *Remove* answer moves the file to the
   trash (`program-detected`).
4. Otherwise it runs (`program-run`):
   - its process appears in Task Manager / Activity Monitor;
   - its start-up entry appears in Startup apps / Login Items, and the OS says so: a Settings banner "New startup item: …"
     (Windows 11's Startup App Notification, macOS's "Background Items Added"). A scene's `startup` command raises it too;
   - its notification appears;
   - it deletes its file when `selfDelete` is set;
   - its `view` opens.

A program with no `view` shows nothing when it runs, and in many scenes that is the lesson ("nothing seems to happen").

## 3. Views (`data.views`): what a program shows

A view is the content of a program window (`app: 'program'`, `payload: { view, page? }`). Its `layout` picks the frame:

| Layout | Use it for |
|---|---|
| `message` | A small OS-style message box: error, warning, fake alert (an icon, text and buttons) |
| `panel` | An ordinary app window: a fake cleaner, a toolbar's settings, an "account" page |
| `wizard` | An installer: pages with Back / Next / Finish / Cancel, and checkboxes the bundlers pre-tick |
| `ransom` | A full ransom note: a countdown timer, an amount, payment instructions |
| `console` | A black console window with output `line`s |
| `document` | A read-only document (the automatic PDF viewer uses it) |
| `screen` | Full screen: a lock screen, a fake blue screen, a "your PC is blocked" page |
| `scan` | A fake antivirus scan: a progress bar, an infections table, a "Fix all" button |
| `character` | A desktop buddy with a speech `balloon`, drawn as an original green blob |
| `sheet` | A spreadsheet: ribbon or toolbar, formula bar, a lettered grid with the first `table` from row 1, sheet tabs. A page `bar` is Office's Protected View or macro bar |
| `slides` | A presentation: slide thumbnails, the current slide (a page), Previous / Next |

Every view has a `title`. It may also have:

- `app` (the name in the title bar);
- `publisher`;
- `theme` (`bg`, `fg`, `accent`, `header`: `#rrggbb` colours);
- `size` (`{ w, h }`);
- `fullscreen`;
- either the page fields directly, or `pages` (up to 12).

**Page fields:**

- `heading`, `text`;
- `icon`: none, error, warning, info, question, shield, shield-ok, shield-bad, lock, program, gear, bug, disk, web, mail,
  money, user or character;
- `sections` (up to 12);
- `buttons` (up to 6): `{ label, action, primary? }`;
- `bar`: an information bar with `text`, `button`, `action` and `tone` (info, warn or bad);
- `lines`: console output;
- `counter`: `{ label, from, to }`, which counts up;
- `image`;
- `balloon`.

**Section fields:**

- `heading`, `text`;
- `rows`: label = value pairs;
- `table`: `{ columns, rows }`;
- `items`;
- `checks`: `{ label, checked }`;
- `progress`: 0–100;
- `timer`: `{ label, seconds }`, which counts down;
- `code`;
- `note`;
- `tone`: normal, good, bad, warn, or `injected`, which marks content the malware added to a real page.

`ransom`, `scan` and `screen` views always carry a "Training copy" tag.

**Button actions:**

| Action | Effect |
|---|---|
| `close` | Close the window |
| `done` | Close it and tell the guide (`view-done`) |
| `next` · `back` · `page:N` | Turn the page (`view-page`) |
| `run:<program>` | Run a program (no prompts) |
| `view:<view>` | Open another view |
| `open:<id>` | Open a scene page, a file, a mail id or an app |
| `choice:<id>` | A scene choice |
| `notify:<id>` | Tell the guide |
| `none` | Nothing (a button that does not work) |

## 3b. Web pages: injected content, toolbars and browser warnings

A scene page (`data.web.pages[id]`) may also carry the following fields. Both browsers draw them with
`OceanProgramUI.renderPagePart`:

| Field | Shows |
|---|---|
| `sections` (≤8) | Content under the page body, with the same section fields as views. `tone injected` marks what the malware added to a real page, such as the card and PIN fields of a banking trojan or injected adverts. |
| `toolbars` (≤4 names) | Adware toolbars across the top of the page, each with a search box and its offers. |
| `issuer` | A "Connection is secure · Certificate issued by …" strip. For Superfish, the padlock is green but the issuer is not the site. |
| `warning` | `cert`, `deceptive` or `malware`. The browser's own full-page warning (Edge / Safari wording) covers the page. *Advanced → Continue* shows the page; *Go back* leaves it. That choice belongs to the tab and is not kept in the world. |

## 4. Dialogs (`world.dialogs`)

Dialogs sit above the windows, with the newest on top. A modal dialog blocks the desktop under it, and UAC also dims the
screen. Each dialog is `{ id, kind, fileId?, programId?, step?, threat?, options?, view? }`.

| Kind | Raised by | Answers |
|---|---|---|
| `open-warning` · `reputation` · `elevation` | A program's prompts; a downloaded program with no scene program | `run` · `cancel` |
| `cant-open` | An encrypted, unknown, library, data, disk-image or archive file | `ok` |
| `properties` | Right-click → Properties / Get Info (`file-properties` intent) | `ok` |
| `detected` | A program with `detected` | `trash` (Remove) · `ok` |
| `autoplay` | A scene, for a drive | `option:N` (its action runs) · `cancel` |
| `message` | A scene: a `view` shown as a dialog | Its buttons |
| `firewall` | A scene (`dialog firewall <path>`): a program opened a port to listen. Windows Security Alert ("Windows Defender Firewall has blocked some features of this app") / macOS "accept incoming network connections?" | `ok` (Allow access / Allow) · `cancel` (Cancel / Deny) |

## 5. Intents

Each shell turns the trainee's clicks into intents:

| Intent | What it does |
|---|---|
| `{ kind: 'open-file', fileId }` | The double-click above |
| `{ kind: 'file-properties', fileId }` | Opens the Properties dialog |
| `{ kind: 'dialog-answer', id, answer }` | `answer` is `run`, `cancel`, `ok`, `trash` or `option:0-3` |
| `{ kind: 'view-action', windowId, action }` | A button in a program window |

`applyIntent` returns a `forward` for the guide:

- `program-prompt`, `program-run`, `program-cancelled` and `program-detected`, each with `programId` and `fileId`;
- `view-page` (`view`, `page`) and `view-done` (`view`);
- `choose` (`choiceId`; a scene page's button n has `<page id>-<n>`).

A guide step with `when` plays itself when the trainee does the matching thing (§6).

## 6. Scene commands

These extend [FISH-SCENES.md](FISH-SCENES.md). **Define a view before the program that uses it, and a program before the
file that runs it.**

```
view zeus-done message
  title Invoice viewer
  icon error
  | The file is damaged and could not be opened.
  button OK -> done primary

program zeus invoice-88213.pdf
  publisher none
  prompt open-warning
  process sdra64.exe
  cpu 4
  parent winlogon.exe
  command C:\Windows\System32\sdra64.exe
  startup Userinit C:\Windows\System32\userinit.exe, C:\Windows\System32\sdra64.exe
  location HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
  selfdelete
  view zeus-done

step An overdue invoice
  | …
file Downloads/invoice-88213.pdf.exe
  icon pdf
  program zeus
  size 148480

step The warning almost nobody reads
  when prompt zeus
  | …
open Downloads/invoice-88213.pdf.exe

step Nothing seems to happen
  when run zeus
  | …
answer run
open taskmanager
```

| Command | Indented lines | What it does |
|---|---|---|
| `file <path>` | `icon <kind>`, `program <id>`, `hidden`, `size <bytes>`, `\| text` | A file. The path is `<Desktop\|Documents\|Downloads\|Pictures\|Music\|Home\|drive alias>/[folder/…]<name>` |
| `folder <path>` | `archive <kind>`, `hidden` | A folder. A name ending `.zip .rar .iso .img .dmg` is an archive of that kind. Files go inside: `Downloads/order.zip/order.pdf.exe` |
| `drive <label…>` | `kind usb\|cd\|share`, `as <alias>` | A drive at the top of This PC / the Finder sidebar. Its alias (default: the first word of the label) starts paths: `USB/autorun.inf` |
| `program <id> <display name…>` | `publisher <name>\|none`, `signed yes`, `prompt <kind>` (≤3, in order), `process <name>` with `cpu` `mem` `parent` `command` `net`, `startup <name> <command…>` with `location`, `view <id>`, `selfdelete`, `detected <threat name>`, `description …`, `notify <app> <title…>` with `\| body` | What opening a file with `program <id>` does (§2) |
| `view <id> <layout>` | `title` (required), `app`, `publisher`, `bg` `fg` `accent` `header` `#rrggbb`, `size WxH`, `fullscreen`, then page and section lines (below) | A program window's content (§3) |
| `page <id> <address>` | also `toolbar <name>` (repeatable), `issuer <name>`, `warning cert\|deceptive\|malware`, then `section [heading]` followed by section lines | A web page with the §3b fields. `\| text` before the first `section` is the page body; after it, the text belongs to the section |
| `open <target>` | | Also opens a view id or a drive. A program, encrypted file, PDF or runnable file goes through `open-file`, just as a double-click does: its prompt appears |
| `answer [run\|cancel\|ok\|trash\|option:N]` | | The trainee answers the newest dialog (default `run`) |
| `launch <program>` | | The program runs with no prompts (another program started it) |
| `show <view>` | `page <n>` | Opens a view as a window |
| `press <view> <action>` | | The trainee presses a button in an open view (default `next`) |
| `close <app or view>` | | Closes its windows |
| `dialog <kind> [path\|drive\|view]` | `threat …`, `option <Label> -> <action>` (autoplay, ≤4) | Raises an OS dialog (§4) |
| `run <process name>` | also `parent`, `command`, `net`, `disk` | A process with no program behind it |
| `startup <name> <command…>` | `location …`, `publisher …` | A start-up entry with its registry key or folder |
| `step <title>` | also `when <prompt\|run\|cancel\|detected\|page\|done\|choose> [id] [page]` | The step plays itself when the trainee does that (§5); Next still works. `when page <view> <n>` waits for page `n` of the view, counted from 1 like a button. A step without `when` gets one from its own last gesture when the trainee can make it as the step starts; `check-fish-scenes` fails a `when` the trainee cannot reach `when choose <page id> [n]` waits for button `n` (1 = first, the default) on a scene web page, so a page's Sign in, Download or Continue button can lead to the next step |

**View lines.** Page lines go to the current page, and section lines to the current section. A `page` or `section` line
starts a new one; without them everything goes to a single page.

- **Page lines:**
  - `page [heading]`, `heading …`, `icon <icon>`;
  - `button <Label> -> <action> [primary]` (the action defaults to `close`);
  - `bar <text> -> <Button> -> <action>`;
  - `line <console line>`;
  - `counter <label> <from> <to>`;
  - `image <wallpaper url>`;
  - `balloon …`;
  - `| text`.
- **Section lines:**
  - `section [heading]`, `row <Label> = <Value>`, `item …`;
  - `check [x] <label>` or `check [ ] <label>` (in a program window the trainee can click it: the guide praises an unticked offer, and the scene plays on as written; cue it with `cue view-btn:check:<n>`, n counting the page's checks from 0);
  - `progress <0-100>`, `timer <Label> = <seconds>`;
  - `columns a | b | c`, then `cells x | y | z` for each row;
  - `code …`, `tone <tone>`, `note …`, `| text`.

**Writing guide text.** Each `| ` line in a `step`, `about` or `lesson` is its own paragraph in the guide. Write one line
per paragraph; do not wrap a sentence across two `|` lines.

## 7. Rules

- **No input fields.** Views and dialogs have buttons only. A password, card or PIN prompt is shown as text the trainee
  cannot type into, and it says what the attacker wanted.
- **Fictional only.** Publishers, people, sites and addresses follow FISH-SCENES.md. Name the malware and the incident,
  but never copy a real product's logo or artwork.
- **Parity.** Every layout and dialog renders on both desktops. A Windows program opened on macOS shows Gatekeeper's
  "is a Windows program" sheet, and *Show what it does* runs the illustration.
- **Show it.** A program with no view must still change something the step opens: Task Manager, the start-up list, a
  folder or a notification.
