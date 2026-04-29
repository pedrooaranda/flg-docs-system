"""
Serviço de Instagram — Repository Pattern.

Alterna entre mock realista e API real via USE_INSTAGRAM_MOCK (.env).

Para ativar a API real quando as credenciais chegarem:
  1. Criar app no Meta for Developers (developers.facebook.com)
  2. Permissões: instagram_basic, instagram_manage_insights,
     pages_read_engagement, pages_show_list
  3. Passar pelo processo de revisão do app Meta
  4. Implementar fluxo OAuth por cliente (ver LiveInstagramRepository)
  5. Setar USE_INSTAGRAM_MOCK=false no .env

Documentação: https://developers.facebook.com/docs/instagram-api
"""

import hashlib
import logging
import os
import random
from abc import ABC, abstractmethod
from datetime import date, timedelta

logger = logging.getLogger("flg.instagram")


# ─── Contrato abstrato ────────────────────────────────────────────────────────

class InstagramRepository(ABC):
    @abstractmethod
    def is_connected(self, cliente_id: str) -> bool: ...

    @abstractmethod
    def get_historico(self, cliente_id: str, dias: int) -> list: ...

    @abstractmethod
    def get_posts(self, cliente_id: str, limit: int) -> list: ...

    @abstractmethod
    def get_horarios(self, cliente_id: str) -> list: ...

    def get_demografia(self, cliente_id: str, tipo: str = "follower") -> dict:
        """
        Retorna { tipo, data_referencia, total_count, genero_idade, paises, cidades, locales, fonte }.
        Default vazio — subclasses sobrescrevem.
        """
        return {
            "tipo": tipo, "data_referencia": None, "total_count": 0,
            "genero_idade": {}, "paises": [], "cidades": [], "locales": [],
            "fonte": "unavailable",
        }


# ─── Repositório Mock ─────────────────────────────────────────────────────────

