// An uploaded fish, written as a fish scene (data/fish-scenes language, docs/desktop-parity/FISH-SCENES.md) and compiled by
// fish-scenes.mjs like a base fish's own scene. An uploaded fish keeps no link to its job (privacy), so the scene is built from
// what is known: its file type (how such a file arrives and what the OS does when it is opened) and the behaviour of the
// creature that ate it (findingId: what it then does on Dana's desktop). It is an illustration, and its about text says so.
//
// uploadScene({ type, findingId? , depth? }) -> scene text. Everything here is fictional: .example and .invalid hosts,
// documentation addresses (RFC 5737), invented people and payloads.

export const ILLUSTRATION_NOTE = 'What this kind of file does, acted out on a training desktop. Not a recording of a real run; nothing here is real.';

const OFFICE = { doc: 'Word', docx: 'Word', docm: 'Word', rtf: 'Word', xls: 'Excel', xlsx: 'Excel', xlsm: 'Excel', ppt: 'PowerPoint', pptx: 'PowerPoint' };
const SCRIPTS = ['js', 'jse', 'vbs', 'vbe', 'wsf', 'hta', 'ps1', 'bat', 'cmd'];
const ARCHIVES = ['zip', 'rar', '7z', 'iso', 'img'];
const MAC = ['dmg', 'pkg', 'app', 'macho'];
const ALIAS = { 'js-wsh': 'js', 'js-node': 'js', jpeg: 'jpg', text: 'txt', powershell: 'ps1', vbscript: 'vbs' };
const ICONS = { pdf: 'pdf', jpg: 'image', png: 'image', gif: 'image', txt: 'text', html: 'web', htm: 'web', mp3: 'audio', mp4: 'video', csv: 'sheet' };

// How the file reaches Dana and what opening it looks like: { os, name, icon?, folder?, mail, prompts, open, lesson }.
function arrival(rawType) {
  const type = ALIAS[rawType] ?? rawType ?? 'any';
  const app = OFFICE[type];
  if (app) {
    return { os: 'windows', kind: 'office', app, name: `Invoice_2291.${type}`, process: app === 'Word' ? 'WINWORD.EXE' : app === 'Excel' ? 'EXCEL.EXE' : 'POWERPNT.EXE',
      mail: ['Accounts <billing@invoice-portal.invalid>', 'Invoice 2291 overdue', 'Please find the overdue invoice attached. Open it to see the amount due.'],
      lesson: `An invoice you did not expect is a lure. Never click "Enable Editing" or "Enable Content" to read a document: ${app} only needs them to run code.` };
  }
  if (type === 'pdf') {
    return { os: 'windows', kind: 'pdf', name: 'Statement_October.pdf',
      mail: ['Northwind Bank <statements@bank-notices.invalid>', 'Your October statement', 'Your statement is ready. Open the attached PDF to view it.'],
      lesson: 'A PDF that asks you to open another file or to "allow" something is not a statement. Close it and check with the sender another way.' };
  }
  if (SCRIPTS.includes(type)) {
    return { os: 'windows', kind: 'program', name: `Payment_details.${type}`, prompts: ['open-warning'],
      mail: ['Payments <remit@pay-advice.invalid>', 'Payment advice 4471', 'Your payment details are attached. Open the file to confirm.'],
      lesson: `A .${type} file is a program written as text. Turn on "File name extensions" in File Explorer, and never open a script that came by email.` };
  }
  if (ARCHIVES.includes(type)) {
    return { os: 'windows', kind: 'program', folder: `Invoice_2291.${type}`, name: 'Invoice_2291.pdf.exe', icon: 'pdf', prompts: ['open-warning', 'reputation'],
      mail: ['Accounts <billing@invoice-portal.invalid>', 'Invoice 2291 overdue', 'The invoice is in the attached folder. Open it to see the amount due.'],
      lesson: 'A zip or disc image can hide a program with a document icon. Open the folder, turn on file name extensions, and look at the real ending.' };
  }
  if (MAC.includes(type)) {
    return { os: 'macos', kind: 'program', folder: 'Player_Update.dmg', name: 'Player Update.app', prompts: ['open-warning', 'elevation'],
      mail: ['Video Club <news@video-club.invalid>', 'Update your player to watch', 'Your video player is out of date. Install the attached update to keep watching.'],
      lesson: 'Install apps only from the App Store or the maker’s own site. If an app asks for your password right after you open it, stop and ask why.' };
  }
  if (['exe', 'scr', 'com', 'msi'].includes(type)) {
    const disguised = type === 'exe';
    return { os: 'windows', kind: 'program', name: disguised ? 'Invoice_2291.pdf.exe' : type === 'scr' ? 'Holiday_photos.scr' : type === 'msi' ? 'Viewer_update.msi' : 'Invoice_2291.com',
      ...(disguised ? { icon: 'pdf' } : {}), prompts: ['open-warning', 'reputation'],
      mail: ['Accounts <billing@invoice-portal.invalid>', 'Invoice 2291 overdue', 'The overdue invoice is attached. Open it to see the amount due.'],
      lesson: 'Windows hides the last ending of a file name, so Invoice_2291.pdf.exe reads Invoice_2291.pdf. Turn on file name extensions, and never run a program that came by email.' };
  }
  // Any other type cannot run by itself: the classic trick is a program named like that type, with its icon.
  const ext = type === 'any' || type === 'elf' || !/^[a-z0-9]{1,5}$/.test(type) ? 'pdf' : type;
  return { os: 'windows', kind: 'program', name: `Document_2291.${ext}.exe`, icon: ICONS[ext] ?? 'text', prompts: ['open-warning', 'reputation'],
    mail: ['Accounts <billing@invoice-portal.invalid>', 'Document 2291', 'The document you asked for is attached.'],
    lesson: `A .${ext} file cannot run by itself, so attackers send a program named like one. Turn on file name extensions: the real ending is .exe.` };
}

