export function buildBodySilhouette(rig){
  const p=new Path2D();
  const bp=(x,y)=>rig.bodyPoint(x,y);
  const hp=(x,y,w=1)=>rig.headPoint(x,y,w);
  const M=q=>p.moveTo(q.x,q.y);
  const C=(a,b,c)=>p.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);

  M(bp(-92,222));
  C(bp(-146,207),bp(-182,156),bp(-188,78));
  C(bp(-194,-20),bp(-163,-122),bp(-112,-211));
  C(bp(-92,-246),hp(-67,-269,.35),hp(-45,-288,.55));
  C(hp(-50,-321,.82),hp(-48,-355,1),hp(-35,-388,1));
  C(hp(-8,-362,1),hp(12,-339,1),hp(24,-321,1));
  C(hp(47,-328,1),hp(66,-326,1),hp(82,-317,1));
  C(hp(96,-344,1),hp(108,-378,1),hp(128,-405,1));
  C(hp(137,-367,1),hp(135,-330,1),hp(127,-302,1));
  C(hp(147,-285,1),hp(155,-262,1),hp(149,-240,1));
  C(hp(163,-225,1),hp(160,-204,1),hp(144,-190,1));
  C(hp(131,-179,1),hp(118,-177,1),hp(105,-183,.96));
  C(hp(98,-165,.88),hp(89,-147,.8),hp(84,-125,.7));
  C(hp(74,-90,.55),bp(72,-39),bp(81,9));
  C(bp(93,71),bp(117,127),bp(121,184));
  C(bp(125,220),bp(111,246),bp(82,255));
  C(bp(36,268),bp(-40,260),bp(-92,222));
  p.closePath();
  return p;
}

export function buildWhiskers(rig){
  const whiskers=[];
  const anchors=[
    [{x:140,y:-190},{x:194,y:-178}],
    [{x:139,y:-184},{x:202,y:-191}],
    [{x:136,y:-178},{x:191,y:-207}]
  ];
  for(const [a,b] of anchors){
    const aa=rig.headPoint(a.x,a.y,1),bb=rig.headPoint(b.x,b.y,1);
    const p=new Path2D();
    p.moveTo(aa.x,aa.y);
    p.quadraticCurveTo((aa.x+bb.x)/2,aa.y-2,bb.x,bb.y);
    whiskers.push(p);
  }
  return whiskers;
}