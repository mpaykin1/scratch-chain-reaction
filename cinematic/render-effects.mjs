import {fitCanvas} from './quality.mjs';
import {createAdaptiveQuality} from './adaptive-quality.mjs';
const VS=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}`;
const FS=`#version 300 es
precision highp float;
in vec2 uv;
uniform float time,energy,ecology,water,age,amplitude;
uniform vec2 origin;
out vec4 color;
void main(){
  float dist=length((uv-origin)*vec2(1.0,1.5));
  float ring=exp(-120.0*pow(dist-age*0.38,2.0));
  float echo=exp(-180.0*pow(dist-age*0.24-0.09,2.0));
  float fade=clamp(1.0-age/3.0,0.0,1.0)*amplitude;
  float strength=(ring*0.8+echo*0.2)*fade;
  vec3 tint=mix(vec3(0.16,0.72,0.92),vec3(1.0,0.27,0.09),clamp(1.0-min(ecology,water)+energy*0.1,0.0,1.0));
  color=vec4(tint,clamp(strength*0.36,0.0,0.38));
}`;
function makeProgram(gl){
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  const v=compile(gl.VERTEX_SHADER,VS),f=compile(gl.FRAGMENT_SHADER,FS),program=gl.createProgram();
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniforms=Object.fromEntries(['time','energy','ecology','water','age','amplitude','origin'].map(k=>[k,gl.getUniformLocation(program,k)]));
  return {program,uniforms,vao:gl.createVertexArray()};
}
function fallback(host){
  const ring=document.createElement('div');ring.className='reaction-fallback-pulse';ring.setAttribute('aria-hidden','true');host.appendChild(ring);
  return {setWorldState(s){host.dataset.climate=s.eco<22||s.water<8?'critical':s.eco<55||s.water<18?'stressed':'stable';},
    pulse(point){ring.style.setProperty('--pulse-x',point[0]*100+'%');ring.style.setProperty('--pulse-y',(1-point[1])*100+'%');ring.classList.remove('active');void ring.offsetWidth;ring.classList.add('active');},
    destroy(){ring.remove()}};
}
export function createEffectLayer(host){
  if(!host)return null;
  const css=fallback(host);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){host.dataset.effectRenderer='css-fallback';return {...css,pulse(){}};}
  const canvas=document.createElement('canvas');canvas.id='reactionCanvas';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen';
  host.insertBefore(canvas,host.querySelector('#people')||null);
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power'});
  if(!gl){canvas.remove();host.dataset.effectRenderer='css-fallback';return css;}
  let gpu;try{gpu=makeProgram(gl);}catch{canvas.remove();host.dataset.effectRenderer='css-fallback';return css;}
  host.dataset.effectRenderer='webgl2';
  let state={power:0,eco:0,water:0},lastFrame=0,pulseAt=-10000,origin=[0.5,0.5],lost=false,disposed=false,cleared=true;
  const governor=createAdaptiveQuality({slowMs:65,fastMs:38});
  const coarse=matchMedia('(pointer:coarse)').matches;
  function resize(){
    const rect=host.getBoundingClientRect(),size=fitCanvas(rect.width,rect.height,devicePixelRatio||1,1080,governor.quality);
    if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;gl.viewport(0,0,size.width,size.height);}host.dataset.renderScale=String(governor.quality);
  }
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);
  observer?.observe(host);window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;host.dataset.effectRenderer='css-fallback';});
  canvas.addEventListener('webglcontextrestored',()=>{try{gpu=makeProgram(gl);lost=false;gl.viewport(0,0,canvas.width,canvas.height);resize();host.dataset.effectRenderer='webgl2';}catch{host.dataset.effectRenderer='css-fallback';}});
  function frame(now){
    if(disposed)return;requestAnimationFrame(frame);
    if(lost||document.hidden||now-lastFrame<(coarse?32:24))return;
    const age=(now-pulseAt)/1000;
    if(age>3.1){if(!cleared){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);cleared=true;}lastFrame=0;return;}
    const prior=governor.quality;if(lastFrame)governor.observe(now-lastFrame);
    if(prior!==governor.quality)resize();
    lastFrame=now;resize();cleared=false;
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(gpu.program);gl.bindVertexArray(gpu.vao);
    gl.uniform1f(gpu.uniforms.time,now/1000);gl.uniform1f(gpu.uniforms.energy,state.power/100);
    gl.uniform1f(gpu.uniforms.ecology,state.eco/100);gl.uniform1f(gpu.uniforms.water,state.water/100);
    gl.uniform1f(gpu.uniforms.age,Math.max(0,(now-pulseAt)/1000));
    gl.uniform1f(gpu.uniforms.amplitude,1);
    gl.uniform2f(gpu.uniforms.origin,...origin);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  resize();requestAnimationFrame(frame);
  return {
    setWorldState(next){state=next;css.setWorldState(next);},
    pulse(kind){origin=({city:[.29,.56],forest:[.64,.5],energy:[.52,.48],volcano:[.83,.42]})[kind]||[.5,.5];pulseAt=performance.now();lastFrame=0;if(lost)css.pulse(origin);},
    destroy(){disposed=true;observer?.disconnect();window.removeEventListener('resize',resize);if(!lost){gl.deleteVertexArray(gpu.vao);gl.deleteProgram(gpu.program);}canvas.remove();css.destroy();}
  };
}
