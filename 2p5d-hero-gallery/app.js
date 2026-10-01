(() => {
  "use strict";

  // Every visible game pixel comes from an original repository image.
  // This file only selects source-defined animation frames and displays them.

  const games = {
    caapora: {
      image: "./assets/caapora-running.png",
      totalMs: 333.333344,
      sequence: [0,1,2,3],
      frames: [
        {x:0,y:0,w:60,h:84},
        {x:60,y:0,w:60,h:84},
        {x:120,y:0,w:60,h:84},
        {x:180,y:0,w:60,h:84}
      ]
    },
    moral: {
      image: "./assets/moral-walk.png",
      totalMs: 1000,
      sequence: [0,1,2,3,4,5,6,7],
      frames: [
        {x:97,y:119,w:292,h:1005},
        {x:1394,y:124,w:300,h:995},
        {x:2044,y:119,w:292,h:996},
        {x:3309,y:124,w:358,h:995},
        {x:4658,y:124,w:301,h:995},
        {x:5322,y:128,w:292,h:1013},
        {x:5964,y:128,w:345,h:1018},
        {x:7246,y:128,w:341,h:978}
      ]
    },
    flare: {
      image: "./assets/flare-peasant.png",
      totalMs: 1600,
      sequence: [0,1,2,3,2,1],
      frames: [
        {x:515,y:163,w:89,h:161},
        {x:313,y:325,w:90,h:161},
        {x:403,y:325,w:87,h:161},
        {x:696,y:496,w:87,h:161}
      ]
    }
  };

  const selected = new URLSearchParams(location.search).get("game");
  const allSections = [...document.querySelectorAll(".scene[data-game]")];
  if (selected && games[selected]) {
    allSections.forEach(section => {
      if (section.dataset.game !== selected) section.hidden = true;
    });
  }

  const states = [];

  allSections.filter(section => !section.hidden).forEach(section => {
    const def = games[section.dataset.game];
    const canvas = section.querySelector(".actor");
    const ctx = canvas.getContext("2d", {alpha:true});
    const img = new Image();
    const maxW = Math.max(...def.frames.map(f => f.w));
    const maxH = Math.max(...def.frames.map(f => f.h));
    canvas.width = maxW;
    canvas.height = maxH;
    img.src = def.image;
    states.push({def,canvas,ctx,img,maxW,maxH,ready:false,start:performance.now()});
    img.addEventListener("load", () => {
      const s = states.find(v => v.img === img);
      if (s) s.ready = true;
    }, {once:true});
  });

  function render(now){
    for(const s of states){
      if(!s.ready) continue;
      const cycle = (now - s.start) % s.def.totalMs;
      const slot = Math.min(
        s.def.sequence.length - 1,
        Math.floor(cycle / (s.def.totalMs / s.def.sequence.length))
      );
      const f = s.def.frames[s.def.sequence[slot]];
      s.ctx.clearRect(0,0,s.maxW,s.maxH);
      const dx = Math.round((s.maxW - f.w) / 2);
      const dy = s.maxH - f.h;
      s.ctx.drawImage(s.img,f.x,f.y,f.w,f.h,dx,dy,f.w,f.h);
    }
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();