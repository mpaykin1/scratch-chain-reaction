// Sound starts only after a user gesture and remains off by default.
export function createAmbientAudio(){
  let ctx=null,osc=null,gain=null,enabled=false;
  function ensure(){
    if(ctx)return true;
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return false;
    ctx=new Context();osc=ctx.createOscillator();gain=ctx.createGain();
    osc.type='sine';osc.frequency.value=65;gain.gain.value=0;
    osc.connect(gain).connect(ctx.destination);osc.start();return true;
  }
  return {
    get enabled(){return enabled;},
    async toggle(){
      if(!enabled){
        if(!ensure())return false;
        try{await ctx.resume();}catch{return false;}
        enabled=true;gain.gain.setTargetAtTime(0.025,ctx.currentTime,0.15);
      }else{
        enabled=false;gain.gain.setTargetAtTime(0,ctx.currentTime,0.08);
      }
      return enabled;
    },
    setWorldState(s){
      if(!ctx||!osc)return;
      const tension=(100-Math.max(0,Math.min(100,s.eco||0)))/100;
      osc.frequency.setTargetAtTime(75+45*tension+15*Math.min(1,(s.power||0)/100),ctx.currentTime,0.45);
    },
    pulse(kind){
      if(!enabled||!ctx)return;
      const now=ctx.currentTime;
      const tone=ctx.createOscillator(),volume=ctx.createGain();
      tone.type='sine';tone.frequency.value=({city:280,forest:370,energy:480,volcano:125})[kind]||290;
      volume.gain.setValueAtTime(0.0001,now);
      volume.gain.exponentialRampToValueAtTime(0.055,now+0.05);
      volume.gain.exponentialRampToValueAtTime(0.0001,now+0.4);
      tone.connect(volume).connect(ctx.destination);tone.start(now);tone.stop(now+0.42);
    },
    muteOnHidden(){
      if(!ctx||!gain)return;
      gain.gain.setTargetAtTime(document.hidden?0:enabled?0.025:0,ctx.currentTime,0.08);
    }
  };
}
