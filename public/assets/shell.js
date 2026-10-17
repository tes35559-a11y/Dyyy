(function(){
  'use strict';
  if(window.__adiShellVersion>=5)return;
  window.__adiShellVersion=5;
  var I={
    home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
    drama:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    up:'<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    img:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    comic:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4z"/><path d="M8 20h11M8 8h7M8 12h7"/>'
  };
  var M=[['Beranda','/','home'],['DyyMovie','/home','film'],['DyyMovie2','/movie2/','film'],['DyyComic','/dyycomic/','comic'],['Dev Info','/movie/info-dev','user'],['DyyHua','/donghua/','play'],['DyyRacin','/dracin/','drama'],['DyyStalker','/stalker/','user'],['DyyDownloader','/downloader/','down'],['DyyUploader','/uploader/','up'],['DyyUpscale','/upscale/','img']];
  function icon(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(I[k]||I.home)+'</svg>';}
  function normalizedPath(){var p=location.pathname||'/';p=p.replace(/\/+/g,'/');if(p.length>1)p=p.replace(/\/$/,'');return p.replace(/\.html$/,'')||'/';}
  function currentIndex(){var p=normalizedPath();if(p==='/'||p==='/index')return 0;if(/^\/(home|anime|search|favorites|history|profile|play|movie-app)(\/|$)/.test(p))return 1;for(var i=1;i<M.length;i++){if(i===8)continue;var target=M[i][1].replace(/\.html$/,'').replace(/\/$/,'')||'/';if(p===target||p.indexOf(target+'/')===0)return i;}return -1;}
  function ensureFonts(){
    if(document.querySelector('link[data-adi-fonts]'))return;
    var h=document.head;
    [['https://fonts.googleapis.com',''],['https://fonts.gstatic.com','anonymous']].forEach(function(o){var p=document.createElement('link');p.rel='preconnect';p.href=o[0];if(o[1])p.crossOrigin=o[1];h.appendChild(p);});
    var f=document.createElement('link');f.rel='stylesheet';f.setAttribute('data-adi-fonts','1');
    f.href='https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Patrick+Hand&family=JetBrains+Mono:wght@500;600;700&display=swap';
    f.media='print';f.onload=function(){f.media='all';};h.appendChild(f);
  }
  function ensureDrawerStyles(){
    var href='/assets/drawer.css?v=20261016-notif1';
    var link=document.querySelector('link[data-adi-drawer-style]')||document.querySelector('link[href*="/assets/drawer.css"]');
    if(!link){link=document.createElement('link');link.rel='stylesheet';document.head.appendChild(link);}
    if(!link.href||new URL(link.href,location.href).pathname!='/assets/drawer.css'||new URL(link.href,location.href).search!=='?v=20261016-notif1')link.href=href;
    link.setAttribute('data-adi-drawer-style','1');
  }
  var DSEL='.card,.panel,.tool-card,.feature-card,.hero-banner,.wallet-hero,.auth-card,.info,.stage,.drop';
  function mark(el){if(!el.dataset.adiDecor){el.dataset.adiDecor='1';el.classList.add(el.classList.contains('card')||el.classList.contains('tool-card')?'nb-tape':'nb-pin');}}
  function decorate(root){root=root||document;if(root.nodeType!==1&&root.nodeType!==9)return;if(root.nodeType===1&&root.matches&&root.matches(DSEL))mark(root);if(root.querySelectorAll)root.querySelectorAll(DSEL).forEach(mark);}
  /* ===== Notifikasi dari dev (bot Telegram) ===== */
  function buildNotif(){
    if(document.querySelector('.nt-btn'))return;
    var API='/api/notif',SEEN_KEY='dyy_notif_seen',POLL=60000;
    var items=[],seen=0,viewSeen=0,loading=false,loaded=false,failMsg='',timer=null,previousFocus=null;
    function store(get,key,val){try{if(get)return window.localStorage.getItem(key);window.localStorage.setItem(key,String(val));}catch(e){}return null;}
    seen=parseInt(store(true,SEEN_KEY),10)||0;
    var bell='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>';
    var btn=document.createElement('button');btn.type='button';btn.className='nt-btn';btn.setAttribute('aria-label','Buka notifikasi');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','dyy-notif');btn.innerHTML=bell;
    var badge=document.createElement('span');badge.className='nt-badge';badge.setAttribute('aria-hidden','true');btn.appendChild(badge);
    var ov=document.createElement('div');ov.className='nt-ov';ov.setAttribute('aria-hidden','true');
    var pn=document.createElement('section');pn.className='nt-pn';pn.id='dyy-notif';pn.setAttribute('role','dialog');pn.setAttribute('aria-label','Notifikasi dari dev');pn.setAttribute('aria-hidden','true');
    pn.innerHTML='<div class="nt-head"><div><h2 class="nt-title">Notifikasi</h2><span class="nt-sub">PESAN DARI DEV</span></div><div class="nt-acts"><button type="button" class="nt-refresh" aria-label="Muat ulang notifikasi"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg></button><button type="button" class="nt-x" aria-label="Tutup notifikasi"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div><div class="nt-body" aria-live="polite"></div>';
    document.body.appendChild(btn);document.body.appendChild(ov);document.body.appendChild(pn);
    var body=pn.querySelector('.nt-body'),closeBtn=pn.querySelector('.nt-x'),refreshBtn=pn.querySelector('.nt-refresh');
    function isOpen(){return pn.classList.contains('open');}
    function maxId(){var m=0;items.forEach(function(it){if(it.id>m)m=it.id;});return m;}
    function unread(){var c=0;items.forEach(function(it){if(it.id>seen)c++;});return c;}
    function paintBadge(){
      var c=unread();
      badge.textContent=c>99?'99+':String(c);badge.classList.toggle('on',c>0);
      btn.setAttribute('aria-label',c>0?'Buka notifikasi, '+c+' belum dibaca':'Buka notifikasi');
    }
    function fmt(ts){
      try{return new Date(ts).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return '';}
    }
    function linkify(el,text){
      var re=/https?:\/\/[^\s<>"']+/g,last=0,m;
      while((m=re.exec(text))){
        var url=m[0],trail='';
        var t=url.match(/[.,;:!?)\]]+$/);if(t){trail=t[0];url=url.slice(0,url.length-trail.length);}
        if(m.index>last)el.appendChild(document.createTextNode(text.slice(last,m.index)));
        var a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=url;el.appendChild(a);
        if(trail)el.appendChild(document.createTextNode(trail));
        last=m.index+m[0].length;
      }
      if(last<text.length)el.appendChild(document.createTextNode(text.slice(last)));
    }
    function state(title,msg){
      body.textContent='';
      var p=document.createElement('p');p.className='nt-state';
      var s=document.createElement('strong');s.textContent=title;p.appendChild(s);p.appendChild(document.createTextNode(msg));
      body.appendChild(p);
    }
    function render(freshSeen){
      if(!loaded&&loading){state('Memuat','Mengambil pesan dari dev.');return;}
      if(!items.length){
        if(failMsg)state('Gagal memuat',failMsg);else state('Belum ada notifikasi','Pesan dari dev akan muncul di sini.');
        return;
      }
      body.textContent='';
      var ul=document.createElement('ul');ul.className='nt-list';
      items.forEach(function(it){
        var li=document.createElement('li');li.className='nt-item'+(it.id>freshSeen?' new':'');
        var from=document.createElement('span');from.className='nt-from';from.textContent='DEV  |  '+fmt(it.date);
        var p=document.createElement('p');p.className='nt-text';linkify(p,it.text);
        li.appendChild(from);li.appendChild(p);ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    function load(){
      if(loading)return Promise.resolve();
      loading=true;refreshBtn.classList.add('spin');
      var ctl=typeof AbortController==='function'?new AbortController():null;
      var to=setTimeout(function(){if(ctl)ctl.abort();},12000);
      return fetch(API,{cache:'no-store',signal:ctl?ctl.signal:undefined}).then(function(r){
        if(!r.ok)throw new Error('http');return r.json();
      }).then(function(d){
        if(!d||d.ok!==true||!Array.isArray(d.items)){failMsg=(d&&d.message)||'Notifikasi belum dapat dimuat.';if(!loaded)items=[];return;}
        failMsg='';loaded=true;
        items=d.items.filter(function(it){return it&&typeof it.text==='string'&&typeof it.id==='number';});
      }).catch(function(){
        failMsg='Periksa koneksi internet lalu coba lagi.';
      }).then(function(){
        clearTimeout(to);loading=false;refreshBtn.classList.remove('spin');
        paintBadge();
        if(isOpen()){render(viewSeen);markRead();}
      });
    }
    function markRead(){var m=maxId();if(m>seen){seen=m;store(false,SEEN_KEY,m);}paintBadge();}
    function setOpen(open){
      if(open===isOpen())return;
      pn.classList.toggle('open',open);ov.classList.toggle('open',open);
      btn.setAttribute('aria-expanded',open?'true':'false');pn.setAttribute('aria-hidden',open?'false':'true');ov.setAttribute('aria-hidden',open?'false':'true');
      if(open){
        previousFocus=document.activeElement;
        viewSeen=seen;render(viewSeen);
        closeBtn.focus({preventScroll:true});
        load().then(function(){});
        markRead();
      }else{
        render(seen);
        if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus({preventScroll:true});else btn.focus({preventScroll:true});
      }
    }
    btn.addEventListener('click',function(){setOpen(!isOpen());});
    ov.addEventListener('click',function(){setOpen(false);});
    closeBtn.addEventListener('click',function(){setOpen(false);});
    refreshBtn.addEventListener('click',function(){load();});
    var menuBtn=document.querySelector('.hb-btn');
    if(menuBtn)menuBtn.addEventListener('click',function(){setOpen(false);},true);
    document.addEventListener('keydown',function(e){
      if(!isOpen())return;
      if(e.key==='Escape'){e.preventDefault();setOpen(false);return;}
      if(e.key==='Tab'){
        var f=[refreshBtn,closeBtn].concat([].slice.call(pn.querySelectorAll('.nt-text a')));
        var first=f[0],last=f[f.length-1];
        if(!pn.contains(document.activeElement)){e.preventDefault();first.focus();}
        else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    var lastY=window.pageYOffset||0,tick=false;
    window.addEventListener('scroll',function(){
      if(tick)return;tick=true;
      window.requestAnimationFrame(function(){
        var y=window.pageYOffset||0;
        if(!isOpen()&&!document.body.classList.contains('hb-lock')){if(y>lastY+6&&y>120)btn.classList.add('nt-hide');else if(y<lastY-6||y<=120)btn.classList.remove('nt-hide');}
        lastY=y;tick=false;
      });
    },{passive:true});
    function start(){clearInterval(timer);timer=setInterval(function(){if(!document.hidden&&!isOpen())load();},POLL);}
    document.addEventListener('visibilitychange',function(){if(!document.hidden){load();start();}else clearInterval(timer);});
    paintBadge();
    load();start();
  }
  function build(){
    if(!document.body||document.body.dataset.adiShellBuilt)return;
    ensureFonts();ensureDrawerStyles();document.body.dataset.adiShellBuilt='1';
    var path=location.pathname;
    var moviePage=path==='/'||/^\/(index|home|anime|anime-watch|movie-app|play)(\.html)?$/.test(path)||/^\/(search|favorites|history|profile|play|movie)(\/|$)/.test(path);
    if(moviePage&&!document.querySelector('link[data-dyy-movie-theme]')){var mt=document.createElement('link');mt.rel='stylesheet';mt.href='/css/dyymovie1-theme.css?v=20261016-notif1';mt.setAttribute('data-dyy-movie-theme','1');document.head.appendChild(mt);}
    var button=document.createElement('button');button.className='hb-btn';button.type='button';button.setAttribute('aria-label','Buka menu navigasi');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','dyy-navigation');
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var overlay=document.createElement('div');overlay.className='hb-ov';overlay.setAttribute('aria-hidden','true');
    var drawer=document.createElement('aside');drawer.className='hb-dr';drawer.id='dyy-navigation';drawer.setAttribute('aria-label','Menu navigasi');drawer.setAttribute('aria-hidden','true');
    var active=currentIndex();
    var html='<div class="hb-head"><div class="hb-brand"><img src="https://www.gobox.my.id/file/cs6Rm6XfZgxT.jpg" alt="Logo DyyMovie" referrerpolicy="no-referrer"><div class="hb-brand-text"><strong>Dyy Kenedy\'s Official</strong><small>Entertainment Hub</small></div></div><button type="button" class="hb-x" aria-label="Tutup menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><ul class="hb-list" aria-label="Pilihan halaman">';
    M.forEach(function(item,index){var disabled=item[0]==='DyyDownloader';html+='<li><a class="hb-link'+(index===active?' on':'')+(disabled?' hb-disabled':'')+'" '+(disabled?'href="#dyy-down-disabled" role="link" aria-disabled="true" tabindex="-1" title="DyyDownloader dinonaktifkan"':'href="'+item[1]+'"'+(index===active?' aria-current="page"':'')+' tabindex="-1"')+'>'+icon(item[2])+'<span class="hb-link-label">'+item[0]+'</span>'+(disabled?'<small class="hb-down-badge">DOWN</small>':'')+'</a></li>';});
    drawer.innerHTML=html+'</ul>';
    var title=document.createElement('div');title.className='hb-menu-title';title.textContent='MENU UTAMA';drawer.insertBefore(title,drawer.querySelector('.hb-list'));
    var footer=document.createElement('div');footer.className='hb-menu-footer';footer.innerHTML='<span class="hb-footer-mark" aria-hidden="true">D</span><span><strong>Dyy Kenedy\'s Official</strong><small>Entertainment Hub</small></span>';drawer.appendChild(footer);
    var logo=drawer.querySelector('.hb-brand img');logo.addEventListener('error',function(){if(logo.dataset.fallback)return;logo.dataset.fallback='1';logo.src='/assets/icon-192.png';});
    document.body.classList.add('hb-'+(location.pathname.split('/')[1]||'home').replace(/\.html$/,''));
    document.body.appendChild(button);document.body.appendChild(overlay);document.body.appendChild(drawer);
    var closeButton=drawer.querySelector('.hb-x');var links=Array.prototype.slice.call(drawer.querySelectorAll('.hb-link:not(.hb-disabled)'));var previousFocus=null;
    function setOpen(open){
      drawer.classList.toggle('open',open);overlay.classList.toggle('open',open);document.body.classList.toggle('hb-lock',open);
      button.setAttribute('aria-expanded',open?'true':'false');drawer.setAttribute('aria-hidden',open?'false':'true');overlay.setAttribute('aria-hidden',open?'false':'true');
      links.forEach(function(a){a.tabIndex=open?0:-1;});
      if(open){previousFocus=document.activeElement;closeButton.focus({preventScroll:true});}else if(previousFocus&&typeof previousFocus.focus==='function'){previousFocus.focus({preventScroll:true});}else{button.focus({preventScroll:true});}
    }
    button.addEventListener('click',function(){setOpen(true);});overlay.addEventListener('click',function(){setOpen(false);});closeButton.addEventListener('click',function(){setOpen(false);});
    drawer.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.classList.contains('hb-disabled')){e.preventDefault();e.stopPropagation();return;}setOpen(false);});
    document.addEventListener('keydown',function(e){if(!drawer.classList.contains('open'))return;if(e.key==='Escape'){e.preventDefault();setOpen(false);return;}if(e.key==='Tab'){var focusable=[closeButton].concat(links);var first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    var lastY=window.pageYOffset||0;var ticking=false;
    window.addEventListener('scroll',function(){if(ticking)return;ticking=true;window.requestAnimationFrame(function(){var y=window.pageYOffset||0;if(!drawer.classList.contains('open')){if(y>lastY+6&&y>120)button.classList.add('hb-hide');else if(y<lastY-6||y<=120)button.classList.remove('hb-hide');}lastY=y;ticking=false;});},{passive:true});
    decorate();var pending=[];var queued=false;var observer=new MutationObserver(function(records){records.forEach(function(r){for(var i=0;i<r.addedNodes.length;i++){var n=r.addedNodes[i];if(n.nodeType===1&&!n.closest('.hb-dr,.hb-ov,.hb-btn'))pending.push(n);}});if(queued||!pending.length)return;queued=true;window.requestAnimationFrame(function(){queued=false;var list=pending;pending=[];list.forEach(function(n){if(n.isConnected)decorate(n);});});});observer.observe(document.body,{childList:true,subtree:true});
    try{buildNotif();}catch(err){if(window.console)console.error(err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
