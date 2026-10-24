export const DISPLAY_KEY='baeumgil:display:v1';
export function createDisplayPreferences(storage) {
 let largeText=false,persistent=Boolean(storage);
 try {const saved=JSON.parse(storage?.getItem(DISPLAY_KEY)??'null');largeText=saved?.version===1&&saved.largeText===true;}
 catch { /* 손상된 설정은 기본 크기로 연다. 학습 기록은 건드리지 않는다. */ }
 return {get largeText(){return largeText;},get persistent(){return persistent;},setLargeText(value){
  largeText=value===true;
  try{storage?.setItem(DISPLAY_KEY,JSON.stringify({version:1,largeText}));}catch{persistent=false;}
 }};
}

export function installDisplayControls({document,storage}) {
 const prefs=createDisplayPreferences(storage),button=document.getElementById('large-text');
 const status=document.getElementById('display-status');
 const apply=()=>{
  document.documentElement.classList.toggle('large-text',prefs.largeText);
  button.setAttribute('aria-pressed',String(prefs.largeText));
  button.textContent=prefs.largeText?'큰글씨 켜짐':'큰글씨';
 };
 apply();
 const set=value=>{
  prefs.setLargeText(value);apply();
  status.textContent=`${prefs.largeText?'큰글씨로 바꿨어요.':'기본 글씨로 바꿨어요.'}${prefs.persistent?'':' 이 환경에서는 설정이 저장되지 않아요.'}`;
 };
 button.addEventListener('click',()=>set(!prefs.largeText));
 // 첫 화면의 큰글씨 추천도 같은 설정을 바꾼다
 return {get largeText(){return prefs.largeText;},get persistent(){return prefs.persistent;},setLargeText:set};
}
