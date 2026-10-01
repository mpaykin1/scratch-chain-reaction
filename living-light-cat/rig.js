import {constrainPose} from './constraints.js';

export class CatRig2D{
  constructor(){
    this.pose=constrainPose();
    this.headPivot={x:64,y:-214};
    this.tailBase={x:-92,y:222};
  }

  setPose(next){ this.pose=constrainPose({...this.pose,...next}); }

  headPoint(x,y,weight=1){
    const p=this.pose;
    const angle=(p.headTurn+p.headTilt)*weight;
    const ox=this.headPivot.x, oy=this.headPivot.y;
    const dx=x-ox, dy=y-oy;
    const ca=Math.cos(angle), sa=Math.sin(angle);
    const yawPush=p.headTurn*32*weight;
    return {
      x:ox+dx*ca-dy*sa+yawPush,
      y:oy+dx*sa+dy*ca
    };
  }

  bodyPoint(x,y){
    const breathe=this.pose.breath;
    const side=(x>0?1:-1)*Math.abs(breathe)*3.8;
    return {x:x+side,y};
  }
}