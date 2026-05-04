"""
Prompt de geração de slides HTML para os encontros FLG.
Design system completo — paleta gold/black da FLG Brazil.
"""


SLIDES_SYSTEM_PROMPT = """\
Você é um especialista em comunicação estratégica da FLG Brazil (FLG).
Sua função é gerar apresentações HTML completas e personalizadas para encontros
com founders, seguindo rigorosamente o design system FLG.

REGRAS ABSOLUTAS:
1. Retorne APENAS o HTML completo — sem markdown, sem explicações, sem código fora do HTML
2. Gere entre 20 e {num_slides} slides
3. Cada slide tem conteúdo ESPECÍFICO do cliente — nada genérico
4. O conteúdo deve integrar: linha intelectual do encontro + perfil do cliente + contexto da conversa
5. Preserve EXATAMENTE o CSS e a estrutura JavaScript fornecidos
6. Substitua apenas o conteúdo textual e os dados do cliente

SOBRE OS SLIDES:
- Slide 1: Capa — nome do founder, empresa, nome e número do encontro
- Slides 2-N: Conteúdo do encontro (misture: seção, conteúdo, dados, citação, pessoa, ação)
- Slide final: Encerramento com mensagem personalizada para o founder
"""


def build_slides_prompt(
    cliente: dict,
    encontro: dict,
    conversation_context: str,
    image_b64: str = "",
) -> str:
    """
    Constrói o prompt completo para geração dos slides,
    incluindo o contexto da conversa com o consultor.
    """
    num_slides = encontro.get("numero_slides_medio", 22)
    nome = cliente.get("nome", "")
    empresa = cliente.get("empresa", "")
    num_enc = encontro.get("numero", "")
    nome_enc = encontro.get("nome", "")

    # Tag da imagem de fundo (base64 ou vazio)
    img_tag = ""
    if image_b64:
        img_tag = f'<img class="slide-bg" src="data:image/jpeg;base64,{image_b64}" alt="">'

    return f"""\
Gere uma apresentação HTML completa para o seguinte encontro da FLG Brazil.

━━━ DADOS DO ENCONTRO ━━━
Encontro: {num_enc} — {nome_enc}
Cliente: {nome} | {empresa}
Objetivo: {encontro.get("objetivo_estrategico", "")}
Número de slides: {num_slides}

━━━ LINHA INTELECTUAL DO ENCONTRO ━━━
{encontro.get("intelecto_base", "")}

━━━ PERFIL DO CLIENTE ━━━
Tom de voz: {cliente.get("tom_de_voz", "")}
Pontos fortes: {cliente.get("pontos_fortes", "")}
Travas: {cliente.get("travas_conhecidas", "")}
Situação atual: {cliente.get("situacao_atual", "")}
Objetivo 6 meses: {cliente.get("objetivo_em_6_meses", "")}

━━━ CONTEXTO DA CONVERSA COM O CONSULTOR ━━━
{conversation_context or "Nenhum contexto adicional fornecido."}

━━━ TEMPLATE HTML OBRIGATÓRIO ━━━
Use EXATAMENTE o template abaixo como base. Preencha com conteúdo real e personalizado.
A variável IMAGE_TAG deve ser substituída por: {img_tag or "<!-- sem imagem de fundo -->"}

{_get_html_template(nome, empresa, num_enc, nome_enc, num_slides)}
"""


