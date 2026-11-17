// 启动（放在所有模块之后，避免常量还没初始化）
load(); render();

const themeButtons=document.querySelectorAll('#theme-choice button');
function syncThemeButtons(){
  for(const button of themeButtons){
    button.setAttribute('aria-pressed',String(button.dataset.theme===document.documentElement.dataset.theme));
  }
}
for(const button of themeButtons){
  button.addEventListener('click',()=>{
    const theme=button.dataset.theme;
    if(theme===document.documentElement.dataset.theme) return;
    applyTheme(theme);
    syncThemeButtons();
    try{ localStorage.setItem(THEME_KEY,theme); }catch(e){}
    drawCourt();
  });
}
syncThemeButtons();

const modalRoot=document.getElementById('modal'), appRoot=document.getElementById('app');
let modalTrigger=null;
new MutationObserver(()=>{
  const box=modalRoot.querySelector('.modal>.box');
  if(box){
    if(!appRoot.inert){ modalTrigger=document.activeElement; appRoot.inert=true; }
    box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true');
    if(!box.hasAttribute('aria-label') && !box.hasAttribute('aria-labelledby')){
      box.setAttribute('aria-label',box.querySelector('h1')?.textContent||'详细信息');
    }
    if(!box.contains(document.activeElement)){ box.tabIndex=-1; box.focus({preventScroll:true}); }
  }else if(appRoot.inert){
    appRoot.inert=false;
    if(modalTrigger?.isConnected) modalTrigger.focus({preventScroll:true});
    modalTrigger=null;
  }
}).observe(modalRoot,{childList:true});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && modalRoot.firstChild && !cheatBusy) closeModal();
});
