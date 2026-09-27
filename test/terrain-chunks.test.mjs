import test from 'node:test';
import assert from 'node:assert/strict';
import {hash32,sampleTerrain} from '../cinematic/ws-terrain-contract.mjs';
import {CHUNK_PIXELS,WORLD_PIXEL_PER_VOXEL,chunkCoord,chunkKey,visibleChunks,
  terrainAt,terrainSupports,paintChunk} from '../cinematic/terrain-chunks.mjs';
test('vendored World Server terrain is deterministic for negative and distant coordinates',()=>{
  const coordinates=[[-1,-1],[-1000,500],[0,0],[10000,-123000],[-2**30,2**30]];
  for(const [x,y] of coordinates){
    const a=terrainAt('main',270927,x,y);
    assert.deepEqual(a,terrainAt('main',270927,x,y));
    assert.deepEqual(a,sampleTerrain(x/WORLD_PIXEL_PER_VOXEL,
      y/WORLD_PIXEL_PER_VOXEL,270927,'mixed'));
  }
  assert.notEqual(chunkKey('main',4,-1,2),chunkKey('other',4,-1,2));
  assert.notEqual(hash32(1,2,1),hash32(1,2,2));
});
test('negative floor division has no initial-scene boundary',()=>{
  assert.equal(CHUNK_PIXELS,384);
  assert.equal(chunkCoord(-1),-1);
  assert.equal(chunkCoord(-384),-1);
  assert.equal(chunkCoord(-385),-2);
  assert.equal(chunkCoord(0),0);
  assert.equal(chunkCoord(384),1);
});
test('mobile and desktop visible chunks cover viewport and stay bounded',()=>{
  for(const [view,limit] of [
    [{width:390,height:844},16],[{width:1280,height:800},32],
    [{width:844,height:390},16]
  ])for(const x of [0,700,-1000000000]){
    const camera={x,y:-250000},chunks=visibleChunks(camera,view,1,limit);
    assert.ok(chunks.length<=limit);
    const active=new Set(chunks.map(c=>c.cx+','+c.cy));
    for(let y=chunkCoord(camera.y-view.height/2);
      y<=chunkCoord(camera.y+view.height/2);y++)
      for(let cx=chunkCoord(camera.x-view.width/2);
        cx<=chunkCoord(camera.x+view.width/2);cx++)
        assert.ok(active.has(cx+','+y),'all displayed chunks must load');
    assert.equal(active.size,chunks.length);
  }
});
function fakeCanvas(){
  const operations=[],ctx={
    setTransform(...v){operations.push(['transform',...v]);},
    save(){},restore(){},translate(){},fillRect(...v){operations.push(['rect',this.fillStyle,...v]);},
    beginPath(){},ellipse(...v){operations.push(['ellipse',...v]);},fill(){}
  };
  return {width:0,height:0,operations,getContext(){return ctx;}};
}
test('reloading a chunk recreates bit-for-bit identical terrain graphics',()=>{
  for(const [cx,cy] of [[0,0],[-1,-1],[30000,-30000]]){
    const a=fakeCanvas(),b=fakeCanvas(),options={cx,cy,worldId:'main',seed:73194217,lod:0,quality:.75};
    paintChunk(a,options);paintChunk(b,options);
    assert.deepEqual(a.operations,b.operations);
    assert.equal(a.width,b.width);
    assert.ok(a.operations.length>100);
  }
});
test('terrain-aware building accepts known dry sites and rejects steep/wet locations',()=>{
  const fp={width:100,height:68};let dry=null,wet=null;
  for(let z=-3072;z<=3072&&(!dry||!wet);z+=128)
    for(let x=-3072;x<=3072&&(!dry||!wet);x+=128){
      const point={x,y:z},terrain=terrainAt('main',270927,x,z);
      if(!dry&&terrainSupports('city',point,fp,270927))dry=point;
      if(!wet&&terrain.height<22&&!terrainSupports('city',point,fp,270927))wet=point;
    }
  assert.ok(dry,'there must be suitable terrain for at least one city');
  assert.ok(wet,'wet regions must not allow invisible city placement');
  assert.equal(terrainSupports('volcano',wet,fp,270927),true);
});
