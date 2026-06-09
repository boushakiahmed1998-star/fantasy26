"""
Sync — Fantasy Boulzazen
===========================
Hook post-login : pré-charge les données de l'utilisateur dans Redis
pour accélérer les appels suivants (équipe, classement, pronostics).

Architecture :
  • on_user_login(user_id)  → appelé depuis auth.py après login réussi
  • get_cached / set_cached → wrapper Redis avec TTL configurable
  • invalidate_user(user_id) → vide le cache d'un user (ex : après saveTeam)
  • invalidate_match(match_id) → vide le cache classement après scoring

Clés Redis utilisées :
  fantasy:user:<uid>:team        → équipe complète avec joueurs résolus
  fantasy:user:<uid>:points      → total points + historique
  fantasy:league:standings       → classement général (partagé)
  fantasy:players:all            → liste complète des joueurs (TTL long)
  fantasy:coaches:all            → liste des entraîneurs

TTL par défaut :
  équipe       : 5 min   (peut changer si l'utilisateur édite)
  points       : 2 min   (peut changer après un match)
  standings    : 1 min
  players/all  : 30 min  (changent rarement)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis

from app.config import settings
from core.supabase import get_supabase

logger = logging.getLogger(__name__)

# ── Connexion Redis ────────────────────────────────────────────────────────────

_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _redis_client


# ── TTL constants (secondes) ───────────────────────────────────────────────────

TTL = {
    "team": 300,         # 5 min
    "points": 120,       # 2 min
    "standings": 60,     # 1 min
    "players_all": 1800, # 30 min
    "coaches_all": 1800,
}

# ── Helpers Redis ──────────────────────────────────────────────────────────────

def _key(namespace: str, *parts: str) -> str:
    return "fantasy:" + ":".join([namespace] + list(parts))


def get_cached(key: str) -> Optional[Any]:
    """Récupère une valeur du cache. Retourne None si absente ou Redis injoignable."""
    try:
        raw = get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.debug(f"Redis GET {key} failed: {exc}")
        return None


def set_cached(key: str, value: Any, ttl: int) -> bool:
    """Stocke une valeur dans Redis. Retourne True si succès."""
    try:
        get_redis().setex(key, ttl, json.dumps(value, ensure_ascii=False, default=str))
        return True
    except Exception as exc:
        logger.debug(f"Redis SET {key} failed: {exc}")
        return False


def delete_cached(*keys: str) -> None:
    """Supprime une ou plusieurs clés."""
    try:
        if keys:
            get_redis().delete(*keys)
    except Exception as exc:
        logger.debug(f"Redis DEL {keys} failed: {exc}")


def delete_pattern(pattern: str) -> int:
    """Supprime toutes les clés correspondant à un pattern glob. Retourne le nombre supprimé."""
    try:
        r = get_redis()
        keys = list(r.scan_iter(pattern))
        if keys:
            r.delete(*keys)
        return len(keys)
    except Exception as exc:
        logger.debug(f"Redis SCAN/DEL {pattern} failed: {exc}")
        return 0


# ── Loaders Supabase → cache ───────────────────────────────────────────────────

def _load_team(user_id: str) -> Optional[dict]:
    sb = get_supabase()
    res = sb.table("fantasy_teams").select("*").eq("user_id", user_id).limit(1).execute()
    if not res.data:
        return None
    team = res.data[0]
    meta = team.get("players") or {}
    slots: dict = meta.get("slots", {}) if isinstance(meta, dict) else {}

    # Résoudre les IDs joueurs en objets complets
    player_ids = [v for v in slots.values() if v]
    players_data: dict[str, dict] = {}
    if player_ids:
        pres = sb.table("players").select("*").in_("id", player_ids).execute()
        players_data = {str(p["id"]): p for p in pres.data}

    coach_data = None
    if team.get("coach_id"):
        cres = sb.table("coaches").select("*").eq("id", team["coach_id"]).limit(1).execute()
        if cres.data:
            coach_data = cres.data[0]

    return {**team, "players_data": players_data, "coach": coach_data}


def _load_user_points(user_id: str) -> dict:
    sb = get_supabase()
    history = (
        sb.table("points_history")
        .select("match_id, total_points, points, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    total = sum(float(r.get("total_points") or 0) for r in history)
    return {"total": round(total, 1), "history": history}


def _load_standings() -> list[dict]:
    sb = get_supabase()
    # Classement basé sur les points des fantasy_teams
    teams = (
        sb.table("fantasy_teams")
        .select("id,name,points,user_id")
        .order("points", desc=True)
        .execute()
        .data
    )
    user_ids = [t["user_id"] for t in teams]
    users: dict[str, dict] = {}
    if user_ids:
        ures = sb.table("users").select("id,username").in_("id", user_ids).execute()
        users = {str(u["id"]): u for u in ures.data}

    return [
        {
            "rank": i + 1,
            "team_id": t["id"],
            "team_name": t.get("name", "—"),
            "username": users.get(t["user_id"], {}).get("username", "?"),
            "points": float(t.get("points") or 0),
        }
        for i, t in enumerate(teams)
    ]


def _load_all_players() -> list[dict]:
    sb = get_supabase()
    return sb.table("players").select("*").order("position").order("price", desc=True).execute().data


def _load_all_coaches() -> list[dict]:
    sb = get_supabase()
    return sb.table("coaches").select("*").order("price", desc=True).execute().data


# ── Hook principal ─────────────────────────────────────────────────────────────

def on_user_login(user_id: str) -> None:
    """
    Hook à appeler juste après un login réussi.
    Pré-charge en cache Redis les données dont l'utilisateur aura besoin
    immédiatement : son équipe, ses points, le classement, et la liste
    des joueurs (si pas déjà en cache).
    """
    logger.info(f"[sync] on_user_login user={user_id}")

    # 1. Équipe de l'utilisateur
    team = _load_team(user_id)
    if team:
        set_cached(_key("user", user_id, "team"), team, TTL["team"])
    else:
        logger.debug(f"  Pas d'équipe pour user {user_id}")

    # 2. Points & historique
    pts = _load_user_points(user_id)
    set_cached(_key("user", user_id, "points"), pts, TTL["points"])

    # 3. Classement (partagé, on ne le recharge que si absent du cache)
    standings_key = _key("league", "standings")
    if not get_cached(standings_key):
        standings = _load_standings()
        set_cached(standings_key, standings, TTL["standings"])

    # 4. Joueurs & coachs (partagé, TTL long)
    players_key = _key("players", "all")
    if not get_cached(players_key):
        players = _load_all_players()
        set_cached(players_key, players, TTL["players_all"])

    coaches_key = _key("coaches", "all")
    if not get_cached(coaches_key):
        coaches = _load_all_coaches()
        set_cached(coaches_key, coaches, TTL["coaches_all"])

    logger.info(f"[sync] Cache prêt pour user {user_id}")


# ── Invalidations ──────────────────────────────────────────────────────────────

def invalidate_user(user_id: str) -> None:
    """
    Vide les clés spécifiques à un utilisateur.
    À appeler après saveTeam, modification de l'équipe, etc.
    """
    n = delete_pattern(f"fantasy:user:{user_id}:*")
    logger.debug(f"[sync] invalidate_user {user_id} → {n} clé(s) supprimée(s)")


def invalidate_match(match_id: str) -> None:
    """
    Après le calcul des points d'un match, invalide :
    - tous les caches de points (globaux + par user)
    - le classement
    """
    delete_pattern("fantasy:user:*:points")
    delete_cached(_key("league", "standings"))
    logger.debug(f"[sync] invalidate_match {match_id} → standings + points vidés")


def invalidate_players() -> None:
    """Après un import admin, vide le cache des joueurs."""
    delete_cached(_key("players", "all"), _key("coaches", "all"))
    logger.debug("[sync] Cache joueurs/coachs invalidé")


# ── Helpers publics (utilisés par les routes FastAPI) ─────────────────────────

def get_team_cached(user_id: str) -> Optional[dict]:
    """Renvoie l'équipe depuis le cache, ou None si absente."""
    return get_cached(_key("user", user_id, "team"))


