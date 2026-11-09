// Only reviewed, hash-pinned, passive SVG artwork. Not a general SVG exemption.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const DESKTOP_ARTWORK_NAMES=Object.freeze([
  'app-accounts.svg','app-browser-windows.svg','app-browser.svg','app-files.svg','app-finder.svg',
  'app-inbox.svg','app-launchpad.svg','app-logs.svg','app-monitor.svg','app-outbox.svg','app-payments.svg',
  'app-permissions.svg','app-services.svg','app-sessions.svg','app-training-center.svg','app-training-guide.svg',
  'app-transfers.svg','app-updater.svg','app-wallet.svg','sonoma-flow.svg','windows-bloom.svg',
]);
const tags=new Set(['svg','defs','linearGradient','radialGradient','stop','path','rect','circle','ellipse','line','polyline','polygon','g']);
const attrs=new Set(['xmlns','viewBox','preserveAspectRatio','id','x','y','x1','y1','x2','y2','width','height','rx','ry',
  'cx','cy','r','d','points','fill','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity',
  'opacity','offset','stop-color','stop-opacity','transform','gradientTransform','gradientUnits','fx','fy']);
export function verifyPassiveDesktopSvg(buffer,expectedSha256){
  if(!Buffer.isBuffer(buffer)||buffer.length>16384||! /^[a-f0-9]{64}$/.test(expectedSha256||''))return false;
  if(createHash('sha256').update(buffer).digest('hex')!==expectedSha256)return false;
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{return false;}
  if(!/^\s*<svg\b/.test(text)||!/<\/svg>\s*$/.test(text)||/[\u0000-\u001f]/.test(text.replace(/[\t\r\n]/g,''))||/[&]|<!|<\?/.test(text))return false;
  const stack=[];let cursor=0,roots=0;
  for(const match of text.matchAll(/<([^<>]+)>/g)){
    if(text.slice(cursor,match.index).trim())return false;
    cursor=match.index+match[0].length;
    const tag=match[1].match(/^(\/)?([A-Za-z][A-Za-z0-9]*)\b([\s\S]*?)(\/)?$/);
    if(!tag||!tags.has(tag[2]))return false;
    if(tag[1]){if(tag[3].trim()||tag[4]||stack.pop()!==tag[2])return false;continue;}
    if(!stack.length){if(tag[2]!=='svg'||++roots!==1)return false;}
    let end=0;const seen=new Set();
    for(const attribute of tag[3].matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/g)){
      if(tag[3].slice(end,attribute.index).trim()||!attrs.has(attribute[1])||seen.has(attribute[1]))return false;
      seen.add(attribute[1]);end=attribute.index+attribute[0].length;
      const value=attribute[2].slice(1,-1);
      if(attribute[1]==='xmlns'){if(tag[2]!=='svg'||value!=='http://www.w3.org/2000/svg')return false;}
      else if(/[:<>\\]|\b(?:javascript|data|https?)\b/i.test(value)||/url\(/i.test(value)&&!/^url\(#[A-Za-z][A-Za-z0-9_-]*\)$/.test(value))return false;
    }
    if(tag[3].slice(end).trim()||tag[2]==='svg'&&!seen.has('xmlns'))return false;
    if(!tag[4])stack.push(tag[2]);
  }
  return cursor>0&&!text.slice(cursor).trim()&&!stack.length&&roots===1;
}
export function loadDesktopArtwork(root){
  const manifestPath=join(root,'ui/desktop/assets/artwork-manifest.json');
  const bytes=readFileSync(manifestPath);if(bytes.length>16384)throw Error('desktop_artwork_manifest_rejected');
  const manifest=JSON.parse(bytes);
  if(!manifest||Object.keys(manifest).sort().join(',')!=='files,type'||manifest.type!=='original-passive-svg-v1'||!Array.isArray(manifest.files)||manifest.files.length!==DESKTOP_ARTWORK_NAMES.length)throw Error('desktop_artwork_manifest_rejected');
  const approved=new Map();
  for(const entry of manifest.files){
    if(!entry||Object.keys(entry).sort().join(',')!=='name,sha256'||!DESKTOP_ARTWORK_NAMES.includes(entry.name)||approved.has('ui/desktop/assets/'+entry.name))throw Error('desktop_artwork_manifest_rejected');
    const relative='ui/desktop/assets/'+entry.name;
    if(!verifyPassiveDesktopSvg(readFileSync(join(root,relative)),entry.sha256))throw Error('desktop_artwork_rejected: '+entry.name);
    approved.set(relative,entry.sha256);
  }
  return approved;
}
