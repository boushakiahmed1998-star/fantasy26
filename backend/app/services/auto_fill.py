"""
Service Auto-Fill — Génère une équipe Fantasy de 15 joueurs + 1 entraîneur valide.

Algorithme :
  1. Calcul des slots requis selon la formation (11 titulaires + 4 banc)
  2. Tri des joueurs par prix décroissant (proxy de qualité avant stats réelles)
  3. Sélection greedy : premier joueur valide par slot
     → Contraintes : budget restant, max 3/nationalité, pas de doublon
  4. Entraîneur : nationalité différente de tous les joueurs sélectionnés
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)

# ── Configurations des formations ─────────────────────────────────────────────

FORMATION_STARTERS: dict[str, dict[str, int]] = {
    "4-3-3":   {"GK": 1, "DEF": 4, "MID": 3, "FWD": 3},
    "4-4-2":   {"GK": 1, "DEF": 4, "MID": 4, "FWD": 2},
    "3-5-2":   {"GK": 1, "DEF": 3, "MID": 5, "FWD": 2},
    "4-2-3-1": {"GK": 1, "DEF": 4, "MID": 5, "FWD": 1},
    "3-4-3":   {"GK": 1, "DEF": 3, "MID": 4, "FWD": 3},
    "5-3-2":   {"GK": 1, "DEF": 5, "MID": 3, "FWD": 2},
    "5-4-1":   {"GK": 1, "DEF": 5, "MID": 4, "FWD": 1},
}

# Banc toujours : 1 GK + 1 DEF + 1 MID + 1 FWD = 4 joueurs
BENCH_POSITIONS = ["GK", "DEF", "MID", "FWD"]


def _build_slot_requirements(formation: str) -> list[tuple[str, str]]:
    """
    Retourne la liste ordonnée de (slot_id, position) pour 15 joueurs.
    Starters en premier, puis banc (BENCH_0 à BENCH_3).
    """
    config = FORMATION_STARTERS.get(formation, FORMATION_STARTERS["4-3-3"])
    slots: list[tuple[str, str]] = []

    for pos in ["GK", "DEF", "MID", "FWD"]:
        count = config.get(pos, 0)
        for i in range(count):
            slots.append((f"{pos}_{i}", pos))

    for i, pos in enumerate(BENCH_POSITIONS):
        slots.append((f"BENCH_{i}", pos))

    return slots  # 15 slots exactement


def auto_fill_team(
    formation: str,
    all_players: list[dict],
    all_coaches: list[dict],
    budget: int = 100,
    nationality_limit: int = 3,
) -> dict:
    """
    Génère une équipe complète de 15 joueurs + coach en respectant toutes les règles.

    Returns:
        {
          "formation": str,
          "slots": { slot_id: player_dict | None },
          "coach": coach_dict | None,
          "budget_used": int,
          "players_found": int,
          "players_needed": int,
        }
    """
    required_slots = _build_slot_requirements(formation)

    # Tri par prix décroissant (best first) comme proxy de qualité
    players_pool = sorted(all_players, key=lambda p: -(p.get("price") or 0))

    selected_slots: dict[str, dict] = {}
    selected_ids: set[str] = set()
    nat_count: dict[str, int] = {}
    remaining_budget = float(budget)

    for slot_id, position in required_slots:
        candidates = [
            p for p in players_pool
            if p.get("position") == position and str(p["id"]) not in selected_ids
        ]

        for player in candidates:
            nat = player.get("nationality", "")
            price = player.get("price", 0) or 0

            if nat_count.get(nat, 0) >= nationality_limit:
                continue
            if price > remaining_budget:
                continue

            selected_slots[slot_id] = player
            selected_ids.add(str(player["id"]))
            nat_count[nat] = nat_count.get(nat, 0) + 1
            remaining_budget -= price
            break

    # Sélection du coach (nationalité absente des joueurs, budget restant)
    player_nationalities = {p.get("nationality", "") for p in selected_slots.values()}
    chosen_coach = None

    coaches_sorted = sorted(all_coaches, key=lambda c: -(c.get("price") or 0))
    for coach in coaches_sorted:
        coach_nat = coach.get("nationality", "")
        coach_price = coach.get("price", 0) or 0
        if coach_nat not in player_nationalities and coach_price <= remaining_budget:
            chosen_coach = coach
            remaining_budget -= coach_price
            break

    budget_used = budget - remaining_budget
    logger.info(
        f"Auto-fill {formation}: {len(selected_slots)}/{len(required_slots)} joueurs, "
        f"coach={'oui' if chosen_coach else 'non'}, budget utilisé={budget_used:.1f}M"
    )

    return {
        "formation": formation,
        "slots": selected_slots,
        "coach": chosen_coach,
        "budget_used": round(budget_used, 1),
        "players_found": len(selected_slots),
        "players_needed": len(required_slots),
    }