def get_points_cached(user_id: str) -> Optional[dict]:
    return get_cached(_key("user", user_id, "points"))


def get_standings_cached() -> Optional[list]:
    return get_cached(_key("league", "standings"))


def get_players_cached() -> Optional[list]:
    return get_cached(_key("players", "all"))


def get_coaches_cached() -> Optional[list]:
    return get_cached(_key("coaches", "all"))


# ── Santé Redis ───────────────────────────────────────────────────────────────

def redis_health() -> dict:
    """Vérifie la connexion Redis. Utilisé par /health."""
    try:
        r = get_redis()
        r.ping()
        info = r.info("memory")
        return {
            "status": "ok",
            "used_memory_human": info.get("used_memory_human"),
            "connected_clients": r.info("clients").get("connected_clients"),
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ── CLI de test ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Sync / cache Redis — Fantasy Boulzazen")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_login = sub.add_parser("login", help="Simuler un on_user_login")
    p_login.add_argument("user_id")

    p_inv = sub.add_parser("invalidate", help="Invalider le cache d'un user")
    p_inv.add_argument("user_id")

    p_match = sub.add_parser("invalidate-match", help="Invalider après scoring d'un match")
    p_match.add_argument("match_id")

    sub.add_parser("health", help="Vérifier la connexion Redis")
    sub.add_parser("flush-players", help="Vider le cache joueurs/coachs")

    args = parser.parse_args()

    if args.cmd == "login":
        on_user_login(args.user_id)
    elif args.cmd == "invalidate":
        invalidate_user(args.user_id)
    elif args.cmd == "invalidate-match":
        invalidate_match(args.match_id)
    elif args.cmd == "health":
        print(json.dumps(redis_health(), indent=2))
    elif args.cmd == "flush-players":
        invalidate_players()
        print("Cache joueurs/coachs vidé.")