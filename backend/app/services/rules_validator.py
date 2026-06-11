"""
Validateur de règles métier avant insertion en base.
"""

from __future__ import annotations
from typing import Any


class RuleViolation(Exception):
    def __init__(self, code: str, message: str, details: dict | None = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _parse_price(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(',', '.').replace('M', '').replace('m', '').strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def validate_import_batch(entries: list[dict]) -> dict:
    players = [e for e in entries if e.get("position") in ("GK", "DEF", "MID", "FWD")]
    coaches = [e for e in entries if e.get("position") == "COACH"]
    warnings = []

    for p in players + coaches:
        price = _parse_price(p.get("price"))
        if price is None or price < 0:
            p["price"] = 5.0
            warnings.append(f"Prix manquant/invalide pour {p.get('name', '?')} → défaut 5M")
        elif price < 4:
            p["price"] = 4.0
            warnings.append(f"Prix trop bas pour {p.get('name', '?')} → ajusté à 4M")
        elif price > 12:
            p["price"] = 12.0
            warnings.append(f"Prix trop élevé pour {p.get('name', '?')} → plafonné à 12M")
        else:
            p["price"] = round(price, 1)

    for entry in players + coaches:
        if not entry.get("nationality"):
            raise RuleViolation(
                "MISSING_NATIONALITY",
                f"Nationalité manquante pour {entry.get('name', '?')}",
            )

    valid_positions = {"GK", "DEF", "MID", "FWD", "COACH"}
    for entry in entries:
        if entry.get("position") not in valid_positions:
            raise RuleViolation(
                "INVALID_POSITION",
                f"Poste invalide '{entry.get('position')}' pour {entry.get('name', '?')}",
            )

    return {
        "valid": True,
        "players": players,
        "coaches": coaches,
        "warnings": warnings,
    }


def validate_fantasy_team(
    player_ids: list[str],
    coach_id: str | None,
    all_players: list[dict],
    all_coaches: list[dict],
) -> dict:
    players_by_id = {str(p["id"]): p for p in all_players}
    coaches_by_id = {str(c["id"]): c for c in all_coaches}

    selected = []
    for pid in player_ids:
        p = players_by_id.get(str(pid))
        if not p:
            raise RuleViolation("PLAYER_NOT_FOUND", f"Joueur introuvable : {pid}")
        selected.append(p)

    if len(selected) != 15:
        raise RuleViolation(
            "WRONG_SQUAD_SIZE",
            f"L'effectif doit contenir exactement 15 joueurs (actuel : {len(selected)})",
            {"count": len(selected)},
        )

    budget_used = sum(float(p.get("price", 0)) for p in selected)
    if coach_id:
        coach = coaches_by_id.get(str(coach_id))
        if coach:
            budget_used += float(coach.get("price", 0))
    if budget_used > 105:
        raise RuleViolation(
            "BUDGET_EXCEEDED",
            f"Budget dépassé : {budget_used:.1f}M > 105M",
            {"budget_used": budget_used, "limit": 105},
        )

    nat_count: dict[str, int] = {}
    for p in selected:
        nat = p.get("nationality", "")
        nat_count[nat] = nat_count.get(nat, 0) + 1
    violations = {nat: cnt for nat, cnt in nat_count.items() if cnt > 3}
    if violations:
        details = ", ".join(f"{nat}: {cnt}" for nat, cnt in violations.items())
        raise RuleViolation(
            "NATIONALITY_LIMIT",
            f"Max 3 joueurs par nation dépassé → {details}",
            {"violations": violations},
        )

    if coach_id:
        coach = coaches_by_id.get(str(coach_id))
        if not coach:
            raise RuleViolation("COACH_NOT_FOUND", f"Entraîneur introuvable : {coach_id}")
        coach_nat = coach.get("nationality", "")
        player_nats = {p.get("nationality", "") for p in selected}
        if coach_nat in player_nats:
            raise RuleViolation(
                "COACH_NATIONALITY_CONFLICT",
                f"L'entraîneur ({coach['name']}, {coach_nat}) ne peut pas diriger des joueurs de sa nationalité",
                {"coach_nationality": coach_nat},
            )

    return {"valid": True, "budget_used": round(budget_used, 1)}


def validate_single_player(player: dict, existing_team_players: list[dict]) -> dict:
    player_nat = player.get("nationality", "")
    count = sum(
        1 for p in existing_team_players if p.get("nationality") == player_nat
    )
    if count >= 3:
        raise RuleViolation(
            "NATIONALITY_LIMIT",
            f"Limite de 3 joueurs par nation atteinte pour {player_nat}",
            {"nationality": player_nat, "current_count": count},
        )
    return {"valid": True}