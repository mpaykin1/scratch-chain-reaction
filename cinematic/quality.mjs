export function fitCanvas(cssWidth,cssHeight,dpr=1,maxSide=1080,quality=1){
  const w=Math.max(1,Number(cssWidth)||1),h=Math.max(1,Number(cssHeight)||1);
  const ratio=Math.min(Math.max(0.5,Number(dpr)||1),maxSide/Math.max(w,h))*Math.max(0.5,Math.min(1,quality));
  return {width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio)),scale:ratio};
}
