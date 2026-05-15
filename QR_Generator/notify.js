/* Custom notification helper — replaces window.alert
 * Usage: notify("message", "success" | "error" | "info" | "warn")
 *        notifyModal({title, message, okText, cancelText}) -> Promise<boolean>
 */
(function(){
  function ensureWrap(){
    let w=document.querySelector('.notif-wrap');
    if(!w){w=document.createElement('div');w.className='notif-wrap';document.body.appendChild(w);}
    return w;
  }
  const ICONS={success:'\u2713',error:'\u2715',info:'i',warn:'!'};
  window.notify=function(msg,type){
    type=type||'info';
    const wrap=ensureWrap();
    const el=document.createElement('div');
    el.className='notif notif-'+type;
    el.innerHTML='<div class="notif-icon">'+(ICONS[type]||'')+'</div>'+
      '<div class="notif-msg"></div>'+
      '<button class="notif-close" aria-label="Close">&times;</button>';
    el.querySelector('.notif-msg').textContent=msg;
    wrap.appendChild(el);
    const close=()=>{el.classList.add('out');setTimeout(()=>el.remove(),300);};
    el.querySelector('.notif-close').onclick=close;
    setTimeout(close,4200);
    return el;
  };
  window.notifyModal=function(opts){
    return new Promise(resolve=>{
      const bg=document.createElement('div');bg.className='notif-modal-bg';
      bg.innerHTML='<div class="notif-modal" role="dialog" aria-modal="true">'+
        '<h3></h3><p></p>'+
        '<div class="notif-btns">'+
          (opts.cancelText?'<button class="notif-btn cancel">'+opts.cancelText+'</button>':'')+
          '<button class="notif-btn ok">'+(opts.okText||'OK')+'</button>'+
        '</div></div>';
      bg.querySelector('h3').textContent=opts.title||'Notice';
      bg.querySelector('p').textContent=opts.message||'';
      document.body.appendChild(bg);
      const done=v=>{bg.classList.add('out');setTimeout(()=>{bg.remove();resolve(v);},220);};
      bg.querySelector('.ok').onclick=()=>done(true);
      const c=bg.querySelector('.cancel');if(c)c.onclick=()=>done(false);
    });
  };
})();
