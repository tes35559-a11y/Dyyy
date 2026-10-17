/* DyyMovie1 — dukungan foto & tampilan PC (mouse): fallback gambar, panah geser, drag mouse */
(function(){
  'use strict';
  /* ---- Fallback gambar poster: coba ukuran lebih kecil, lalu sembunyikan ---- */
  window.dyyImgFail=function(img){
    try{
      if(!img||img.dataset.dyyTry==='2'){if(img)img.style.display='none';return;}
      var src=img.getAttribute('src')||'';
      if(!img.dataset.dyyTry){
        img.dataset.dyyTry='1';img.referrerPolicy='no-referrer';
        if(/image\.tmdb\.org\/t\/p\/w500/.test(src)){img.src=src.replace('/t/p/w500','/t/p/w342');return;}
        img.src=src;return;
      }
      img.dataset.dyyTry='2';
      if(/image\.tmdb\.org\/t\/p\/w342/.test(src)){img.src=src.replace('/t/p/w342','/t/p/original');return;}
      img.style.display='none';
    }catch(e){if(img)img.style.display='none';}
  };
  /* Gambar lain (backdrop, modal, player, anime): coba ulang sekali tanpa referrer */
  document.addEventListener('error',function(e){
    var t=e.target;
    if(!t||t.tagName!=='IMG'||t.dataset.dyyTry||t.getAttribute('onerror'))return;
    t.dataset.dyyTry='1';t.referrerPolicy='no-referrer';
    var s=t.getAttribute('src');if(s)t.src=s;
  },true);

  /* ---- Panah geser + drag mouse untuk baris poster (.row-scroll) di PC ---- */
  var fine=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)');
  function enhance(row){
    if(row.dataset.dyyPc)return;row.dataset.dyyPc='1';
    var host=row.parentElement;if(!host)return;host.classList.add('dyy-row-host');
    function mk(dir){
      var b=document.createElement('button');b.type='button';
      b.className='dyy-row-arrow dyy-row-'+(dir<0?'prev':'next');
      b.setAttribute('aria-label',dir<0?'Geser ke kiri':'Geser ke kanan');
      b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(dir<0?'M15 5l-7 7 7 7':'M9 5l7 7-7 7')+'"/></svg>';
      b.addEventListener('click',function(ev){ev.stopPropagation();row.scrollBy({left:dir*Math.max(240,row.clientWidth*.8),behavior:'smooth'});});
      host.appendChild(b);return b;
    }
    var prev=mk(-1),next=mk(1);
    function upd(){
      var max=row.scrollWidth-row.clientWidth;
      prev.classList.toggle('off',row.scrollLeft<=4);
      next.classList.toggle('off',row.scrollLeft>=max-4||max<=4);
    }
    row.addEventListener('scroll',upd,{passive:true});window.addEventListener('resize',upd);
    row.addEventListener('load',upd,true);setTimeout(upd,60);setTimeout(upd,600);
    /* drag dengan mouse */
    var down=false,sx=0,sl=0,moved=false;
    row.addEventListener('mousedown',function(e){if(e.button!==0||!fine||!fine.matches)return;down=true;moved=false;sx=e.pageX;sl=row.scrollLeft;});
    window.addEventListener('mousemove',function(e){
      if(!down)return;var dx=e.pageX-sx;
      if(!moved&&Math.abs(dx)>6){moved=true;row.classList.add('dyy-dragging');}
      if(moved){row.scrollLeft=sl-dx;e.preventDefault();}
    });
    window.addEventListener('mouseup',function(){
      if(!down)return;down=false;
      if(moved){setTimeout(function(){row.classList.remove('dyy-dragging');},0);}
    });
    row.addEventListener('click',function(e){if(moved){e.stopPropagation();e.preventDefault();moved=false;}},true);
    row.addEventListener('dragstart',function(e){e.preventDefault();});
  }
  function scan(root){(root||document).querySelectorAll&&(root||document).querySelectorAll('.row-scroll').forEach(enhance);}
  function init(){
    scan();
    var q=false;
    new MutationObserver(function(){if(q)return;q=true;requestAnimationFrame(function(){q=false;scan();});}).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
