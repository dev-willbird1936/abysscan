import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Builds previews/macos-final/ (the final training macOS shell) from the private Kimi macOS 27 mirror.
// Reproducible and fail-closed: every source file must match its recorded SHA-256 and every bundle patch must match
// exactly the expected number of times. The sources/kimi-macos27 originals are only read, never written.
// Authored inputs live in previews/macos-final/src/ and are never deleted; generated files are listed in generated.json.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const source = path.join(here, 'sources/kimi-macos27');
const out = path.join(here, 'previews/macos-final');
const authored = path.join(out, 'src');
const BUNDLE = 'assets/index-Bfk0NWYJ.js';
const sha = data => createHash('sha256').update(data).digest('hex');

const provenance = JSON.parse(fs.readFileSync(path.join(source, 'provenance.json'), 'utf8'));
const recorded = new Map([...provenance.files, ...(provenance.derivedFiles ?? [])].map(item => [item.file, item.sha256]));
function readVerified(file) {
  const data = fs.readFileSync(path.join(source, file));
  if (!recorded.has(file)) throw Error(`No recorded hash for ${file}`);
  if (sha(data) !== recorded.get(file)) throw Error(`${file} differs from provenance.json; refusing to build`);
  return data;
}

// [description, search (string or global RegExp), replacement, expected match count]
const PATCHES = [
  ['desktop layer: the window wrapper no longer swallows desktop clicks',
    '"code-path":"src/os/components/WindowManager.tsx:33:9",className:"absolute inset-0 pointer-events-auto"',
    '"code-path":"src/os/components/WindowManager.tsx:33:9",className:"absolute inset-0 pointer-events-none"', 1],
  ['desktop layer: window frames opt back in to pointer events',
    '"code-path":"src/os/components/WindowFrame.tsx:250:7",ref:m,className:"fixed surface-window overflow-hidden"',
    '"code-path":"src/os/components/WindowFrame.tsx:250:7",ref:m,className:"fixed surface-window overflow-hidden pointer-events-auto"', 1],
  ['shortcuts: ⌃⌘Q lock is no longer shadowed by ⌘Q quit',
    'if(h&&!s.shiftKey&&!s.altKey)switch(s.key.toLowerCase()){case"q":',
    'if(h&&!(s.ctrlKey&&s.metaKey)&&!s.shiftKey&&!s.altKey)switch(s.key.toLowerCase()){case"q":', 1],
  ['shortcuts: ⌃⌘Space emoji is no longer shadowed by Spotlight',
    'if(h&&s.code==="Space"&&!s.shiftKey&&!s.altKey)', 'if(h&&s.code==="Space"&&!(s.ctrlKey&&s.metaKey)&&!s.shiftKey&&!s.altKey)', 1],
  ['shortcuts: ⌃↑/⌃↓ Mission Control can fire (h includes ctrlKey)',
    'if(s.ctrlKey&&!h&&!s.altKey){if(s.key==="ArrowUp")', 'if(s.ctrlKey&&!s.metaKey&&!s.altKey){if(s.key==="ArrowUp")', 1],
  ['shortcuts: F3 opens Mission Control',
    'switch(s.key){case"F4":{s.preventDefault(),r.spotlightOpen?',
    'switch(s.key){case"F3":{s.preventDefault(),c.setMissionControl(c.missionControl==="all"?!1:"all");return}case"F4":{s.preventDefault(),r.spotlightOpen?', 1],
  ['screenshot cull: ⇧⌘3 and ⇧⌘4', 'case"3":{s.preventDefault(),ANe();return}case"4":{s.preventDefault(),NNe();return}', '', 1],
  ['screenshot cull: capture entry points', 'function ANe(){mU?.save()}function NNe(){ze.getState().setScreenshotMode("region")}', 'function ANe(){}function NNe(){}', 1],
  ['screenshot cull: Spotlight action',
    '{id:"act-shot",name:"Take Screenshot",glyph:"Camera",run:()=>{window.dispatchEvent(new CustomEvent("macos27:screenshot"))}},', '', 1],
  ['screenshot cull: shortcut help', '["⇧⌘3","Screenshot"],["⇧⌘4","Selection screenshot"],', '["F3","Mission Control"],', 1],
  ['Siri cull: pill', 'function BSe(){const t=ze(m=>m.siriOpen)', 'function BSe(){return null;const t=ze(m=>m.siriOpen)', 1],
  ['Siri cull: open action', 'setSiriOpen:s=>t({siriOpen:s})', 'setSiriOpen:s=>{}', 1],
  ['Siri cull: menu bar button', 'e.jsx("button",{"code-path":"src/os/components/MenuBar.tsx:486:9"', 'null&&e.jsx("button",{"code-path":"src/os/components/MenuBar.tsx:486:9"', 1],
  ['Safari: no external site is allowed into a frame', 'function I4e(t){try{return T4e.has(new URL(t).hostname.toLowerCase())}catch{return!1}}', 'function I4e(t){return!1}', 1],
  ['Safari: scene:<id> URLs open the training page',
    'function F4e(t,a=!0){const s=t.trim();', 'function F4e(t,a=!0){const s=t.trim();if(/^scene:[a-z0-9-]{1,40}$/.test(s)){const g=window.__oceanWorld?.data.web?.pages?.[s.slice(6)];return{kind:"external",display:g?.url.replace(/^https?:\\/\\//,"")??s,title:g?.title??"Training page",url:s}}', 1],
  ['Safari: the external page renders the scene page, never an iframe',
    'function nve({winId:t,tabId:a,info:s}){return e.jsx("iframe",{"code-path":"src/apps/internet/safari/ExternalPages.tsx:18:5",src:s.url,title:s.title,className:"w-full h-full border-0 bg-white",sandbox:"allow-scripts allow-same-origin allow-popups allow-forms",referrerPolicy:"no-referrer",onLoad:()=>lt.iframeLoaded(t,a)},s.url)}',
    'function nve({winId:t,tabId:a,info:s}){return window.__oceanScenePage?.(s.url,e)??e.jsx("div",{className:"w-full h-full grid place-items-center surface-window text-label-2",style:{fontSize:13},children:"This training browser only opens built-in pages."})}', 1],
  ['Safari: a scene page finishes loading like a built-in page (no frame timeout)', 'r(.35,120),o!=="external"?(r(.7,240),', 'r(.35,120),!0?(r(.7,240),', 1],
  ['weather widget: fixed offline forecast, no request',
    'if(!t){s({temp:68,hi:74,lo:55,code:2,offline:!0});return}let o=!0;return fetch(', '{s({temp:64,hi:69,lo:56,code:2});return}let o=!0;return fetch(', 1],
  ['mail: the second account is a fictional archive, not a real provider',
    '"code-path":"src/apps/communication/mail/MailApp.tsx:218:13",className:"flex-1 truncate",children:"Gmail"',
    '"code-path":"src/apps/communication/mail/MailApp.tsx:218:13",className:"flex-1 truncate",children:"Archive account"', 1],
  ['Activity Monitor: a refused quit (scene process without an end choice) shows no "terminated" notice',
    'const Q=()=>{a.kill(C.pid),C.kind==="app"', 'const Q=()=>{if(!a.kill(C.pid))return;C.kind==="app"', 1],
  ['file-open handlers only list installed apps', 'function mE(t){return _1.filter(a=>a.fileTypes?.includes(t))}', 'function mE(t){return qu().filter(a=>a.fileTypes?.includes(t))}', 1],
  ['programs: opening a world file goes through the OS (prompts, programs, read-only PDFs; docs/desktop-parity/PROGRAMS.md)',
    'Le("finder",{folderId:o.id,path:s.pathOf(o.id)});const c=xn(o.name);',
    'Le("finder",{folderId:o.id,path:s.pathOf(o.id)});if(!a&&window.__oceanOpenFile?.(o.id))return null;const c=xn(o.name);', 1],
  ['programs: Get Info on a world file opens the shared Properties dialog',
    'r.push({label:"Get Info",shortcut:"⌘I",action:()=>ze.getState().setInfoNode(t.id)})',
    'r.push({label:"Get Info",shortcut:"⌘I",action:()=>{window.__oceanGetInfo?.(t.id)||ze.getState().setInfoNode(t.id)}})', 1],
  ['mail: scene links and attachments under the body',
    'children:t.body.split(/\\n{2,}/).map((b,M)=>e.jsx("p",{"code-path":"src/apps/communication/mail/MailApp.tsx:490:13",className:"mb-3 whitespace-pre-wrap",children:b},M))',
    'children:[...t.body.split(/\\n{2,}/).map((b,M)=>e.jsx("p",{"code-path":"src/apps/communication/mail/MailApp.tsx:490:13",className:"mb-3 whitespace-pre-wrap",children:b},M)),window.__oceanMailExtras?.(t)]', 1],
  ['login: no Finder window opens by itself (windows belong to the world)',
    'p.length===0?Le("finder",{folderId:"documents",path:"/Users/kimi/Documents"}):', 'p.length===0?null:', 1],
  ['identity: lock screen avatar initial',
    '"code-path":"src/os/components/LockScreen.tsx:83:11",className:"text-white text-[40px] font-semibold",children:"K"',
    '"code-path":"src/os/components/LockScreen.tsx:83:11",className:"text-white text-[40px] font-semibold",children:__oceanUser.name.charAt(0)', 1],
  ['identity: settings avatar initial', '0 2px 8px rgba(0,0,0,0.18)"},children:"K"})}function I8e(', '0 2px 8px rgba(0,0,0,0.18)"},children:__oceanUser.name.charAt(0)})}function I8e(', 1],
  // Asset URLs become document-relative so the shell works under /previews/macos-final/.
  ['assets: relative media paths', /"\/(wallpaper-[a-z-]+\.jpg|photo-\d\.jpg|cover-\d\.jpg|track-\d\.mp3|podcast-cover\.jpg)"/g, '"./$1"', 78],
  ['assets: seeded photo paths', 'assetUrl:`/photo-${s}.jpg`', 'assetUrl:`./photo-${s}.jpg`', 1],
  ['assets: seeded track paths', 'assetUrl:`/track-${s}.mp3`', 'assetUrl:`./track-${s}.mp3`', 1],
  // Identity: the fixed "kimi" account becomes the world user (window.__oceanUser, kept current by the adapter).
  ['identity: home paths', /"\/Users\/kimi([^"]*)"/g, '("/Users/"+__oceanUser.short+"$1")', 15],
  ['identity: home folder name', 'id:"home",parentId:"users",name:"kimi",kind:"folder"', 'id:"home",parentId:"users",name:__oceanUser.short,kind:"folder"', 1],
  ['identity: settings user', 'user:{name:"kimi"}', 'user:{name:__oceanUser.name}', 1],
  ['identity: mail account', 'const Lo={name:"kimi",email:"kimi@icloud.com"}', 'const Lo={name:__oceanUser.name,email:__oceanUser.email}', 1],
  ['identity: email labels', /children:"kimi@icloud\.com"/g, 'children:__oceanUser.email', 3],
  ['identity: device name', '"Discoverable as “kimi’s MacBook Pro”"', '"Discoverable as “"+__oceanUser.name+"’s Mac”"', 1],
  ['identity: device label', 'children:"kimi’s MacBook Pro"', 'children:__oceanUser.name+"’s Mac"', 1],
  ['identity: process owner filter', 'R.user==="kimi"', 'R.user===__oceanUser.short', 1],
  ['identity: process owners', /user:"kimi"/g, 'user:__oceanUser.short', 16],
  ['identity: terminal prompt', 't:"kimi@macbook"', 't:__oceanUser.short+"@mac"', 1],
  ['identity: terminal title prompt', '["kimi@macbook","green"', '[__oceanUser.short+"@mac","green"', 1],
  ['identity: whoami', 'case"whoami":return x("kimi")', 'case"whoami":return x(__oceanUser.short)', 1],
  ['identity: ls owner', '{t:"  1  kimi  staff  "}', '{t:"  1  "+__oceanUser.short+"  staff  "}', 1],
  ['identity: sudo', 'a("kimi is not in the s', 'a(__oceanUser.short+" is not in the s', 1],
  ['identity: terminal title', '`kimi — -zsh — ${R}', '`${__oceanUser.short} — -zsh — ${R}', 1],
  ['identity: account labels', /children:"kimi"/g, 'children:__oceanUser.name', 4],
  // Remaining occurrences are sample text (seed mail, seed files, mock pages) that the world replaces or that no scene uses.
  ['identity: remaining sample text', /\bkimi\b/g, 'trainee', 12],
  // Branding: no real-brand sites, tickers, accounts or places where a trainee would see them. The Apple-like look stays.
  ['Safari: an address that is not a scene page shows the neutral page (no built-in real-brand sites or search results)',
    'if(s==="safari:history"||s==="history:")return{kind:"history",display:"safari:history",title:"History",url:"safari:history"};',
    'if(s==="safari:history"||s==="history:")return{kind:"history",display:"safari:history",title:"History",url:"safari:history"};{const k=u=>Mf(u).replace(/\\/+$/,"").toLowerCase(),g=Object.entries(window.__oceanWorld?.data.web?.pages??{}).find(([,p])=>k(p.url)===k(s));return g?F4e("scene:"+g[0],a):{kind:"offline",display:Mf(s),title:"Not Available",url:s}}', 1],
  ['Safari: the neutral page explains the training browser',
    'children:"You Are Not Connected to the Internet"}),e.jsx("div",{"code-path":"src/apps/internet/safari/ExternalPages.tsx:102:9",className:"mt-2 text-[13px] text-label-2",children:"This page can’t be displayed because your Mac is currently offline. Turn Wi-Fi back on in Control Center, then reload."',
    'children:"This Page Isn’t Available"}),e.jsx("div",{"code-path":"src/apps/internet/safari/ExternalPages.tsx:102:9",className:"mt-2 text-[13px] text-label-2",children:"This training Mac opens only the pages that belong to the exercise. Use a favorite or a link from the exercise."', 1],
  ['stocks: fictional tickers for the widget and the (culled) app', /const Wm=\[\{symbol:"AAPL"[^\]]*\],YO=\[[^\]]*\];/g,
    'const Wm=[' + [['NWND', 'Northwind Traders', 84.2], ['FBRK', 'Fabrikam, Inc.', 142.6], ['CNTS', 'Contoso Ltd.', 213.4], ['TLSP', 'Tailspin Toys', 38.9],
      ['WWIM', 'Wide World Importers', 61.5], ['ADVW', 'Adventure Works', 97.3], ['LTWR', 'Litware, Inc.', 27.8], ['PRSW', 'Proseware, Inc.', 118.1],
      ['FRCF', 'Fourth Coffee', 19.6], ['ALSH', 'Alpine Ski House', 45.2], ['BLYA', 'Blue Yonder Airlines', 72.9], ['CHWN', 'Coho Winery', 33.4]]
      .map(([symbol, name, base], index) => `{symbol:"${symbol}",name:"${name}",base:${base},vol:${(0.0012 + index * 0.00015).toFixed(5)},capB:${Math.round(base * 3)},pe:${(18 + index * 2.5).toFixed(1)}}`).join(',')
      + '],YO=["NWND","FBRK","CNTS","TLSP","WWIM","ADVW","LTWR","PRSW"];', 1],
  ['stocks: no real-company news', /const M\$=\[\{id:"n1"[\s\S]*?\]\}\];(?=function Jve)/g, 'const M$=[];', 1],
  ['mail: the first account is the work account; the address truncates instead of hiding the label',
    'className:"flex-1 truncate",children:"iCloud"}),e.jsx("span",{"code-path":"src/apps/communication/mail/MailApp.tsx:214:13",className:"text-[10px] text-label-3"',
    'className:"shrink-0",children:"Work"}),e.jsx("span",{"code-path":"src/apps/communication/mail/MailApp.tsx:214:13",className:"text-[10px] text-label-3 truncate min-w-0 ml-auto"', 1],
  ['mail: the reader shows the whole sender name and address (it wraps; a cut address hides the lookalike domain)',
    'className:"text-[14px] font-semibold text-label flex items-center gap-1.5 truncate",children:[t.from.name',
    'className:"text-[14px] font-semibold text-label flex items-center gap-1.5",style:{flexWrap:"wrap",rowGap:0},children:[t.from.name', 1],
  ['mail: the sender address breaks anywhere instead of truncating',
    'className:"font-normal text-label-3 text-[12px] truncate",children:`<${t.from.email}>`',
    'className:"font-normal text-label-2 text-[12px]",style:{wordBreak:"break-all"},children:`<${t.from.email}>`', 1],
  ['Safari: the start page hides an empty Favorites section (the world has no web pages)',
    'h.favorites&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{"code-path":"src/apps/internet/safari/StartPage.tsx:112:13"',
    'h.favorites&&Z4e.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{"code-path":"src/apps/internet/safari/StartPage.tsx:112:13"', 1],
  ['branding: iCloud labels', /iCloud/g, 'Cloud', 18],
  ['branding: Apple Account labels', /Apple Account/g, 'Account', 7],
  ['branding: Music sidebar heading', 'tracking-wide text-label-2",children:"Apple Music"}', 'tracking-wide text-label-2",children:"Discover"}', 1],
  ['branding: Wi-Fi networks and Bluetooth devices are generic', '{name:"xfinitywifi",secured:!0,signal:2},{name:"Pretty Fly for a Wi-Fi",secured:!0,signal:1}],w8e=[{name:"AirPods Pro",status:"Connected",battery:.84},{name:"Magic Keyboard",status:"Connected",battery:null},{name:"MX Master 3",',
    '{name:"Harbor-Library",secured:!0,signal:2},{name:"Northwind-Guest",secured:!0,signal:1}],w8e=[{name:"Wireless Earbuds",status:"Connected",battery:.84},{name:"Wireless Keyboard",status:"Connected",battery:null},{name:"Wireless Mouse",', 1],
  ['branding: Settings Bluetooth devices and sound output are generic', /"(AirPods Pro|Magic Keyboard|MX Master 3)"/g,
    match => ({ '"AirPods Pro"': '"Wireless Earbuds"', '"Magic Keyboard"': '"Wireless Keyboard"', '"MX Master 3"': '"Wireless Mouse"' })[match], 4],
  ['branding: Settings account subscription and privacy text', /"(Apple One Premier|Share anonymous usage data with Apple|Apple-delivered ads in the App Store|Maps and Weather may use your \(simulated\) location)"/g,
    match => ({ '"Apple One Premier"': '"None"', '"Share anonymous usage data with Apple"': '"Share anonymous usage data with Northwind IT"',
      '"Apple-delivered ads in the App Store"': '"Suggestions in the App Store"', '"Maps and Weather may use your (simulated) location"': '"Apps may use your (simulated) location"' })[match], 4],
  ['branding: App Store developer', /developer:"Apple"/g, 'developer:"Northwind IT"', 4],
  ['clocks: the home city keeps the Mac\'s own time zone, so the world clock matches the menu bar',
    /((?:city|name):)"Cupertino",tz:"America\/Los_Angeles"/g, '$1"Harbor City",tz:Intl.DateTimeFormat().resolvedOptions().timeZone', 2],
  ['branding: real city in the weather widget, clocks and settings', /Cupertino/g, 'Harbor City', 13],
  ['Notification Center: medium widgets span both columns (no clipped stocks or squeezed calendar)',
    '"code-path":"src/os/components/NotificationCenter.tsx:307:15",style:{', '"code-path":"src/os/components/NotificationCenter.tsx:307:15",style:{gridColumn:x.size==="M"?"span 2":void 0,', 1],
  ['Spotlight: ⌘Space opens the search (Files) tab, not the last-used Apps tab', 'r.spotlightOpen?r.closeSpotlight():r.openSpotlight();return}', 'r.spotlightOpen?r.closeSpotlight():r.openSpotlight("files");return}', 1],
  ['Spotlight: an Apps search without a match says so (no empty Suggested row)', '...w?[{label:"Remove from Dock",action:()=>Pt.getState().unpinApp(x)}]:[]])};return a==="list"?',
    '...w?[{label:"Remove from Dock",action:()=>Pt.getState().unpinApp(x)}]:[]])};return t.trim()&&p.length===0?e.jsxs("div",{className:"py-10 text-center text-[15px] text-label-2",style:{borderTop:"0.5px solid var(--separator)"},children:["No Results for ‘",t.trim(),"’"]}):a==="list"?', 1],
  ['Spotlight: the menu bar magnifier opens the search (Files) tab', '"aria-label":"Spotlight",onClick:()=>ze.getState().openSpotlight()', '"aria-label":"Spotlight",onClick:()=>ze.getState().openSpotlight("files")', 1],
  ['updates: Settings ▸ General ▸ Software Update opens the world-driven Software Update app', 'onClick:()=>t("general/software-update")', 'onClick:()=>Le("softwareupdate")', 2],
  ['updates: About This Mac ▸ Software Update… opens the world-driven Software Update app', 'Le("appstore",{pane:"updates"})},children:"Software Update…"', 'Le("softwareupdate")},children:"Software Update…"', 1],
  ['Finder: a .zip opens like any other world file (the stub extraction wrote folders outside the world contract and hid run-file)',
    'c==="zip"){const h=o.parentId??"home"', '!1){const h=o.parentId??"home"', 1],
  // Terminal working directory is world state (data.terminal.cwd): a new session starts there and every cd reports it.
  ['Terminal: a new session starts in the world working directory and registers with the adapter',
    'class X7e{cwd;oldpwd=null;constructor(a){const s=a?_s(jF(a)):null;this.cwd=a&&nc(s)?jF(a):Vm}',
    'class X7e{cwd;oldpwd=null;constructor(a){const s=a?_s(jF(a)):null;this.cwd=a&&nc(s)?jF(a):window.__oceanTerminalCwd?.()??Vm;window.__oceanTerminalSession?.(this)}', 1],
  ['Terminal: cd reports the new working directory', '(this.oldpwd=this.cwd,this.cwd=r,{})', '(this.oldpwd=this.cwd,this.cwd=r,window.__oceanTerminalCd?.(r),{})', 1],
  ['Terminal: cd - reports the new working directory', 'return this.cwd=this.oldpwd,this.oldpwd=h,s(AF(this.cwd)),{}',
    'return this.cwd=this.oldpwd,this.oldpwd=h,window.__oceanTerminalCd?.(this.cwd),s(AF(this.cwd)),{}', 1],
  // Scene focus dimming (world.scene.focusApps) and the creature (world.scene.creature) are drawn by src/scene-fx.js, which
  // needs the native app id on each window frame and on each Apps panel icon (the Dock already has data-dock-app).
  ['scene focus: window frames carry their native app id',
    '"code-path":"src/os/components/WindowFrame.tsx:250:7",ref:m,className:"fixed surface-window overflow-hidden pointer-events-auto"',
    '"code-path":"src/os/components/WindowFrame.tsx:250:7",ref:m,"data-native-app":s.appId,className:"fixed surface-window overflow-hidden pointer-events-auto"', 1],
  ['scene focus: Apps panel suggested icons carry their native app id',
    '"code-path":"src/os/components/Spotlight.tsx:283:11",className:"flex flex-col items-center gap-1 w-[76px]"',
    '"code-path":"src/os/components/Spotlight.tsx:283:11","data-native-app":x.id,className:"flex flex-col items-center gap-1 w-[76px]"', 1],
  ['scene focus: Apps panel category icons carry their native app id',
    '"code-path":"src/os/components/Spotlight.tsx:300:17",className:"flex flex-col items-center gap-1 w-[76px]"',
    '"code-path":"src/os/components/Spotlight.tsx:300:17","data-native-app":w.id,className:"flex flex-col items-center gap-1 w-[76px]"', 1],
  // Lock screen: the world user's avatar image (user.avatar other than 'initials') over the initial, and the email under the name.
  ['lock screen: avatar image from world.user.avatar',
    'className:"w-24 h-24 rounded-full grid place-items-center",style:{background:"linear-gradient(160deg,#5EB3F8,#1463E8)",boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.4), 0 8px 24px rgba(0,0,0,0.3)"},children:e.jsx("span",{"code-path":"src/os/components/LockScreen.tsx:83:11",className:"text-white text-[40px] font-semibold",children:__oceanUser.name.charAt(0)})})',
    'className:"w-24 h-24 rounded-full grid place-items-center relative overflow-hidden",style:{background:"linear-gradient(160deg,#5EB3F8,#1463E8)",boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.4), 0 8px 24px rgba(0,0,0,0.3)"},children:[e.jsx("span",{"code-path":"src/os/components/LockScreen.tsx:83:11",className:"text-white text-[40px] font-semibold",children:__oceanUser.name.charAt(0)},"initial"),window.__oceanAvatarUrl?.()&&e.jsx("img",{src:window.__oceanAvatarUrl(),alt:"",className:"absolute inset-0 w-full h-full object-cover",onError:ev=>{ev.currentTarget.style.display="none"}},"avatar")]})', 1],
  ['lock screen: email under the name',
    'children:s}),e.jsx("div",{"code-path":"src/os/components/LockScreen.tsx:88:9"',
    'children:s}),e.jsx("div",{"code-path":"src/os/components/LockScreen.tsx:87:9",className:"mt-0.5 text-white/80 text-[12px]",style:{textShadow:"0 1px 4px rgba(0,0,0,0.4)"},children:__oceanUser.email}),e.jsx("div",{"code-path":"src/os/components/LockScreen.tsx:88:9"', 1],
  // Sandbox replay (SPEC §9.1): an encrypted file shows a padlock, a new Safari tab opens the world homepage, and Settings lists the
  // world's login items (the pane itself is registered in src/bundle-hook.js).
  ['replay: an encrypted file shows a padlock badge on its icon',
    'function Rs({node:t,size:a=48}){const s=xn(t.name);',
    'function Rs(q){const a=q.size??48;return q.node.encrypted?e.jsxs("div",{"data-encrypted":"true",title:"Encrypted",className:"relative",style:{display:"inline-block"},children:[e.jsx(Rs0,{...q}),e.jsx("span",{"data-lock-badge":"true",className:"absolute grid place-items-center",style:{right:-4,bottom:-4,width:Math.round(a*.4),height:Math.round(a*.4),borderRadius:"50%",background:"#FF453A",boxShadow:"0 1px 3px rgba(0,0,0,0.4)"},children:e.jsx(Ni("Lock"),{size:Math.round(a*.24),color:"#fff",strokeWidth:2.4})})]}):e.jsx(Rs0,{...q})}function Rs0({node:t,size:a=48}){const s=xn(t.name);', 1],
  // After the padlock wrapper: the inner icon shows the shared type icon (a disguised program shows its disguise).
  ['programs: file icons show the shared type icon',
    'function Rs0({node:t,size:a=48}){const s=xn(t.name);',
    'function Rs0({node:t,size:a=48}){const __oi=window.__oceanFileIconUrl?.(t.id);if(__oi)return e.jsx("img",{src:__oi,alt:"",draggable:!1,"data-file-icon":t.id,style:{width:a,height:a,objectFit:"contain"}});const s=xn(t.name);', 1],
  ['programs: Activity Monitor\'s Inspect window shows a scene process\'s parent, command and network',
    'className:"grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[12px]",children:[',
    'className:"grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[12px]",children:[...(window.__oceanProcRows?.(t)??[]).flatMap(([l,v])=>[e.jsx("span",{className:"text-label-2",children:l},`l-${l}`),e.jsx("span",{className:"text-label break-all","data-proc-detail":l,children:v},`v-${l}`)]),', 1],
  ['programs: Finder hides a hidden (system) file as it hides dot-files, until Show Hidden Files',
    'function Bc(t){return t.name.startsWith(".")}', 'function Bc(t){return t.name.startsWith(".")||t.hidden===!0}', 1],
  // Finder's own inspector (item menu, File menu, ⌘I): one selected world file opens the shared Properties dialog instead.
  ['programs: Finder item menu Get Info',
    'gt.label==="Get Info"&&(gt.action=()=>M({open:!0}))',
    'gt.label==="Get Info"&&(gt.action=()=>{window.__oceanGetInfo?.($e.id)||M({open:!0})})', 1],
  ['programs: Finder File > Get Info and ⌘I',
    ',ot=()=>M({open:!0,fixedId:P.length?void 0:B??void 0}),',
    ',ot=()=>{P.length===1&&window.__oceanGetInfo?.(P[0])||M({open:!0,fixedId:P.length?void 0:B??void 0})},', 1],
  ['programs: Finder background menu Get Info (selection)',
    'action:()=>M({open:!0,fixedId:P.length?void 0:B??void 0})',
    'action:()=>{P.length===1&&window.__oceanGetInfo?.(P[0])||M({open:!0,fixedId:P.length?void 0:B??void 0})}', 1],
  ['replay: a new Safari tab opens the world homepage', 'function HO(t){const a=tF(t??"start:");', 'function HO(t){const a=tF(t??window.__oceanHomepage?.()??"start:");', 1],
  ['replay: Settings opens the Login Items pane', 'z=S=>{const[$,G]=S.split("/");switch($){case"account":', 'z=S=>{const[$,G]=S.split("/");switch($){case"loginitems":return e.jsx(window.__oceanLoginItems,{});case"account":', 1],
  ['Dock: a full-screen window hides the Dock until the pointer reaches the edge (as macOS does; a ransom or boot screen covers it)',
    'f=we(U=>U.dockAutohide),x=we(U=>U.dockPosition)', 'f=we(U=>U.dockAutohide)||Object.values(r).some(U=>U.fullscreen&&!U.minimized&&!U.hidden),x=we(U=>U.dockPosition)', 1],
  ['Finder: View > Show All Filename Extensions toggles the shared setting (sys.showExtensions, as Explorer does)',
    '{label:s?.showStatusBar?"Hide Status Bar":"Show Status Bar",shortcut:"⌘/",disabled:!a,action:()=>a?.toggleFlag("showStatusBar")}',
    '{label:s?.showStatusBar?"Hide Status Bar":"Show Status Bar",shortcut:"⌘/",disabled:!a,action:()=>a?.toggleFlag("showStatusBar")},{label:window.__oceanWorld?.sys?.showExtensions?"Hide All Filename Extensions":"Show All Filename Extensions",action:()=>window.__oceanToggleExtensions?.()}', 1],
];

