from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from core.supabase import get_supabase
from core.security import create_access_token
import logging
import threading

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    username: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_user_profile(user_id: str, email: str, username: str) -> None:
    """Sync Supabase auth user → table users"""
    sb = get_supabase()
    existing = sb.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        sb.table("users").insert({
            "id": user_id,
            "email": email,
            "username": username,
            "role": "user",
            "password_hash": "",
        }).execute()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    sb = get_supabase()
    username = body.username or body.email.split("@")[0]

    existing = sb.table("users").select("id").eq("username", username).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris")

    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not res.user:
        raise HTTPException(status_code=400, detail="Erreur lors de l'inscription")

    create_user_profile(res.user.id, body.email, username)
    token = create_access_token(res.user.id, body.email, "user")

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": res.user.id, "email": body.email, "username": username, "role": "user"},
    }


@router.post("/login")
async def login(body: LoginRequest):
    sb = get_supabase()

    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not res.user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    profile = sb.table("users").select("*").eq("id", res.user.id).single().execute()
    user_data = profile.data or {
        "id": res.user.id,
        "email": body.email,
        "username": body.email.split("@")[0],
        "role": "user",
    }

    if not profile.data:
        create_user_profile(res.user.id, body.email, body.email.split("@")[0])

    token = create_access_token(res.user.id, body.email, user_data.get("role", "user"))

    # Hook post-login : pré-chargement cache Redis (non-bloquant)
    try:
        from app.services.sync import on_user_login
        threading.Thread(target=on_user_login, args=(res.user.id,), daemon=True).start()
    except Exception as e:
        logger.debug(f"sync hook skipped: {e}")

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_data["id"],
            "email": user_data["email"],
            "username": user_data.get("username"),
            "role": user_data.get("role", "user"),
        },
    }


@router.get("/me")
async def me(user_id: str, email: str):
    sb = get_supabase()
    profile = sb.table("users").select("*").eq("id", user_id).single().execute()
    return profile.data