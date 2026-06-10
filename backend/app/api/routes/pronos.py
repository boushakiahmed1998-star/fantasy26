"""
Routes Pronostics — Fantasy Boulzazen
======================================
Endpoints :
  POST  /api/v1/pronos              → soumettre / modifier un pronostic
  GET   /api/v1/pronos/my           → mes pronostics avec résultats
  GET   /api/v1/pronos/match/{id}   → tous les pronos d'un match (après résultat)
  GET   /api/v1/pronos/upcoming     → matchs à venir pour lesquels prono possible
  POST  /api/v1/pronos/score/{id}   → déclencher scoring d'un match (admin)

Barème de points pronostics :
  Score exact  → +5 pts
  Bonne issue  (V/N/D) → +2 pts
  Mauvais      → 0 pt
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from core.security import get_current_user, require_admin
from core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pronos", tags=["pronos"])

# ── Barème ─────────────────────────────────────────────────────────────────────

EXACT_SCORE_BONUS = 5
CORRECT_OUTCOME_BONUS = 2


# ── Schémas ────────────────────────────────────────────────────────────────────

class PronoRequest(BaseModel):
    match_id: str
    score_home: int
    score_away: int

    @field_validator("score_home", "score_away")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Le score ne peut pas être négatif")
        if v > 20:
            raise ValueError("Score irréaliste (> 20)")
        return v


class ComplaintRequest(BaseModel):
    match_id: str
    reason: str
    description: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _outcome(home: int, away: int) -> str:
    """Retourne 'H' (home win), 'D' (draw) ou 'A' (away win)."""
    if home > away:
        return "H"
    if home < away:
        return "A"
    return "D"


def _compute_points(pred_home: int, pred_away: int, real_home: int, real_away: int) -> int:
    """Calcule les points d'un pronostic par rapport au résultat réel."""
    if pred_home == real_home and pred_away == real_away:
        return EXACT_SCORE_BONUS
    if _outcome(pred_home, pred_away) == _outcome(real_home, real_away):
        return CORRECT_OUTCOME_BONUS
    return 0


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_prono(body: PronoRequest, user=Depends(get_current_user)):
    """
    Soumet ou met à jour un pronostic.
    Interdit si le match a déjà commencé (status != 'pending').
    """
    sb = get_supabase()

    # Vérifier que le match existe et est encore "pending"
    match_row = (
        sb.table("matches")
        .select("id,status,team_home,team_away,start_time")
        .eq("id", body.match_id)
        .single()
        .execute()
    )
    if not match_row.data:
        raise HTTPException(status_code=404, detail="Match introuvable")

    match = match_row.data
    if match["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Impossible de parier : le match est '{match['status']}'"
        )

    # Upsert sur (user_id, match_id)
    existing = (
        sb.table("pronostics")
        .select("id,locked")
        .eq("user_id", user["sub"])
        .eq("match_id", body.match_id)
        .execute()
    )

    if existing.data:
        row = existing.data[0]
        if row.get("locked"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce pronostic est verrouillé (match déjà démarré)"
            )
        sb.table("pronostics").update({
            "prediction": {"score_home": body.score_home, "score_away": body.score_away},
        }).eq("id", row["id"]).execute()
        return {"success": True, "action": "updated", "match": f"{match['team_home']} vs {match['team_away']}"}
    else:
        sb.table("pronostics").insert({
            "user_id": user["sub"],
            "match_id": body.match_id,
            "prediction": {"score_home": body.score_home, "score_away": body.score_away},
            "points": 0,
            "locked": False,
        }).execute()
        return {"success": True, "action": "created", "match": f"{match['team_home']} vs {match['team_away']}"}


@router.get("/upcoming")
async def upcoming_matches(user=Depends(get_current_user)):
    """
    Retourne les matchs à venir (status='pending') pour lesquels
    l'utilisateur peut encore soumettre / modifier un pronostic.
    Inclut le pronostic existant si présent.
    """
    sb = get_supabase()

    matches = (
        sb.table("matches")
        .select("id,team_home,team_away,start_time,group,stage")
        .eq("status", "pending")
        .order("start_time")
        .execute()
        .data
    )

    if not matches:
        return {"matches": []}

    match_ids = [m["id"] for m in matches]
    my_pronos_raw = (
        sb.table("pronostics")
        .select("match_id,prediction,locked")
        .eq("user_id", user["sub"])
        .in_("match_id", match_ids)
        .execute()
        .data
    )
    prono_map = {str(p["match_id"]): p for p in my_pronos_raw}

    return {
        "matches": [
            {**m, "my_prono": prono_map.get(str(m["id"]))}
            for m in matches
        ]
    }