class MockInstagramRepository(InstagramRepository):
    """
    Dados mockados realistas com seed por cliente_id.
    O mesmo cliente recebe sempre os mesmos dados base, com variações
    diárias determinísticas — ideal para desenvolvimento e demos.
    """

    def _rng(self, cliente_id: str) -> random.Random:
        seed = int(hashlib.md5(cliente_id.encode()).hexdigest()[:8], 16)
        return random.Random(seed)

    def is_connected(self, cliente_id: str) -> bool:
        return False

    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        rng = self._rng(cliente_id)
        seguidores_base = rng.randint(900, 9000)
        eng_base = rng.uniform(2.0, 5.5)
        alcance_base = rng.randint(2000, 30000)

        dados = []
        for i in range(dias):
            data_ref = date.today() - timedelta(days=dias - i - 1)
            # RNG por dia — determinístico mas com variação diária
            day_rng = random.Random(rng.randint(0, 9_999_999) + i)

            crescimento = day_rng.randint(-4, 20)
            seguidores_base += crescimento

            eng = round(max(0.5, eng_base + day_rng.uniform(-0.6, 0.6)), 2)
            alcance = max(0, alcance_base + day_rng.randint(-600, 900))
            alcance_base += day_rng.randint(-50, 100)  # drift gradual

            posts_pub  = day_rng.choices([0, 1, 2], weights=[5, 4, 1])[0]
            reels_pub  = day_rng.choices([0, 1],    weights=[6, 4])[0]
            stories_pub = day_rng.choices([0, 1, 2, 3], weights=[2, 3, 3, 2])[0]

            curtidas      = day_rng.randint(20, 280)
            comentarios   = day_rng.randint(2, 45)
            salvamentos   = day_rng.randint(5, 90)
            compartilh    = day_rng.randint(1, 30)

            dados.append({
                "data": str(data_ref),
                "seguidores": seguidores_base,
                "delta_seguidores": crescimento,
                "alcance_total": alcance,
                "impressoes_total": int(alcance * day_rng.uniform(1.4, 2.3)),
                "taxa_engajamento": eng,
                "curtidas_total": curtidas,
                "comentarios_total": comentarios,
                "salvamentos_total": salvamentos,
                "compartilhamentos_total": compartilh,
                "visitas_perfil": day_rng.randint(35, 450),
                "cliques_link_bio": day_rng.randint(2, 40),
                "posts_publicados": posts_pub,
                "reels_publicados": reels_pub,
                "stories_publicados": stories_pub,
                "fonte": "mock",
            })

        return dados

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        rng = self._rng(cliente_id)
        tipos_ciclo = ["REEL", "IMAGE", "CAROUSEL", "REEL", "VIDEO", "IMAGE"]
        posts = []

        for i in range(limit):
            tipo = tipos_ciclo[i % len(tipos_ciclo)]
            alcance   = rng.randint(600, 6000)
            curtidas  = rng.randint(80, 500)
            coments   = rng.randint(5, 70)
            salvam    = rng.randint(10, 140)
            taxa = round((curtidas + coments + salvam) / max(alcance, 1) * 100, 2)
            dias_atras = rng.randint(1, 30)

            posts.append({
                "id": f"mock_{cliente_id[:8]}_{i}",
                "tipo": tipo,
                "publicado_em": str(date.today() - timedelta(days=dias_atras)),
                "legenda": _mock_legenda(tipo, rng),
                "curtidas": curtidas,
                "comentarios": coments,
                "salvamentos": salvam,
                "compartilhamentos": rng.randint(2, 35),
                "alcance": alcance,
                "impressoes": int(alcance * rng.uniform(1.3, 2.2)),
                "plays": curtidas * rng.randint(3, 8) if tipo in ("REEL", "VIDEO") else 0,
                "taxa_engajamento": taxa,
                "fonte": "mock",
            })

        return sorted(posts, key=lambda x: x["taxa_engajamento"], reverse=True)

    def get_demografia(self, cliente_id: str, tipo: str = "follower") -> dict:
        """Mock: distribuição realista de gênero × idade + países + cidades."""
        rng = self._rng(cliente_id)
        total = rng.randint(800, 8000) if tipo == "follower" else rng.randint(200, 2000)

        # Gênero × idade — distribuição que soma ~total
        gender_split = {"F": rng.uniform(0.45, 0.65), "M": 0, "U": 0}
        gender_split["M"] = 1 - gender_split["F"] - 0.02
        gender_split["U"] = 0.02
        ages = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
        age_weights = [0.05, 0.30, 0.34, 0.15, 0.10, 0.04, 0.02]
        genero_idade = {}
        for g, gw in gender_split.items():
            for age, aw in zip(ages, age_weights):
                v = int(total * gw * aw * rng.uniform(0.85, 1.15))
                if v > 0:
                    genero_idade[f"{g}.{age}"] = v
                    genero_idade[g] = genero_idade.get(g, 0) + v
        for age, aw in zip(ages, age_weights):
            genero_idade[f"U.{age}"] = int(total * aw)

        paises_pool = [("BR", 0.78), ("PT", 0.06), ("US", 0.05), ("AR", 0.03), ("ES", 0.02), ("AO", 0.02), ("MZ", 0.01), ("FR", 0.01), ("IT", 0.01), ("CA", 0.01)]
        paises = sorted(
            [{"key": k, "value": int(total * w * rng.uniform(0.85, 1.15))} for k, w in paises_pool],
            key=lambda x: x["value"], reverse=True
        )

        cidades_pool = [
            ("São Paulo, BR", 0.18), ("Rio de Janeiro, BR", 0.10), ("Belo Horizonte, BR", 0.06),
            ("Brasília, BR", 0.05), ("Curitiba, BR", 0.04), ("Porto Alegre, BR", 0.04),
            ("Salvador, BR", 0.03), ("Recife, BR", 0.03), ("Fortaleza, BR", 0.03),
            ("Campinas, BR", 0.02), ("Lisboa, PT", 0.02), ("Buenos Aires, AR", 0.02),
            ("Goiânia, BR", 0.02), ("Manaus, BR", 0.015), ("Florianópolis, BR", 0.015),
        ]
        cidades = sorted(
            [{"key": k, "value": int(total * w * rng.uniform(0.85, 1.15))} for k, w in cidades_pool],
            key=lambda x: x["value"], reverse=True
        )

        locales = [
            {"key": "pt_BR", "value": int(total * 0.85)},
            {"key": "pt_PT", "value": int(total * 0.05)},
            {"key": "en_US", "value": int(total * 0.05)},
            {"key": "es_ES", "value": int(total * 0.03)},
            {"key": "es_LA", "value": int(total * 0.02)},
        ]

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

    def get_horarios(self, cliente_id: str) -> list:
        """Matriz de engajamento médio por faixa horária × dia da semana."""
        rng = self._rng(cliente_id)
        dias    = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
        faixas  = ["06-09h", "09-12h", "12-15h", "15-18h", "18-21h"]
        data    = []

        for faixa_idx, faixa in enumerate(faixas):
            for dia_idx, dia in enumerate(dias):
                is_weekend  = dia_idx in (0, 6)
                is_lunch    = faixa_idx == 2   # 12-15h
                is_morning  = faixa_idx == 1   # 09-12h

                base = 1.5
                if not is_weekend and is_lunch:
                    base += rng.uniform(2.0, 3.5)
                elif not is_weekend and is_morning:
                    base += rng.uniform(0.8, 2.0)
                elif not is_weekend:
                    base += rng.uniform(0.3, 1.0)
                elif is_weekend:
                    base += rng.uniform(0.0, 0.8)

                data.append({
                    "dia":       dia,
                    "dia_idx":   dia_idx,
                    "faixa":     faixa,
                    "faixa_idx": faixa_idx,
                    "engajamento": round(max(0.3, base + rng.uniform(-0.2, 0.2)), 2),
                })

        return data