def _get_html_template(nome: str, empresa: str, num_enc: int, nome_enc: str, num_slides: int) -> str:
    """Retorna o template HTML base com design system FLG."""
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{empresa} × FLG — Encontro {num_enc}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
  :root{{
    --gold-light:#F5D68A;--gold-mid:#C9A84C;--gold-dark:#8B6914;
    --gold-grad:linear-gradient(135deg,#F5D68A 0%,#C9A84C 50%,#8B6914 100%);
    --black:#080808;--white:#FAFAF8;--grey:#888;
  }}
  html,body{{width:100%;height:100%;background:#000;font-family:'Poppins',sans-serif;color:var(--white);overflow:hidden}}
  #presentation{{width:100vw;height:100vh;position:relative;overflow:hidden}}
  .slide{{position:absolute;inset:0;width:100%;height:100%;background:var(--black);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:4vw 6vw;opacity:0;transform:translateX(60px);transition:opacity .55s ease,transform .55s ease;pointer-events:none;overflow:hidden}}
  .slide.active{{opacity:1;transform:translateX(0);pointer-events:all}}
  .slide.exit{{opacity:0;transform:translateX(-60px);pointer-events:none}}
  .slide::before{{content:'';position:absolute;inset:18px;border:1px solid rgba(201,168,76,.25);border-radius:2px;pointer-events:none;z-index:3}}
  .corner{{position:absolute;width:40px;height:40px;border-color:var(--gold-mid);border-style:solid;opacity:.6;z-index:4}}
  .corner.tl{{top:24px;left:24px;border-width:1px 0 0 1px}}.corner.tr{{top:24px;right:24px;border-width:1px 1px 0 0}}
  .corner.bl{{bottom:24px;left:24px;border-width:0 0 1px 1px}}.corner.br{{bottom:24px;right:24px;border-width:0 1px 1px 0}}
  .logo-flg{{position:absolute;top:32px;right:48px;width:72px;height:auto;opacity:.75;z-index:4}}
  .slide-num{{position:absolute;bottom:36px;right:52px;font-size:10px;letter-spacing:3px;color:var(--gold-mid);opacity:.5;z-index:4}}
  .slide-bg{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.13;z-index:0}}
  .col{{display:flex;flex-direction:column;align-items:center;width:100%;max-width:1100px;position:relative;z-index:1}}
  .col.left{{align-items:flex-start}}
  .grid-2{{display:grid;grid-template-columns:1fr 1fr;gap:2rem;width:100%;max-width:1100px;position:relative;z-index:1}}
  .grid-3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem;width:100%;max-width:1100px;position:relative;z-index:1}}
  .tag{{font-size:10px;letter-spacing:5px;text-transform:uppercase;background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:1rem;font-weight:600}}
  h1{{font-family:'Playfair Display',serif;font-size:clamp(2.4rem,5.5vw,5rem);font-weight:700;line-height:1.1;background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;margin-bottom:1.2rem}}
  h2{{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,3.8vw,3.2rem);font-weight:700;line-height:1.2;background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:1rem}}
  h3{{font-family:'Playfair Display',serif;font-size:clamp(1.1rem,2.2vw,1.7rem);font-weight:600;color:var(--gold-light);margin-bottom:.6rem}}
  p{{font-size:clamp(.82rem,1.3vw,1rem);line-height:1.75;color:rgba(250,250,248,.75)}}
  .lead{{font-size:clamp(.95rem,1.5vw,1.15rem);line-height:1.8;color:rgba(250,250,248,.9);max-width:800px;text-align:center}}
  .quote{{font-family:'Playfair Display',serif;font-size:clamp(1.1rem,2vw,1.55rem);font-style:italic;line-height:1.65;background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;max-width:820px;margin:1rem auto}}
  .quote-attr{{font-size:.8rem;letter-spacing:3px;text-transform:uppercase;color:rgba(250,250,248,.4);text-align:center;margin-top:1rem}}
  .divider{{width:80px;height:1px;background:var(--gold-grad);margin:1.2rem auto;border:none}}
  .cover-line{{width:120px;height:1px;background:var(--gold-grad);margin:1.8rem auto}}
  .cover-sub{{font-size:clamp(.8rem,1.2vw,.95rem);letter-spacing:4px;text-transform:uppercase;color:rgba(250,250,248,.45);margin-top:.6rem}}
  .card{{background:rgba(255,255,255,.03);border:1px solid rgba(201,168,76,.18);border-radius:4px;padding:1.5rem 1.8rem;position:relative;overflow:hidden}}
  .card::before{{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--gold-grad)}}
  .card h3{{font-size:clamp(.9rem,1.4vw,1.1rem);margin-bottom:.5rem}}
  .card p{{font-size:clamp(.75rem,1.1vw,.88rem);text-align:left;line-height:1.65}}
  .list-items{{list-style:none;width:100%;max-width:860px}}
  .list-items li{{display:flex;align-items:flex-start;gap:.8rem;padding:.65rem 0;border-bottom:1px solid rgba(201,168,76,.1);font-size:clamp(.8rem,1.25vw,.95rem);color:rgba(250,250,248,.82);line-height:1.6}}
  .list-items li:last-child{{border-bottom:none}}
  .list-items li::before{{content:'◆';color:var(--gold-mid);font-size:.55rem;margin-top:.38rem;flex-shrink:0}}
  .stat-row{{display:flex;gap:2rem;justify-content:center;width:100%;position:relative;z-index:1}}
  .stat-box{{text-align:center;padding:1.2rem 1rem}}
  .stat-num{{font-family:'Playfair Display',serif;font-size:clamp(2rem,4vw,3.5rem);font-weight:700;background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:.3rem}}
  .stat-label{{font-size:clamp(.7rem,1vw,.82rem);letter-spacing:2px;text-transform:uppercase;color:rgba(250,250,248,.55)}}
  .gold{{color:var(--gold-light)}}
  .gold-grad{{background:var(--gold-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
  .slide-cover{{background:radial-gradient(ellipse at 60% 40%,#1f1400 0%,#0a0a00 40%,var(--black) 100%)}}
  .slide-dark{{background:linear-gradient(160deg,#0d0d0d 0%,#080808 100%)}}
  .slide-section{{background:radial-gradient(ellipse at center,#1a1200 0%,var(--black) 70%);align-items:flex-start;justify-content:center}}
  .section-num{{font-size:clamp(5rem,12vw,10rem);font-family:'Playfair Display',serif;font-weight:900;color:rgba(201,168,76,.06);line-height:1;position:absolute;right:8vw;bottom:8vh}}
  #nav{{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:1.2rem;z-index:100;background:rgba(8,8,8,.85);border:1px solid rgba(201,168,76,.2);border-radius:40px;padding:.55rem 1.4rem;backdrop-filter:blur(8px)}}
  #nav button{{background:none;border:none;color:var(--gold-mid);font-size:1.1rem;cursor:pointer;padding:.3rem .6rem;border-radius:50%;transition:background .2s;font-family:'Poppins',sans-serif}}
  #nav button:hover{{background:rgba(201,168,76,.12)}}
  #nav button:disabled{{opacity:.25;cursor:default}}
  #nav-counter{{font-size:.72rem;letter-spacing:2px;color:var(--gold-mid);min-width:54px;text-align:center}}
  #hint{{position:fixed;bottom:28px;left:28px;font-size:.65rem;letter-spacing:2px;color:rgba(201,168,76,.3)}}
  @media print{{
    *{{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
    html,body{{overflow:visible!important;background:#080808!important;height:auto!important}}
    #nav,#hint{{display:none!important}}
    #presentation{{position:relative!important;height:auto!important;overflow:visible!important}}
    .slide{{position:relative!important;inset:auto!important;width:100%!important;height:100vh!important;page-break-after:always!important;break-after:page!important;opacity:1!important;transform:none!important;display:flex!important;background:#080808!important}}
    .slide-cover{{background:radial-gradient(ellipse at 60% 40%,#1f1400 0%,#0a0a00 40%,#080808 100%)!important}}
    .slide-section{{background:radial-gradient(ellipse at center,#1a1200 0%,#080808 70%)!important}}
    .card{{background:rgba(255,255,255,.03)!important}}
  }}
</style>
</head>
<body>
<div id="presentation">
<!-- GERE ENTRE 20 E {num_slides} SLIDES AQUI. Cada slide usa a estrutura:
  <div class="slide [classe-variante]" id="sN">
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    IMAGE_TAG
    <img class="logo-flg" src="/api/assets/logo-flg.svg" alt="FLG">
    <div class="slide-num">N / {num_slides}</div>
    ... CONTEÚDO PERSONALIZADO ...
  </div>
Substitua IMAGE_TAG pelo valor fornecido no prompt.
Slide 1: capa com logo grande centralizada + título + subtítulo.
Slides 2-{num_slides-1}: conteúdo estratégico personalizado.
Slide {num_slides}: encerramento.
-->
</div>
<div id="nav">
  <button id="btn-prev" onclick="changeSlide(-1)">←</button>
  <span id="nav-counter">1 / {num_slides}</span>
  <button id="btn-next" onclick="changeSlide(1)">→</button>
</div>
<div id="hint">← → navegar · P imprimir</div>
<script>
const slides=document.querySelectorAll('.slide');
const counter=document.getElementById('nav-counter');
const btnP=document.getElementById('btn-prev'),btnN=document.getElementById('btn-next');
const total=slides.length;let cur=0;
function goTo(n){{slides[cur].classList.remove('active');slides[cur].classList.add('exit');setTimeout(()=>slides[cur].classList.remove('exit'),600);cur=Math.max(0,Math.min(n,total-1));slides[cur].classList.add('active');counter.textContent=`${{cur+1}} / ${{total}}`;btnP.disabled=cur===0;btnN.disabled=cur===total-1;}}
function changeSlide(d){{goTo(cur+d);}}
document.addEventListener('keydown',e=>{{if(e.key==='ArrowRight'||e.key===' '){{e.preventDefault();changeSlide(1);}}if(e.key==='ArrowLeft'){{e.preventDefault();changeSlide(-1);}}if(e.key==='p'||e.key==='P')window.print();}});
let tx=0;document.addEventListener('touchstart',e=>{{tx=e.touches[0].clientX;}},{{passive:true}});
document.addEventListener('touchend',e=>{{const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50)changeSlide(dx<0?1:-1);}},{{passive:true}});
goTo(0);
</script>
</body>
</html>"""
