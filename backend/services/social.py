"""
Serviço multi-plataforma de métricas sociais — FLG Jornada System.

Plataformas suportadas: instagram, linkedin, youtube, tiktok.
Cada plataforma tem mock realista com seed determinístico por cliente_id.

Factory: get_platform_repository(plataforma, cliente_id) → retorna o mock correto.
"""

import hashlib
import logging
import os
import random
from abc import ABC, abstractmethod
from datetime import date, timedelta

logger = logging.getLogger("flg.social")

PLATAFORMAS_VALIDAS = ("instagram", "linkedin", "youtube", "tiktok")


# ─── Contrato base ───────────────────────────────────────────────────────────

class SocialRepository(ABC):
    @abstractmethod
    def is_connected(self, cliente_id: str) -> bool: ...

    @abstractmethod
    def get_historico(self, cliente_id: str, dias: int) -> list: ...

    @abstractmethod
    def get_posts(self, cliente_id: str, limit: int) -> list: ...

    @abstractmethod
    def get_horarios(self, cliente_id: str) -> list: ...


class BaseMockRepository(SocialRepository):
    """Classe base com helpers de RNG compartilhados."""

    plataforma: str = "base"

    def _rng(self, cliente_id: str) -> random.Random:
        raw = f"{cliente_id}:{self.plataforma}"
        seed = int(hashlib.md5(raw.encode()).hexdigest()[:8], 16)
        return random.Random(seed)

    def _day_rng(self, base_rng: random.Random, i: int) -> random.Random:
        return random.Random(base_rng.randint(0, 9_999_999) + i)

    def is_connected(self, cliente_id: str) -> bool:
        return False

    def _base_horarios(self, cliente_id: str) -> list:
        """Heatmap genérico de engajamento — reutilizado por todas as plataformas."""
        rng = self._rng(cliente_id)
        dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
        faixas = ["06-09h", "09-12h", "12-15h", "15-18h", "18-21h"]
        data = []
        for fi, faixa in enumerate(faixas):
            for di, dia in enumerate(dias):
                weekend = di in (0, 6)
                base = 1.5
                if not weekend and fi == 2:
                    base += rng.uniform(2.0, 3.5)
                elif not weekend and fi == 1:
                    base += rng.uniform(0.8, 2.0)
                elif not weekend:
                    base += rng.uniform(0.3, 1.0)
                else:
                    base += rng.uniform(0.0, 0.8)
                data.append({
                    "dia": dia, "dia_idx": di,
                    "faixa": faixa, "faixa_idx": fi,
                    "engajamento": round(max(0.3, base + rng.uniform(-0.2, 0.2)), 2),
                })
        return data


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# INSTAGRAM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MockInstagramRepository(BaseMockRepository):
    plataforma = "instagram"

    def get_historico(self, cliente_id: str, dias: int = 30, **kwargs) -> list:
        rng = self._rng(cliente_id)
        seg = rng.randint(900, 9000)
        eng_base = rng.uniform(2.0, 5.5)
        alc_base = rng.randint(2000, 30000)
        dados = []
        for i in range(dias):
            dr = self._day_rng(rng, i)
            cresc = dr.randint(-4, 20)
            seg += cresc
            eng = round(max(0.5, eng_base + dr.uniform(-0.6, 0.6)), 2)
            alc = max(0, alc_base + dr.randint(-600, 900))
            alc_base += dr.randint(-50, 100)
            dados.append({
                "data": str(date.today() - timedelta(days=dias - i - 1)),
                "seguidores": seg, "delta_seguidores": cresc,
                "alcance_total": alc,
                "impressoes_total": int(alc * dr.uniform(1.4, 2.3)),
                "taxa_engajamento": eng,
                "curtidas_total": dr.randint(20, 280),
                "comentarios_total": dr.randint(2, 45),
                "salvamentos_total": dr.randint(5, 90),
                "compartilhamentos_total": dr.randint(1, 30),
                "visitas_perfil": dr.randint(35, 450),
                "cliques_link_bio": dr.randint(2, 40),
                "posts_publicados": dr.choices([0, 1, 2], weights=[5, 4, 1])[0],
                "reels_publicados": dr.choices([0, 1], weights=[6, 4])[0],
                "stories_publicados": dr.choices([0, 1, 2, 3], weights=[2, 3, 3, 2])[0],
                "fonte": "mock",
            })
        return dados

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        rng = self._rng(cliente_id)
        tipos = ["REEL", "IMAGE", "CAROUSEL", "REEL", "VIDEO", "IMAGE"]
        legendas_map = {
            "REEL": ["Bastidores do processo de vendas", "Como triplicamos resultados em 90 dias",
                      "O erro que a maioria comete no digital", "Estratégia que mudou tudo pra mim"],
            "IMAGE": ["Reflexão sobre liderança e crescimento.", "Resultados do mês: números que importam."],
            "CAROUSEL": ["5 passos para escalar seu negócio", "Os 3 pilares do crescimento digital"],
            "VIDEO": ["Conversa honesta sobre posicionamento digital.", "O que aprendi nesses 6 meses."],
        }
        posts = []
        for i in range(limit):
            tipo = tipos[i % len(tipos)]
            alc = rng.randint(600, 6000)
            cur = rng.randint(80, 500)
            com = rng.randint(5, 70)
            sal = rng.randint(10, 140)
            taxa = round((cur + com + sal) / max(alc, 1) * 100, 2)
            opts = legendas_map.get(tipo, legendas_map["IMAGE"])
            posts.append({
                "id": f"ig_{cliente_id[:8]}_{i}", "tipo": tipo,
                "publicado_em": str(date.today() - timedelta(days=rng.randint(1, 30))),
                "legenda": opts[rng.randint(0, len(opts) - 1)],
                "curtidas": cur, "comentarios": com, "salvamentos": sal,
                "compartilhamentos": rng.randint(2, 35),
                "alcance": alc, "impressoes": int(alc * rng.uniform(1.3, 2.2)),
                "plays": cur * rng.randint(3, 8) if tipo in ("REEL", "VIDEO") else 0,
                "taxa_engajamento": taxa, "fonte": "mock",
            })
        return sorted(posts, key=lambda x: x["taxa_engajamento"], reverse=True)

    def get_horarios(self, cliente_id: str) -> list:
        return self._base_horarios(cliente_id)

    def get_demografia(self, cliente_id: str, tipo: str = "follower") -> dict:
        """Mock realista de demografia (follower ou engaged_audience)."""
        rng = self._rng(cliente_id)
        total = rng.randint(800, 8000) if tipo == "follower" else rng.randint(200, 2000)

        # Engaged tende a ser ligeiramente mais feminino e mais jovem
        f_pct = rng.uniform(0.50, 0.62) if tipo == "follower" else rng.uniform(0.55, 0.68)
        m_pct = 1 - f_pct - 0.02
        u_pct = 0.02
        ages = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
        age_weights = ([0.06, 0.32, 0.34, 0.14, 0.08, 0.04, 0.02]
                       if tipo == "engaged_audience"
                       else [0.04, 0.28, 0.34, 0.16, 0.10, 0.05, 0.03])

        genero_idade = {}
        for g, gp in (("F", f_pct), ("M", m_pct), ("U", u_pct)):
            for age, aw in zip(ages, age_weights):
                v = int(total * gp * aw * rng.uniform(0.85, 1.15))
                if v > 0:
                    genero_idade[f"{g}.{age}"] = v
            genero_idade[g] = int(total * gp)

        paises_pool = [
            ("BR", 0.78), ("PT", 0.06), ("US", 0.05), ("AR", 0.03),
            ("ES", 0.02), ("AO", 0.02), ("MZ", 0.01), ("FR", 0.01),
            ("IT", 0.01), ("CA", 0.01),
        ]
        paises = sorted(
            [{"key": k, "value": int(total * w * rng.uniform(0.85, 1.15))} for k, w in paises_pool],
            key=lambda x: x["value"], reverse=True,
        )

        cidades_pool = [
            ("São Paulo, BR", 0.18), ("Rio de Janeiro, BR", 0.10),
            ("Belo Horizonte, BR", 0.06), ("Brasília, BR", 0.05),
            ("Curitiba, BR", 0.04), ("Porto Alegre, BR", 0.04),
            ("Salvador, BR", 0.03), ("Recife, BR", 0.03),
            ("Fortaleza, BR", 0.03), ("Campinas, BR", 0.02),
            ("Lisboa, PT", 0.02), ("Buenos Aires, AR", 0.02),
            ("Goiânia, BR", 0.02), ("Manaus, BR", 0.015),
            ("Florianópolis, BR", 0.015),
        ]
        cidades = sorted(
            [{"key": k, "value": int(total * w * rng.uniform(0.85, 1.15))} for k, w in cidades_pool],
            key=lambda x: x["value"], reverse=True,
        )

        locales = sorted(
            [
                {"key": "pt_BR", "value": int(total * 0.85)},
                {"key": "pt_PT", "value": int(total * 0.05)},
                {"key": "en_US", "value": int(total * 0.05)},
                {"key": "es_ES", "value": int(total * 0.03)},
                {"key": "es_LA", "value": int(total * 0.02)},
            ],
            key=lambda x: x["value"], reverse=True,
        )

        return {
            "tipo": tipo,
            "data_referencia": str(date.today()),
            "total_count": total,
            "genero_idade": genero_idade,
            "paises": paises,
            "cidades": cidades,
            "locales": locales,
            "fonte": "mock",
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LINKEDIN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MockLinkedInRepository(BaseMockRepository):
    plataforma = "linkedin"

    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        rng = self._rng(cliente_id)
        seg = rng.randint(500, 12000)
        conexoes = seg + rng.randint(200, 2000)
        ssi_base = rng.uniform(55, 85)
        eng_base = rng.uniform(2.5, 6.0)
        imp_base = rng.randint(1000, 15000)
        dados = []
        for i in range(dias):
            dr = self._day_rng(rng, i)
            cresc = dr.randint(-2, 15)
            seg += cresc
            conexoes += dr.randint(0, 8)
            ssi = round(min(100, max(30, ssi_base + dr.uniform(-1.5, 1.5))), 1)
            ssi_base += dr.uniform(-0.3, 0.4)
            eng = round(max(0.8, eng_base + dr.uniform(-0.8, 0.8)), 2)
            imp = max(0, imp_base + dr.randint(-400, 600))
            imp_base += dr.randint(-30, 60)
            dados.append({
                "data": str(date.today() - timedelta(days=dias - i - 1)),
                "seguidores": seg, "delta_seguidores": cresc,
                "conexoes": conexoes,
                "ssi_score": ssi,
                "impressoes_posts": imp,
                "visualizacoes_perfil": dr.randint(20, 350),
                "taxa_engajamento": eng,
                "reacoes_total": dr.randint(15, 200),
                "comentarios_total": dr.randint(3, 50),
                "compartilhamentos_total": dr.randint(1, 25),
                "busca_aparicoes": dr.randint(5, 120),
                "posts_publicados": dr.choices([0, 1], weights=[4, 6])[0],
                "artigos_publicados": dr.choices([0, 1], weights=[9, 1])[0],
                "fonte": "mock",
            })
        return dados

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        rng = self._rng(cliente_id)
        tipos = ["POST", "ARTICLE", "POLL", "POST", "DOCUMENT", "POST"]
        legendas_map = {
            "POST": ["Lições de liderança que aprendi construindo minha empresa",
                      "O maior erro de founders em crescimento: não delegar",
                      "3 insights da minha última mentoria com CEOs"],
            "ARTICLE": ["Como construir uma cultura de alta performance",
                         "O futuro do trabalho remoto no Brasil"],
            "POLL": ["Qual o maior desafio do seu negócio agora?",
                      "Home office ou presencial? O que funciona melhor?"],
            "DOCUMENT": ["Framework de OKRs que uso com meus clientes",
                          "Playbook de vendas B2B — resumo visual"],
        }
        posts = []
        for i in range(limit):
            tipo = tipos[i % len(tipos)]
            imp = rng.randint(400, 8000)
            reac = rng.randint(20, 300)
            com = rng.randint(5, 60)
            comp = rng.randint(2, 40)
            taxa = round((reac + com + comp) / max(imp, 1) * 100, 2)
            opts = legendas_map.get(tipo, legendas_map["POST"])
            posts.append({
                "id": f"li_{cliente_id[:8]}_{i}", "tipo": tipo,
                "publicado_em": str(date.today() - timedelta(days=rng.randint(1, 30))),
                "legenda": opts[rng.randint(0, len(opts) - 1)],
                "reacoes": reac, "comentarios": com, "compartilhamentos": comp,
                "impressoes": imp, "taxa_engajamento": taxa, "fonte": "mock",
            })
        return sorted(posts, key=lambda x: x["taxa_engajamento"], reverse=True)

    def get_horarios(self, cliente_id: str) -> list:
        return self._base_horarios(cliente_id)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# YOUTUBE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MockYouTubeRepository(BaseMockRepository):
    plataforma = "youtube"

    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        rng = self._rng(cliente_id)
        inscritos = rng.randint(500, 25000)
        views_base = rng.randint(500, 8000)
        ctr_base = rng.uniform(3.5, 8.0)
        ret_base = rng.uniform(35, 60)
        dados = []
        for i in range(dias):
            dr = self._day_rng(rng, i)
            cresc = dr.randint(-3, 30)
            inscritos += cresc
            views = max(0, views_base + dr.randint(-300, 500))
            views_base += dr.randint(-20, 40)
            wt = round(views * dr.uniform(0.03, 0.12), 1)  # watch time hrs
            dur_media = round(dr.uniform(3.5, 12.0), 1)
            ctr = round(max(1.0, ctr_base + dr.uniform(-1.0, 1.0)), 1)
            ret = round(max(20, min(80, ret_base + dr.uniform(-4, 4))), 1)
            dados.append({
                "data": str(date.today() - timedelta(days=dias - i - 1)),
                "inscritos": inscritos, "delta_inscritos": cresc,
                "visualizacoes": views,
                "watch_time_horas": wt,
                "duracao_media_min": dur_media,
                "ctr_pct": ctr,
                "taxa_retencao_pct": ret,
                "likes_total": dr.randint(10, 200),
                "comentarios_total": dr.randint(1, 40),
                "compartilhamentos_total": dr.randint(0, 15),
                "videos_publicados": dr.choices([0, 1], weights=[7, 3])[0],
                "shorts_publicados": dr.choices([0, 1], weights=[6, 4])[0],
                "fonte": "mock",
            })
        return dados

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        rng = self._rng(cliente_id)
        tipos = ["VIDEO", "SHORT", "VIDEO", "VIDEO", "SHORT", "VIDEO"]
        titulos_map = {
            "VIDEO": ["Como construir um negócio de 7 dígitos | Passo a passo",
                       "PARE de cometer esses erros no seu negócio",
                       "Os 5 livros que mudaram minha visão de liderança",
                       "Mentoria ao vivo: análise de negócio real"],
            "SHORT": ["1 dica que vale R$1M", "O segredo dos top 1%",
                       "Hack de produtividade em 30s", "Erro fatal de founders"],
        }
        posts = []
        for i in range(limit):
            tipo = tipos[i % len(tipos)]
            views = rng.randint(200, 50000)
            likes = rng.randint(10, int(views * 0.08))
            com = rng.randint(1, max(2, int(views * 0.01)))
            dur = rng.uniform(1.5, 15.0) if tipo == "VIDEO" else rng.uniform(0.2, 0.9)
            ret = round(rng.uniform(25, 65), 1)
            ctr = round(rng.uniform(2.5, 10.0), 1)
            opts = titulos_map.get(tipo, titulos_map["VIDEO"])
            posts.append({
                "id": f"yt_{cliente_id[:8]}_{i}", "tipo": tipo,
                "publicado_em": str(date.today() - timedelta(days=rng.randint(1, 30))),
                "legenda": opts[rng.randint(0, len(opts) - 1)],
                "visualizacoes": views, "likes": likes, "comentarios": com,
                "compartilhamentos": rng.randint(0, max(1, int(views * 0.005))),
                "watch_time_min": round(dur * ret / 100 * views / 60, 1),
                "duracao_min": round(dur, 1),
                "taxa_retencao": ret, "ctr": ctr,
                "taxa_engajamento": round((likes + com) / max(views, 1) * 100, 2),
                "fonte": "mock",
            })
        return sorted(posts, key=lambda x: x["taxa_engajamento"], reverse=True)

    def get_horarios(self, cliente_id: str) -> list:
        return self._base_horarios(cliente_id)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TIKTOK
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MockTikTokRepository(BaseMockRepository):
    plataforma = "tiktok"

    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        rng = self._rng(cliente_id)
        seg = rng.randint(300, 15000)
        eng_base = rng.uniform(4.0, 9.0)
        views_base = rng.randint(1000, 40000)
        conclusao_base = rng.uniform(35, 65)
        fyp_base = rng.uniform(60, 90)
        dados = []
        for i in range(dias):
            dr = self._day_rng(rng, i)
            cresc = dr.randint(-8, 50)
            seg += cresc
            views = max(0, views_base + dr.randint(-2000, 4000))
            views_base += dr.randint(-100, 200)
            eng = round(max(1.0, eng_base + dr.uniform(-1.2, 1.2)), 2)
            conclusao = round(max(15, min(85, conclusao_base + dr.uniform(-5, 5))), 1)
            fyp = round(max(30, min(98, fyp_base + dr.uniform(-5, 5))), 1)
            dados.append({
                "data": str(date.today() - timedelta(days=dias - i - 1)),
                "seguidores": seg, "delta_seguidores": cresc,
                "visualizacoes_video": views,
                "visualizacoes_perfil": dr.randint(30, 600),
                "curtidas_total": dr.randint(50, 800),
                "comentarios_total": dr.randint(5, 100),
                "compartilhamentos_total": dr.randint(3, 80),
                "taxa_engajamento": eng,
                "taxa_conclusao": conclusao,
                "fyp_pct": fyp,
                "videos_publicados": dr.choices([0, 1, 2], weights=[4, 4, 2])[0],
                "fonte": "mock",
            })
        return dados

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        rng = self._rng(cliente_id)
        legendas = [
            "O que ninguém te conta sobre empreender no Brasil",
            "Respondi a pergunta mais difícil de um founder",
            "3 segundos para captar a atenção — técnica real",
            "POV: você no primeiro pitch da vida",
            "Hack de liderança que aprendi com meu mentor",
            "Esse conselho vale mais que qualquer MBA",
            "O dia que eu quase desisti do meu negócio",
            "Rotina de CEO: o que realmente funciona",
        ]
        posts = []
        for i in range(limit):
            views = rng.randint(500, 200000)
            cur = rng.randint(30, int(views * 0.1))
            com = rng.randint(3, max(4, int(views * 0.02)))
            comp = rng.randint(2, max(3, int(views * 0.03)))
            conclusao = round(rng.uniform(20, 75), 1)
            fyp = round(rng.uniform(50, 95), 1)
            posts.append({
                "id": f"tk_{cliente_id[:8]}_{i}", "tipo": "VIDEO",
                "publicado_em": str(date.today() - timedelta(days=rng.randint(1, 30))),
                "legenda": legendas[rng.randint(0, len(legendas) - 1)],
                "visualizacoes": views, "curtidas": cur,
                "comentarios": com, "compartilhamentos": comp,
                "taxa_conclusao": conclusao, "fyp_pct": fyp,
                "taxa_engajamento": round((cur + com + comp) / max(views, 1) * 100, 2),
                "fonte": "mock",
            })
        return sorted(posts, key=lambda x: x["taxa_engajamento"], reverse=True)

    def get_horarios(self, cliente_id: str) -> list:
        return self._base_horarios(cliente_id)


# ─── Factory ─────────────────────────────────────────────────────────────────

_REPOS = {
    "instagram": MockInstagramRepository,
    "linkedin": MockLinkedInRepository,
    "youtube": MockYouTubeRepository,
    "tiktok": MockTikTokRepository,
}


def get_platform_repository(plataforma: str = "instagram", cliente_id: str = None) -> SocialRepository:
    """
    Retorna repositório real (lê das tabelas sincronizadas) quando o cliente tem
    conexão OAuth ativa para a plataforma. Caso contrário, retorna mock.
    Override forçado: USE_INSTAGRAM_MOCK=true sempre retorna mock.
    """
    import os

    cls = _REPOS.get(plataforma)
    if not cls:
        raise ValueError(f"Plataforma inválida: {plataforma}. Use: {', '.join(PLATAFORMAS_VALIDAS)}")

    if os.getenv("USE_INSTAGRAM_MOCK", "false").lower() == "true":
        return cls()

    # Para Instagram, checa se há conexão ativa e retorna LiveInstagramRepository
    if plataforma == "instagram" and cliente_id:
        try:
            from deps import supabase_client as sb
            r = sb.table("instagram_conexoes").select("id,status").eq(
                "cliente_id", cliente_id
            ).eq("status", "ativo").maybe_single().execute()
            if r and r.data:
                from services.instagram import LiveInstagramRepository
                return LiveInstagramRepository(sb)
            else:
                logger.info(
                    f"get_platform_repository: cliente={cliente_id} sem conexão ativa "
                    f"em instagram_conexoes — usando MockInstagramRepository"
                )
        except Exception as e:
            logger.warning(
                f"get_platform_repository: falha ao consultar instagram_conexoes "
                f"para cliente={cliente_id} — fallback Mock. Erro: {type(e).__name__}: {str(e)[:200]}"
            )

    return cls()