function applyPatches(text) {
  for (const [description, search, replacement, expected] of PATCHES) {
    const count = typeof search === 'string' ? text.split(search).length - 1 : [...text.matchAll(search)].length;
    if (count !== expected) throw Error(`Patch "${description}" matched ${count} times, expected ${expected}; refusing to build`);
    text = typeof search === 'string' ? text.split(search).join(replacement) : text.replace(search, replacement);
  }
  if (/kimi/i.test(text)) throw Error('Kimi identity text survived the patches');
  return text;
}

const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
// Runs before the bundle: memory-only storage, the world user, and no camera, microphone, location or external network.
const PRELUDE = `
for (const name of ['localStorage', 'sessionStorage']) {
  const data = new Map();
  Object.defineProperty(window, name, { configurable: true, value: {
    getItem: key => data.get(String(key)) ?? null, setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(String(key)), clear: () => data.clear(), key: index => [...data.keys()][index] ?? null,
    get length() { return data.size; } } });
}
window.__oceanUser = (({ short, name, email }) => ({ short, name, email }))(window.__oceanWorldSeed.user);
const oceanDenied = () => Promise.reject(new DOMException('Not available in the training desktop.', 'NotAllowedError'));
if (navigator.mediaDevices) for (const name of ['getUserMedia', 'getDisplayMedia']) Object.defineProperty(navigator.mediaDevices, name, { value: oceanDenied });
for (const name of ['geolocation']) try { Object.defineProperty(navigator, name, { configurable: true, value: undefined }); } catch {}
for (const name of ['MediaRecorder', 'WebSocket', 'EventSource', 'RTCPeerConnection']) try { Object.defineProperty(window, name, { configurable: true, value: undefined }); } catch {}
navigator.sendBeacon = () => false;
window.open = () => null;
const oceanFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
  return url.host === location.host && /^https?:$/.test(url.protocol) ? oceanFetch(input, init) : Promise.reject(new TypeError('Network access is disabled in the training desktop.'));
};
`;
const INDEX = bundleFile => `<!DOCTYPE html><html lang="en" data-theme="dark"><head>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Training Mac</title>
<link href="./fonts/inter.css" rel="stylesheet"/>
<style>html, body, #root { height: 100%; margin: 0; overflow: hidden; background: #000; }
/* Low-effects mode (world sys.reduceTransparency): the bundle already gives glass surfaces solid fills; this also drops
   the remaining backdrop blurs, so the SVG refraction filter is never evaluated. */
html[data-reduce-transparency=true] *, html[data-reduce-transparency=true] *::before, html[data-reduce-transparency=true] *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
/* Menu bar: its own items follow the wallpaper tone the adapter samples (html[data-menubar-tone]), in either theme.
   Dropdown menus are siblings of these items and keep the theme colours. */
html[data-menubar-tone=light] .glass-menubar > .menubar-item { --label: #fff; }
html[data-menubar-tone=light] .glass-menubar > .menubar-item .menubar-text { text-shadow: 0 1px 2px rgba(0,0,0,.35); }
html[data-menubar-tone=dark] .glass-menubar > .menubar-item { --label: #1d1d1f; }
html[data-menubar-tone=dark] .glass-menubar > .menubar-item .menubar-text { text-shadow: 0 0 6px rgba(255,255,255,.3); }
/* Notification Center: grouped notifications fit the panel instead of the wider floating-banner width. */
[code-path="src/os/components/NotificationCenter.tsx:276:7"] .glass-banner { width: 100% !important; }</style>
<script src="./world-seed.js"></script>
<script src="./world-model.js"></script>
<script src="./program-ui.js"></script>
<script>${PRELUDE}</script>
<script type="module" crossorigin="" src="./${bundleFile}"></script>
<link rel="stylesheet" crossorigin="" href="./assets/index-BqrKPhU7.css"/>
<script defer src="./src/adapter.js"></script>
<script defer src="./src/scene-fx.js"></script>
</head>
<body>
<div id="root"></div>
<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
<filter id="lg-refraction" x="-5%" y="-5%" width="110%" height="110%">
<feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="noise"></feTurbulence>
<feGaussianBlur in="noise" stdDeviation="2.2" result="soft"></feGaussianBlur>
<feDisplacementMap in="SourceGraphic" in2="soft" scale="12" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
</filter></defs></svg>
</body></html>
`;

