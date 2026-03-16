from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Claude
    anthropic_api_key: str

    # Supabase
    supabase_url: str
    supabase_key: str                  # service role key
    supabase_db_url: str               # postgresql+psycopg://...
    supabase_jwt_secret: str = ""      # opcional — fallback para validação JWT

    # ClickUp
    clickup_api_token: str = ""

    # Runtime
    assets_path: str = "/app/assets"


settings = Settings()
