import { playStampSound } from './stamp-sound.js';
const NS='http://www.w3.org/2000/svg';
const scheduled=new WeakMap();
// Keep events pending across store updates and the UI's second render. Consume only
// when the seal in the CURRENT DOM is about to celebrate, never when scheduling.
export function celebrateRelationCompletion(root,ui){
  const previous=scheduled.get(root);
  if(previous!==undefined){clearTimeout(previous);scheduled.delete(root);}
  if(!ui.pendingStampIds?.length)return;
  const visible=()=>[...root.querySelectorAll('.rm-node')].filter(n=>
    ui.pendingStampIds?.includes(n.dataset.mapNode)&&n.isConnected&&n.querySelector('.rm-seal'));
  if(!visible().length)return;
  const timer=setTimeout(()=>{
    scheduled.delete(root);
    const nodes=visible();
    if(!nodes.length)return; // A different page is open: preserve the event for returning.
    const ids=new Set(nodes.map(n=>n.dataset.mapNode));
    ui.pendingStampIds=ui.pendingStampIds.filter(id=>!ids.has(id));
    nodes[0].scrollIntoView?.({block:'nearest',inline:'center',behavior:'instant'});
    playStampSound();
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    for(const node of nodes){
      const seal=node.querySelector('.rm-seal'),circle=node.querySelector('.rm-c');
      if(!seal||!circle)continue;
      seal.classList.add('rm-stamp-arrive');
      const burst=document.createElementNS(NS,'g');burst.setAttribute('class','rm-fireworks');burst.setAttribute('aria-hidden','true');burst.setAttribute('transform',`translate(${circle.getAttribute('cx')} ${circle.getAttribute('cy')})`);
      for(let i=0;i<20;i++){
        const angle=2*Math.PI*i/20,distance=36+(i%3)*13;
        const particle=document.createElementNS(NS,'rect');particle.setAttribute('x','-1.5');particle.setAttribute('y','-3');particle.setAttribute('width','3');particle.setAttribute('height','6');particle.setAttribute('rx','1');particle.setAttribute('class',`rm-spark spark-${i%4}`);
        particle.style.setProperty('--dx',`${Math.cos(angle)*distance}px`);particle.style.setProperty('--dy',`${Math.sin(angle)*distance+12}px`);particle.style.setProperty('--spin',`${i*61}deg`);burst.append(particle);
      }
      node.append(burst);setTimeout(()=>{burst.remove();seal.classList.remove('rm-stamp-arrive');},1050);
    }
  },ui.relationZoom?520:0);
  scheduled.set(root,timer);
}
