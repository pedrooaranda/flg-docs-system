"""
Sincronização DB → Auth metadata para colaboradores.

Quando o role de um colaborador muda na tabela `colaboradores`, espelhamos
em `auth.users.user_metadata.role` para que o frontend (que lê
`user_metadata.role` via session) reflita a permissão sem precisar
de query extra contra `colaboradores`.

Sync é one-way (DB → Auth). Se alguém alterar user_metadata diretamente
pelo dashboard, vira out-of-sync — aceitável dado o volume baixo (dezenas
de operadores) e a baixa frequência de mudanças manuais.
"""

import logging

logger = logging.getLogger("flg.colaboradores_sync")


def sync_role_to_auth_metadata(supabase, email: str, role: str) -> bool:
    """
    Atualiza `auth.users.user_metadata.role` do usuário com `email` para `role`.
    Faz merge com metadata existente (não substitui).

    Returns: True se sucesso, False se usuário não encontrado ou erro.
    Logs warning em qualquer falha — não levanta exceção (caller decide se
    quer ignorar ou propagar).

    Per supabase-py v2.10+:
      - `list_users(page, per_page) -> List[User]` (Pydantic User objects)
      - Default per_page=50; bumpamos pra 200 pra cobrir workspace FLG.
      - `update_user_by_id(uid, attributes)` aceita dict que supabase-py coerce
        em AdminUserAttributes via Pydantic. Shape `{"user_metadata": {...}}` é canônico.
    """
    try:
        users = supabase.auth.admin.list_users(page=1, per_page=200)
        target_email = (email or "").strip().lower()
        target = next(
            (u for u in users if (getattr(u, "email", "") or "").strip().lower() == target_email),
            None,
        )
        if not target:
            logger.warning(f"sync_role: usuário {email} não encontrado em auth.users — colaborador órfão?")
            return False

        user_id = getattr(target, "id", None)
        if not user_id:
            logger.warning(f"sync_role: User {email} sem id — formato inesperado da resposta")
            return False

        # User.user_metadata é dict (ou None) per Pydantic model do supabase-auth.
        current_meta = getattr(target, "user_metadata", None) or {}
        new_meta = {**current_meta, "role": role}

        supabase.auth.admin.update_user_by_id(user_id, {"user_metadata": new_meta})
        logger.info(f"sync_role: {email} → role={role} (auth metadata atualizado)")
        return True
    except Exception as e:
        logger.warning(f"sync_role: falhou pra {email} (role={role}): {e}")
        return False
