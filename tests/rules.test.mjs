import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,bookStream,createGame,applyInput,resultOf} from '../shared/rules.js';
test('seed determinism, balanced bags, no three identical colors, unique IDs',()=>{
 for(let seed=0;seed<100;seed++){
  const a=bookStream(seed),b=bookStream(seed),books=Array.from({length:900},()=>a());
  assert.deepEqual(books,Array.from({length:900},()=>b()));
  assert.equal(new Set(books.map(v=>v.id)).size,900);
  for(const c of[0,1,2])assert.equal(books.filter(v=>v.color===c).length,300);
  for(let i=2;i<books.length;i++)assert(!(books[i].color===books[i-1].color&&books[i].color===books[i-2].color));
 }
});
test('atomic correct input removes exactly one and supplies exactly one under rapid input',()=>{
 const g=createGame(2);let previous=g.queue.map(b=>b.id);
 for(let i=0;i<500;i++){
  const r=applyInput(g,g.queue[0].color,i*20);assert(r.correct);
  assert.deepEqual(g.queue.slice(0,3).map(b=>b.id),previous.slice(1));
  assert.equal(g.queue.length,4);assert(!previous.includes(g.queue[3].id));previous=g.queue.map(b=>b.id);
 }assert.equal(g.score,500);assert.equal(g.deadline,33000);
});
test('wrong input preserves queue, penalty can end a run, boundary time wins',()=>{
 const g=createGame(3),q=structuredClone(g.queue);applyInput(g,(q[0].color+1)%3,29900);
 assert.deepEqual(g.queue,q);assert.equal(g.mistakes,1);assert.equal(g.terminalAt,29900);
 assert.equal(applyInput(g,q[0].color,29900).accepted,false);
 const h=createGame(1);assert.equal(applyInput(h,h.queue[0].color,30000).accepted,false);assert.equal(h.score,0);
});
test('10 combo bonus is awarded once even after mistakes',()=>{
 const g=createGame(4);for(let i=0;i<20;i++)applyInput(g,g.queue[0].color,i*100);
 assert.equal(g.deadline,33000);applyInput(g,(g.queue[0].color+1)%3,2100);
 for(let i=0;i<20;i++)applyInput(g,g.queue[0].color,2200+i*100);
 assert.equal(g.deadline,32500);assert.equal(g.maxCombo,20);assert(g.bonus);
});

test('target is checked at the result; reaching it does not end play',()=>{const g=createGame(1);for(let i=0;i<30;i++)applyInput(g,g.queue[0].color,i*100);assert.equal(g.score,30);assert.equal(g.terminalAt,null);assert.equal(resultOf(g).success,true);assert.equal(resultOf(createGame(1)).success,false);});