// What each creature's behaviour does once the file runs: { proc, intro, steps: scene text, lesson }. A behaviour's steps open
// what shows them (FISH-SCENES.md: each step must show its own change).
const indent = lines => lines.map(line => `  | ${line}`).join('\n');
const STEPS = {
  encrypt: { proc: 'locker.exe', cpu: 88, attack: 'ransomware-encrypt', lesson: 'Keep a backup ransomware cannot reach: an offline drive, or cloud storage that keeps older versions.', steps: `
view upl-ransom ransom
  title Your files are encrypted
  bg #1a0000
  fg #f2e6e6
  accent #c01818
  size 660x420
  heading Your files are encrypted
  icon lock
  | Your documents and photos were encrypted. Pay within the time below to get the key.
  section Time left
  timer Key destroyed in = 259200
  section Locked files
  columns File | State
  cells Q3-report.docx.locked | encrypted
  cells budget.xlsx.locked | encrypted
  cells holiday-01.png.locked | encrypted
  note A training copy: no payment is taken and no key exists.
  button Pay now -> none primary

step Every file is locked
  look Documents: a padlock on every file, and a new ending, .locked
${indent(['The program encrypts the documents and pictures one by one. Each gets a new ending, .locked, and no app can open it any more.', 'Try opening one: the computer says it cannot.'])}
attack ransomware-encrypt
  | Q3-report.docx
  | budget.xlsx
  | Client contacts.xlsx
  | holiday-01.png
encrypt Documents .locked
encrypt Pictures .locked
open Documents

step The ransom demand
  look the note on the desktop, the wallpaper and the payment window
${indent(['A note on the desktop and a new wallpaper say the files are held for a payment. A window counts down to the day the key is destroyed.', 'Paying is no promise of getting the files back.'])}
file Desktop/README_DECRYPT.txt
  | Your files are encrypted. Pay within 72 hours to get the key.
  | (Fictional training copy. Nothing on this desktop is real.)
wallpaper #3a0000
  | YOUR FILES ARE ENCRYPTED
  | Read README_DECRYPT.txt on the desktop
  | (training illustration)
show upl-ransom
` },
  'system-wipe': { proc: 'wiper.exe', cpu: 71, lesson: 'Keep offline backups and a recovery drive: a wiper leaves nothing to pay for and nothing to restore.', steps: `
view upl-wiped screen
  title Boot failure
  bg #000000
  fg #c0c0c0
  fullscreen
  heading An operating system wasn't found.
  line Try disconnecting any drives that don't contain an operating system.
  line Press Ctrl+Alt+Del to restart
  button Restart -> close

step It deletes everything it can reach
  look Documents: empty
${indent(['The program deletes the documents, the pictures and the desktop files. It does not ask for money: destroying them is the goal.'])}
delete Documents
delete Pictures
open Documents

step The computer will not start
  look the black boot screen
${indent(['It also overwrites the part of the disk the computer starts from. After the next restart there is nothing left to start.'])}
show upl-wiped
` },
  'destroy-files': { proc: 'cleanup.exe', cpu: 30, lesson: 'Keep a backup, and check what a program is before you run it: deleted files do not always reach the Recycle Bin.', steps: `
step Files disappear
  look Documents: three files are gone
${indent(['The program deletes some of the documents. Nothing on screen says so.', 'On a real computer they may not even be in the Recycle Bin.'])}
delete Documents/Q3-report.docx
delete Documents/budget.xlsx
delete Documents/notes.txt
open Documents
` },
  spread: { proc: 'netsvc.exe', cpu: 35, net: '192.0.2.0/24 port 445', attack: 'network-worm', lesson: 'Install security updates, and keep shared folders read-only for people who only need to read them.', steps: `
step It looks for other computers
  look Task Manager: netsvc.exe, and the blocked connections
${indent(['The program tries every computer on the office network, on the port Windows uses for shared folders (445).', 'This desktop has no network, so each try is blocked.'])}
attack network-worm
  | 192.0.2.10
  | 192.0.2.11
  | 192.0.2.12
block 192.0.2.10 445
block 192.0.2.11 445
block 192.0.2.12 445
open taskmanager

step It copies itself to the shared folder
  look the Office share: a copy with the same invoice name
${indent(['Where it gets in, it copies itself. Here it reaches the office\’s shared folder, under the same believable name.', 'The next colleague who opens it starts the same thing on their computer.'])}
drive Office share
  kind share
  as Share
file Share/Invoice_2291.pdf.exe
  icon pdf
open Share
` },
  'steal-credentials': { proc: 'svcupdate.exe', cpu: 12, attack: 'data-exfil', lesson: 'Use a password manager and two-step sign-in, and never keep keys or passwords in plain files.', steps: `
view upl-loot panel
  title What it packed (illustration)
  app Stolen data
  icon bug
  heading What it packed to send away
  section Files read
  columns Item | Where
  cells Cloud access keys | .aws\\credentials
  cells SSH private key | .ssh\\id_rsa
  cells Saved Wi-Fi passwords | Windows credential store
  note Fictional. On a real computer each item opens a door the attacker can use later.
  button Close -> close primary

step It reads saved passwords and keys
  look the list of what it packed, and the blocked connection
${indent(['The program reads the files where computers keep keys and saved passwords, and packs them up.', 'It then tries to send them away. Here the connection is blocked.'])}
attack data-exfil
  | access keys
  | SSH key
  | sent to the attacker
show upl-loot
block 203.0.113.7 443
` },
  'steal-browser': { proc: 'svcupdate.exe', cpu: 14, attack: 'data-exfil', lesson: 'Use a password manager and two-step sign-in. If a stealer ran, change your passwords from another device and sign out of every session.', steps: `
view upl-loot panel
  title What it packed (illustration)
  app Stolen data
  icon bug
  heading What it copied from the browser
  section Browser data
  columns Item | Count
  cells Saved passwords | 37
  cells Cookies (signed-in sessions) | 412
  cells Saved cards | 2
  note Fictional. Cookies let the attacker use accounts without the password or the code.
  button Close -> close primary

step It copies the browser's passwords and cookies
  look the list of what it copied, and the blocked connection
${indent(['The program opens the browser\’s own files: saved passwords, saved cards and the cookies that keep Dana signed in.', 'With the cookies, an attacker can use her accounts without a password or a code.'])}
attack data-exfil
  | saved passwords
  | cookies
  | sent to the attacker
show upl-loot
block 203.0.113.8 443
` },
  'steal-documents': { proc: 'svcupdate.exe', cpu: 20, attack: 'data-exfil', lesson: 'Keep sensitive documents in places that need a sign-in, and report any program you did not mean to run.', steps: `
step It collects the documents
  look Downloads: collected.zip, and the blocked connection
${indent(['The program copies the documents into one zip file, ready to send.', 'It then tries to upload it. Here the connection is blocked.'])}
attack data-exfil
  | Q3-report.docx
  | Client contacts.xlsx
  | sent to the attacker
folder Downloads/collected.zip
file Downloads/collected.zip/Q3-report.docx
file Downloads/collected.zip/Client contacts.xlsx
block 203.0.113.9 443
open Downloads
` },
  keylog: { proc: 'input-logger.exe', cpu: 4, attack: 'spyware-surveillance', lesson: 'Use two-step sign-in, so a typed password is not enough, and check Task Manager for programs you do not know.', steps: `
step It records every key
  look the keystrokes.log file: what Dana typed, word for word
${indent(['The program records every key Dana presses into a hidden file: mails, searches and passwords.', 'Every few minutes it sends the file away.'])}
attack spyware-surveillance
  | keys recorded
  | password typed
  | file sent
file Documents/keystrokes.log
  | [09:02 Mail] Hi Priya, the van lease is 389 a month
  | [09:05 Browser] bank sign in
  | [09:05 Browser] dana.okafor@northwind.example  ********** (the password, in clear)
  | [09:07 Mail] Marcus, can you check the travel line?
open Documents/keystrokes.log
` },
  capture: { proc: 'screen-recorder.exe', cpu: 9, attack: 'spyware-surveillance', lesson: 'Check Task Manager and the start-up list for programs you do not know, and keep the screen locked when you step away.', steps: `
step It takes pictures of the screen
  look Pictures: new screen captures
${indent(['The program takes a picture of the screen every few seconds and saves it to send later.', 'Anything on screen is in them: mails, documents, bank pages.'])}
attack spyware-surveillance
  | screen captured
  | screen captured
  | pictures sent
file Pictures/capture-01.png
file Pictures/capture-02.png
file Pictures/capture-03.png
open Pictures
` },
  'clipboard-swap': { proc: 'clipboard-watcher.exe', cpu: 1, attack: 'wallet-drain', lesson: 'Check the first and last characters of every pasted payment address before you send.', steps: `
view upl-wallet panel
  title Training Wallet
  app Training Wallet
  icon money
  heading Send bitcoin
  section Payment
  row Amount = 0.25 BTC
  row Pay to (pasted) = 1TrainAttacker4hJf8LsYt6aNcQ1uVo9f4
  section You copied
  tone good
  code 1TrainSupplier7q3kZc9WmP2xRvB5nDe7e1
  section What was pasted
  tone bad
  code 1TrainAttacker4hJf8LsYt6aNcQ1uVo9f4
  note Fictional training addresses.
  button Send -> close primary

step It changes what Dana pastes
  look the Pay to box: the pasted address is not the one she copied
${indent(['The program watches the clipboard. When Dana copies a payment address, it swaps it for the attacker\’s.', 'Nothing warns her: the only clue is the address itself.'])}
attack wallet-drain
  | address copied
  | address swapped
  | payment to the attacker
show upl-wallet
` },
  'fake-login': { proc: 'svcupdate.exe', cpu: 3, attack: 'credential-phish', lesson: 'Type the address of a site yourself, or use a bookmark. A sign-in page you reached from a file or a mail is a guess, not a site.', steps: `
page signin account-check.invalid/login
  title Sign in to continue
  heading Your session expired. Sign in to keep reading.
  brand Account check
  insecure
  button Sign in
  button Cancel

step A sign-in page opens
  look the address bar: account-check.invalid, and "Not secure"
${indent(['The file opens a page that looks like a normal sign-in. The address is not the site it pretends to be.', 'Whatever is typed here goes to the attacker.'])}
attack credential-phish
  | page opened
  | password typed
  | sent to the attacker
open signin

step What signing in would do
  look the blocked connection
  when choose signin 1
${indent(['Signing in sends the address and password to the attacker, who tries them on every site Dana uses.'])}
block account-check.invalid 443
` },
  'exfil-attempt': { proc: 'svcupdate.exe', cpu: 5, attack: 'data-exfil', lesson: 'Report a program you did not mean to run, even when nothing seems to happen.', steps: `
step It tries to send something away
  look Task Manager, and the blocked connection
${indent(['The program tries to send data to a server. Here the connection is blocked, so nothing leaves.'])}
block 203.0.113.7 443
open taskmanager
` },
  'self-copy': { proc: 'svchost32.exe', cpu: 2, lesson: 'A program in AppData with a system name is a warning sign: the real svchost.exe lives in System32.', steps: `
step It hides a copy of itself
  look the hidden AppData folder: svchost32.exe
${indent(['The program copies itself into a hidden folder under a name close to a real Windows program.', 'Deleting the attachment no longer removes it.'])}
folder Home/AppData
  hidden
folder Home/AppData/Roaming
file Home/AppData/Roaming/svchost32.exe
  hidden
open Home/AppData/Roaming
` },
  'privilege-escalation': { proc: 'svcupdate.exe', cpu: 6, lesson: 'Say No to an administrator prompt you did not expect: it is the program asking for the whole computer.', steps: `
program upl-admin svchelper
  prompt elevation
  process svchelper.exe
  cpu 7
  parent svcupdate.exe

step It asks to be an administrator
  look the User Account Control prompt: an unknown publisher
${indent(['The program asks for administrator rights. With them it can change anything on the computer, for every user.', 'Saying Yes is the moment it takes the whole computer.'])}
folder Home/AppData
  hidden
file Home/AppData/svchelper.exe
  program upl-admin
open Home/AppData/svchelper.exe

step With Yes, it has the whole computer
  look Task Manager: svchelper.exe
${indent(['Now it runs as an administrator: it can turn off protection and hide where normal users cannot look.'])}
answer run
open taskmanager
` },
  persistence: { proc: 'updater.exe', cpu: 2, lesson: 'Check the start-up list now and then (Task Manager on Windows, Login Items on a Mac), and remove what you do not know.', steps: `
step It sets itself to start every time
  look the start-up list: Updater
${indent(['The program adds itself to the programs that start when Dana signs in, under a harmless name.', 'Restarting the computer no longer gets rid of it.'])}
startup Updater C:\\Users\\Dana\\AppData\\Roaming\\updater.exe
  location HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run
open taskmanager
` },
  'defence-tamper': { proc: 'svcupdate.exe', cpu: 6, lesson: 'If protection turns itself off, do not turn it back on and carry on: disconnect and ask for help.', steps: `
step It turns off the protection
  look the Windows Security warning: real-time protection is off
${indent(['The program switches off the antivirus so the next programs it fetches are not caught.', 'Windows says so, in a warning that is easy to dismiss.'])}
notify settings Virus & threat protection is off
  | Real-time protection is off, leaving your device vulnerable.
open taskmanager
` },
  'traffic-redirect': { proc: 'dnschanger.exe', cpu: 3, attack: 'credential-phish', lesson: 'Check the address bar before you sign in, and use a bookmark for your bank.', steps: `
page bank online-banking.invalid
  title Online banking: sign in
  heading Sign in to online banking
  brand Online banking
  insecure
  button Sign in

step It changes where names lead
  look Task Manager: dnschanger.exe
${indent(['The program changes the computer\’s DNS: the phone book that turns names into addresses. Now it decides where every name leads.'])}
open taskmanager

step The bank's name leads to a copy
  look the address bar: the bank's page, "Not secure"
${indent(['Dana types her bank\’s name as usual. The page that opens is the attacker\’s copy.'])}
attack credential-phish
  | name looked up
  | wrong address
  | password to the attacker
open bank
` },
  'browser-hijack': { proc: 'searchhelper.exe', cpu: 3, lesson: 'Remove browser add-ons and home pages you did not choose, and install software only from its maker’s own site.', steps: `
page hijack search-start.invalid
  title Search Start
  heading Search the web
  toolbar SearchStart
  button Search

step The browser has a new home page
  look the browser: a search page and a toolbar Dana never chose
${indent(['The program changes the browser\’s home page and search, and adds a toolbar.', 'Every search now goes through the attacker\’s site, which shows its own adverts and records what Dana looks for.'])}
homepage hijack
open hijack
` },
  'remote-control': { proc: 'remote-agent.exe', cpu: 4, net: '203.0.113.20 port 4444', attack: 'spyware-surveillance', lesson: 'Never let a stranger "connect to fix" your computer, and check Task Manager for remote programs you did not install. Say no when an unknown program asks the firewall to let it accept connections.', steps: `
step It asks to let the attacker in
  look the firewall alert: an unknown program wants to accept connections
${indent(['The program opens a door on the computer for the attacker to connect to. The firewall notices and asks first.', 'Allowing it is the dangerous answer. Cancel (or Deny) keeps the door shut.'])}
dialog firewall {file}

step It opens a door for the attacker
  look Task Manager: remote-agent.exe, and the blocked connection
${indent(['The program connects to the attacker and waits for orders: move files, watch the screen, run other programs.'])}
attack spyware-surveillance
  | connected
  | screen watched
  | files taken
block 203.0.113.20 4444
open taskmanager
` },
  injection: { proc: 'svcupdate.exe', cpu: 3, lesson: 'A trusted program using too much processor can be hiding someone else’s code: report it.', steps: `
step It hides inside a trusted program
  look Task Manager: explorer.exe, flagged and busy
${indent(['The program puts its code inside explorer.exe, the program that draws the desktop. It now runs under a trusted name.'])}
run explorer.exe
  cpu 41
  mem 210
  parent userinit.exe
open taskmanager
` },
  'second-stage': { proc: 'loader.exe', cpu: 5, attack: 'macro-dropper', lesson: 'A small file that "does nothing" may be fetching the real malware. Report it before it finishes.', steps: `
program upl-stage2 stage2
  process stage2.exe
  cpu 33
  parent loader.exe

step It fetches the real malware
  look Downloads: stage2.bin, and the blocked download
${indent(['The first program is only a loader. It downloads the next program, often ransomware or a stealer.'])}
attack macro-dropper
  | loader started
  | download
  | next program
block cdn.update.invalid 443
file Downloads/stage2.bin
  hidden
  program upl-stage2
open Downloads

step The second program starts
  look Task Manager: stage2.exe under loader.exe
${indent(['On a real computer the download works, and the second program starts.'])}
launch upl-stage2
open taskmanager
` },
  'resource-hijack': { proc: 'svchosts.exe', cpu: 97, lesson: 'A computer that is suddenly slow and loud may be mining for someone else. Check Task Manager.', steps: `
step It uses the computer to make money
  look Task Manager: svchosts.exe at 97% of the processor
${indent(['The program mines cryptocurrency with Dana\’s processor. The computer gets slow, hot and loud.'])}
open taskmanager
` },
  'other-harm': { proc: 'svcupdate.exe', cpu: 8, lesson: 'Report any program you did not mean to run, even when nothing seems to happen.', steps: `
step It runs in the background
  look Task Manager: a program Dana did not start
${indent(['The program keeps running. Nothing on screen shows what it does.'])}
open taskmanager
` },
};
export const UPLOAD_BEHAVIOURS = Object.keys(STEPS);

