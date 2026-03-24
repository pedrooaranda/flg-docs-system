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
import os
import random
from abc import ABC, abstractmethod
from datetime import date, timedelta


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


# ─── Repositório Real (skeleton) ──────────────────────────────────────────────

class LiveInstagramRepository(InstagramRepository):
    """
    Skeleton para integração com Instagram Graph API.
    Implementar quando as credenciais chegarem.
    """

    BASE_URL = "https://graph.facebook.com/v19.0"

    def __init__(self, access_token: str):
        self.access_token = access_token

    def is_connected(self, cliente_id: str) -> bool:
        return False  # TODO: verificar credenciais no banco

    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        raise NotImplementedError(
            "Instagram API não configurada. "
            "Veja: developers.facebook.com/docs/instagram-api"
        )

    def get_posts(self, cliente_id: str, limit: int = 12) -> list:
        raise NotImplementedError("Instagram API não configurada.")

    def get_horarios(self, cliente_id: str) -> list:
        raise NotImplementedError("Instagram API não configurada.")


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_repository(cliente_id: str = None) -> InstagramRepository:
    """
    Retorna mock ou real baseado em USE_INSTAGRAM_MOCK no ambiente.
    Quando a API real estiver configurada:
      - Verificar credenciais do cliente no banco
      - Retornar LiveInstagramRepository com access_token do cliente
    """
    use_mock = os.getenv("USE_INSTAGRAM_MOCK", "true").lower() != "false"
    if use_mock:
        return MockInstagramRepository()
    # TODO: buscar credentials do cliente e retornar LiveInstagramRepository
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
