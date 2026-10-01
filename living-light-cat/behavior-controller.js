export class IdleBehaviorController{
  sample(t){
    const headTurn=Math.sin(t*0.72)*0.205;
    const headTilt=Math.sin(t*0.39+0.8)*0.035;
    const tailSwing=Math.sin(t*1.02);
    const tailCurl=Math.sin(t*0.53+1.4)*0.55;
    const breath=Math.sin(t*1.55)*0.75;
    const twitch=Math.pow(Math.max(0,Math.sin(t*2.91+0.4)),10);
    return {headTurn,headTilt,tailSwing,tailCurl,tailPhase:t,breath,earTwitch:twitch};
  }
}