from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Claude
    anthropic_api_key: str

    # Supabase
    supabase_url: str
    supabase_key: str                  # service role key
    supabase_db_url: str               # postgresql+psycopg://...

    # ClickUp
    clickup_api_token: str = ""
    clickup_list_id: str = ""
    clickup_team_id: str = ""

    # Meta — Instagram Business Login (caminho atual desde abr/2026)
    # IDs/secrets do produto "Instagram API with Instagram Login" no painel Meta
    ig_app_id: str = ""
    ig_app_secret: str = ""

    # Legacy — Facebook Login for Business (deprecated, mantido só pra rollback)
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_redirect_uri: str = "https://docs.foundersledgrowth.online/api/instagram/oauth/callback"
    meta_webhook_verify_token: str = ""

    # App
    app_base_url: str = "https://docs.foundersledgrowth.online"

    # Runtime
    assets_path: str = "/app/assets"


settings = Settings()
