"""
Routes Matches — Fantasy Boulzazen
====================================
GET  /api/v1/matches            → liste tous les matchs (optionnel: ?status=pending|live|finished)
GET  /api/v1/matches/live       → indique s'il y a un match en cours (utilisé par Ranking.tsx)
POST /api/v1/matches            → créer un match (admin)
PUT  /api/v1/matches/{id}       → mettre à jour score/statut (admin)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from core.security import get_current_user, require_admin
from core.supabase import get_supabase

router = APIRouter(prefix="/matches", tags=["matches"])


class MatchCreate(BaseModel):
    team_home: str
    team_away: str
    start_time: str          # ISO 8601
    group: Optional[str] = None
    stage: str = "group"


class MatchUpdate(BaseModel):
    score_home: Optional[int] = None
    score_away: Optional[int] = None
    status: Optional[str] = None   # pending | live | finished


@router.get("")
async def list_matches(
    status: Optional[str] = None,
    _user=Depends(get_current_user),
):
    """Liste les matchs, optionnellement filtrés par statut."""
    sb = get_supabase()
    query = sb.table("matches").select("*").order("start_time")
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return {"matches": result.data, "total": len(result.data)}


@router.get("/live")
async def live_status(_user=Depends(get_current_user)):
    """
    Indique s'il y a au moins un match en cours.
    Utilisé par Ranking.tsx pour adapter l'intervalle de polling.
    """
    sb = get_supabase()
    res = sb.table("matches").select("id").eq("status", "live").limit(1).execute()
    return {"live": len(res.data) > 0}


@router.post("", status_code=201)
async def create_match(body: MatchCreate, _admin=Depends(require_admin)):
    """Crée un nouveau match (admin uniquement)."""
    sb = get_supabase()
    res = sb.table("matches").insert({
        "team_home": body.team_home,
        "team_away": body.team_away,
        "start_time": body.start_time,
        "group": body.group,
        "stage": body.stage,
        "status": "pending",
    }).execute()
    return {"success": True, "match": res.data[0] if res.data else None}


@router.put("/{match_id}")
async def update_match(
    match_id: str,
    body: MatchUpdate,
    _admin=Depends(require_admin),
):
    """
    Met à jour le score et/ou le statut d'un match.
    Passer status='finished' déclenche automatiquement le scoring des pronos.
    """
    sb = get_supabase()

    payload = {}
    if body.score_home is not None:
        payload["score_home"] = body.score_home
    if body.score_away is not None:
        payload["score_away"] = body.score_away
    if body.status is not None:
        payload["status"] = body.status

    if not payload:
        return {"success": False, "detail": "Aucun champ à mettre à jour"}

    sb.table("matches").update(payload).eq("id", match_id).execute()

    # Si le match vient d'être marqué "finished", lancer le scoring des pronos
    if body.status == "finished":
        try:
            from app.api.routes.pronos import score_match_pronos
            # Appel direct sans passer par HTTP
            from core.supabase import get_supabase as _sb
            from app.api.routes.pronos import _compute_points

            match_row = sb.table("matches").select(
                "id,status,score_home,score_away,team_home,team_away"
            ).eq("id", match_id).single().execute().data

            if match_row and match_row["status"] == "finished":
                real_h = int(match_row["score_home"] or 0)
                real_a = int(match_row["score_away"] or 0)
                pronos = sb.table("pronostics").select("id,prediction").eq(
                    "match_id", match_id
                ).execute().data

                for p in pronos:
                    pred = p.get("prediction") or {}
                    pts = _compute_points(
                        int(pred.get("score_home", 0)),
                        int(pred.get("score_away", 0)),
                        real_h, real_a,
                    )
                    sb.table("pronostics").update(
                        {"points": pts, "locked": True}
                    ).eq("id", p["id"]).execute()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Auto-scoring failed: {e}")

    return {"success": True}