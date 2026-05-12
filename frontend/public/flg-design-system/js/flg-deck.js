/* ═══════════════════════════════════════════════════════════════
   FLG DESIGN SYSTEM — DECK ENGINE v1.0
   Para apresentações HTML 16:9 (pitch decks, briefings, propostas)
   - Canvas backdrop (partículas + ondas douradas)
   - Slide engine (teclado / swipe / clique)
   - Stagger reveal automático ao trocar slide
   ═══════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  /* ---------- STAGE CANVAS (backdrop animado) ---------- */
  const canvas = document.getElementById('stage-canvas');
  if(canvas){
    const ctx = canvas.getContext('2d');
    let W=0, H=0, dpr=Math.min(window.devicePixelRatio||1, 2);

    function resize(){
      W = canvas.width = innerWidth * dpr;
      H = canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth+'px';
      canvas.style.height = innerHeight+'px';
    }
    resize();
    addEventListener('resize', resize);

    // Partículas douradas
    const N = 60;
    const particles = Array.from({length:N}, () => ({
      x: Math.random()*W,
      y: Math.random()*H,
      vx: (Math.random()-0.5)*0.15*dpr,
      vy: (Math.random()-0.5)*0.15*dpr,
      r: (Math.random()*1.4+0.3)*dpr,
      a: Math.random()*0.4+0.1,
    }));

    let t = 0;
    function frame(){
      t += 0.006;
      ctx.clearRect(0,0,W,H);

      // Ondas sonoras douradas no horizonte
      ctx.globalCompositeOperation = 'lighter';
      for(let k=0;k<3;k++){
        ctx.beginPath();
        const amp = 18*dpr + k*6*dpr;
        const y0 = H*0.78 + k*10*dpr;
        for(let x=0;x<=W;x+=6*dpr){
          const y = y0 + Math.sin(x*0.004 + t*1.2 + k*1.3) * amp * (0.5+Math.sin(t*0.6+k)*0.5);
          if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.strokeStyle = `rgba(233,196,106,${0.04 - k*0.008})`;
        ctx.lineWidth = 1*dpr;
        ctx.stroke();
      }

      // Partículas dourado-suave (sem RGB rainbow)
      for(const p of particles){
        p.x += p.vx; p.y += p.vy;
        if(p.x<0) p.x=W; if(p.x>W) p.x=0;
        if(p.y<0) p.y=H; if(p.y>H) p.y=0;
        const twinkle = 0.6 + Math.sin(t*2 + p.x*0.01)*0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(233,196,106,${p.a*twinkle*0.6})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      requestAnimationFrame(frame);
    }
    frame();
  }

  /* ---------- DECK ENGINE ---------- */
  const deck = document.querySelector('.deck');
  if(!deck) return; // não é um deck, sair

  const slides = [...document.querySelectorAll('.slide')];
  const total = slides.length;
  const progressFill = document.querySelector('.progress-fill');
  const counter = document.querySelector('.counter-num');

  // Storage key opcional (define data-deck-id no <body> para persistir posição)
  const STORAGE = 'flg-deck-' + (document.body.dataset.deckId || 'default');
  let cur = 0;
  try{
    const saved = parseInt(localStorage.getItem(STORAGE)||'0',10);
    if(!isNaN(saved) && saved>=0 && saved<total) cur = saved;
  }catch(e){}

  function go(i){
    i = Math.max(0, Math.min(total-1, i));
    slides[cur].classList.remove('active');
    cur = i;
    slides[cur].classList.add('active');
    if(progressFill) progressFill.style.width = ((cur+1)/total*100)+'%';
    if(counter) counter.textContent = String(cur+1).padStart(2,'0') + ' / ' + String(total).padStart(2,'0');
    try{ localStorage.setItem(STORAGE, String(cur)); }catch(e){}
    try{ window.parent.postMessage({slideIndexChanged: cur}, '*'); }catch(e){}
    slides[cur].scrollTop = 0;
  }

  // Init
  slides[cur].classList.add('active');
  if(progressFill) progressFill.style.width = ((cur+1)/total*100)+'%';
  if(counter) counter.textContent = String(cur+1).padStart(2,'0') + ' / ' + String(total).padStart(2,'0');

  // Teclado
  addEventListener('keydown', (e)=>{
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ e.preventDefault(); go(cur+1); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); go(cur-1); }
    else if(e.key==='Home'){ e.preventDefault(); go(0); }
    else if(e.key==='End'){ e.preventDefault(); go(total-1); }
  });

  // Setas de navegação
  const prevBtn = document.querySelector('.nav-prev');
  const nextBtn = document.querySelector('.nav-next');
  if(prevBtn) prevBtn.addEventListener('click', ()=>go(cur-1));
  if(nextBtn) nextBtn.addEventListener('click', ()=>go(cur+1));

  // Clique no slide avança / volta (ignora elementos interativos)
  deck.addEventListener('click', (e)=>{
    if(e.target.closest('a,button,input,textarea,select,.no-click')) return;
    const rect = deck.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if(x > rect.width*0.5) go(cur+1);
    else go(cur-1);
  });

  // Swipe (touch)
  let sx=0, sy=0;
  deck.addEventListener('touchstart', (e)=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; }, {passive:true});
  deck.addEventListener('touchend', (e)=>{
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)){
      if(dx<0) go(cur+1); else go(cur-1);
    }
  }, {passive:true});

  // Expor para uso externo (speaker notes, etc)
  window.flgGoToSlide = go;
})();
