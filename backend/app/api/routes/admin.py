"""
Routes Admin — Panneau d'administration Fantasy Boulzazen.
Endpoints :
  POST /api/v1/admin/import-players  → IA parse texte ou image → JSON
  POST /api/v1/admin/confirm-import  → valide et insère en BDD
  GET  /api/v1/admin/players         → liste tous les joueurs
  GET  /api/v1/admin/coaches         → liste tous les entraîneurs
  DELETE /api/v1/admin/players/{id}  → supprime un joueur
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.services.ai_parser import parse_auto
from app.services.rules_validator import RuleViolation, validate_import_batch
from core.security import require_admin
from core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schémas ────────────────────────────────────────────────────────────────────

class PlayerEntry(BaseModel):
    name: str
    nationality: str
    position: str  # GK | DEF | MID | FWD
    team: str
    price: int
    age: Optional[int] = None
    jersey_number: Optional[int] = None


class CoachEntry(BaseModel):
    name: str
    nationality: str
    team: str
    price: int
    age: Optional[int] = None


class ConfirmImportRequest(BaseModel):
    players: list[PlayerEntry] = []
    coaches: list[CoachEntry] = []


# ── Endpoint 1 : Parse IA ──────────────────────────────────────────────────────

@router.post("/import-players")
async def import_players_via_ai(
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    _admin=Depends(require_admin),
):
    """
    Reçoit du texte OU une image.
    - Image → Gemini Vision (OCR + extraction)
    - Texte → Groq LLaMA (extraction)
    Retourne { type, data[], warnings[] } pour validation côté front.
    """
    if not text and not image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fournissez du texte ou une image.",
        )

    try:
        image_bytes = None
        mime_type = "image/jpeg"

        if image:
            image_bytes = await image.read()
            mime_type = image.content_type or "image/jpeg"
            logger.info(f"Image reçue : {image.filename} ({len(image_bytes)} bytes)")

        raw_result = parse_auto(text=text, image_bytes=image_bytes, mime_type=mime_type)

        # Validation des règles métier sur le lot
        entries = raw_result.get("data", [])
        validated = validate_import_batch(entries)

        return {
            "type": raw_result.get("type", "mixed"),
            "source_info": raw_result.get("source_info", ""),
            "players": validated["players"],
            "coaches": validated["coaches"],
            "warnings": validated["warnings"],
            "total": len(entries),
        }

    except RuleViolation as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "RULE_VIOLATION", "code": e.code, "message": e.message, "details": e.details},
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in import_players_via_ai: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# ── Endpoint 2 : Confirm & Insert ─────────────────────────────────────────────

@router.post("/confirm-import", status_code=status.HTTP_201_CREATED)
async def confirm_import(
    body: ConfirmImportRequest,
    _admin=Depends(require_admin),
):
    """
    Insère les joueurs et entraîneurs validés dans Supabase.
    Gère les doublons via upsert sur (name, nationality).
    """
    sb = get_supabase()
    inserted_players = 0
    inserted_coaches = 0
    errors = []

    # Insérer les joueurs
    for p in body.players:
        try:
            sb.table("players").upsert(
                {
                    "name": p.name,
                    "nationality": p.nationality,
                    "position": p.position,
                    "team": p.team,
                    "price": p.price,
                    "stats": {"age": p.age, "jersey_number": p.jersey_number},
                },
                on_conflict="name,nationality",
            ).execute()
            inserted_players += 1
        except Exception as e:
            logger.error(f"Error inserting player {p.name}: {e}")
            errors.append(f"Joueur {p.name}: {str(e)[:100]}")

    # Insérer les entraîneurs
    for c in body.coaches:
        try:
            sb.table("coaches").upsert(
                {
                    "name": c.name,
                    "nationality": c.nationality,
                    "team": c.team,
                    "price": c.price,
                    "forbidden_players_nationality": [c.nationality],
                },
                on_conflict="name,nationality",
            ).execute()
            inserted_coaches += 1
        except Exception as e:
            logger.error(f"Error inserting coach {c.name}: {e}")
            errors.append(f"Entraîneur {c.name}: {str(e)[:100]}")

    return {
        "success": True,
        "inserted_players": inserted_players,
        "inserted_coaches": inserted_coaches,
        "errors": errors,
    }


# ── Endpoint 3 : Lister les joueurs ───────────────────────────────────────────

@router.get("/players")
async def list_players(
    team: Optional[str] = None,
    position: Optional[str] = None,
    _admin=Depends(require_admin),
):
    sb = get_supabase()
    query = sb.table("players").select("*").order("team").order("position").order("name")
    if team:
        query = query.eq("team", team)
    if position:
        query = query.eq("position", position)
    result = query.execute()
    return {"players": result.data, "total": len(result.data)}


# ── Endpoint 4 : Lister les entraîneurs ───────────────────────────────────────

@router.get("/coaches")
async def list_coaches(_admin=Depends(require_admin)):
    sb = get_supabase()
    result = sb.table("coaches").select("*").order("team").execute()
    return {"coaches": result.data, "total": len(result.data)}


# ── Endpoint 5 : Supprimer un joueur ──────────────────────────────────────────

@router.delete("/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_player(player_id: str, _admin=Depends(require_admin)):
    sb = get_supabase()
    sb.table("players").delete().eq("id", player_id).execute()


# ── Endpoint 6 : Supprimer un entraîneur ──────────────────────────────────────

@router.delete("/coaches/{coach_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coach(coach_id: str, _admin=Depends(require_admin)):
    sb = get_supabase()
    sb.table("coaches").delete().eq("id", coach_id).execute()


# ── Endpoint 7 : Stats rapides ────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(_admin=Depends(require_admin)):
    sb = get_supabase()
    players = sb.table("players").select("id, position, team").execute()
    coaches = sb.table("coaches").select("id").execute()
    users = sb.table("users").select("id").execute()

    positions = {}
    teams = set()
    for p in players.data:
        positions[p["position"]] = positions.get(p["position"], 0) + 1
        teams.add(p["team"])

    return {
        "total_players": len(players.data),
        "total_coaches": len(coaches.data),
        "total_users": len(users.data),
        "positions": positions,
        "teams_count": len(teams),
    }