import { createServer } from 'node:http';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join, resolve, extname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { loadOceanProfiles } from '../backend/ocean-profiles.mjs';
import { readAvatar } from '../backend/desktop-avatars.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const projectRoot=dirname(root);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp3':'audio/mpeg'};
const csp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
// Final world-contract shells (macOS, Windows): framed by the local app or this server, local media allowed, no frames.
const finalShellCsp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' http://127.0.0.1:4173";
const finalShellPrefixes=['/previews/macos-final/','/previews/win11-final/'];
// The one Windows and one macOS shell, plus the scene scripts. Alternatives live in archive/ and are never served.
export function createComparisonServer({ shellRoots = {} } = {}){
 if (!shellRoots || typeof shellRoots !== 'object' || Array.isArray(shellRoots) || Object.keys(shellRoots).some(os => !['windows','macos'].includes(os))) throw new TypeError('shellRoots accepts only windows and macos build directories.');
 const routes=new Map();
 // Explicit local build overrides keep the original preview outputs intact during fork acceptance tests.
 const excluded = new Set(['node_modules','.git','.cache','archive','sources','test','tests','check','evidence','screenshots']);
 function add(directory, relative){for(const entry of readdirSync(directory,{withFileTypes:true})){const file=join(directory,entry.name),route=relative+'/'+entry.name;if(entry.isDirectory()){if(!excluded.has(entry.name))add(file,route)}else if(entry.isFile()&&mime[extname(file)])routes.set('/'+route.split('/').map(encodeURIComponent).join('/'),file)}}
 for(const [os,folder] of [['windows','previews/win11-final'],['macos','previews/macos-final']]){
  const override = shellRoots[os];
  if (override !== undefined && (typeof override !== 'string' || !isAbsolute(override) || !override)) throw new TypeError(`${os} shell root must be an absolute local build directory.`);
  const directory=override ?? join(root,folder);
  if (!lstatSync(directory).isDirectory() || !lstatSync(join(directory,'index.html')).isFile()) throw new TypeError(`${os} shell root must contain a regular index.html.`);
  add(directory,folder);
 }
 for(const file of ['index.html','previews/ocean-scenes.js','previews/ocean-fx.js'])routes.set('/'+file,join(root,file));
 for(const depth of ['sunlight','twilight','midnight','abyss','trench'])routes.set(`/previews/ocean-scenarios/${depth}.js`,join(root,`previews/ocean-scenarios/${depth}.js`));
 // Wallpaper creature sprites for the shells (world.scene.creature.sprite) and victim avatars (world.user.avatar): exact, hash-checked or by id.
 let creatureAssets=new Map();
 try{creatureAssets=loadOceanProfiles(projectRoot).assets}catch{creatureAssets=new Map()}
 const sendAsset=(response,mime,bytes)=>{response.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"});response.end(bytes)};
 return createServer((request,response)=>{
  if(!['GET','HEAD','OPTIONS'].includes(request.method)){response.writeHead(405,{Allow:'GET, HEAD, OPTIONS'});response.end();return}
  let requestUrl,pathname;
  try{requestUrl=new URL(request.url,'http://127.0.0.1');pathname=requestUrl.pathname.split('/').map(s=>encodeURIComponent(decodeURIComponent(s))).join('/')}catch{response.writeHead(400);response.end('Invalid path');return}
  if(request.method!=='OPTIONS'){
   const creature=creatureAssets.get(pathname);
   if(creature){if(request.method==='HEAD'){response.writeHead(200,{'Content-Type':'image/gif','Content-Length':creature.bytes.length});response.end();return}sendAsset(response,'image/gif',creature.bytes);return}
   const avatarId=/^\/avatars\/([a-z0-9-]{1,40})$/.exec(pathname)?.[1];
   const avatar=avatarId?readAvatar(projectRoot,avatarId):null;
   if(avatar){if(request.method==='HEAD'){response.writeHead(200,{'Content-Type':avatar.mime,'Content-Length':avatar.bytes.length});response.end();return}sendAsset(response,avatar.mime,avatar.bytes);return}
  }
  const file=routes.get(pathname==='/'?'/index.html':pathname);
  if(!file){response.writeHead(404);response.end('Not found');return}
  if(request.method==='OPTIONS'){response.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'Content-Type, X-Requested-With'});response.end();return}
  const type=mime[extname(file)];let data;
  try{data=readFileSync(file)}catch{response.writeHead(503);response.end('Preview asset unavailable');return}
  const responseCsp=type==='image/svg+xml'?"default-src 'none'; script-src 'none'; sandbox":finalShellPrefixes.some(prefix=>pathname.startsWith(prefix))?finalShellCsp:csp;
  // Audio and video accept one byte range (206), so the media element can seek; every other header is unchanged.
  const media=/^(audio|video)\//.test(type);
  let status=200,body=data,contentRange;
  if(media){
   const range=/^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range||''));
   if(range&&(range[1]||range[2])){
    const size=data.length;
    const start=range[1]===''?Math.max(0,size-Number(range[2])):Number(range[1]);
    const end=range[1]===''||range[2]===''?size-1:Math.min(Number(range[2]),size-1);
    if(!(start<size&&start<=end)){response.writeHead(416,{'Content-Range':`bytes */${size}`,'Accept-Ranges':'bytes'});response.end();return}
    status=206;body=data.subarray(start,end+1);contentRange=`bytes ${start}-${end}/${size}`;
   }
  }
  response.writeHead(status,{'Content-Type':type,'Content-Length':body.length,...(media?{'Accept-Ranges':'bytes'}:{}),...(contentRange?{'Content-Range':contentRange}:{}),'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':responseCsp,'Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), usb=(), serial=(), clipboard-read=(), clipboard-write=()'});
  response.end(request.method==='HEAD'?undefined:body);
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const shellRoots={...(process.env.E2E_WINDOWS_SHELL_ROOT?{windows:resolve(process.env.E2E_WINDOWS_SHELL_ROOT)}:{}),...(process.env.E2E_MACOS_SHELL_ROOT?{macos:resolve(process.env.E2E_MACOS_SHELL_ROOT)}:{})};
 const server=createComparisonServer({shellRoots});
 server.once('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 4189 is occupied. Close the previous desktop shell server window; no existing listener was stopped.':error.message);process.exitCode=1});
 server.listen(4189,'127.0.0.1',()=>{const url='http://127.0.0.1:4189/';console.log('Training desktops (Windows 11, macOS): '+url+'\nKeep this console open. Local evaluation only; no training backend.');if(process.platform==='win32'&&!process.argv.includes('--no-browser')){const browser=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{stdio:'ignore',windowsHide:true});browser.on('error',()=>console.log('Open the URL manually.'));browser.unref()}});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.closeAllConnections();server.close()});
}
