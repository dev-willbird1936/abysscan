// Legacy archive: the superseded flat-palette study and RetroDiffusion loops.
// Runs only after the user opens <details id="legacy">; the current grid never loads these assets.
document.querySelector('#legacy').addEventListener('toggle',function init(event){
 if(!event.target.open)return;
 event.target.removeEventListener('toggle',init);
 document.querySelector('#legacy-variants').replaceChildren();
 const roleColors={primary:'#FF00A8',secondary:'#00E5FF',tertiary:'#B6FF00'};
 const themes={sunlight:'#164d4a',twilight:'#173867',midnight:'#25234f',abyss:'#112a3c',trench:'#111522'};
 Promise.all([fetch('indexed-manifest.json').then(r=>{if(!r.ok)throw Error('Indexed manifest missing');return r.json()}),fetch('depth-variants.json').then(r=>{if(!r.ok)throw Error('Depth variants missing');return r.json()}),fetch('../retrodiffusion-creature-animation/manifest.json').then(r=>r.ok?r.json():{derivatives:[]}).catch(()=>({derivatives:[]})) ]).then(([baseManifest,variants,rd])=>{
  const hasSiblingRD=rd.derivatives.length===30;
  if(!hasSiblingRD)document.querySelectorAll('.project-link').forEach(link=>link.hidden=true);
  const body=document.querySelector('#legacy-variants');
  const rdByCell=new Map(rd.derivatives.map(loop=>[`${loop.family}/${loop.depth}`,loop]));
  for(const base of baseManifest.assets){
   const row=document.createElement('tr'),head=document.createElement('th');head.scope='row';
   const title=document.createElement('strong');title.textContent=base.family;head.append(title);
   const line=document.createElement('small'),baseLink=document.createElement('a');baseLink.href=base.file;baseLink.download='';baseLink.textContent='Role-coded base';line.append(baseLink);head.append(line);row.append(head);
   for(const depth of variants.depths){
    const item=variants.variants.find(v=>v.family===base.family&&v.depth===depth),cell=document.createElement('td');cell.style.setProperty('--ocean',themes[depth]);
    if(!item){cell.textContent='Missing';row.append(cell);continue}
    const img=document.createElement('img');img.src=item.display_file;img.alt=`${base.family} · ${depth}`;img.loading='lazy';cell.append(img);
    const label=document.createElement('small');label.className='depth-name';label.textContent=depth[0].toUpperCase()+depth.slice(1);cell.append(label);
    const link=document.createElement('a');link.href=item.file;link.download='';link.textContent='Download legacy PNG';cell.append(link);const rdLoop=rdByCell.get(`${base.family}/${depth}`);if(rdLoop){cell.append(document.createTextNode(' · '));const animation=document.createElement('a');animation.href='../retrodiffusion-creature-animation/'+rdLoop.file;animation.download='';animation.textContent='RetroDiffusion animation (legacy)';cell.append(animation);}row.append(cell);
   }
   body.append(row);
  }
  const cards=document.querySelector('#legacy-bases');
  for(const base of baseManifest.assets){
   const card=document.createElement('article'),title=document.createElement('h3'),img=document.createElement('img');title.textContent=base.family;img.src=base.display_file;img.alt=base.family+' indexed base';card.append(title,img);
   const chips=document.createElement('p');for(const role of ['primary','secondary','tertiary']){const swatch=document.createElement('span');swatch.className='chip';swatch.style.background=roleColors[role];swatch.title=role+' '+roleColors[role];chips.append(swatch,document.createTextNode(' '+role+'  '));}card.append(chips);
   const download=document.createElement('a');download.href=base.file;download.download='';download.textContent='Download indexed base';card.append(download);card.append(document.createElement('br'));
   const native=document.createElement('a');native.href=base.native_file;native.download='';native.textContent='Untouched native';card.append(native);
   for(const role of ['primary','secondary','tertiary']){card.append(document.createTextNode(' · '));const mask=document.createElement('a');mask.href=base.role_mask_files[role];mask.download='';mask.textContent=role+' mask';card.append(mask)}
   cards.append(card);
  }
 }).catch(error=>document.querySelector('#legacy-variants').textContent='Could not load palette assets: '+error.message);
 fetch('all-six-palette-bases.zip',{method:'HEAD'}).then(r=>{if(!r.ok)document.querySelector('.zip-link').hidden=true}).catch(()=>document.querySelector('.zip-link').hidden=true);
});
