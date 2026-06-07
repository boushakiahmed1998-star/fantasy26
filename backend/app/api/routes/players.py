"""
Routes Players & Coaches — Fantasy Boulzazen
GET /api/v1/players  → liste complète avec filtres (position, team, nationality, search)
GET /api/v1/coaches  → liste des entraîneurs
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from core.security import get_current_user
from core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["players"])


@router.get("/players")
async def list_players(
    position: Optional[str] = Query(None, description="GK | DEF | MID | FWD | ALL"),
    team: Optional[str] = Query(None),
    nationality: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Recherche par nom"),
    _user=Depends(get_current_user),
):
    """
    Retourne la liste des joueurs avec filtres optionnels.
    Si position=ALL ou None → tous les postes.
    """
    sb = get_supabase()
    query = (
        sb.table("players")
        .select("*")
        .order("team")
        .order("position")
        .order("name")
    )

    if position and position not in ("ALL", "all"):
        query = query.eq("position", position)
    if team:
        query = query.eq("team", team)
    if nationality:
        query = query.eq("nationality", nationality)
    if search and search.strip():
        query = query.ilike("name", f"%{search.strip()}%")

    result = query.execute()
    return {"players": result.data, "total": len(result.data)}


@router.get("/coaches")
async def list_coaches(
    search: Optional[str] = Query(None),
    _user=Depends(get_current_user),
):
    """Retourne tous les entraîneurs disponibles."""
    sb = get_supabase()
    query = sb.table("coaches").select("*").order("name")
    if search and search.strip():
        query = query.ilike("name", f"%{search.strip()}%")
    result = query.execute()
    return {"coaches": result.data, "total": len(result.data)}