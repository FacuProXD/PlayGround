(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 600;
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start-btn');
  const stageLabel = document.getElementById('stage-label');
  const timerEl = document.getElementById('timer');
  const heartsEl = document.getElementById('hearts');
  const sprintText = document.getElementById('sprint-text');
  const sprintMeter = document.getElementById('sprint-meter');
  const toast = document.getElementById('toast');
  const soundBtn = document.getElementById('sound-toggle');
  const routeSteps = [...document.querySelectorAll('.route-step')];
  const keys = new Set();
  const stages = [
    {name:'SALIDA DE 5°B', subtitle:'Salida de 5°B', title:'¡La profe viene atrás!', count:2, speed:66, colors:['#d9e7d0','#78977a'], props:'classroom'},
    {name:'PASILLO PRINCIPAL', subtitle:'Pasillo principal', title:'Tráfico de recreo', count:5, speed:75, colors:['#e8dfc7','#c7aa72'], props:'hall'},
    {name:'ZONA DE ESCALERAS', subtitle:'Zona de escaleras', title:'La hora pico', count:7, speed:82, colors:['#d7e3de','#789e9a'], props:'stairs'},
    {name:'ÚLTIMO PASILLO', subtitle:'Último pasillo', title:'Ya casi, Lucio', count:8, speed:91, colors:['#e7ddca','#bc9d68'], props:'last'}
  ];
  let player, enemies, obstacles, stage = 0, lives = 3, elapsed = 0, started = false, won = false, lost = false;
  let lastTime = 0, sprint = 100, sprinting = 0, invuln = 0, anim = 0, soundOn = false, audioCtx = null, stepSound = 0, toastTimer = 0, camShake = 0;
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const rects = (x,y,w,h,color) => {ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  function beep(freq=520,duration=.08,type='square',volume=.035){
    if(!soundOn)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}catch(e){}
  }
  function showToast(text){toast.textContent=text;toast.classList.add('show');toastTimer=2.1;}
  function makeLevel(index){
    stage=index; const conf=stages[index]; stageLabel.textContent=conf.name;
    document.getElementById('destination').textContent=index===3?'¡Ahí está! 5°A':'Aula 5°A';
    routeSteps.forEach((el,i)=>{el.classList.toggle('active',i===index);el.classList.toggle('done',i<index);el.querySelector('.route-status').textContent=i<index?'✓':i===index?'●':'○';});
    player={x:82,y:300,r:13,face:1}; obstacles=[]; enemies=[];
    // A clear central lane keeps movement readable while furniture and bags make the route weave.
    if(index===0){obstacles.push({x:225,y:102,w:115,h:72,type:'desk'},{x:385,y:408,w:100,h:56,type:'bag'},{x:535,y:115,w:98,h:67,type:'desk'},{x:665,y:424,w:70,h:54,type:'bag'});}
    if(index===1){obstacles.push({x:205,y:115,w:100,h:52,type:'bag'},{x:350,y:425,w:132,h:50,type:'bench'},{x:505,y:123,w:124,h:52,type:'bench'},{x:684,y:418,w:80,h:55,type:'bag'},{x:775,y:200,w:52,h:90,type:'locker'});}
    if(index===2){obstacles.push({x:195,y:125,w:105,h:68,type:'group'},{x:360,y:403,w:112,h:66,type:'group'},{x:500,y:115,w:90,h:75,type:'stairs'},{x:675,y:414,w:120,h:67,type:'group'});}
    if(index===3){obstacles.push({x:205,y:110,w:115,h:54,type:'bench'},{x:360,y:427,w:80,h:55,type:'bag'},{x:520,y:106,w:110,h:61,type:'bench'},{x:680,y:421,w:90,h:50,type:'bag'});}
    for(let i=0;i<conf.count;i++){
      const pursuer=(index===0&&i===0)||(index>0&&i===conf.count-1&&index>=2);
      enemies.push({x:rand(280,810),y:rand(205,395),r:pursuer?14:12,base:conf.speed*rand(.75,1.08),angle:rand(0,6.28),turn:rand(.4,2),pursuer,phase:rand(0,6),color:['#e17d64','#697db3','#d8a843','#8c6b9f','#58a195'][i%5],hit:false});
    }
    if(index===0 && started) showToast('¡La profe te vio! ¡Rajá por la derecha!');
    else if(index>0) showToast(['','¡Recreo! Mirá por dónde vas.','¡Escaleras! No te quedes en el medio.','¡La puerta de 5°A está ahí nomás!'][index]);
  }
  function startGame(){
    started=true;won=false;lost=false;stage=0;lives=3;elapsed=0;sprint=100;sprinting=0;invuln=0;overlay.classList.add('hidden');makeLevel(0);lastTime=performance.now();
  }
  function circleRect(cx,cy,r,o){const x=clamp(cx,o.x,o.x+o.w),y=clamp(cy,o.y,o.y+o.h);return (cx-x)**2+(cy-y)**2<r*r;}
  function movePlayer(dx,dy){
    let nx=clamp(player.x+dx,35,910),ny=clamp(player.y+dy,65,535);
    for(const o of obstacles){if(circleRect(nx,player.y,player.r,o))nx=player.x;if(circleRect(nx,ny,player.r,o))ny=player.y;}
    player.x=nx;player.y=ny;if(Math.abs(dx)>.01)player.face=Math.sign(dx);
  }
  function hurt(){if(invuln>0)return;lives--;invuln=1.65;camShake=.3;beep(170,.2,'sawtooth',.06);showToast(lives>0?'¡PUM! Mochila humana. ¡Cuidado!':'¡Te atraparon! Volvé a intentarlo.');
    if(lives<=0){lost=true;started=false;setTimeout(()=>endScreen(false),650);}else{player.x=100;player.y=300;sprinting=0;}
    updateHud();
  }
  function updateHud(){heartsEl.innerHTML=Array.from({length:3},(_,i)=>`<span style="color:${i<lives?'#eb6f6b':'#d9ddda'}">♥</span>`).join(' ');sprintMeter.style.width=`${sprint}%`;sprintText.textContent=sprinting>0?'¡YA!':sprint>=100?'LISTO':'CARGA';}
  function update(dt){
    anim+=dt;elapsed+=dt;if(invuln>0)invuln-=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove('show');}if(camShake>0)camShake-=dt;
    let x=(keys.has('ArrowRight')||keys.has('d')||keys.has('D')?1:0)-(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')?1:0);
    let y=(keys.has('ArrowDown')||keys.has('s')||keys.has('S')?1:0)-(keys.has('ArrowUp')||keys.has('w')||keys.has('W')?1:0);
    const moving=x||y;if(x&&y){x*=.707;y*=.707;}
    let dashKey=keys.has(' ')||keys.has('Shift');if(dashKey&&sprint>=100&&moving&&!sprinting){sprinting=.72;sprint=0;beep(760,.1,'triangle');showToast('¡PIQUE DE ESTUDIANTE! ⚡');}
    let speed=150;if(sprinting>0){sprinting-=dt;speed=300;}else sprint=Math.min(100,sprint+dt*13);
    if(moving){movePlayer(x*speed*dt,y*speed*dt);stepSound-=dt;if(stepSound<=0){beep(180+Math.random()*65,.025,'triangle',.012);stepSound=.22;}}
    if(player.x>910){if(stage<3){makeLevel(stage+1);beep(650,.12,'square');}else{won=true;started=false;beep(720,.12);setTimeout(()=>endScreen(true),450);}}
    const conf=stages[stage];
    for(const e of enemies){
      e.phase+=dt*7;e.turn-=dt;
      if(e.pursuer){const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;e.x+=dx/d*e.base*1.03*dt;e.y+=dy/d*e.base*1.03*dt;}
      else{if(e.turn<=0){e.angle+=rand(-2.2,2.2);e.turn=rand(.6,1.8);}e.x+=Math.cos(e.angle)*e.base*.52*dt;e.y+=Math.sin(e.angle)*e.base*.52*dt;if(e.x<150||e.x>860)e.angle=Math.PI-e.angle;if(e.y<190||e.y>410)e.angle=-e.angle;}
      e.x=clamp(e.x,120,884);e.y=clamp(e.y,180,430);
      for(const o of obstacles){if(circleRect(e.x,e.y,e.r,o)){e.angle+=Math.PI*.7;e.x-=Math.cos(e.angle)*10;e.y-=Math.sin(e.angle)*10;}}
      if(Math.hypot(player.x-e.x,player.y-e.y)<player.r+e.r-3)hurt();
    }
    timerEl.textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;updateHud();
  }
  function floorAndWalls(){
    const conf=stages[stage]||stages[0];rects(0,0,W,H,conf.colors[0]);
    // tiled school linoleum with subtle alternating flecks
    for(let y=68;y<535;y+=32)for(let x=28;x<W;x+=32){rects(x,y,31,31,(Math.floor(x/32)+Math.floor(y/32))%2?'#ffffff0a':'#26361c08');rects(x+3,y+3,1,1,'#65735e20');}
    rects(0,0,W,55,'#354950');rects(0,545,W,55,'#354950');rects(0,55,W,8,'#afc1a8');rects(0,537,W,8,'#afc1a8');
    for(let x=0;x<W;x+=48){rects(x,5,45,43,'#40595a');rects(x+4,10,37,32,'#536c65');rects(x+7,13,31,3,'#e5dcae');rects(x+5,548,42,45,'#40595a');}
    // exit door and destination sign
    rects(879,205,81,190,'#43585a');rects(889,215,71,172,stage===3?'#54745a':'#65766b');rects(896,222,57,42,'#e7ddb7');ctx.fillStyle='#283649';ctx.font='bold 17px monospace';ctx.textAlign='center';ctx.fillText(stage===3?'5°A':'SALIDA',925,249);rects(943,305,5,5,'#efd16d');
    if(stage===0){rects(29,208,69,180,'#495f62');rects(38,218,59,160,'#7c6150');rects(45,227,45,30,'#f1e8be');ctx.fillStyle='#263649';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.fillText('5°B',67,248);}
    // wall bulletin boards and class doodles
    for(let i=0;i<5;i++){const x=155+i*155;rects(x,13,72,29,'#c7ab73');rects(x+4,17,64,21,['#e7d9a8','#d2e0c3','#e5c4aa'][i%3]);rects(x+10,23,20,2,'#9b987b');rects(x+38,23,20,2,'#9b987b');}
    // yellow dashed center-line hints the corridor's direction
    for(let x=140;x<875;x+=45)rects(x,297,22,3,'#d7ba6580');
  }
  function drawObstacle(o){
    if(o.type==='desk'||o.type==='bench'){rects(o.x+3,o.y+7,o.w,o.h,'#00000018');rects(o.x,o.y,o.w,o.h-7,o.type==='bench'?'#ad8052':'#bd9461');rects(o.x+4,o.y+4,o.w-8,o.h-16,o.type==='bench'?'#c79b68':'#d7b77d');rects(o.x+8,o.y+o.h-9,6,9,'#806446');rects(o.x+o.w-14,o.y+o.h-9,6,9,'#806446');if(o.type==='desk'){rects(o.x+o.w*.5,o.y+15,18,11,'#e8d8ae');rects(o.x+o.w*.5+3,o.y+18,11,2,'#738474');}}
    else if(o.type==='bag'){rects(o.x+3,o.y+5,o.w,o.h,'#00000018');rects(o.x+5,o.y+4,o.w-10,o.h-7,'#b85449');rects(o.x+10,o.y+7,o.w-20,o.h-14,'#dc7660');rects(o.x+o.w*.5-7,o.y+o.h-12,14,7,'#8e5148');rects(o.x+o.w*.5-3,o.y+o.h*.5,6,4,'#f1cd75');}
    else if(o.type==='locker'){rects(o.x,o.y,o.w,o.h,'#8a9e91');for(let y=o.y+7;y<o.y+o.h;y+=19){rects(o.x+5,y,o.w-10,15,'#aab8a4');rects(o.x+o.w-12,y+6,3,3,'#52695e');}}
    else if(o.type==='stairs'){for(let i=0;i<5;i++){rects(o.x+i*16,o.y+i*13,o.w-i*25,12,'#b3c5b5');rects(o.x+i*16,o.y+i*13+10,o.w-i*25,3,'#718f85');}}
    else if(o.type==='group'){rects(o.x+4,o.y+9,o.w-8,o.h-8,'#ffffff28');for(let i=0;i<3;i++)drawKid(o.x+12+i*30,o.y+17+(i%2)*18,['#d37963','#667eb0','#d3a344'][i],.8,anim*4+i);}
  }
  function drawKid(x,y,color,scale=1,t=0){ctx.save();ctx.translate(x,y+Math.sin(t)*2);ctx.scale(scale,scale);rects(-7,13,5,5,'#333b40');rects(3,13,5,5,'#333b40');rects(-9,0,18,15,color);rects(-8,-9,16,12,'#d9a879');rects(-9,-12,7,6,'#332e2b');rects(-3,-14,8,7,'#292725');rects(3,-11,6,5,'#332e2b');rects(3,-5,2,2,'#27313a');ctx.restore();}
  function drawPlayer(){
    const blink=invuln>0&&Math.floor(anim*15)%2===0;if(blink)return;
    const x=player.x,y=player.y+Math.sin(anim*10)*1.5*(keys.size?1:0);ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(player.face,1);
    rects(-8,9,6,8,'#33343a');rects(2,9,6,8,'#33343a');rects(-10,-2,20,14,'#446f83');rects(-8,-7,16,10,'#d8aa82');
    // dark, unruly curls
    rects(-10,-11,7,6,'#211f20');rects(-7,-15,8,7,'#211f20');rects(0,-14,7,7,'#211f20');rects(6,-10,5,6,'#272326');rects(-3,-16,5,4,'#151719');
    rects(1,-3,2,2,'#282d31');rects(5,2,2,2,'#fff1c8');rects(-2,2,4,2,'#b86e65');
    if(sprinting>0){rects(-19,-8,6,3,'#efd063');rects(-26,-13,5,3,'#efd063');}
    ctx.restore();
  }
  function drawTeacher(){if(stage!==0)return;const x=650+Math.sin(anim*2)*22,y=300+Math.sin(anim*3)*34;drawKid(x,y,'#8b5476',1.14,anim*6);ctx.fillStyle='#52404e';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText('¡LANFRANCHINI!',x,y-24);}
  function render(){
    ctx.save();if(camShake>0)ctx.translate(rand(-3,3),rand(-3,3));floorAndWalls();
    for(const o of obstacles)drawObstacle(o);
    // light puddles and chalk marks add lived-in school flavor
    if(stage===2){rects(423,250,42,17,'#b0c9bd');rects(427,254,34,2,'#7d9b91');}
    for(const e of enemies){drawKid(e.x,e.y,e.color,1,e.phase);if(e.pursuer){ctx.fillStyle='#38404b';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText(stage===0?'PROFE':'¡EH!',e.x,e.y-23);}}
    drawTeacher();drawPlayer();
    // little exit sparkle
    if(Math.sin(anim*5)>0){rects(900,280,3,3,'#ffe58b');rects(913,392,3,3,'#ffe58b');}
    ctx.restore();
  }
  function endScreen(victory){
    overlay.classList.remove('hidden');
    const card=overlay.querySelector('.intro-card');
    if(victory){card.innerHTML=`<div class="eyebrow"><span>MISIÓN CUMPLIDA</span><span>04 — 04</span></div><div class="intro-art"><div class="sunburst"></div><div class="art-door" style="background:#55785b"><b>5°A</b><i></i></div><div class="art-kid">●<span>◡</span></div><div class="art-scribble">¡SÍ!</div><div class="art-arrow">✦</div></div><h1>¡LO LOGRASTE,<br><em>LUCIO!</em></h1><p>Llegaste a 5°A. La profe se quedó hablando con una mochila y vos… llegaste justo para Lengua.</p><div class="intro-bottom"><button class="primary-btn" id="again-btn">JUGAR DE NUEVO <span>↻</span></button><div class="key-hint">TIEMPO<br><small>${timerEl.textContent} · ${lives} VIDAS</small></div></div><div class="tiny-note">LANFRANCHINI VUELVE A CASA <b>·</b> FIN DEL RECREO</div>`;}
    else{card.innerHTML=`<div class="eyebrow"><span>RECREO INTERRUMPIDO</span><span>FIN DE PARTIDA</span></div><div class="intro-art"><div class="sunburst"></div><div class="art-door"><b>5°B</b><i></i></div><div class="art-kid">●<span>◡</span></div><div class="art-scribble">¡UPS!</div><div class="art-arrow">↻</div></div><h1>¡TE AGARRARON,<br><em>LUCIO!</em></h1><p>El pasillo ganó esta vez. Tomate un respiro y probá otra ruta para llegar a 5°A.</p><div class="intro-bottom"><button class="primary-btn" id="again-btn">VOLVER A INTENTAR <span>↻</span></button><div class="key-hint">MEJOR SUERTE<br><small>TE QUEDASTE SIN VIDAS</small></div></div><div class="tiny-note">LA PRÓXIMA NO TE ALCANZAN <b>·</b> VAMOS LUCIO</div>`;}
    document.getElementById('again-btn').addEventListener('click',startGame);
  }
  startBtn.addEventListener('click',startGame);
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key);if((e.key===' '||e.key==='Shift')&&!started&&overlay.classList.contains('hidden')===false&&(!won&&!lost))startGame();});
  window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('.dpad button').forEach(btn=>{const dir=btn.dataset.dir;const map={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};const k=map[dir];btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keys.add(k);});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,()=>keys.delete(k)));});
  const dashBtn=document.getElementById('dash-btn');dashBtn.addEventListener('pointerdown',e=>{e.preventDefault();keys.add('Shift');});['pointerup','pointercancel','pointerleave'].forEach(ev=>dashBtn.addEventListener(ev,()=>keys.delete('Shift')));
  soundBtn.addEventListener('click',()=>{soundOn=!soundOn;soundBtn.innerHTML=soundOn?'♫ <span>SONIDO ON</span>':'♫ <span>SONIDO</span>';if(soundOn){beep(550,.08);showToast('¡Timbre activado!');}});
  function loop(now){const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;if(started)update(dt);render();requestAnimationFrame(loop);}
  makeLevel(0);updateHud();requestAnimationFrame(loop);
})();
