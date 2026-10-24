import {CONFIG,CATEGORIES,createGame,applyInput,resultOf} from './shared/rules.js';
const $=s=>document.querySelector(s), L=CONFIG.layout, ctx=$('#scene').getContext('2d');
const assets={}, visual=new Map(), storage={
 get(k,f){try{return JSON.parse(localStorage.getItem('book-sort:'+k))??f;}catch{return f;}},
 set(k,v){try{localStorage.setItem('book-sort:'+k,JSON.stringify(v));return true;}catch{return false;}}
};
const savedBest=storage.get('best',0);
let best=Number.isSafeInteger(savedBest)&&savedBest>=0?savedBest:0;
let phase='loading',g=createGame(1),playStart=0,pausedTotal=0,pauseStart=0;
let tutorialCount=0,completed=false;
let flights=[],sparkles=[],boxCounts=[0,0,0],bounces=[0,0,0],shake=0,catStart=-Infinity,catBook=null,catRelease=0;
let catReleaseMs=CONFIG.catMs*.62;
const releasePoint=()=>{const f=assets.motion?.frames.find(f=>f.event==='release-to-queue');return f?{x:L.catX+(f.held_book_center.x-f.anchor.x)*L.catScale,y:L.baseline+(f.held_book_center.y-f.anchor.y)*L.catScale}:{x:L.catX+33,y:L.baseline-37};};
let lastInputT=-Infinity,roundId=crypto.randomUUID();
let lastInputAt=-Infinity,muted=false,audio=null,lastTone=-Infinity,toastUntil=0,countdownTimer=0;
let oopsUntil=0,scenePausedAt=null,scenePausedMs=0;
function sceneTime(now=performance.now()){return(scenePausedAt??now)-scenePausedMs;}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize(){
 const css=getComputedStyle(document.body);
 const w=innerWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
 const h=innerHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
 const scale=Math.min(w/360,h/640,1.35);
 $('#shell').style.width=360*scale+'px';$('#shell').style.height=640*scale+'px';$('#stage').style.transform='scale('+scale+')';
}
addEventListener('resize',resize);resize();
$('#focus-label').style.left=(L.frontX-29)+'px';$('#focus-label').style.top=(L.baseline-L.bookH-29)+'px';
function showPanel(html){$('#panel').innerHTML=html;$('#overlay').hidden=false;$('#panel').scrollTop=0;$('#stage').classList.add('modal');}
function hidePanel(){$('#overlay').hidden=true;$('#stage').classList.remove('modal');}
function heading(eyebrow,title){return '<span class="eyebrow">'+eyebrow+'</span><h2 id="panel-title">'+title+'</h2>';}
function startMenu(){
 phase='menu';
 showPanel('<div class="hero-cat" aria-hidden="true"></div>'+heading('LIBRARY MINI GAME','고양이 사서의 부탁')+
 '<p>사서님과 고양이의 영혼이 뒤바뀌었어요!<br>고양이가 꺼낸 책을 같은 색 상자로 정리해 주세요.</p><div class="rule-chips"><span>30초 동안</span><span>25권 이상 성공</span><span>1 · 2 · 3 조작</span></div><p>오답 −0.5초 · 첫 10콤보 +3초<br>금빛 테두리의 맨 앞 책부터!</p><button class="primary" id="tutorial">세 권 연습하고 시작</button><p id="menu-best">내 기기 최고 '+best+'권</p>');
 $('#tutorial').onclick=beginTutorial;
}
function clearRound(seed){
 clearTimeout(countdownTimer);g=createGame(seed);flights=[];sparkles=[];boxCounts=[0,0,0];bounces=[0,0,0];visual.clear();
 catStart=-Infinity;catBook=null;shake=0;oopsUntil=0;scenePausedAt=null;scenePausedMs=0;lastInputAt=-Infinity;lastInputT=-Infinity;roundId=crypto.randomUUID();completed=false;
 pausedTotal=0;pauseStart=0;toastUntil=0;
 document.querySelectorAll('[data-color]').forEach(b=>b.classList.remove('pressed'));
 $('#combo').textContent='';$('#score').textContent='정리 0권';$('#time-bar').style.width='100%';
}
function beginTutorial(){
 clearRound(1);g.queue=[{id:-1,color:0},{id:-2,color:1},{id:-3,color:2},{id:-4,color:0}];
 tutorialCount=0;phase='tutorial';hidePanel();$('#time').textContent='∞';$('#time-label').textContent='천천히 연습';
 $('#mode').textContent='튜토리얼';$('#status').textContent='먼저 파랑 책 → 일반 버튼을 눌러요.';
}
function prepareRound(){
 clearRound(crypto.getRandomValues(new Uint32Array(1))[0]);startCountdown();
}
function startCountdown(){
 phase='countdown';let n=3;
 const step=()=>{
  showPanel(heading('준비됐나요?','내 기록에 도전해요')+'<div class="count">'+n+'</div><p>같은 색 버튼으로 분류해요.</p>');
  countdownTimer=setTimeout(()=>{if(phase!=='countdown')return;if(--n>0)step();else if(document.hidden)cancelCountdown();else beginPlay();},1000);
 };step();
}
function cancelCountdown(){
 clearTimeout(countdownTimer);phase='ready';
 showPanel(heading('준비를 마치면','다시 시작해요')+'<p>화면을 벗어나 준비를 멈췄어요.</p><button id="ready" class="primary">새 판 준비하기</button>');
 $('#ready').onclick=prepareRound;
}
function beginPlay(){
 phase='playing';playStart=performance.now();pausedTotal=0;hidePanel();$('#time-label').textContent='남은 시간';
 $('#mode').textContent='내 기록 도전';$('#status').textContent='고양이가 꺼내면, 내가 분류해요!';
}
function active(now=performance.now()){return Math.max(0,Math.floor((phase==='paused'?pauseStart:now)-playStart-pausedTotal));}
function tone(correct){
 if(muted||!audio||audio.state!=='running'||performance.now()-lastTone<45)return;lastTone=performance.now();
 const o=audio.createOscillator(),v=audio.createGain(),t=audio.currentTime;o.type='sine';o.frequency.setValueAtTime(correct?680:170,t);
 o.frequency.exponentialRampToValueAtTime(correct?1050:100,t+.07);v.gain.setValueAtTime(.045,t);v.gain.exponentialRampToValueAtTime(.001,t+.1);
 o.connect(v).connect(audio.destination);o.start();o.stop(t+.11);
}
function unlockSound(){try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
function notify(text,ms=1400){$('#combo').textContent=text;toastUntil=sceneTime()+ms;}
function position(book,index,now){
 const target=L.frontX-index*L.gap;let v=visual.get(book.id);
 if(!v){v={fromX:target,fromY:L.baseline-L.bookH/2,toX:target,toY:L.baseline-L.bookH/2,at:now};visual.set(book.id,v);}
 const p=Math.min(1,(now-v.at)/CONFIG.slideMs),q=1-(1-p)**3;
 return{x:v.fromX+(v.toX-v.fromX)*q,y:v.fromY+(v.toY-v.fromY)*q};
}
function input(color){
 if(phase!=='playing'&&phase!=='tutorial')return;
 const wallNow=performance.now(),now=sceneTime(wallNow),t=phase==='tutorial'?0:active(wallNow);
 if(phase==='playing'&&(g.terminalAt!==null||t>=g.deadline)){endRound();return;}
 // Prevent synthesized duplicate pointer events; do not lock for animations.
 if(now-lastInputAt<20||(phase==='playing'&&t-lastInputT<20))return;lastInputAt=now;
 const old=g.queue.map((b,i)=>({...b,...position(b,i,now)}));
 const r=applyInput(g,color,t);if(!r.accepted)return;
 const button=$('[data-color="'+color+'"]');button.classList.add('pressed');setTimeout(()=>button.classList.remove('pressed'),90);
 if(phase==='playing')lastInputT=t;
 if(r.correct){
  if(catBook)catBook.released=true;
  flights.push({color,at:now,x:old[0].x,y:old[0].y});boxCounts[color]=Math.min(5,boxCounts[color]+1);bounces[color]=now;
  for(let i=0;i<g.queue.length;i++){
   const b=g.queue[i],prev=old.find(v=>v.id===b.id);
   visual.set(b.id,{fromX:prev?.x??releasePoint().x,fromY:prev?.y??releasePoint().y,toX:L.frontX-i*L.gap,toY:L.baseline-L.bookH/2,at:now});
  }
  for(const id of visual.keys())if(!g.queue.some(b=>b.id===id))visual.delete(id);
  const busy=now-catStart<CONFIG.catMs;
  catStart=busy?now-CONFIG.catMs*.3:now;catRelease=catStart+catReleaseMs;catBook={...r.supplied,released:false};
  sparkles.push({x:L.boxX[color],at:now,color});
  if(r.bonus)notify('10콤보! 시간 +3초 ✦',1900);else if(g.combo%5===0)notify(g.combo+'콤보! 멋진 사서님 ✦');
  tone(true);
  if(phase==='tutorial'){
   tutorialCount++;$('#score').textContent='연습 '+tutorialCount+'권';
   if(tutorialCount===3){
    oopsUntil=0;phase='tutorial-done';showPanel(heading('연습 완료!','이제 도서관을 부탁해요')+'<p>고양이가 책을 꺼내는 동안에도<br>다음 책을 바로 분류할 수 있어요.</p><button id="play" class="primary">30초 도전 시작</button>');$('#play').onclick=prepareRound;
   }else $('#status').textContent=tutorialCount===1?'다음은 노랑 책 → 어린이 버튼이에요.':'마지막은 빨강 책 → 유아 버튼이에요.';
  }
 }else{
  oopsUntil=now+CONFIG.oopsMs;shake=now;tone(false);notify(phase==='tutorial'?'같은 색을 다시 골라요.':'앗! −0.5초',850);
  if(phase==='tutorial'){g.deadline=CONFIG.durationMs;g.mistakes=0;}
 }
 if(phase==='playing'){
  $('#score').textContent='정리 '+g.score+'권';
  if(g.terminalAt!==null)endRound();
 }
}
function pauseGame(){
 if(phase!=='playing'&&phase!=='tutorial')return;
 const now=performance.now();
 if(phase==='playing'&&active(now)>=g.deadline){endRound();return;}
 scenePausedAt=now;
 if(phase==='tutorial')phase='tutorial-paused';
 else{pauseStart=now;phase='paused';}
 showPanel(heading('잠깐 쉬어가요','책들은 기다리고 있어요')+'<p>시간은 멈춰 있어요.<br>준비가 되면 이어서 정리해 주세요.</p><button id="resume" class="primary">이어서 하기</button><button id="restart-pause" class="secondary">새로 시작</button>');
 $('#resume').onclick=resumeGame;$('#restart-pause').onclick=phase==='tutorial-paused'?beginTutorial:prepareRound;
}
function resumeGame(){
 if(document.hidden||(phase!=='paused'&&phase!=='tutorial-paused'))return;
 const now=performance.now();scenePausedMs+=now-scenePausedAt;scenePausedAt=null;
 if(phase==='tutorial-paused'){phase='tutorial';hidePanel();return;}
 pausedTotal+=now-pauseStart;phase='playing';hidePanel();
}
function endRound(){
 if(phase!=='playing')return;
 const r=resultOf(g);oopsUntil=0;phase='result';
 const previousBest=best;best=Math.max(best,r.score);
 const stored=storage.set('best',best);
 $('#time').innerHTML='0<span>초</span>';$('#time-bar').style.width='0%';
 showResult(r,best>previousBest,stored);
 if(r.success&&!completed){
  completed=true;const detail={runId:roundId,...r};
  try{
   if(typeof window.onGameComplete==='function')window.onGameComplete(detail);
   else dispatchEvent(new CustomEvent('library:book-sort-complete',{detail}));
  }catch(e){console.error('onGameComplete callback failed',e);}
 }
}
function showResult(r,newBest,stored){
 showPanel(heading(r.success?'MISSION COMPLETE':'다시 도전해요',r.success?'도서관이 한결 가벼워요!':'조금만 더 정리해 볼까요?')+
 '<div class="result-score">'+r.score+'<span> 권 정리</span></div><div class="stats"><span>실수 '+r.mistakes+'회</span><span>최고 '+r.maxCombo+'콤보</span></div>'+
 '<p id="record-message" class="record-badge">'+(newBest?'새 최고 기록이에요! ✦':'다음 판에 새 기록에 도전해요!')+'</p>'+
 '<div class="personal-best"><small>내 기기 최고 기록</small><strong id="best-score">'+best+'<span>권</span></strong></div>'+
 '<p id="record-note">'+(stored?'기록은 이 브라우저에 저장돼요.':'이 기기에서 저장할 수 없어 이번 창에서만 기록을 유지해요.')+'</p>'+
 '<button class="primary" id="again">다시 하기</button><button class="secondary" id="continue" '+(r.success?'':'hidden')+'>정리를 마쳤어요 · 다음으로</button>');
 $('#again').onclick=prepareRound;
 $('#continue').onclick=()=>{hidePanel();$('#status').textContent='정리 완료! 다음 단서로 이동해 주세요.';};
}
function buildCabinetBooks(){
 const image=assets['return-cabinet'],canvas=document.createElement('canvas');
 canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const c=canvas.getContext('2d'),hole=L.cabinetInterior;
 c.save();c.beginPath();c.rect(hole.x,hole.y,hole.w,hole.h);c.clip();
 const pile=[
  {color:0,x:84,y:239,scale:.25,angle:Math.PI/2},
  {color:1,x:84,y:217,scale:.25,angle:Math.PI/2},
  {color:2,x:84,y:195,scale:.25,angle:Math.PI/2},
  {color:0,x:84,y:173,scale:.25,angle:Math.PI/2},
  {color:2,x:125,y:229,scale:.23,angle:0},
  {color:1,x:149,y:229,scale:.23,angle:0},
  {color:0,x:173,y:229,scale:.23,angle:0}
 ];
 for(const item of pile){
  const bookImage=assets['book-'+CATEGORIES[item.color].color],w=bookImage.naturalWidth*item.scale,h=bookImage.naturalHeight*item.scale;
  c.save();c.translate(item.x,item.y);c.rotate(item.angle);c.drawImage(bookImage,-w/2,-h/2,w,h);c.restore();
 }
 c.globalCompositeOperation='source-atop';c.fillStyle='rgba(38,26,18,.16)';c.fillRect(hole.x,hole.y,hole.w,hole.h);c.restore();
 assets.cabinetBooks=canvas;
}
function drawImage(name,x,y,w,h){if(assets[name])ctx.drawImage(assets[name],x,y,w,h);}
function book(color,x,y,w=L.bookW,h=L.bookH){
 drawImage('book-'+CATEGORIES[color].color,x-w/2,y-h/2,w,h);
 ctx.fillStyle='#503725';ctx.font='bold '+Math.max(6,w*.24)+'px system-ui';ctx.textAlign='center';ctx.fillText(CATEGORIES[color].mark,x-w*.12,y-h*.07);
}
function draw(wallNow){
 const now=sceneTime(wallNow);
 ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,360,640);drawImage('library-background',0,0,360,640);
 const [cx,cy,cw,ch]=L.cabinet;drawImage('return-cabinet',cx,cy,cw,ch);
 if(assets.cabinetBooks)ctx.drawImage(assets.cabinetBooks,cx,cy,cw,ch);
 ctx.fillStyle='#563d2c';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText('반납함',cx+cw*.47,cy+ch*.255);
 let frame=assets.motion?.frames[assets.motion.idle_frame],age=now-catStart;
 if(age>=0&&age<CONFIG.catMs){
  let acc=0;for(const index of assets.motion.sequence){const f=assets.motion.frames[index];acc+=f.duration_ms*CONFIG.catMs/assets.motion.duration_ms;if(age<acc){frame=f;break;}}
 }
 if(frame){
  const {rect,anchor}=frame,s=L.catScale,x=L.catX-anchor.x*s,y=L.baseline-anchor.y*s;
  const sheet=now<oopsUntil&&assets['cat-oops-sheet']?assets['cat-oops-sheet']:assets['cat-supply-sheet'];
  if(sheet)ctx.drawImage(sheet,rect.x,rect.y,rect.w,rect.h,x,y,rect.w*s,rect.h*s);
  if(catBook&&!catBook.released&&now<catRelease&&frame.held_book_center){
   const p=frame.held_book_center,z=frame.held_book_size;
   book(catBook.color,x+p.x*s,y+p.y*s,z.w*s,z.h*s);
   // Reuse the actual front-paw pixels above the book instead of inventing a hand.
   const px=p.x+z.w*.25,py=p.y+z.h*.12;
   ctx.save();ctx.beginPath();ctx.ellipse(x+px*s,y+py*s,8*s,12*s,0,0,Math.PI*2);ctx.clip();
   ctx.drawImage(sheet,rect.x,rect.y,rect.w,rect.h,x,y,rect.w*s,rect.h*s);ctx.restore();
  }
 }
 for(let i=g.queue.length-1;i>=0;i--){
  const b=g.queue[i];if(catBook?.id===b.id&&!catBook.released){
   if(now<catRelease)continue;
   catBook.released=true;const v=visual.get(b.id);if(v){v.fromX=releasePoint().x;v.fromY=releasePoint().y;v.at=now;}
  }
  const p=position(b,i,now);ctx.save();
  if(i===0){ctx.strokeStyle='#f9c746';ctx.lineWidth=3;ctx.fillStyle='#ffefad60';ctx.beginPath();ctx.roundRect(p.x-L.bookW/2-3,L.baseline-L.bookH-3,L.bookW+6,L.bookH+6,6);ctx.fill();ctx.stroke();if(now-shake<240&&!reduced)ctx.translate(Math.sin((now-shake)*.09)*2,0);}
  book(b.color,p.x,p.y);ctx.restore();
 }
 for(let i=0;i<3;i++){
  const x=L.boxX[i]-L.boxW/2,dy=!reduced&&now-bounces[i]<180?-Math.sin((now-bounces[i])/180*Math.PI)*3:0,y=L.boxY+dy;
  drawImage('box-'+CATEGORIES[i].color,x,y,L.boxW,L.boxH);
  ctx.save();ctx.beginPath();ctx.rect(x+13,y+5,L.boxW-26,15);ctx.clip();
  for(let n=0;n<boxCounts[i];n++)book(i,x+25+n*13,y+10,13,26);ctx.restore();
  // Restore the box's front face over the contents using the same asset.
  const img=assets['box-'+CATEGORIES[i].color];if(img)ctx.drawImage(img,0,85,320,111,x,y+85*L.boxH/196,L.boxW,111*L.boxH/196);
  ctx.fillStyle='#543c2c';ctx.font='900 15px system-ui';ctx.textAlign='center';ctx.fillText(CATEGORIES[i].name,L.boxX[i],y+48);
 }
 flights=flights.filter(f=>now-f.at<CONFIG.flightMs);
 for(const f of flights){const p=Math.min(1,(now-f.at)/CONFIG.flightMs),q=1-(1-p)**2;
  ctx.save();ctx.globalAlpha=1-p*.25;book(f.color,f.x+(L.boxX[f.color]-f.x)*q,f.y+(L.boxY+12-f.y)*q-Math.sin(p*Math.PI)*25,L.bookW*(1-p*.55),L.bookH*(1-p*.55));ctx.restore();}
 sparkles=sparkles.filter(s=>now-s.at<460);
 for(const s of sparkles){const p=(now-s.at)/460;ctx.save();ctx.globalAlpha=1-p;ctx.fillStyle='#92652e';ctx.font='bold 15px system-ui';ctx.fillText('+1 ✦',s.x,L.boxY-10-p*18);ctx.restore();}
 if(phase==='playing'){
  const t=active(wallNow);if(t>=g.deadline||g.terminalAt!==null)endRound();
  else{$('#time').innerHTML=Math.ceil((g.deadline-t)/1000)+'<span>초</span>';$('#time-bar').style.width=Math.min(100,(g.deadline-t)/CONFIG.durationMs*100)+'%';}
 }
 if(toastUntil&&now>toastUntil){$('#combo').textContent='';toastUntil=0;}
 requestAnimationFrame(draw);
}
async function loadAssets(){
 const names=['library-background','return-cabinet','cat-supply-sheet',...CATEGORIES.flatMap(c=>['book-'+c.color,'box-'+c.color])];
 const load=(name,ext)=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=new URL('./assets/'+name+'.'+ext,import.meta.url).href;});
 await Promise.all(names.map(async name=>{try{assets[name]=await load(name,'webp');}catch{assets[name]=await load(name,'png');}}));
 assets.motion=await(await fetch(new URL('./assets/cat-supply.json',import.meta.url))).json();
 buildCabinetBooks();
 // This skin is optional; missing images or incompatible metadata keep the normal cat.
 let timeout;
 const optional=async()=>{
  const meta=await(await fetch(new URL('./assets/cat-oops.json',import.meta.url))).json();
  let sheet;try{sheet=await load('cat-oops-sheet','webp');}catch{sheet=await load('cat-oops-sheet','png');}
  const normal=assets['cat-supply-sheet'];
  if(sheet.naturalWidth!==normal.naturalWidth||sheet.naturalHeight!==normal.naturalHeight||meta.role!=='expression-skin'||meta.reaction_duration_ms!==CONFIG.oopsMs||meta.frames?.length!==assets.motion.frames.length)throw Error('invalid_expression_skin');
  for(const f of assets.motion.frames){const other=meta.frames[f.index];if(JSON.stringify(other?.rect)!==JSON.stringify(f.rect)||JSON.stringify(other?.anchor)!==JSON.stringify(f.anchor))throw Error('unaligned_expression_skin');}
  return sheet;
 };
 try{const skin=await Promise.race([optional(),new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),2500);})]);if(skin)assets['cat-oops-sheet']=skin;}catch{}finally{clearTimeout(timeout);}
 let beforeRelease=0;for(const index of assets.motion.sequence){const f=assets.motion.frames[index];if(f.event==='release-to-queue')break;beforeRelease+=f.duration_ms;}catReleaseMs=beforeRelease/assets.motion.duration_ms*CONFIG.catMs;
 document.documentElement.style.setProperty('--cat-idle','url("'+assets['cat-supply-sheet'].src+'")');
}
document.querySelectorAll('[data-color]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();unlockSound();input(Number(b.dataset.color));});
 // Keyboard/screen-reader activation; real pointer clicks are already handled.
 b.addEventListener('click',e=>{if(e.detail===0){unlockSound();input(Number(b.dataset.color));}});
});
addEventListener('keydown',e=>{
 if(e.repeat||/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;
 if(['1','2','3'].includes(e.key)&&(phase==='playing'||phase==='tutorial')){e.preventDefault();unlockSound();input(Number(e.key)-1);}
 if(e.key==='Escape'&&(phase==='playing'||phase==='tutorial'))pauseGame();
});
$('#pause').onclick=pauseGame;
$('#sound').onclick=()=>{unlockSound();muted=!muted;$('#sound').textContent=muted?'소리 꺼짐':'소리 켜짐';$('#sound').setAttribute('aria-pressed',String(muted));$('#sound').setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');};
$('#sound').textContent='소리 켜짐';$('#sound').setAttribute('aria-pressed','false');$('#sound').setAttribute('aria-label','소리 끄기');
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(phase==='countdown')cancelCountdown();else pauseGame();}});
addEventListener('pagehide',()=>{if(phase==='countdown')cancelCountdown();else pauseGame();});
try{await loadAssets();startMenu();requestAnimationFrame(draw);}
catch{showPanel(heading('이미지를 불러오지 못했어요','다시 열어 주세요')+'<p>인터넷 연결과 assets 폴더를 확인해 주세요.</p><button class="primary" id="reload">다시 불러오기</button>');$('#reload').onclick=()=>location.reload();}
if(new URLSearchParams(location.search).get('dev')==='1'){
 // Local QA inspection only; disabled in normal play.
 window.bookSortDebug={get state(){return{phase,g,flights,catBook,catStart,catRelease,completed,boxCounts,roundId,best,oopsUntil,sceneNow:sceneTime(),hasOopsSheet:!!assets['cat-oops-sheet'],cabinetCache:assets.cabinetBooks};},input,pauseGame,resumeGame};
}

