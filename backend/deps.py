"""
Dependências compartilhadas do backend FLG.
Importar daqui para evitar imports circulares entre main.py e routers.
"""
from fastapi import Header, HTTPException
from supabase import create_client

from config import settings

# Cliente Supabase (service role — bypassa RLS)
supabase_client = create_client(settings.supabase_url, settings.supabase_key)


async def get_current_user(authorization: str = Header(...)):
    """Valida JWT do Supabase. Retorna o user dict."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization[7:]
    try:
        user = supabase_client.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
