import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorldShape} from '../cinematic/world-server/world-shape-library.mjs';
import {sceneBlocks,drawIsometric} from '../cinematic/world-server/world-server-graphics.mjs';

test('ported World Server house geometry is deterministic and block-limited',()=>{
  const a=buildWorldShape({type:'house',scale:.48},{origin:{x:-8,y:0,z:0},maxBlocks:900});
  const b=buildWorldShape({type:'house',scale:.48},{origin:{x:-8,y:0,z:0},maxBlocks:900});
  assert.deepEqual(a,b);assert.ok(a.length>50&&a.length<=900);
  assert.ok(a.some(v=>v.blockType===10),'real brick voxel geometry is present');
});
test('no city, no props; lightweight and full modes reuse same shapes',()=>{
  assert.equal(sceneBlocks({city:0,forest:0}).length,0);
  const city=sceneBlocks({city:1,forest:0});
  const forest=sceneBlocks({city:0,forest:1},{coarse:true});
  assert.ok(city.length>50);assert.ok(forest.length>20);
  assert.ok(sceneBlocks({city:1,forest:1},{coarse:true}).length <
    sceneBlocks({city:1,forest:1},{coarse:false}).length);
});
test('isometric geometry stays within the mobile and desktop canvases',()=>{
  const voxels=sceneBlocks({city:1,forest:1},{coarse:true});
  for(const [width,height] of [[320,220],[160,170],[640,270]]){
    const points=[];
    const ctx={beginPath(){},moveTo(x,y){points.push([x,y]);},
      lineTo(x,y){points.push([x,y]);},closePath(){},fill(){},fillStyle:''};
    const result=drawIsometric(ctx,voxels,{width,height,padding:9});
    assert.ok(result.faces>100);assert.ok(points.length>400);
    for(const [x,y]of points){
      assert.ok(Number.isFinite(x)&&x>=-1&&x<=width+1, 'x clipped at '+width+': '+x);
      assert.ok(Number.isFinite(y)&&y>=-1&&y<=height+1,'y clipped at '+height+': '+y);
    }
  }
});
