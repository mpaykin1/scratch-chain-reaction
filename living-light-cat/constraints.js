export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function constrainPose(input={}){
  return {
    breath:clamp(input.breath??0,-1,1),
    headTurn:clamp(input.headTurn??0,-0.24,0.24),
    headTilt:clamp(input.headTilt??0,-0.08,0.08),
    tailSwing:clamp(input.tailSwing??0,-1,1),
    tailCurl:clamp(input.tailCurl??0,-1,1),
    tailPhase:Number.isFinite(input.tailPhase)?input.tailPhase:0,
    earTwitch:clamp(input.earTwitch??0,0,1)
  };
}

export function layoutForViewport(width,height){
  const safeW=Math.max(280,width), safeH=Math.max(520,height);
  const scale=Math.min(safeW/520,safeH/900);
  return {cx:width*0.43,cy:height*0.50,scale};
}