// ---- build ----
const hook = fs.readFileSync(path.join(authored, 'bundle-hook.js'), 'utf8');
for (const file of ['adapter.js', 'scene-fx.js', ...['sunlight', 'twilight', 'midnight', 'abyss', 'trench'].map(name => `wallpapers/depth-${name}.svg`)]) {
  if (!fs.existsSync(path.join(authored, file))) throw Error(`Missing authored file src/${file}`);
}
const bundle = applyPatches(readVerified(BUNDLE).toString('utf8')) + '\n' + hook;
const copies = [...recorded.keys()].filter(file => /^(assets\/index-BqrKPhU7\.css|fonts\/inter(-\d)?\.(woff2|css)|[a-z0-9-]+\.(jpg|mp3))$/.test(file));
const seed = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/desktop-world-seed.json'), 'utf8'));
const generated = new Map([
  ['assets/macos-final.js', Buffer.from(bundle)],
  ['index.html', Buffer.from(INDEX('assets/macos-final.js'))],
  ['world-seed.js', Buffer.from(`// Generated from data/desktop-world-seed.json for standalone mode.\nwindow.__oceanWorldSeed = ${JSON.stringify(seed)};\n`)],
  ['world-model.js', fs.readFileSync(path.join(projectRoot, 'ui/desktop/world-model.js'))],
  ['program-ui.js', fs.readFileSync(path.join(projectRoot, 'ui/desktop/program-ui.js'))],
  ...copies.map(file => [file, readVerified(file)]),
]);

// Remove only files this script generated last time.
const manifestPath = path.join(out, 'generated.json');
if (fs.existsSync(manifestPath)) {
  for (const { file } of JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files) {
    const full = path.join(out, file);
    if (!full.startsWith(out + path.sep) || full.startsWith(authored + path.sep)) throw Error(`Refusing to remove ${file}`);
    fs.rmSync(full, { force: true });
  }
}
for (const [file, data] of generated) {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.writeFileSync(path.join(out, file), data);
}
fs.writeFileSync(manifestPath, JSON.stringify({
  note: 'Generated by desktop-comparison/make-macos-final.mjs from the private Kimi macOS 27 mirror (build input not in the public repository). src/ is authored.',
  source: { bundle: BUNDLE, sha256: recorded.get(BUNDLE) },
  patches: PATCHES.map(([description, , , expected]) => ({ description, expected })),
  files: [...generated].map(([file, data]) => ({ file, bytes: data.length, sha256: sha(data) })),
}, null, 2));
console.log(`macos-final: ${generated.size} files, ${PATCHES.length} patches`);
