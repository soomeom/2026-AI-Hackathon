import test from 'node:test';
import assert from 'node:assert/strict';
import * as display from '../public/src/state/display-preferences.js';
const memory=()=>{const m=new Map([['baeumgil:mvp:v1','original']]);return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('large text defaults off, persists independently and restores without touching records',()=>{
 const storage=memory(),prefs=display.createDisplayPreferences(storage);assert.equal(prefs.largeText,false);
 prefs.setLargeText(true);assert.equal(display.createDisplayPreferences(storage).largeText,true);
 assert.equal(storage.getItem('baeumgil:mvp:v1'),'original');prefs.setLargeText(false);assert.equal(prefs.largeText,false);
});
test('corrupt/unavailable settings fall back safely; toggling works without storage',()=>{
 const storage=memory();storage.setItem(display.DISPLAY_KEY,'broken');assert.equal(display.createDisplayPreferences(storage).largeText,false);
 const p=display.createDisplayPreferences({getItem(){throw Error();},setItem(){throw Error();}});p.setLargeText(true);assert.equal(p.largeText,true);assert.equal(p.persistent,false);
 const missing=display.createDisplayPreferences(null);missing.setLargeText(true);assert.equal(missing.largeText,true);
});
