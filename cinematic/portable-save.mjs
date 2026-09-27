// Portable saves remain local. No server or account is involved.
export const MAX_SAVE_BYTES=1000000;
export function parsePortableSave(raw,restoreWorld){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_SAVE_BYTES)
    return {world:null,error:'Файл сохранения слишком большой или повреждён.'};
  const world=restoreWorld(raw);
  return world?{world,error:null}:
    {world:null,error:'Это не сохранение текущей версии игры или данные повреждены.'};
}
export function downloadPortableSave(doc,json){
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=doc.createElement('a');
  link.href=url;link.download='chain-reaction-save.json';
  doc.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function installPortableControls(doc,{onTick,onExport,onImport,onError}){
  const next=doc.createElement('button');
  next.id='nextTurn';next.className='ctrl';next.type='button';
  next.title='Следующий ход';next.setAttribute('aria-label','Следующий ход');
  next.textContent='⏭';doc.querySelector('.controls').appendChild(next);
  next.addEventListener('click',onTick);

  const menu=doc.getElementById('menuBox');
  const before=doc.getElementById('fullscreenBtn');
  const download=doc.createElement('button');
  download.id='exportSave';download.className='send';download.type='button';
  download.textContent='⬇ Экспортировать мир';
  menu.insertBefore(download,before);download.addEventListener('click',onExport);

  const upload=doc.createElement('button');
  upload.id='importSave';upload.className='send';upload.type='button';
  upload.textContent='⬆ Импортировать мир';
  menu.insertBefore(upload,before);

  const picker=doc.createElement('input');
  picker.type='file';picker.accept='.json,application/json';
  picker.id='importSaveInput';picker.hidden=true;menu.insertBefore(picker,before);
  upload.addEventListener('click',()=>picker.click());
  picker.addEventListener('change',async()=>{
    const file=picker.files?.[0];picker.value='';
    if(!file)return;
    if(file.size>MAX_SAVE_BYTES){onError('Файл сохранения слишком большой.');return;}
    try{await onImport(await file.text());}
    catch{onError('Не удалось прочитать файл сохранения.');}
  });
}
