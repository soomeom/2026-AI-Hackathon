// A brief local fanfare, unlocked by the completion click; no remote audio assets.
let context;
export function unlockCompletionAudio() {
  try {
    const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
    if(!Audio)return;
    context??=new Audio();
    if(context.state==='suspended')context.resume().catch(()=>{});
  } catch { /* optional audio */ }
}
export function playStampSound() {
  unlockCompletionAudio();
  if(!context)return;
  const play=()=>{
    try {
      const t=context.currentTime,master=context.createGain();master.gain.value=0.16;master.connect(context.destination);
      // Rising major arpeggio followed by a bright final chord.
      const notes=[[523.25,0,.12],[659.25,.13,.12],[783.99,.26,.13],[1046.5,.42,.42],[659.25,.42,.42],[783.99,.42,.42]];
      for(const [frequency,delay,duration] of notes){
        const o=context.createOscillator(),g=context.createGain();o.type='triangle';o.frequency.value=frequency;
        g.gain.setValueAtTime(0,t+delay);g.gain.linearRampToValueAtTime(.38,t+delay+.018);g.gain.exponentialRampToValueAtTime(.001,t+delay+duration);
        o.connect(g);g.connect(master);o.start(t+delay);o.stop(t+delay+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();};
      }
      setTimeout(()=>master.disconnect(),1100);
    }catch { /* audio must never interrupt learning */ }
  };
  if(context.state==='running')play();else context.resume().then(play).catch(()=>{});
}
