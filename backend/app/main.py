from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.config import settings

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


# ── Health check ────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}


# ── API v1 router (matches the Vite proxy rewrite: /api → /api/v1) ─────────
from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/ping")
async def ping():
    return {"message": "pong"}


# Register future route modules here, e.g.:
# from app.api.v1.routes import auth, players, matches
# api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
# api_router.include_router(players.router, prefix="/players", tags=["players"])

app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=settings.DEBUG)