// The scene for an uploaded fish: { type, findingId } (a creature ate it) or { type, depth } (a Sunlight or Twilight school).
export function uploadScene({ type, findingId, depth }) {
  const a = arrival(type);
  const school = !findingId;
  const harm = STEPS[findingId] ?? STEPS['other-harm'];
  const lines = [`# An uploaded file: ${type} file${findingId ? `, ${findingId}` : `, ${depth} school`}. Generated by backend/detonation/upload-scenes.mjs.`, `os ${a.os}`, 'about',
    `  | ${ILLUSTRATION_NOTE}`,
    `  | It shows how a file like this one usually arrives, what the computer does when it is opened${school ? '' : ', and what its kind of malware then does'}.`, ''];
  const proc = school ? 'toolbar-helper.exe' : harm.proc;
  const procLines = [`  process ${proc}`, `  cpu ${school ? 3 : harm.cpu}`, `  parent ${a.kind === 'program' ? 'explorer.exe' : a.kind === 'pdf' ? 'Viewer.exe' : a.process}`, ...(harm.net && !school ? [`  net ${harm.net}`] : [])];
  // Sunlight files are harmless: the document opens and nothing else happens.
  if (depth === 'sunlight') {
    const name = a.kind === 'program' ? 'Statement_October.pdf' : a.name.replace(/\.(docm|xlsm)$/, m => (m === '.docm' ? '.docx' : '.xlsx'));
    lines.push('step A file arrives', `  look the attachment: ${name}`, '  | A message with an attachment. Most attachments are what they say they are: this one is.', '',
      `mail arrives`, `  from ${a.mail[0]}`, `  subject ${a.mail[1]}`, `  attach Downloads/${name}`, `  | ${a.mail[2]}`, `file Downloads/${name}`,
      `  | ${a.mail[1]}`, '  | A harmless document: no program, no macro.', 'open arrives', '',
      'step It opens as a document', '  look the document window: no warning, nothing else running',
      '  | It opens in its own app. No security warning appears, nothing asks to be turned on, and no new program starts.', `open Downloads/${name}`, '',
      'lesson', '  | A harmless file opens as itself. Be wary of the ones that ask for more: to enable content, to run, or to sign in.');
    return lines.join('\n');
  }
  // The file and how it opens.
  const path = a.folder ? `Downloads/${a.folder}/${a.name}` : `Downloads/${a.name}`;
  const harmSteps = harm.steps.replaceAll('{file}', path);
  const payload = school ? 'upl-adware' : 'upl-payload';
  if (a.kind === 'office') {
    const content = a.app === 'Excel' ? 'Enable Content to see the invoice total.' : 'This invoice was created in an earlier version. Enable editing, then enable content, to view it.';
    lines.push(`view upl-doc document`, `  title ${a.name} [Protected View] - ${a.app}`, `  app ${a.app}`, '  size 720x480',
      '  page', '  bar PROTECTED VIEW  Be careful: files from the Internet can contain viruses. -> Enable Editing -> next', '  icon lock', `  heading ${content}`, '  | Training copy: there is no invoice in this file.',
      '  page', '  bar SECURITY WARNING  Macros have been disabled. -> Enable Content -> run:' + payload, '  icon lock', `  heading ${content}`, '  | Training copy: there is no invoice in this file.', '',
      `program ${payload} ${proc}`, '  publisher none', ...procLines, '', `program upl-file ${a.name}`, '  publisher none', `  process ${a.process}`, '  cpu 3', '  parent explorer.exe', '  view upl-doc', '');
  } else if (a.kind === 'pdf') {
    lines.push('view upl-doc document', `  title ${a.name}`, '  app PDF', '  size 700x460', '  bar This document is protected. Open the secure attachment to view it. -> Open -> run:' + payload, '  icon lock',
      '  heading Secure statement', '  | The statement is in a protected attachment. Click Open in the bar above to view it.', '  | Training copy: there is no statement in this file.', '',
      `program ${payload} ${proc}`, '  publisher none', ...procLines, '', `program upl-file ${a.name}`, '  publisher none', '  view upl-doc', '');
  } else {
    lines.push(`program upl-file ${a.name}`, '  publisher none', ...a.prompts.map(kind => `  prompt ${kind}`), ...procLines.map(line => line.replace(/^  parent .*/, '  parent explorer.exe')), '');
  }
  // 1. It arrives.
  lines.push('step A message with an attachment', `  look the attachment: ${a.folder ?? a.name}`,
    `  | ${a.mail[1]}: the mail asks Dana to open the attachment. Nobody she knows sent it.`, `  | Look at the sender's address, not just the name.`);
  if (a.folder) lines.push(`folder Downloads/${a.folder}`);
  lines.push(`file ${path}`, ...(a.icon ? [`  icon ${a.icon}`] : []), '  program upl-file', '  size 184320',
    'mail arrives', `  from ${a.mail[0]}`, `  subject ${a.mail[1]}`, `  attach Downloads/${a.folder ?? a.name}`, `  | ${a.mail[2]}`, 'open arrives', '');
  // 2. It is opened.
  if (a.kind === 'office') {
    lines.push('step The document asks to turn things on', `  look ${a.app}: the yellow bar and a page with no invoice on it`,
      `  | ${a.app} opens the file in Protected View, which stops it running code. The page shows no invoice, only a reason to click the bar.`,
      '  | "Enable Editing" and then "Enable Content" turn that protection off.', `open ${path}`, '',
      'step Enable Content runs the macro', `  look Task Manager: ${proc} under ${a.process}`,
      `  | The macro in the file starts ${proc}. From here on, everything happens out of sight.`,
      'press upl-doc next', `press upl-doc run:${payload}`, 'open taskmanager', '');
  } else if (a.kind === 'pdf') {
    lines.push('step The PDF asks to open something else', '  look the bar above the page: "Open the secure attachment"',
      '  | The statement is not in the PDF. A bar asks Dana to open a "secure attachment" instead.', `open ${path}`, '',
      'step Open starts a program', `  look Task Manager: ${proc}`,
      '  | The "attachment" is a program hidden in the PDF. Open starts it, and the statement never appears.', `press upl-doc run:${payload}`, 'open taskmanager', '');
  } else {
    const mac = a.os === 'macos';
    if (a.folder) lines.push('step Inside the attachment', `  look the file inside ${a.folder}: ${a.name}`,
      `  | The attachment is a ${mac ? 'disk image' : 'compressed folder'}. Inside is one file${a.icon ? ' with a PDF icon' : ''}.`, mac ? '  | Disk images are how Mac apps are shared, which makes this one look normal.' : '  | Windows hides the last ending of its name: it reads Invoice_2291.pdf, but it is a program.',
      `open Downloads/${a.folder}`, '');
    lines.push('step The warning almost nobody reads', `  look ${mac ? 'the Gatekeeper sheet: "an app downloaded from the Internet"' : 'the Open File - Security Warning: Publisher "Unknown Publisher"'}`,
      `  | Opening it makes the computer ask first: a program from the Internet, from an unknown publisher. A real document never asks this.`, `open ${path}`, '',
      'step Saying yes to every warning', `  look ${mac ? 'Activity Monitor' : 'Task Manager'}: ${proc}`,
      `  | ${a.prompts.length > 1 ? 'One warning leads to the next. Each yes lets it go further.' : 'With Run, it starts.'} Then nothing seems to happen.`,
      ...a.prompts.map(() => 'answer run'), 'open taskmanager', '');
  }
  // 3. What it does.
  if (school) {
    lines.push('page upl-ads deals-today.invalid', '  title Deals Today', '  heading Today’s deals for you', '  toolbar DealsToday', '  button See deals', '',
      'step Adverts take over the browser', '  look the browser: a toolbar and a home page Dana never chose',
      '  | The file was adware. It adds a toolbar and changes the home page, so every visit starts with its adverts.', 'homepage upl-ads', 'open upl-ads', '',
      'lesson', `  | ${a.lesson}`, '  | Remove toolbars and home pages you did not choose.');
  } else {
    lines.push(harmSteps.trim(), '', 'lesson', `  | ${a.lesson}`, `  | ${harm.lesson}`);
  }
  return lines.join('\n');
}
