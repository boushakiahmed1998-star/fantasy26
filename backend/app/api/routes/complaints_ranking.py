"""
Routes Réclamations & Classement — Fantasy Boulzazen
======================================================
Réclamations :
  POST  /api/v1/complaints              → soumettre une réclamation
  GET   /api/v1/complaints/my           → mes réclamations
  GET   /api/v1/admin/complaints        → liste admin (toutes)
  PUT   /api/v1/admin/complaints/{id}   → répondre / changer le statut

Classement :
  GET   /api/v1/ranking                 → classement fantasy + pronos combinés
  GET   /api/v1/ranking/pronos          → classement pronostics seul
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from core.security import get_current_user, require_admin
from core.supabase import get_supabase

logger = logging.getLogger(__name__)

# ── Routeurs séparés ────────────────────────────────────────────────────────────

complaints_router = APIRouter(prefix="/complaints", tags=["complaints"])
admin_complaints_router = APIRouter(prefix="/admin/complaints", tags=["admin"])
ranking_router = APIRouter(prefix="/ranking", tags=["ranking"])


# ── Schémas ────────────────────────────────────────────────────────────────────

class ComplaintRequest(BaseModel):
    match_id: str
    reason: str
    description: Optional[str] = None


class ComplaintResolveRequest(BaseModel):
    status: str  # "approved" | "rejected"
    admin_response: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
#  RÉCLAMATIONS — Utilisateurs
# ══════════════════════════════════════════════════════════════════════════════

@complaints_router.post("", status_code=status.HTTP_201_CREATED)
async def submit_complaint(body: ComplaintRequest, user=Depends(get_current_user)):
    """Soumet une réclamation sur un match."""
    sb = get_supabase()

    # Vérifier que le match existe
    m = sb.table("matches").select("id,team_home,team_away,status").eq("id", body.match_id).single().execute()
    if not m.data:
        raise HTTPException(status_code=404, detail="Match introuvable")

    if m.data["status"] == "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Impossible de réclamer sur un match qui n'a pas encore eu lieu"
        )

    # Une seule réclamation par (user, match)
    existing = (
        sb.table("complaints")
        .select("id,status")
        .eq("user_id", user["sub"])
        .eq("match_id", body.match_id)
        .execute()
        .data
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vous avez déjà soumis une réclamation pour ce match"
        )

    res = sb.table("complaints").insert({
        "user_id": user["sub"],
        "match_id": body.match_id,
        "reason": body.reason,
        "description": body.description or "",
        "status": "pending",
    }).execute()

    return {
        "success": True,
        "complaint_id": res.data[0]["id"] if res.data else None,
        "match": f"{m.data['team_home']} vs {m.data['team_away']}",
    }


@complaints_router.get("/my")
async def my_complaints(user=Depends(get_current_user)):
    """Retourne toutes les réclamations de l'utilisateur."""
    sb = get_supabase()

    rows = (
        sb.table("complaints")
        .select("*")
        .eq("user_id", user["sub"])
        .order("created_at", desc=True)
        .execute()
        .data
    )

    if not rows:
        return {"complaints": []}

    match_ids = list({str(r["match_id"]) for r in rows})
    matches = (
        sb.table("matches")
        .select("id,team_home,team_away,score_home,score_away,status")
        .in_("id", match_ids)
        .execute()
        .data
    )
    match_map = {str(m["id"]): m for m in matches}

    return {
        "complaints": [
            {**r, "match": match_map.get(str(r["match_id"]), {})}
            for r in rows
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
#  RÉCLAMATIONS — Admin
# ══════════════════════════════════════════════════════════════════════════════

@admin_complaints_router.get("")
async def list_all_complaints(
    complaint_status: Optional[str] = None,
    _admin=Depends(require_admin),
):
    """Liste toutes les réclamations, optionnellement filtrées par statut."""
    sb = get_supabase()

    query = sb.table("complaints").select("*").order("created_at", desc=True)
    if complaint_status:
        query = query.eq("status", complaint_status)

    rows = query.execute().data

    if not rows:
        return {"complaints": [], "total": 0}

    # Enrichir avec match + username
    match_ids = list({str(r["match_id"]) for r in rows})
    user_ids = list({str(r["user_id"]) for r in rows})

    matches = (
        sb.table("matches")
        .select("id,team_home,team_away,score_home,score_away,status")
        .in_("id", match_ids)
        .execute()
        .data
    )
    users = (
        sb.table("users")
        .select("id,username")
        .in_("id", user_ids)
        .execute()
        .data
    )

    match_map = {str(m["id"]): m for m in matches}
    user_map = {str(u["id"]): u["username"] for u in users}

    return {
        "complaints": [
            {
                **r,
                "match": match_map.get(str(r["match_id"]), {}),
                "username": user_map.get(str(r["user_id"]), "?"),
            }
            for r in rows
        ],
        "total": len(rows),
    }


@admin_complaints_router.put("/{complaint_id}")
async def resolve_complaint(
    complaint_id: str,
    body: ComplaintResolveRequest,
    _admin=Depends(require_admin),
):
    """Résout une réclamation (approuve ou rejette)."""
    if body.status not in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le statut doit être 'approved' ou 'rejected'"
        )

    sb = get_supabase()

    existing = sb.table("complaints").select("id").eq("id", complaint_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="Réclamation introuvable")

    from datetime import datetime, timezone
    sb.table("complaints").update({
        "status": body.status,
        "admin_response": body.admin_response or "",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", complaint_id).execute()

    return {"success": True, "complaint_id": complaint_id, "new_status": body.status}


# ══════════════════════════════════════════════════════════════════════════════
#  CLASSEMENT
# ══════════════════════════════════════════════════════════════════════════════

@ranking_router.get("")
async def get_ranking(_user=Depends(get_current_user)):
    """
    Classement combiné : points Fantasy + points Pronostics.
    Retourne aussi le rang de l'utilisateur connecté.
    Trié par total décroissant.
    """
    sb = get_supabase()

    # Points fantasy
    teams = (
        sb.table("fantasy_teams")
        .select("user_id,name,points")
        .order("points", desc=True)
        .execute()
        .data
    )

    # Points pronostics agrégés par user
    all_pronos = sb.table("pronostics").select("user_id,points").execute().data
    prono_pts: dict[str, int] = {}
    for p in all_pronos:
        uid = str(p["user_id"])
        prono_pts[uid] = prono_pts.get(uid, 0) + int(p.get("points") or 0)

    # Tous les users pour récupérer les usernames
    all_user_ids = list({str(t["user_id"]) for t in teams} | set(prono_pts.keys()))
    users_res = (
        sb.table("users")
        .select("id,username")
        .in_("id", all_user_ids)
        .execute()
        .data
    ) if all_user_ids else []
    user_map = {str(u["id"]): u["username"] for u in users_res}

    # Construction du classement
    team_map = {str(t["user_id"]): t for t in teams}
    all_uid = sorted(all_user_ids, key=lambda uid: -(
        int((team_map.get(uid) or {}).get("points") or 0) + prono_pts.get(uid, 0)
    ))

    ranking = []
    for rank, uid in enumerate(all_uid, 1):
        t = team_map.get(uid, {})
        fantasy_pts = int((t.get("points") or 0))
        p_pts = prono_pts.get(uid, 0)
        ranking.append({
            "rank": rank,
            "user_id": uid,
            "username": user_map.get(uid, "?"),
            "team_name": t.get("name", "—"),
            "fantasy_points": fantasy_pts,
            "prono_points": p_pts,
            "total_points": fantasy_pts + p_pts,
        })

    return {"ranking": ranking, "total": len(ranking)}


@ranking_router.get("/pronos")
async def get_prono_ranking(_user=Depends(get_current_user)):
    """Classement pronostics uniquement."""
    sb = get_supabase()

    all_pronos = sb.table("pronostics").select("user_id,points").execute().data
    prono_pts: dict[str, int] = {}
    for p in all_pronos:
        uid = str(p["user_id"])
        prono_pts[uid] = prono_pts.get(uid, 0) + int(p.get("points") or 0)

    if not prono_pts:
        return {"ranking": []}

    users_res = (
        sb.table("users")
        .select("id,username")
        .in_("id", list(prono_pts.keys()))
        .execute()
        .data
    )
    user_map = {str(u["id"]): u["username"] for u in users_res}

    ranking = sorted(
        [
            {"user_id": uid, "username": user_map.get(uid, "?"), "points": pts}
            for uid, pts in prono_pts.items()
        ],
        key=lambda x: -x["points"],
    )
    for i, row in enumerate(ranking):
        row["rank"] = i + 1

    return {"ranking": ranking}