(() => {
  const themes = {
    caapora:{sky:"#b8d9c8",ground:"#5f8d52",path:"#a98d68",accent:"#f2a24b",dark:"#244c35"},
    moral:{sky:"#d7c6b9",ground:"#8d7b76",path:"#cbb18e",accent:"#8f5cc2",dark:"#3b3149"},
    sovereign:{sky:"#9fc9cf",ground:"#6f9b62",path:"#857259",accent:"#d75f45",dark:"#324b39"},
    hd2d:{sky:"#cbb997",ground:"#74624e",path:"#bfa277",accent:"#d7b65b",dark:"#44372e"},
    flare:{sky:"#443a42",ground:"#3d3737",path:"#655649",accent:"#e99342",dark:"#211f25"},
    allacrost:{sky:"#a8d6ef",ground:"#78a85e",path:"#d0b47d",accent:"#4a79c5",dark:"#4f5535"}
  };
  const sections=[...document.querySelectorAll(".scene")];
  const active=new Set(sections.slice(0,2));
  const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?active.add(e.target):active.delete(e.target)),{rootMargin:"80% 0px"});
  sections.forEach(s=>io.observe(s));

  function fit(c){
    const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h}
    c._d=d;c._w=r.width;c._h=r.height;
  }
  const poly=(x,p,fill,stroke)=>{x.beginPath();x.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)x.lineTo(p[i][0],p[i][1]);x.closePath();x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.stroke()}};
  function diamond(x,cx,cy,w,h,fill){poly(x,[[cx,cy-h/2],[cx+w/2,cy],[cx,cy+h/2],[cx-w/2,cy]],fill)}
  function shadow(x,cx,cy,w,h,a=.25){x.save();x.globalAlpha=a;x.fillStyle="#000";x.beginPath();x.ellipse(cx,cy,w,h,0,0,Math.PI*2);x.fill();x.restore()}
  function tree(x,cx,cy,s,t){
    shadow(x,cx+4*s,cy+10*s,12*s,5*s,.18);
    x.fillStyle="#5a3d2a";x.fillRect(cx-2*s,cy-28*s,4*s,34*s);
    const greens=t==="flare"?["#343936","#465044","#59614b"]:["#2e6548","#3f7d55","#5d9864"];
    [[0,-38,13],[8,-30,10],[-8,-28,11]].forEach((q,i)=>{x.fillStyle=greens[i%greens.length];x.beginPath();x.arc(cx+q[0]*s,cy+q[1]*s,q[2]*s,0,Math.PI*2);x.fill()});
  }
  function house(x,cx,cy,s,t){
    const wall=t==="allacrost"?"#d9c59a":t==="sovereign"?"#9b8766":"#887866";
    shadow(x,cx+4*s,cy+12*s,28*s,8*s,.2);
    x.fillStyle=wall;x.fillRect(cx-24*s,cy-28*s,48*s,34*s);
    poly(x,[[cx-30*s,cy-28*s],[cx,cy-50*s],[cx+30*s,cy-28*s]],t==="allacrost"?"#a94f45":"#5b4d4a");
    x.fillStyle="#332a27";x.fillRect(cx-6*s,cy-12*s,12*s,18*s);
    x.fillStyle="#b8d2dc";x.fillRect(cx-18*s,cy-18*s,8*s,8*s);
  }
  function pillar(x,cx,cy,s,light){
    shadow(x,cx+5*s,cy+9*s,9*s,4*s,.2);
    x.fillStyle=light?"#bfae8a":"#70645c";x.fillRect(cx-5*s,cy-42*s,10*s,46*s);
    x.fillStyle=light?"#d5c39b":"#8b7b6f";x.fillRect(cx-8*s,cy-46*s,16*s,7*s);x.fillRect(cx-8*s,cy,16*s,6*s);
  }
  function torch(x,cx,cy,s,t){
    x.fillStyle="#604631";x.fillRect(cx-2*s,cy-22*s,4*s,24*s);
    const flick=(Math.sin(t*9+cx*.01)+1)*.5;
    x.save();x.globalAlpha=.2+.12*flick;x.fillStyle="#ffb54f";x.beginPath();x.arc(cx,cy-25*s,18*s,0,Math.PI*2);x.fill();x.restore();
    x.fillStyle=flick>.5?"#ffd267":"#ff8b3e";x.beginPath();x.arc(cx,cy-26*s,4.5*s,0,Math.PI*2);x.fill();
  }
  function hero(x,cx,cy,s,t,kind){
    const p=Math.sin(t*6.2),step=Math.abs(p),bob=step*2*s;
    shadow(x,cx,cy+7*s,10*s,4*s,.32);
    const skin="#e6b07f",dark="#2e2b31";
    let body="#4d7ab2",hair="#463528",cape=null;
    if(kind==="caapora"){body="#3f7c55";hair="#2b4435";cape="#d67b38"}
    if(kind==="moral"){body="#704f8d";hair="#241f2a"}
    if(kind==="sovereign"){body="#9a5843";hair="#3a3329"}
    if(kind==="hd2d"){body="#d1b05c";hair="#7d4a36";cape="#8a4f45"}
    if(kind==="flare"){body="#6c7781";hair="#313237";cape="#7f3434"}
    if(kind==="allacrost"){body="#4477bd";hair="#7a573c";cape="#d8d0b7"}
    const y=cy-bob;
    x.lineCap="round";x.lineWidth=4*s;x.strokeStyle=dark;
    x.beginPath();x.moveTo(cx-3*s,y+12*s);x.lineTo(cx-8*s+p*3*s,y+25*s);x.moveTo(cx+3*s,y+12*s);x.lineTo(cx+8*s-p*3*s,y+25*s);x.stroke();
    x.strokeStyle=skin;x.beginPath();x.moveTo(cx-7*s,y+2*s);x.lineTo(cx-12*s-p*3*s,y+14*s);x.moveTo(cx+7*s,y+2*s);x.lineTo(cx+12*s+p*3*s,y+14*s);x.stroke();
    if(cape){x.fillStyle=cape;poly(x,[[cx-9*s,y-1*s],[cx+8*s,y-1*s],[cx+11*s,y+17*s],[cx-12*s,y+17*s]])}
    x.fillStyle=body;x.fillRect(cx-8*s,y-2*s,16*s,18*s);
    x.fillStyle=skin;x.beginPath();x.arc(cx,y-9*s,7*s,0,Math.PI*2);x.fill();
    x.fillStyle=hair;x.beginPath();x.arc(cx,y-12*s,7*s,Math.PI,Math.PI*2);x.fill();
    x.fillStyle="#171717";x.fillRect(cx+3*s,y-9*s,1.5*s,1.5*s);
  }
  function ground(x,w,h,t){
    const base=h*.57, tw=Math.max(78,w*.14),th=tw*.48;
    for(let row=-1;row<9;row++)for(let col=-5;col<11;col++){
      const cx=w*.5+(col-row)*tw*.5,cy=base+(col+row)*th*.5;
      const shade=(col+row)%2===0?0:1;
      diamond(x,cx,cy,tw+1,th+1,shade?t.ground:t.path);
    }
  }
  function scene(x,w,h,k,tm,sec){
    const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,tm.sky);g.addColorStop(.58,tm.sky);g.addColorStop(1,tm.dark);x.fillStyle=g;x.fillRect(0,0,w,h);
    ground(x,w,h,tm);
    const b=h*.64,s=Math.max(.75,Math.min(1.5,w/420));
    if(k==="caapora"){
      for(let i=0;i<7;i++)tree(x,w*(.08+i*.145),b-(i%2)*28,s*(.85+(i%3)*.12),k);
      x.fillStyle="#6aa6a3";x.fillRect(0,b+54*s,w,20*s);
    } else if(k==="moral"){
      pillar(x,w*.16,b-30*s,s,true);pillar(x,w*.84,b-24*s,s,true);
      house(x,w*.29,b-12*s,s*.9,k);house(x,w*.72,b-25*s,s*.82,k);
      x.fillStyle="#5e4d69";x.fillRect(w*.43,b-70*s,w*.14,42*s);
    } else if(k==="sovereign"){
      for(let i=0;i<5;i++)tree(x,w*(.08+i*.21),b-(i%2)*22,s*.82,k);
      house(x,w*.72,b-18*s,s*.95,k);x.fillStyle="#6e7770";x.fillRect(w*.14,b+25*s,w*.22,8*s);
    } else if(k==="hd2d"){
      pillar(x,w*.18,b-18*s,s,true);pillar(x,w*.82,b-18*s,s,true);
      pillar(x,w*.34,b-54*s,s*.85,true);pillar(x,w*.66,b-54*s,s*.85,true);
      x.fillStyle="#5f4934";x.fillRect(w*.43,b-95*s,w*.14,70*s);
    } else if(k==="flare"){
      pillar(x,w*.12,b-18*s,s,false);pillar(x,w*.88,b-18*s,s,false);
      house(x,w*.74,b-28*s,s*.9,k);torch(x,w*.28,b-8*s,s,sec);torch(x,w*.64,b-22*s,s,sec);
    } else {
      house(x,w*.18,b-12*s,s*.85,k);house(x,w*.78,b-26*s,s*.9,k);
      tree(x,w*.36,b-28*s,s*.8,k);tree(x,w*.62,b-36*s,s*.9,k);
    }
    const walk=Math.sin(sec*.55)*w*.12;
    hero(x,w*.5+walk,b+30*s,s*3.0,sec,k);
    x.save();x.globalAlpha=.08;x.fillStyle="#fff";for(let i=0;i<18;i++)x.fillRect((i*97+sec*7)%w,(i*53)%h,2,2);x.restore();
  }
  function render(now){
    const sec=now/1000;
    sections.forEach(s=>{
      if(!active.has(s))return;
      const c=s.querySelector("canvas");fit(c);
      const x=c.getContext("2d"),d=c._d,w=c._w,h=c._h,k=s.dataset.theme;
      x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);x.imageSmoothingEnabled=false;
      scene(x,w,h,k,themes[k],sec);
    });
    requestAnimationFrame(render);
  }
  addEventListener("resize",()=>sections.forEach(s=>fit(s.querySelector("canvas"))),{passive:true});
  requestAnimationFrame(render);
})();