# ─── Repositório Real (lê das tabelas sincronizadas pelo cron) ────────────────

class LiveInstagramRepository(InstagramRepository):
    """
    Serve dados das tabelas Supabase populadas pelo `instagram_sync` (cron diário).
    Não bate no Graph API a cada request — evita rate limit com 70+ clientes.
    """

    DIAS_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    FAIXAS = [(6, 9, "06-09h"), (9, 12, "09-12h"), (12, 15, "12-15h"),
              (15, 18, "15-18h"), (18, 21, "18-21h")]

    def __init__(self, sb):
        self.sb = sb

    def is_connected(self, cliente_id: str) -> bool:
        r = self.sb.table("instagram_conexoes").select("id").eq(
            "cliente_id", cliente_id
        ).eq("status", "ativo").maybe_single().execute()
        return bool(r and r.data)

    def get_historico(self, cliente_id: str, dias: int = 30, tipo: str = "all") -> list:
        """
        tipo: 'all' | 'feed' | 'reels' | 'story' — filtra os agregados por tipo
              de mídia. Default 'all' mantém comportamento legado.
        """
        cutoff = (date.today() - timedelta(days=dias - 1)).isoformat()
        # Mapeia o tipo da rota pro valor do DB (media_product_type)
        tipo_db = {"all": "ALL", "feed": "FEED", "reels": "REELS", "story": "STORY"}.get(
            tipo.lower(), "ALL"
        )

        # Followers: pega TUDO (não filtra por cutoff) pra ter o último valor
        # conhecido ANTES do período — usado pro carry-forward dos dias sem snapshot.
        # Cliente recém-conectado tem só 1 snapshot (hoje), sem isso o gráfico
        # mostra linha plana em 0 e spike pra 28000 no último dia.
        all_followers = self.sb.table("instagram_followers_historico").select("*").eq(
            "cliente_id", cliente_id
        ).order("data").execute().data or []

        diarias = self.sb.table("instagram_metricas_diarias").select("*").eq(
            "cliente_id", cliente_id
        ).eq("media_product_type", tipo_db).gte("data", cutoff).order("data").execute().data or []

        diarias_por_dia = {d["data"]: d for d in diarias}
        followers_por_dia = {f["data"]: f for f in all_followers}

        feed_diarias = self.sb.table("instagram_metricas_diarias").select(
            "data,posts_publicados"
        ).eq("cliente_id", cliente_id).eq("media_product_type", "FEED").gte(
            "data", cutoff
        ).execute().data or []
        reels_diarias = self.sb.table("instagram_metricas_diarias").select(
            "data,posts_publicados"
        ).eq("cliente_id", cliente_id).eq("media_product_type", "REELS").gte(
            "data", cutoff
        ).execute().data or []
        stories_diarias = self.sb.table("instagram_metricas_diarias").select(
            "data,posts_publicados"
        ).eq("cliente_id", cliente_id).eq("media_product_type", "STORY").gte(
            "data", cutoff
        ).execute().data or []
        feed_map = {x["data"]: x.get("posts_publicados", 0) for x in feed_diarias}
        reels_map = {x["data"]: x.get("posts_publicados", 0) for x in reels_diarias}
        stories_map = {x["data"]: x.get("posts_publicados", 0) for x in stories_diarias}

        # Estimador de seguidores por dia com 3 prioridades:
        #   1. Snapshot exato do dia
        #   2. Último snapshot ANTERIOR (carry-forward) — caso normal
        #   3. PRIMEIRO snapshot POSTERIOR (forward-projection) — cliente novo
        #      sem histórico anterior. Honesto: assume que ontem ele tinha mais
        #      ou menos a mesma audiência de hoje (vs assumir 0, que cria
        #      "Novos no período = total de seguidores" e gráfico spike).
        sorted_snapshots = sorted(all_followers, key=lambda x: x["data"])

        def _approx_followers(target_date: str) -> int:
            if not sorted_snapshots:
                return 0
            last_before = None
            first_after = None
            for snap in sorted_snapshots:
                snap_date = snap["data"]
                if snap_date == target_date:
                    return snap.get("followers_count") or 0
                if snap_date < target_date:
                    last_before = snap
                elif first_after is None:
                    first_after = snap
            if last_before:
                return last_before.get("followers_count") or 0
            if first_after:
                return first_after.get("followers_count") or 0
            return 0

        result = []
        for i in range(dias):
            d = (date.today() - timedelta(days=dias - i - 1)).isoformat()
            f = followers_por_dia.get(d, {})
            agg = diarias_por_dia.get(d, {})
            seguidores = f.get("followers_count") if f else None
            if seguidores is None:
                seguidores = _approx_followers(d)
            result.append({
                "data": d,
                "seguidores": seguidores,
                "delta_seguidores": f.get("delta_followers") or 0,
                "alcance_total": agg.get("total_reach") or 0,
                "impressoes_total": agg.get("total_impressions") or 0,
                "taxa_engajamento": float(agg.get("avg_engagement_rate") or 0),
                "curtidas_total": agg.get("total_likes") or 0,
                "comentarios_total": agg.get("total_comments") or 0,
                "salvamentos_total": agg.get("total_saves") or 0,
                "compartilhamentos_total": agg.get("total_shares") or 0,
                "visitas_perfil": agg.get("total_profile_visits") or 0,
                "cliques_link_bio": 0,
                "posts_publicados": feed_map.get(d, 0),
                "reels_publicados": reels_map.get(d, 0),
                "stories_publicados": stories_map.get(d, 0),
                # Campos extras pra builders por tipo:
                "plays_total": agg.get("total_plays") or 0,
                "watch_time_ms_total": agg.get("total_watch_time_ms") or 0,
                "watch_time_segundos_medio": float(agg.get("avg_watch_time_seconds") or 0),
                "retention_rate": float(agg.get("avg_retention_rate") or 0),
                "follows_total": agg.get("total_follows") or 0,
                "replies_total": agg.get("total_replies") or 0,
                "taps_forward_total": agg.get("total_taps_forward") or 0,
                "taps_back_total": agg.get("total_taps_back") or 0,
                "exits_total": agg.get("total_exits") or 0,
                "fonte": "live",
            })
        return result

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        posts = self.sb.table("instagram_posts").select("*").eq(
            "cliente_id", cliente_id
        ).order("engagement_rate", desc=True).limit(limit).execute().data or []

        out = []
        for p in posts:
            tipo_raw = (p.get("media_product_type") or "FEED").upper()
            media_type = (p.get("media_type") or "").upper()
            if tipo_raw == "REELS":
                tipo = "REEL"
            elif tipo_raw == "STORY":
                tipo = "STORY"
            elif media_type == "CAROUSEL_ALBUM":
                tipo = "CAROUSEL"
            elif media_type == "VIDEO":
                tipo = "VIDEO"
            else:
                tipo = "IMAGE"

            out.append({
                "id": p["id"],
                "ig_media_id": p.get("ig_media_id"),
                "tipo": tipo,
                "publicado_em": (p.get("posted_at") or "")[:10],
                "legenda": p.get("caption") or "",
                "permalink": p.get("permalink"),
                "thumbnail_url": p.get("thumbnail_url") or p.get("media_url"),
                "curtidas": p.get("likes") or 0,
                "comentarios": p.get("comments") or 0,
                "salvamentos": p.get("saved") or 0,
                "compartilhamentos": p.get("shares") or 0,
                "alcance": p.get("reach") or 0,
                "impressoes": p.get("impressions") or 0,
                "plays": p.get("plays") or 0,
                "taxa_engajamento": float(p.get("engagement_rate") or 0),
                "fonte": "live",
            })
        return out

    def get_demografia(self, cliente_id: str, tipo: str = "follower") -> dict:
        result = self.sb.table("instagram_demografia").select("*").eq(
            "cliente_id", cliente_id
        ).eq("tipo", tipo).order("data_referencia", desc=True).limit(1).execute()
        row = (result.data or [None])[0]
        if not row:
            return {
                "tipo": tipo, "data_referencia": None, "total_count": 0,
                "genero_idade": {}, "paises": [], "cidades": [], "locales": [],
                "fonte": "live", "api_message": "Nenhum snapshot disponível ainda. Aguarde sync semanal.",
            }
        return {
            "tipo": tipo,
            "data_referencia": row.get("data_referencia"),
            "total_count": row.get("total_count") or 0,
            "genero_idade": row.get("genero_idade") or {},
            "paises": row.get("paises") or [],
            "cidades": row.get("cidades") or [],
            "locales": row.get("locales") or [],
            "fonte": "live",
            "api_message": row.get("api_message"),
        }

    def get_horarios(self, cliente_id: str) -> list:
        rows = self.sb.table("instagram_horarios_engagement").select("*").eq(
            "cliente_id", cliente_id
        ).execute().data or []

        # Agrupa em faixas de 3h conforme contrato do mock (5 faixas × 7 dias = 35 buckets)
        buckets = {}
        for r in rows:
            dia_idx = r.get("dia_semana", 0)
            hora = r.get("faixa_horaria", 12)
            faixa_idx = next((i for i, (s, e, _) in enumerate(self.FAIXAS) if s <= hora < e), None)
            if faixa_idx is None:
                continue
            key = (dia_idx, faixa_idx)
            cur = buckets.setdefault(key, {"sum": 0.0, "count": 0})
            cur["sum"] += float(r.get("taxa_engajamento_media") or 0)
            cur["count"] += 1

        data = []
        for faixa_idx, (_, _, faixa_label) in enumerate(self.FAIXAS):
            for dia_idx, dia_label in enumerate(self.DIAS_LABELS):
                b = buckets.get((dia_idx, faixa_idx))
                eng = round(b["sum"] / b["count"], 2) if b and b["count"] else 0.0
                data.append({
                    "dia": dia_label,
                    "dia_idx": dia_idx,
                    "faixa": faixa_label,
                    "faixa_idx": faixa_idx,
                    "engajamento": eng,
                })
        return data


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_repository(cliente_id: str = None) -> InstagramRepository:
    """
    Retorna LiveInstagramRepository quando o cliente tem conexão ativa,
    senão MockInstagramRepository (modo demo / dev).
    Override forçado: USE_INSTAGRAM_MOCK=true sempre retorna mock.
    """
    if os.getenv("USE_INSTAGRAM_MOCK", "false").lower() == "true":
        return MockInstagramRepository()

    if cliente_id:
        try:
            from deps import supabase_client as sb
            r = sb.table("instagram_conexoes").select("id").eq(
                "cliente_id", cliente_id
            ).eq("status", "ativo").maybe_single().execute()
            if r and r.data:
                return LiveInstagramRepository(sb)
            else:
                logger.info(
                    f"get_repository: cliente={cliente_id} sem conexão ativa — usando Mock"
                )
        except Exception as e:
            logger.warning(
                f"get_repository: falha ao consultar instagram_conexoes para "
                f"cliente={cliente_id} — fallback Mock. Erro: {type(e).__name__}: {str(e)[:200]}"
            )

    return MockInstagramRepository()


# ─── Helpers de mock ─────────────────────────────────────────────────────────

def _mock_legenda(tipo: str, rng: random.Random) -> str:
    legendas = {
        "REEL": [
            "Bastidores do processo de vendas 📱",
            "Como triplicamos resultados em 90 dias",
            "O erro que a maioria comete no digital",
            "Estratégia que mudou tudo pra mim ↓",
            "Verdade que ninguém fala sobre crescimento",
        ],
        "IMAGE": [
            "Reflexão sobre liderança e crescimento.",
            "Resultados do mês: números que importam.",
            "Jornada de transformação em andamento.",
        ],
        "CAROUSEL": [
            "5 passos para escalar seu negócio (arrasta ➡️)",
            "Os 3 pilares do crescimento digital",
            "Framework que usamos com nossos clientes",
        ],
        "VIDEO": [
            "Conversa honesta sobre posicionamento digital.",
            "O que aprendi nesses 6 meses de jornada.",
        ],
    }
    opcoes = legendas.get(tipo, legendas["IMAGE"])
    return opcoes[rng.randint(0, len(opcoes) - 1)]
