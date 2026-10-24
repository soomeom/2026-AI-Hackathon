import test from 'node:test';import assert from 'node:assert/strict';
import {celebrateRelationCompletion} from '../public/src/ui/completion-effects.js';
function clock(run){const timeout=globalThis.setTimeout,clear=globalThis.clearTimeout,media=globalThis.matchMedia;const tasks=new Map();let seq=0;globalThis.setTimeout=fn=>{tasks.set(++seq,fn);return seq;};globalThis.clearTimeout=id=>tasks.delete(id);globalThis.matchMedia=()=>({matches:true});try{run(tasks);}finally{globalThis.setTimeout=timeout;globalThis.clearTimeout=clear;globalThis.matchMedia=media;}}
const node=id=>({dataset:{mapNode:id},isConnected:true,querySelector:()=>({}),scrollIntoView(){}});
test('saved stamps without new completion never schedule celebration',()=>{clock(tasks=>{celebrateRelationCompletion({querySelectorAll(){throw Error('should not query');}},{});assert.equal(tasks.size,0);});});
test('double render preserves event until the new DOM celebrates once',()=>{clock(tasks=>{
 const ui={pendingStampIds:['done','later'],relationZoom:true};let current=node('done');const root={querySelectorAll:()=>[current]};
 celebrateRelationCompletion(root,ui);assert.deepEqual(ui.pendingStampIds,['done','later']);
 current.isConnected=false;current=node('done');celebrateRelationCompletion(root,ui);
 assert.equal(tasks.size,1);const fire=[...tasks.values()][0];tasks.clear();fire();assert.deepEqual(ui.pendingStampIds,['later']);
 celebrateRelationCompletion(root,ui);assert.equal(tasks.size,0);
});});
test('navigation away preserves an event and returning plays it',()=>{clock(tasks=>{
 const ui={pendingStampIds:['done']};let current=node('done');const root={querySelectorAll:()=>current?[current]:[]};
 celebrateRelationCompletion(root,ui);current=null;const fire=[...tasks.values()][0];tasks.clear();fire();assert.deepEqual(ui.pendingStampIds,['done']);
 current=node('done');celebrateRelationCompletion(root,ui);const next=[...tasks.values()][0];tasks.clear();next();assert.deepEqual(ui.pendingStampIds,[]);
});});
test('a missing seal or disconnected node cannot prematurely consume completion',()=>{clock(tasks=>{const ui={pendingStampIds:['done']};const n=node('done');n.querySelector=()=>null;const root={querySelectorAll:()=>[n]};celebrateRelationCompletion(root,ui);assert.equal(tasks.size,0);assert.deepEqual(ui.pendingStampIds,['done']);n.querySelector=()=>({});n.isConnected=false;celebrateRelationCompletion(root,ui);assert.equal(tasks.size,0);});});
