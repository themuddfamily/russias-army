import {copyReceiverLocalHitscanOutcomes,type ReceiverLocalHitscanOutcome} from './originalReceiverLocalHitscan';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverWeaponReportCheckpoint {
 readonly prefix:ReceiverScenePrefix;readonly shots:number;readonly hurts:readonly Readonly<{name:string;amount:number}>[];
}
export interface ReceiverWeaponReportPayload {
 readonly shots?:number;readonly hurts?:readonly Readonly<{name:string;amount:number}>[];
}
export interface ReceiverWeaponReportOptions {readonly maxNames:number;readonly maxTextChars:number;readonly maxCommands:number}
export interface ReceiverWeaponReportTransaction {
 admitPrefix(prefix:ReceiverScenePrefix):void;record(outcome:ReceiverLocalHitscanOutcome):void;
 send():ReceiverWeaponReportPayload;freeze():ReceiverWeaponReportCheckpoint;prepareCommit():()=>void;rollback():void;
}
function bounds(maxNames:number,maxTextChars:number):void {
 if(!Number.isSafeInteger(maxNames)||maxNames<1||maxNames>256||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536)throw Error('Invalid weapon report bounds');
}
function copyPrefix(raw:ReceiverScenePrefix):ReceiverScenePrefix {
 if(!raw)throw Error('Missing weapon report prefix');const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid weapon report prefix');
 const prefix=Object.freeze(kind==='callback'?{kind,sceneGeneration,callback}:{kind,sceneGeneration,callback,tick:(raw as Extract<ReceiverScenePrefix,{kind:'receipt'}>).tick});validateReceiverScenePrefix(prefix);return prefix;
}
function copyHurts(raw:readonly Readonly<{name:string;amount:number}>[],maxNames:number,maxTextChars:number):readonly Readonly<{name:string;amount:number}>[] {
 if(!Array.isArray(raw))throw Error('Invalid weapon report hurts');const count=raw.length;
 if(!Number.isSafeInteger(count)||count<0||count>maxNames)throw Error('Weapon report name budget exceeded');
 const names=new Set<string>(),rows:Readonly<{name:string;amount:number}>[]=[];let text=0,total=0;
 for(let i=0;i<count;i++){
  const row:Readonly<{name:string;amount:number}>=raw[i];if(!row)throw Error('Missing weapon report hurt');const name=row.name,amount=row.amount;
  if(typeof name!=='string'||names.has(name)||!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid weapon report hurt');
  text+=name.length;total+=amount;if(!Number.isSafeInteger(text)||text>maxTextChars||!Number.isSafeInteger(total))throw Error('Weapon report text or amount overflow');
  names.add(name);rows.push(Object.freeze({name,amount}));
 }
 return Object.freeze(rows);
}
/** Exact string keys are an adapter; native property-list symbol/case behavior
 * is not established. Unknown fields and actor ids never enter the payload. */
export function copyReceiverWeaponReportPayload(raw:ReceiverWeaponReportPayload,maxNames:number,maxTextChars:number):ReceiverWeaponReportPayload {
 bounds(maxNames,maxTextChars);if(!raw)throw Error('Missing weapon report payload');const shots=raw.shots,rawHurts=raw.hurts;
 if(shots!==undefined&&(!Number.isSafeInteger(shots)||shots<=0))throw Error('Invalid weapon report shot payload');
 const hurts=rawHurts===undefined?undefined:copyHurts(rawHurts,maxNames,maxTextChars);
 if(hurts&&hurts.length===0)throw Error('Empty weapon report hurt payload');
 return Object.freeze({...(shots!==undefined?{shots}:{}),...(hurts?{hurts}:{})});
}
/** Explicit source report accumulation only. Prefixes never schedule send or
 * pingserver; send clears this private stage immediately, never on an ack.
 * No canonical health, network IO, audio, or native timing is inferred. */
export class OriginalReceiverWeaponReportWorld {
 private state:ReceiverWeaponReportCheckpoint|undefined;private released=false;private active=false;
 private rollbackActive:(()=>void)|undefined;private lastReceiptTick:number|undefined;
 private readonly options:ReceiverWeaponReportOptions;
 constructor(seed:ReceiverWeaponReportCheckpoint,options:ReceiverWeaponReportOptions){
  if(!options)throw Error('Missing weapon report options');const maxNames=options.maxNames,maxTextChars=options.maxTextChars,maxCommands=options.maxCommands;bounds(maxNames,maxTextChars);
  if(!Number.isSafeInteger(maxCommands)||maxCommands<1)throw Error('Invalid weapon report command budget');
  this.options=Object.freeze({maxNames,maxTextChars,maxCommands});this.state=this.copy(seed);this.lastReceiptTick=this.state.prefix.kind==='receipt'?this.state.prefix.tick:undefined;
 }
 private copy(raw:ReceiverWeaponReportCheckpoint):ReceiverWeaponReportCheckpoint {
  if(!raw)throw Error('Missing weapon report checkpoint');const prefix=copyPrefix(raw.prefix),shots=raw.shots,hurts=raw.hurts;
  if(!Number.isSafeInteger(shots)||shots<0)throw Error('Invalid weapon report shots');
  return Object.freeze({prefix,shots,hurts:copyHurts(hurts,this.options.maxNames,this.options.maxTextChars)});
 }
 freeze():ReceiverWeaponReportCheckpoint {if(this.released||!this.state)throw Error('Weapon report world released');return this.state;}
 release():void {if(this.released)return;this.released=true;try{this.rollbackActive?.();}finally{this.state=undefined;this.active=false;this.rollbackActive=undefined;this.lastReceiptTick=undefined;}}
 begin():ReceiverWeaponReportTransaction {
  const initial=this.freeze();if(this.active)throw Error('Weapon report transaction active');this.active=true;
  let state=initial,tick=this.lastReceiptTick,count=0,text=0,open=true,failed=false,prepared=false,running=false,publisher:(()=>void)|undefined;
  const read=()=>{if(!open||failed||this.released)throw Error('Weapon report transaction closed or failed');return state;};
  const check=()=>{if(running){failed=true;throw Error('Recursive weapon report command');}read();if(prepared)throw Error('Weapon report transaction prepared');};
  const guarded=<T>(operation:()=>T):T=>{check();running=true;try{if(++count>this.options.maxCommands)throw Error('Weapon report command budget exceeded');const result=operation();read();return result;}catch(error){failed=true;throw error;}finally{running=false;}};
  const rollback=()=>{if(!open)return;open=false;this.active=false;this.rollbackActive=undefined;};this.rollbackActive=rollback;
  return {
   admitPrefix:raw=>guarded(()=>{
    const prefix=copyPrefix(raw);
    if(prefix.sceneGeneration!==state.prefix.sceneGeneration||prefix.kind==='callback'&&prefix.callback!==state.prefix.callback+1||prefix.kind==='receipt'&&(prefix.callback!==state.prefix.callback||tick!==undefined&&prefix.tick<=tick))throw Error('Weapon report prefix replay or mismatch');
    state=this.copy({...state,prefix});if(prefix.kind==='receipt')tick=prefix.tick;
   }),
   record:raw=>guarded(()=>{
    if(state.prefix.kind!=='callback')throw Error('Weapon report record requires callback');
    const outcome=copyReceiverLocalHitscanOutcomes([raw],state.prefix,1,this.options.maxTextChars)[0];
    const shots=state.shots+outcome.positiveShot;if(!Number.isSafeInteger(shots))throw Error('Weapon report shot overflow');
    let hurts=state.hurts;
    if(outcome.hurt){const {name,amount}=outcome.hurt;text+=name.length;if(!Number.isSafeInteger(text)||text>this.options.maxTextChars)throw Error('Weapon report command text budget exceeded');
     const index=hurts.findIndex(row=>row.name===name),rows=[...hurts];
     if(index<0)rows.push({name,amount});else{const sum=rows[index].amount+amount;if(!Number.isSafeInteger(sum))throw Error('Weapon report hurt overflow');rows[index]={name,amount:sum};}
     hurts=rows;
    }
    state=this.copy({...state,shots,hurts});
   }),
   send:()=>guarded(()=>{
    if(state.prefix.kind!=='callback')throw Error('Weapon report send requires callback');
    const payload=copyReceiverWeaponReportPayload({...(state.shots>0?{shots:state.shots}:{}),...(state.hurts.length>0?{hurts:state.hurts}:{})},this.options.maxNames,this.options.maxTextChars);
    state=this.copy({prefix:state.prefix,shots:0,hurts:[]});return payload;
   }),
   freeze:read,
   prepareCommit:()=>{
    if(publisher){read();if(running){failed=true;throw Error('Recursive weapon report prepare');}return publisher;}
    check();const next=state,nextTick=tick;prepared=true;
    publisher=()=>{if(!open||this.released)return;this.state=next;this.lastReceiptTick=nextTick;open=false;this.active=false;this.rollbackActive=undefined;};return publisher;
   },
   rollback,
  };
 }
}
