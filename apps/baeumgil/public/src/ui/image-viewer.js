// 본문을 다시 그리지 않는 원본 이미지 확대. 답안과 입력, 진행 단계는 그대로 둔다.
export function installImageViewer(document) {
 const dialog=document.getElementById('image-viewer');
 if(!dialog?.showModal)return;
 const image=document.getElementById('viewer-image'),toggle=document.getElementById('viewer-size');
 let opener;
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-image-zoom]');if(!button)return;
  opener=button;image.src=button.dataset.imageSrc;image.alt=button.dataset.imageAlt??'확대한 원본 문항';
  dialog.classList.remove('natural-size');toggle.setAttribute('aria-pressed','false');dialog.showModal();
 });
 document.getElementById('viewer-close').addEventListener('click',()=>dialog.close());
 toggle.addEventListener('click',()=>{const on=dialog.classList.toggle('natural-size');toggle.setAttribute('aria-pressed',String(on));});
 dialog.addEventListener('close',()=>opener?.isConnected&&opener.focus());
}
