import {fitCanvas} from './quality.mjs';
const VS=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}`;
const FS=`#version 300 es
precision highp float;
in vec2 uv;
uniform float time,energy,ecology,age,amplitude;
uniform vec2 origin;
out vec4 color;
void main(){
  float dist=length((uv-origin)*vec2(1.0,1.5));
  float ring=exp(-120.0*pow(dist-age*0.38,2.0));
  float echo=exp(-180.0*pow(dist-age*0.24-0.09,2.0));
  float fade=clamp(1.0-age/3.0,0.0,1.0)*amplitude;
  float strength=(ring*0.8+echo*0.2)*fade;
  vec3 tint=mix(vec3(0.16,0.72,0.92),vec3(1.0,0.27,0.09),clamp(1.0-ecology+energy*0.1,0.0,1.0));
  color=vec4(tint,clamp(strength*0.36,0.0,0.38));
}`;
function makeProgram(gl){
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  const v=compile(gl.VERTEX_SHADER,VS),f=compile(gl.FRAGMENT_SHADER,FS),program=gl.createProgram();
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniforms=Object.fromEntries(['time','energy','ecology','age','amplitude','origin'].map(k=>[k,gl.getUniformLocation(program,k)]));
  return {program,uniforms,vao:gl.createVertexArray()};
}
export function createEffectLayer(host){
  if(!host||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
  const canvas=document.createElement('canvas');canvas.id='reactionCanvas';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen';
  host.insertBefore(canvas,host.querySelector('#people')||null);
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power'});
  if(!gl){canvas.remove();host.dataset.effectRenderer='css-fallback';return null;}
  let gpu;try{gpu=makeProgram(gl);}catch{canvas.remove();host.dataset.effectRenderer='css-fallback';return null;}
  host.dataset.effectRenderer='webgl2';
  let state={power:0,eco:0},quality=1,lastFrame=0,pulseAt=-10000,origin=[0.5,0.5],lost=false,disposed=false,slow=0;
  const coarse=matchMedia('(pointer:coarse)').matches;
  function resize(){
    const rect=host.getBoundingClientRect(),size=fitCanvas(rect.width,rect.height,devicePixelRatio||1,1080,quality);
    if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;gl.viewport(0,0,size.width,size.height);}
  }
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);
  observer?.observe(host);window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
  canvas.addEventListener('webglcontextrestored',()=>{try{gpu=makeProgram(gl);lost=false;resize();}catch{host.dataset.effectRenderer='css-fallback';}});
  function frame(now){
    if(disposed)return;requestAnimationFrame(frame);
    if(lost||document.hidden||now-lastFrame<(coarse?32:24))return;
    if(lastFrame&&now-lastFrame>65)slow++;else slow=Math.max(0,slow-2);
    if(slow>35){quality=Math.max(0.58,quality-0.12);slow=0;}
    lastFrame=now;resize();
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(gpu.program);gl.bindVertexArray(gpu.vao);
    gl.uniform1f(gpu.uniforms.time,now/1000);gl.uniform1f(gpu.uniforms.energy,state.power/100);
    gl.uniform1f(gpu.uniforms.ecology,state.eco/100);
    gl.uniform1f(gpu.uniforms.age,Math.max(0,(now-pulseAt)/1000));
    gl.uniform1f(gpu.uniforms.amplitude,1);
    gl.uniform2f(gpu.uniforms.origin,...origin);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  resize();requestAnimationFrame(frame);
  return {
    setWorldState(next){state=next;},
    pulse(kind){origin=({city:[.29,.56],forest:[.64,.5],energy:[.52,.48],volcano:[.83,.42]})[kind]||[.5,.5];pulseAt=performance.now();},
    destroy(){disposed=true;observer?.disconnect();window.removeEventListener('resize',resize);canvas.remove();}
  };
}
