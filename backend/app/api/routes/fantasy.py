import logging
from typing import Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.auto_fill import auto_fill_team
from app.services.rules_validator import RuleViolation, validate_fantasy_team
from app.services.sync import invalidate_user
from core.security import get_current_user
from core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/fantasy", tags=["fantasy"])


def _get_or_create_default_league(sb) -> str:
    res = sb.table("leagues").select("id").limit(1).execute()
    if res.data:
        return str(res.data[0]["id"])

    admin = sb.table("users").select("id").eq("role", "admin").limit(1).execute()
    if not admin.data:
        raise HTTPException(
            status_code=400,
            detail="Aucune ligue disponible. Un administrateur doit être enregistré d'abord.",
        )

    new_league = sb.table("leagues").insert({
        "name": "Ligue Générale — Boulzazen 2026",
        "owner_id": admin.data[0]["id"],
        "description": "La ligue officielle Fantasy Boulzazen — Coupe du Monde 2026",
    }).execute()
    return str(new_league.data[0]["id"])


class SaveTeamRequest(BaseModel):
    name: str = "Ma Sélection"
    formation: str = "4-3-3"
    slots: Dict[str, Optional[str]]
    coach_id: Optional[str] = None
    captain_id: Optional[str] = None


class AutoFillRequest(BaseModel):
    formation: str = "4-3-3"
    budget: int = 100


@router.get("/my-team")
async def get_my_team(user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("fantasy_teams").select("*").eq("user_id", user["sub"]).limit(1).execute()

    if not res.data:
        return {"team": None}

    team = res.data[0]
    meta = team.get("players") or {}

    raw_slots: dict = meta.get("slots", {})
    player_ids = [v for v in raw_slots.values() if v]
    players_data: dict[str, dict] = {}
    if player_ids:
        pres = sb.table("players").select("*").in_("id", player_ids).execute()
        players_data = {str(p["id"]): p for p in pres.data}

    coach_data = None
    if team.get("coach_id"):
        cres = (
            sb.table("coaches")
            .select("*")
            .eq("id", team["coach_id"])
            .limit(1)
            .execute()
        )
        if cres.data:
            coach_data = cres.data[0]

    return {
        "team": {
            **team,
            "players_data": players_data,
            "coach": coach_data,
        }
    }


@router.post("/save")
async def save_team(body: SaveTeamRequest, user=Depends(get_current_user)):
    sb = get_supabase()

    player_ids = [v for v in body.slots.values() if v]
    budget_used = 0

    if player_ids:
        all_players = sb.table("players").select("*").execute().data
        all_coaches = sb.table("coaches").select("*").execute().data

        try:
            validation = validate_fantasy_team(
                player_ids=player_ids,
                coach_id=body.coach_id,
                all_players=all_players,
                all_coaches=all_coaches,
            )
            budget_used = validation["budget_used"]
        except RuleViolation as e:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "RULE_VIOLATION",
                    "code": e.code,
                    "message": e.message,
                    "details": e.details,
                },
            )

    league_id = _get_or_create_default_league(sb)

    team_payload = {
        "user_id": user["sub"],
        "league_id": league_id,
        "name": body.name,
        "players": {
            "formation": body.formation,
            "slots": body.slots,
            "captain_id": body.captain_id,
        },
        "coach_id": body.coach_id or None,
        "budget_used": budget_used,
        "locked": False,
    }

    existing = (
        sb.table("fantasy_teams")
        .select("id")
        .eq("user_id", user["sub"])
        .limit(1)
        .execute()
    )

    if existing.data:
        res = (
            sb.table("fantasy_teams")
            .update(team_payload)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        res = sb.table("fantasy_teams").insert(team_payload).execute()

    logger.info(f"Team saved for user {user['sub']} — budget_used={budget_used}")
    invalidate_user(user["sub"])

    return {
        "success": True,
        "budget_used": budget_used,
        "team_id": res.data[0]["id"] if res.data else None,
    }


@router.post("/auto-fill")
async def auto_fill(body: AutoFillRequest, user=Depends(get_current_user)):
    sb = get_supabase()
    all_players = sb.table("players").select("*").execute().data
    all_coaches = sb.table("coaches").select("*").execute().data

    if not all_players:
        raise HTTPException(
            status_code=400,
            detail="Aucun joueur disponible. L'administrateur doit d'abord peupler la base.",
        )

    result = auto_fill_team(
        formation=body.formation,
        all_players=all_players,
        all_coaches=all_coaches,
        budget=body.budget,
        nationality_limit=3,
    )

    if result["players_found"] < 15:
        raise HTTPException(
            status_code=400,
            detail=f"Pas assez de joueurs disponibles : {result['players_found']}/{result['players_needed']}. "
                   "Importez plus de joueurs via le panneau Admin.",
        )

    return {
        "success": True,
        "formation": result["formation"],
        "slots": result["slots"],
        "coach": result["coach"],
        "budget_used": result["budget_used"],
        "players_found": result["players_found"],
        "players_needed": result["players_needed"],
    }