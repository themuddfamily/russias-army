/** Browser instrumentation identifies source buffers by fetched WAV bytes.
 * Duration alone is insufficient once several original samples are decoded.
 */
export function installOriginalAudioProbe():void {
  const review={decoded:{} as Record<string,{duration:number;sampleRate:number}>,events:[] as Array<{kind:'start'|'stop';name:string;duration:number;time:number}>};
  (window as any).__RA_ORIGINAL_AUDIO__=review;
  const names=new Map<string,string>(),buffers=new WeakMap<AudioBuffer,string>();
  const fingerprint=(bytes:ArrayBuffer)=>{let value=2166136261;const data=new Uint8Array(bytes);for(const byte of data)value=Math.imul(value^byte,16777619);return `${data.length}:${value>>>0}`;};
  const fetchOriginal=window.fetch;
  window.fetch=async function(...args:Parameters<typeof fetch>){
    const response=await fetchOriginal.apply(this,args),url=typeof args[0]==='string'?args[0]:args[0] instanceof URL?args[0].href:args[0].url;
    const match=url.match(/\/original-audio\/([^/]+)\.wav(?:\?|$)/);
    if(match){const read=response.arrayBuffer.bind(response);response.arrayBuffer=async()=>{const bytes=await read();names.set(fingerprint(bytes),match[1]);return bytes;};}
    return response;
  };
  const decode=AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData=function(bytes){const name=names.get(fingerprint(bytes));return decode.call(this,bytes).then(buffer=>{if(name){buffers.set(buffer,name);review.decoded[name]={duration:buffer.duration,sampleRate:buffer.sampleRate};}return buffer;});};
  for(const kind of ['start','stop'] as const){
    const original=AudioBufferSourceNode.prototype[kind];
    AudioBufferSourceNode.prototype[kind]=function(...args:any[]){const name=this.buffer?buffers.get(this.buffer):undefined;if(name&&this.buffer)review.events.push({kind,name,duration:this.buffer.duration,time:performance.now()});return Reflect.apply(original,this,args);};
  }
}
