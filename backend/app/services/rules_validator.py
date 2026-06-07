"""
Validateur de règles métier avant insertion en base.
Vérifie les contraintes Fantasy League :
  - Budget global ≤ 100M
  - Max 3 joueurs par nationalité
  - L'entraîneur ne partage pas la nationalité de ses joueurs
"""

from __future__ import annotations
from typing import Any

# ── Types internes ─────────────────────────────────────────────────────────────

class RuleViolation(Exception):
    """Exception levée lors d'une violation de règle métier."""
    def __init__(self, code: str, message: str, details: dict | None = None):
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


# ── Validation d'un import (texte ou image → liste d'entrées) ─────────────────

def validate_import_batch(entries: list[dict]) -> dict:
    """
    Valide un lot d'entrées parsées par l'IA avant insertion.

    Retourne :
      { "valid": True, "players": [...], "coaches": [...], "warnings": [...] }
    Lève RuleViolation si une règle dure est enfreinte.
    """
    players = [e for e in entries if e.get("position") in ("GK", "DEF", "MID", "FWD")]
    coaches = [e for e in entries if e.get("position") == "COACH"]
    warnings = []

    # 1. Prix valides (accepte float, ex: 4.5)
    for p in players + coaches:
        price = p.get("price")
        if price is None or not isinstance(price, (int, float)) or price < 0:
            p["price"] = 5.0  # prix par défaut
            warnings.append(f"Prix manquant pour {p['name']} → défaut 5M")

    # 2. Nationalité présente
    for entry in players + coaches:
        if not entry.get("nationality"):
            raise RuleViolation(
                "MISSING_NATIONALITY",
                f"Nationalité manquante pour {entry.get('name', '?')}",
            )

    # 3. Poste valide
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
    """
    Valide la composition complète d'une équipe Fantasy.

    Règles :
      - 15 joueurs exactement
      - Budget total ≤ 100M
      - Max 3 joueurs par nationalité
      - L'entraîneur ne peut avoir aucun joueur de sa nationalité

    Retourne { "valid": True, "budget_used": X } ou lève RuleViolation.
    """
    players_by_id = {str(p["id"]): p for p in all_players}
    coaches_by_id = {str(c["id"]): c for c in all_coaches}

    selected = []
    for pid in player_ids:
        p = players_by_id.get(str(pid))
        if not p:
            raise RuleViolation("PLAYER_NOT_FOUND", f"Joueur introuvable : {pid}")
        selected.append(p)

    # Règle 1 : 15 joueurs exactement
    if len(selected) != 15:
        raise RuleViolation(
            "WRONG_SQUAD_SIZE",
            f"L'effectif doit contenir exactement 15 joueurs (actuel : {len(selected)})",
            {"count": len(selected)},
        )

    # Règle 2 : Budget ≤ 100M
    budget_used = sum(float(p.get("price", 0)) for p in selected)
    if coach_id:
        coach = coaches_by_id.get(str(coach_id))
        if coach:
            budget_used += float(coach.get("price", 0))
    if budget_used > 100:
        raise RuleViolation(
            "BUDGET_EXCEEDED",
            f"Budget dépassé : {budget_used:.1f}M > 100M",
            {"budget_used": budget_used, "limit": 100},
        )

    # Règle 3 : Max 3 joueurs par nationalité
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

    # Règle 4 : Entraîneur ≠ nationalité des joueurs
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
    """
    Valide l'ajout d'un seul joueur à une équipe en cours de construction.
    Vérifie uniquement la limite par nationalité (3 max).
    """
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