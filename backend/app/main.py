from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.config import settings
from app.api.v1.routes import auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

# ── API v1 ────────────────────────────────────────────────────────────────────
api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)

# Prochaines phases :
# from app.api.v1.routes import players, fantasy, admin, pronos, matches
# api_router.include_router(players.router)
# api_router.include_router(fantasy.router)
# api_router.include_router(admin.router)

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)