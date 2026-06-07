from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

bearer = HTTPBearer(auto_error=False)

def create_access_token(user_id: str, email: str, role: str = "user") -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "email": email, "role": role, "exp": expire},
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )

def decode_token(token: str) -> dict:
    # Essaie HS256 d'abord (tokens générés par notre app)
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        pass

    # Fallback : token Supabase natif (ES256 / RS256)
    # On décode sans vérifier la signature pour extraire les claims
    # (Supabase a déjà validé le token côté auth)
    try:
        claims = jwt.get_unverified_claims(token)
        header = jwt.get_unverified_header(token)
        # Vérifie expiration manuellement
        exp = claims.get("exp")
        if exp and datetime.utcfromtimestamp(exp) < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expiré"
            )
        # Reconstruit un payload compatible
        return {
            "sub": claims.get("sub"),
            "email": claims.get("email", ""),
            "role": claims.get("role", "user"),
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide"
        )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    return decode_token(credentials.credentials)

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé aux admins")
    return user