export function mountTuner(rig){
  if(new URLSearchParams(location.search).get('debug')!=='1') return;
  const box=document.createElement('div');
  box.style.cssText='position:fixed;right:8px;bottom:8px;z-index:10;width:190px;padding:10px;background:#111d;color:#fff;font:11px system-ui;border:1px solid #ffffff22;border-radius:10px';
  const defs=[['headTurn',-.24,.24,.01],['tailSwing',-1,1,.02],['tailCurl',-1,1,.02],['breath',-1,1,.02]];
  defs.forEach(([name,min,max,step])=>{
    const row=document.createElement('label');
    row.style.cssText='display:block;margin:7px 0';
    row.textContent=name+' ';
    const input=document.createElement('input');
    input.type='range'; input.min=min; input.max=max; input.step=step; input.value=rig.pose[name];
    input.oninput=()=>rig.setPose({[name]:+input.value});
    row.append(input); box.append(row);
  });
  document.body.append(box);
}