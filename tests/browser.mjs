import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'verification');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,timeout:20000}),checks=[],errors=[];
async function session({width=360,height=640,png=false,storageBlocked=false,savedBest}={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(storageBlocked||savedBest!==undefined)await page.addInitScript(({blocked,best})=>{
  if(best!==undefined)localStorage.setItem('book-sort:best',JSON.stringify(best));
  if(blocked){Storage.prototype.getItem=()=>{throw Error('Storage unavailable');};Storage.prototype.setItem=()=>{throw Error('Storage unavailable');};}
 },{blocked:storageBlocked,best:savedBest});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push({url:u.href,method:route.request().method()});
  if(u.origin!=='https://book-sort.test'){await route.abort();return;}
  const pathname=u.pathname.replace(/^\/repo\//,'/'),file=path.join(root,pathname==='/'?'index.html':pathname.slice(1)),ext=path.extname(file);
  if(png&&ext==='.webp'){await route.fulfill({status:404});return;}
  try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'})[ext]});}
  catch{await route.fulfill({status:404});}
 });
 await page.clock.install();
 await page.goto('https://book-sort.test/repo/?dev=1');
 await page.waitForFunction(()=>window.bookSortDebug?.state.phase==='menu');
 return{context,page,requests};
}
async function tutorial(p){
 await p.locator('#tutorial').click();
 for(const key of['1','2','3']){await p.keyboard.press(key);await p.clock.runFor(80);}
 assert.equal(await p.evaluate(()=>bookSortDebug.state.phase),'tutorial-done');
 await p.locator('#play').click();await p.clock.runFor(3100);
 assert.equal(await p.evaluate(()=>bookSortDebug.state.phase),'playing');
}
async function correct(p,n=1){
 for(let i=0;i<n;i++){
  const color=await p.evaluate(()=>bookSortDebug.state.g.queue[0].color);
  await p.locator('[data-color="'+color+'"]').dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:1});
  await p.clock.runFor(30);
 }
}
async function restart(p){
 await p.locator('#again').click();await p.clock.runFor(3100);
 assert.equal(await p.evaluate(()=>bookSortDebug.state.phase),'playing');
}
function onlyStatic(requests){
 assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin==='https://book-sort.test'));
 assert(!requests.some(r=>/config\.js|supabase|functions\/v1/.test(r.url)));
}
try{
 const s=await session(),p=s.page;await p.screenshot({path:path.join(out,'360-start.png')});
 assert.equal(await p.locator('#menu-best').textContent(),'내 기기 최고 0권');
 assert.equal(await p.locator('#open-rank, #nickname').count(),0);
 await tutorial(p);assert.equal(await p.locator('#score').textContent(),'정리 0권');
 const rects=await p.locator('[data-color]').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,bottom:r.bottom};}));
 for(const r of rects)assert(r.x>=0&&r.right<=360&&r.bottom<=640);
 await p.screenshot({path:path.join(out,'360-game.png')});
 checks.push('360×640: tutorial separate from main score, accessible buttons inside viewport, no leaderboard or nickname form');
 const before=await p.evaluate(()=>bookSortDebug.state.g.queue.map(b=>b.id)),front=await p.evaluate(()=>bookSortDebug.state.g.queue[0].color);
 await p.keyboard.press(String((front+1)%3+1));await p.clock.runFor(30);
 assert.deepEqual(await p.evaluate(()=>bookSortDebug.state.g.queue.map(b=>b.id)),before);
 await correct(p);assert.equal(await p.evaluate(()=>bookSortDebug.state.g.score),1);
 const after=await p.evaluate(()=>bookSortDebug.state.g.queue.map(b=>b.id));assert.deepEqual(after.slice(0,3),before.slice(1));
 await p.locator('[data-color="'+front+'"]').dispatchEvent('click',{detail:1});
 await p.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'1',repeat:true})));
 assert.equal(await p.evaluate(()=>bookSortDebug.state.g.score),1);
 checks.push('wrong answer preserves queue; correct answer replaces once; compatibility clicks and key repeat do not double count');
 await p.locator('#pause').click();const frozen=await p.locator('#time').textContent();
 await p.clock.fastForward(600100);assert.equal(await p.locator('#time').textContent(),frozen);
 await p.locator('#resume').click();assert.equal(await p.locator('#mode').textContent(),'내 기록 도전');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await p.evaluate(()=>bookSortDebug.state.phase),'paused');
 await p.evaluate(()=>Object.defineProperty(document,'hidden',{get:()=>false,configurable:true}));await p.locator('#resume').click();
 checks.push('long pauses and visibility changes preserve active time and score with explicit resume');
 await p.evaluate(()=>{window.completions=0;addEventListener('library:book-sort-complete',()=>completions++);});
 await correct(p,29);assert.equal(await p.evaluate(()=>bookSortDebug.state.g.score),30);assert.equal(await p.evaluate(()=>bookSortDebug.state.g.deadline),32500);
 await p.clock.fastForward(34000);
 assert.equal(await p.evaluate(()=>bookSortDebug.state.phase),'result');assert.equal(await p.evaluate(()=>completions),1);
 assert.equal(await p.locator('#best-score').textContent(),'30권');assert.match(await p.locator('#record-message').textContent(),/새 최고/);
 assert.equal(await p.evaluate(()=>localStorage.getItem('book-sort:best')),'30');
 assert.deepEqual(await p.evaluate(()=>Object.keys(localStorage)),['book-sort:best']);
 assert(!/TOP\s*10|순위|별명|연습 기록/.test(await p.locator('#panel').textContent()));
 await p.screenshot({path:path.join(out,'360-result.png')});onlyStatic(s.requests);
 await p.locator('#continue').click();assert.equal(await p.evaluate(()=>completions),1);
 checks.push('30-book rapid play, one bonus, result stats and local best, one completion event, no external API requests');
 await p.reload();await p.waitForFunction(()=>bookSortDebug?.state.phase==='menu');
 assert.equal(await p.locator('#menu-best').textContent(),'내 기기 최고 30권');
 await tutorial(p);await correct(p,5);await p.clock.fastForward(34000);
 assert.equal(await p.locator('#best-score').textContent(),'30권');assert(!/새 최고/.test(await p.locator('#record-message').textContent()));
 const oldId=await p.evaluate(()=>bookSortDebug.state.roundId);await restart(p);
 const reset=await p.evaluate(()=>({score:bookSortDebug.state.g.score,combo:bookSortDebug.state.g.combo,bonus:bookSortDebug.state.g.bonus,flights:bookSortDebug.state.flights.length,cat:bookSortDebug.state.catBook,id:bookSortDebug.state.roundId}));
 assert.notEqual(reset.id,oldId);delete reset.id;assert.deepEqual(reset,{score:0,combo:0,bonus:false,flights:0,cat:null});
 await p.evaluate(()=>{window.calls=0;window.signals=0;window.onGameComplete=()=>calls++;addEventListener('library:book-sort-complete',()=>signals++);});
 await correct(p,31);await p.clock.fastForward(34000);
 assert.equal(await p.evaluate(()=>calls),1);assert.equal(await p.evaluate(()=>signals),0);assert.equal(await p.locator('#best-score').textContent(),'31권');
 await p.locator('#continue').click();assert.equal(await p.evaluate(()=>calls),1);onlyStatic(s.requests);
 checks.push('best survives reload, lower scores retain it, higher scores update it; restart resets state and callback fires once');
 await s.context.close();
 const large=await session({width:430,height:932,savedBest:42});await tutorial(large.page);
 const box=await large.page.locator('#shell').boundingBox();assert(Math.abs(box.width/box.height-360/640)<.001);
 await large.page.screenshot({path:path.join(out,'430-game.png')});await correct(large.page);await large.page.clock.fastForward(34000);
 assert.equal(await large.page.locator('#best-score').textContent(),'42권');
 await large.context.close();checks.push('430×932 preserves aspect ratio and existing device best');
 const offline=await session();const count=offline.requests.length;await offline.context.setOffline(true);await tutorial(offline.page);await correct(offline.page,6);await offline.page.clock.fastForward(34000);
 assert.equal(await offline.page.locator('#best-score').textContent(),'6권');assert.equal(offline.requests.length,count);await offline.context.close();
 checks.push('after initial assets load, offline play finishes and saves local best without further requests');
 const blocked=await session({storageBlocked:true});await tutorial(blocked.page);await correct(blocked.page,4);await blocked.page.clock.fastForward(34000);
 assert.equal(await blocked.page.locator('#best-score').textContent(),'4권');assert.match(await blocked.page.locator('#record-note').textContent(),/今回|이번 창/);
 await blocked.context.close();checks.push('blocked localStorage keeps an in-memory best and does not block results or replay');
 const fallback=await session({png:true});assert.equal(fallback.requests.filter(r=>r.url.endsWith('.png')).length,9);await fallback.context.close();
 checks.push('WebP failure loads PNG alternatives; assets remain under the repository path');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify({version:'book-sort-2.1.0',browser:'Chromium 151 / Playwright 1.62.1',checks,errors,method:'Real Chromium rendering and input, static local source served by Playwright request interception at https://book-sort.test/repo/.'},null,2));
 console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await browser.close();}

