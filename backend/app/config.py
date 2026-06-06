from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    APP_NAME: str = "Fantasy Boulzazen"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    SUPABASE_URL: str = Field(..., env="SUPABASE_URL")
    SUPABASE_KEY: str = Field(..., env="SUPABASE_KEY")
    SUPABASE_JWT_SECRET: str = Field(..., env="SUPABASE_JWT_SECRET")

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    GROQ_API_KEY: str = Field(..., env="GROQ_API_KEY")
    GEMINI_API_KEY: str = Field(..., env="GEMINI_API_KEY")

    SOFASCORE_BASE_URL: str = "https://www.sofascore.com/fr"
    OLYMPICS_BASE_URL: str = "https://www.olympics.com/fr"
    SCRAPER_TIMEOUT: int = 30

    REDIS_URL: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()