@router.get("/my")
async def my_pronos(user=Depends(get_current_user)):
    """
    Tous les pronostics de l'utilisateur connecté,
    avec le résultat réel et les points attribués.
    """
    sb = get_supabase()

    pronos = (
        sb.table("pronostics")
        .select("*")
        .eq("user_id", user["sub"])
        .order("created_at", desc=True)
        .execute()
        .data
    )

    if not pronos:
        return {"pronos": [], "total_points": 0}

    match_ids = list({str(p["match_id"]) for p in pronos})
    matches_res = (
        sb.table("matches")
        .select("id,team_home,team_away,score_home,score_away,status,start_time,group")
        .in_("id", match_ids)
        .execute()
        .data
    )
    match_map = {str(m["id"]): m for m in matches_res}

    enriched = []
    total = 0
    for p in pronos:
        m = match_map.get(str(p["match_id"]), {})
        enriched.append({**p, "match": m})
        total += int(p.get("points") or 0)

    return {"pronos": enriched, "total_points": total}


@router.get("/match/{match_id}")
async def match_pronos(match_id: str, user=Depends(get_current_user)):
    """
    Pronostics de tous les joueurs pour un match (visible après fin du match).
    """
    sb = get_supabase()

    match_row = (
        sb.table("matches")
        .select("id,status,team_home,team_away,score_home,score_away")
        .eq("id", match_id)
        .single()
        .execute()
    )
    if not match_row.data:
        raise HTTPException(status_code=404, detail="Match introuvable")

    match = match_row.data
    if match["status"] == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Les pronostics sont visibles uniquement après le match"
        )

    pronos = (
        sb.table("pronostics")
        .select("user_id,prediction,points,locked")
        .eq("match_id", match_id)
        .execute()
        .data
    )

    user_ids = list({p["user_id"] for p in pronos})
    users_res = (
        sb.table("users")
        .select("id,username")
        .in_("id", user_ids)
        .execute()
        .data
    ) if user_ids else []
    user_map = {str(u["id"]): u["username"] for u in users_res}

    return {
        "match": match,
        "pronos": [
            {**p, "username": user_map.get(str(p["user_id"]), "?")}
            for p in pronos
        ],
    }


@router.post("/score/{match_id}")
async def score_match_pronos(match_id: str, _admin=Depends(require_admin)):
    """
    Calcule et attribue les points de pronostics pour un match terminé.
    Idempotent : recalcule si appelé plusieurs fois.
    """
    sb = get_supabase()

    match_row = (
        sb.table("matches")
        .select("id,status,score_home,score_away,team_home,team_away")
        .eq("id", match_id)
        .single()
        .execute()
    )
    if not match_row.data:
        raise HTTPException(status_code=404, detail="Match introuvable")

    match = match_row.data
    if match["status"] != "finished":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le match n'est pas encore terminé"
        )

    real_home = int(match["score_home"] or 0)
    real_away = int(match["score_away"] or 0)

    pronos = (
        sb.table("pronostics")
        .select("id,prediction")
        .eq("match_id", match_id)
        .execute()
        .data
    )

    updated = 0
    for p in pronos:
        pred = p.get("prediction") or {}
        pts = _compute_points(
            int(pred.get("score_home", 0)),
            int(pred.get("score_away", 0)),
            real_home,
            real_away,
        )
        sb.table("pronostics").update({"points": pts, "locked": True}).eq("id", p["id"]).execute()
        updated += 1

    logger.info(f"score_match_pronos → {updated} pronostic(s) scorés pour match {match_id}")
    return {
        "success": True,
        "match": f"{match['team_home']} vs {match['team_away']}",
        "real_score": f"{real_home}-{real_away}",
        "pronos_scored": updated,
    }