// Local game rules and layout.
export const CONFIG = Object.freeze({
 GAME_VERSION:'book-sort-2.1.0',
 durationMs:30000,target:25,penaltyMs:500,bonusMs:3000,bonusCombo:10,
 queueLength:4,flightMs:145,slideMs:110,catMs:500,
 layout:{width:360,height:640,baseline:408,frontX:214,bookW:30,bookH:58,gap:24,
 catX:100,catScale:.40,cabinet:[0,292,93,116],boxX:[62,180,298],boxY:458,boxW:108,boxH:66}
});
export const CATEGORIES=[
 {color:'blue',name:'일반',hex:'#75a9ed',mark:'Ⅰ'},
 {color:'yellow',name:'어린이',hex:'#f6ce65',mark:'Ⅱ'},
 {color:'red',name:'유아',hex:'#f28c79',mark:'Ⅲ'}
];
export function bookStream(seed){
 let x=(seed>>>0)||0x9e3779b9,bag=[],last=-1,streak=0,id=0;
 const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
 return()=>{
  if(!bag.length){
   bag=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
   if(streak===2&&bag[0]===last)[bag[0],bag[1]]=[bag[1],bag[0]];
  }
  const color=bag.shift();streak=color===last?streak+1:1;last=color;return{id:++id,color};
 };
}
export function createGame(seed){
 const next=bookStream(seed);
 return{next,queue:Array.from({length:CONFIG.queueLength},next),score:0,mistakes:0,combo:0,maxCombo:0,bonus:false,deadline:CONFIG.durationMs,terminalAt:null};
}
export function applyInput(g,color,t){
 if(!Number.isInteger(color)||color<0||color>2||!Number.isInteger(t)||t<0)throw Error('invalid_input');
 // At exactly the deadline, time wins.
 if(g.terminalAt!==null||t>=g.deadline)return{accepted:false};
 if(g.queue[0].color===color){
  const book=g.queue.shift(),supplied=g.next();g.queue.push(supplied);g.score++;g.combo++;g.maxCombo=Math.max(g.maxCombo,g.combo);
  const bonus=!g.bonus&&g.combo===CONFIG.bonusCombo;if(bonus){g.bonus=true;g.deadline+=CONFIG.bonusMs;}
  return{accepted:true,correct:true,book,supplied,bonus};
 }
 g.mistakes++;g.combo=0;g.deadline-=CONFIG.penaltyMs;if(t>=g.deadline)g.terminalAt=t;
 return{accepted:true,correct:false};
}
export function resultOf(g){return{score:g.score,mistakes:g.mistakes,maxCombo:g.maxCombo,bonus:g.bonus,success:g.score>=CONFIG.target,endAt:g.terminalAt??g.deadline};}
