import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {CONFIG} from '../shared/rules.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'verification');
const motion=JSON.parse(await fs.readFile(path.join(root,'assets/cat-supply.json'),'utf8'));
const browser=await chromium.launch({headless:true,timeout:20000}),checks=[],errors=[];
const epoch=new Date('2026-10-24T00:00:00Z');
async function session({width=360,height=640,skin='normal'}={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.catPaints=[];window.pileDrawCount=0;
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
   if(source instanceof HTMLImageElement){
    const filename=new URL(source.src).pathname.split('/').pop();
    if(this.canvas.id==='scene'&&/^cat-(?:supply|oops)-sheet\./.test(filename)){
     window.catPaints.push({filename,args,sceneNow:window.bookSortDebug?.state.sceneNow});
     if(window.catPaints.length>100)window.catPaints.shift();
    }
    if(!this.canvas.id&&/^book-(?:blue|yellow|red)\./.test(filename))window.pileDrawCount++;
   }
   return original.call(this,source,...args);
  };
 });
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(u.href);
  if(u.origin!=='https://book-sort.test'){await route.abort();return;}
  const p=u.pathname.replace(/^\/repo\//,'/'),file=path.join(root,p==='/'?'index.html':p.slice(1));
  if(p.endsWith('/cat-oops-sheet.webp')&&(skin==='webp-fail'||skin==='missing')){await route.fulfill({status:404});return;}
  if(p.endsWith('/cat-oops-sheet.png')&&skin==='missing'){await route.fulfill({status:404});return;}
  if(p.endsWith('/cat-oops.json')&&skin==='bad-geometry'){
   const meta=JSON.parse(await fs.readFile(file,'utf8'));meta.frames[2].anchor.x++;
   await route.fulfill({contentType:'application/json',body:JSON.stringify(meta)});return;
  }
  try{
   const contentType=({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'})[path.extname(file)];
   await route.fulfill({contentType,body:await fs.readFile(file)});
  }catch{await route.fulfill({status:404});}
 });
 await page.clock.install({time:epoch});await page.clock.pauseAt(epoch);
 await page.goto('https://book-sort.test/repo/?dev=1');await page.waitForFunction(()=>window.bookSortDebug?.state.phase==='menu');
 await page.clock.runFor(16);
 return{context,page,requests};
}
async function wrong(p){
 const color=await p.evaluate(()=>bookSortDebug.state.g.queue[0].color);
 await p.locator('[data-color="'+((color+1)%3)+'"]').dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:1});
}
async function correct(p){
 const color=await p.evaluate(()=>bookSortDebug.state.g.queue[0].color);
 await p.locator('[data-color="'+color+'"]').dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:1});
}
const state=p=>p.evaluate(()=>{const s=bookSortDebug.state;return{phase:s.phase,until:s.oopsUntil,now:s.sceneNow,catStart:s.catStart,catRelease:s.catRelease,queue:s.g.queue.map(b=>b.id),score:s.g.score,mistakes:s.g.mistakes,deadline:s.g.deadline,combo:s.g.combo,hasSkin:s.hasOopsSheet};});
const paints=p=>p.evaluate(()=>window.catPaints.splice(0));
async function startMain(p){
 for(let i=0;i<3;i++){await correct(p);await p.clock.runFor(30);}
 await p.locator('#play').click();await p.clock.runFor(3100);
 assert.equal((await state(p)).phase,'playing');
}
function expectedFrame(age){
 if(age<0||age>=CONFIG.catMs)return motion.frames[motion.idle_frame];
 let end=0;for(const index of motion.sequence){end+=motion.frames[index].duration_ms;if(age<end)return motion.frames[index];}
 return motion.frames[motion.idle_frame];
}
function validatePaints(items,catStart,kind){
 assert(items.length>0);
 for(const paint of items){
  assert(paint.filename.startsWith('cat-'+kind+'-sheet.'),paint.filename);
  const f=expectedFrame(paint.sceneNow-catStart),r=f.rect,a=f.anchor;
  assert.deepEqual(paint.args,[r.x,r.y,r.w,r.h,CONFIG.layout.catX-a.x*CONFIG.layout.catScale,CONFIG.layout.baseline-a.y*CONFIG.layout.catScale,r.w*CONFIG.layout.catScale,r.h*CONFIG.layout.catScale]);
 }
}
try{
 const s=await session(),p=s.page;assert((await state(p)).hasSkin);
 await wrong(p);assert.equal((await state(p)).until,0);
 await p.locator('#tutorial').click();const original=await state(p);await wrong(p);const w=await state(p);
 assert.equal(w.until-w.now,420);assert.deepEqual(w.queue,original.queue);assert.equal(w.score,0);
 await paints(p);await p.clock.runFor(16);validatePaints(await paints(p),w.catStart,'oops');
 await p.screenshot({path:path.join(out,'feedback-360-tutorial-oops.png')});
 await p.clock.runFor(403);validatePaints(await paints(p),w.catStart,'oops');
 assert.equal((await state(p)).until-(await state(p)).now,1);
 await p.clock.runFor(17);validatePaints(await paints(p),w.catStart,'supply');
 checks.push('tutorial wrong answer immediately selects the same-frame expression skin; 420ms expires on the first following render; menu input ignored');
 await wrong(p);await p.clock.runFor(200);const first=await state(p);await wrong(p);const repeated=await state(p);
 assert.equal(repeated.until-repeated.now,420);assert(repeated.until>first.until);assert.equal(repeated.catStart,first.catStart);
 const remaining=repeated.until-repeated.now;await p.locator('#pause').click();await p.clock.runFor(5000);
 const frozen=await state(p);assert.equal(frozen.until-frozen.now,remaining);await wrong(p);assert.equal((await state(p)).until,frozen.until);
 await p.locator('#resume').click();await p.clock.runFor(200);assert.equal((await state(p)).until-(await state(p)).now,220);
 await p.locator('#pause').click();await p.locator('#restart-pause').click();assert.equal((await state(p)).phase,'tutorial');assert.equal((await state(p)).until,0);
 checks.push('repeated wrong inputs refresh one deadline; pause freezes expression and supply time; paused input ignored; tutorial restart clears feedback');
 await correct(p);const supplied=await state(p);await p.clock.runFor(80);const before=await state(p);
 await wrong(p);const after=await state(p);assert.equal(after.catStart,before.catStart);assert.equal(after.catRelease,before.catRelease);
 assert.deepEqual(after.queue,before.queue);assert.equal(after.score,1);
 await paints(p);await p.clock.runFor(16);validatePaints(await paints(p),supplied.catStart,'oops');
 await p.screenshot({path:path.join(out,'feedback-360-supplying-oops.png')});
 await p.clock.runFor(74);await paints(p);await p.clock.runFor(16);const bodyAndPaw=await paints(p);
 assert(bodyAndPaw.length>=2,'body and foreground paw both need draws');validatePaints(bodyAndPaw,supplied.catStart,'oops');
 await p.clock.runFor(150);assert.equal((await state(p)).catStart,supplied.catStart);
 assert.equal(await p.evaluate(()=>bookSortDebug.state.catBook.released),true);
 await correct(p);assert.equal((await state(p)).score,2);await p.clock.runFor(30);await correct(p);assert.equal((await state(p)).phase,'tutorial-done');assert.equal((await state(p)).until,0);
 checks.push('wrong during supply preserves animation frame/anchor/release and queue; body and foreground paw use the same skin; correct rapid input remains immediate and tutorial completion clears feedback');
 const cache=await p.evaluate(()=>{
  const c=bookSortDebug.state.cabinetCache,ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;
  let outside=0,inside=0,blue=0,yellow=0,red=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(!data[i+3])continue;
   if(x<55||x>=186||y<148||y>=252)outside++;else inside++;
   const[r,g,b]=data.slice(i,i+3);if(b>r*1.25&&b>g*.9)blue++;if(r>100&&g>80&&b<g*.8)yellow++;if(r>g*1.3&&r>b*1.3)red++;
  }
  window.originalCache=c;window.originalCachePixels=c.toDataURL();
  return{outside,inside,blue,yellow,red,count:window.pileDrawCount};
 });
 assert.equal(cache.outside,0);assert(cache.inside>3000);assert(cache.blue>200&&cache.yellow>200&&cache.red>200);assert.equal(cache.count,7);
 await p.locator('#play').click();await wrong(p);assert.equal((await state(p)).until,0);await p.clock.runFor(3100);
 await wrong(p);const wrongMain=await state(p);assert.equal(wrongMain.mistakes,1);assert.equal(wrongMain.deadline,29500);assert.equal(wrongMain.combo,0);
 await p.clock.runFor(30);for(let i=0;i<30;i++){await correct(p);await p.clock.runFor(30);}
 const rapid=await state(p);assert.equal(rapid.score,30);assert.equal(rapid.queue.length,4);assert.equal(new Set(rapid.queue).size,4);assert.equal(rapid.deadline,32500);
 assert(await p.evaluate(()=>bookSortDebug.state.cabinetCache===originalCache&&bookSortDebug.state.cabinetCache.toDataURL()===originalCachePixels&&window.pileDrawCount===7));
 checks.push('cached seven-book pile is clipped entirely inside the actual cabinet hole, contains all three colors, and remains identical through restart and rapid sorting');
 const labels=await p.locator('[data-color]').evaluateAll(bs=>bs.map(b=>({text:b.textContent.trim(),aria:b.getAttribute('aria-label'),small:b.querySelectorAll('small,kbd').length,w:b.offsetWidth,h:b.offsetHeight,align:getComputedStyle(b).alignItems,justify:getComputedStyle(b).justifyContent})));
 for(let i=0;i<3;i++)assert.deepEqual(labels[i],{text:'분류',aria:['일반','어린이','유아'][i]+' 자료 분류',small:0,w:108,h:64,align:'center',justify:'center'});
 assert.equal(await p.locator('h1').textContent(),'반납 도서 분류하기');
 await p.clock.runFor(600);await p.screenshot({path:path.join(out,'feedback-360-game.png')});
 await wrong(p);await p.locator('#pause').click();await p.locator('#restart-pause').click();assert.equal((await state(p)).until,0);await p.clock.runFor(3100);
 await wrong(p);await p.clock.fastForward(31000);assert.equal((await state(p)).phase,'result');assert.equal((await state(p)).until,0);
 checks.push('main wrong penalty/combo rules preserved; 30 rapid correct inputs replace once; buttons display only centered 분류 with unchanged hit boxes and accessible labels; restart and result clear feedback');
 assert(!s.requests.some(u=>u.endsWith('cat-oops.png')||u.endsWith('cat-oops.webp')));await s.context.close();
 for(const skin of['webp-fail','missing','bad-geometry']){
  const t=await session({skin});await t.page.locator('#tutorial').click();await paints(t.page);await wrong(t.page);await t.page.clock.runFor(16);
  const fallbackState=await state(t.page);
  assert.equal(fallbackState.hasSkin,skin==='webp-fail');
  validatePaints(await paints(t.page),fallbackState.catStart,skin==='webp-fail'?'oops':'supply');
  await t.page.clock.runFor(30);await correct(t.page);assert.equal((await state(t.page)).score,1);
  if(skin==='webp-fail')assert(t.requests.some(u=>u.endsWith('cat-oops-sheet.png')));
  await t.context.close();
 }
 checks.push('optional skin WebP failure falls back to PNG; both-image failure or incompatible frame metadata falls back to the normal cat without blocking play');
 const large=await session({width:430,height:932});await large.page.locator('#tutorial').click();await correct(large.page);await large.page.clock.runFor(80);await wrong(large.page);await large.page.clock.runFor(16);
 await large.page.screenshot({path:path.join(out,'feedback-430-game.png')});const box=await large.page.locator('#shell').boundingBox();assert(Math.abs(box.width/box.height-360/640)<.001);
 await large.context.close();checks.push('430×932 preserves the portrait ratio and same cabinet/cat/button layout');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'feedback-results.json'),JSON.stringify({version:CONFIG.GAME_VERSION,browser:'Chromium 151 / Playwright 1.62.1',checks,errors,method:'Real mobile-sized Chromium, local repository files served by Playwright request interception; canvas draw calls and cached alpha pixels inspected.'},null,2));
 console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await browser.close();}
