// CPU-only frame-budget governor. Idle/background time never lowers visual quality.
export function createAdaptiveQuality(options={}){
  const min=options.min??0.55,max=options.max??1;
  const slowMs=options.slowMs??60,fastMs=options.fastMs??37;
  const slowWindow=options.slowWindow??18,fastWindow=options.fastWindow??90;
  let quality=Math.min(max,Math.max(min,options.initial??max)),slow=0,fast=0;
  return {
    get quality(){return quality;},
    observe(ms,{visible=true,active=true}={}){
      if(!visible||!active||!Number.isFinite(ms)||ms<=0||ms>300)return quality;
      if(ms>slowMs){slow++;fast=0;}
      else if(ms<fastMs){fast++;slow=Math.max(0,slow-1);}
      else {fast=0;slow=Math.max(0,slow-1);}
      if(slow>=slowWindow){
        quality=Math.max(min,Math.round((quality-0.12)*100)/100);slow=0;fast=0;
      }else if(fast>=fastWindow){
        quality=Math.min(max,Math.round((quality+0.06)*100)/100);slow=0;fast=0;
      }
      return quality;
    }
  };
}
