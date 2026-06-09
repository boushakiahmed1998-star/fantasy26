"""
Points Engine — Fantasy Boulzazen
===================================
Calcule les points fantasy d'un joueur à partir de ses stats de match
et met à jour points_history + fantasy_teams.points dans Supabase.

Barème (configurable via SCORING_RULES) :
  Buts     : FWD/MID +5 | DEF +6 | GK +10
  Passes   : +3 pts
  Clean sheet : GK/DEF +4 | MID +1 (si 60+ min)
  Temps    : 0–59 min +1 | 60+ min +2
  Carton J : -1 | Carton R : -3
  Arrêts   : +1 par tranche de 3 (GK)
  Tacles   : +0.5 par tacle (arrondi)
  Penalty concédé : -2
  Penalty obtenu  : +1
  Possession perdue (≥5) : -1

Usage autonome :
  python points_engine.py --match <match_id>
  python points_engine.py --recalculate-all
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass, field
from typing import Optional

from core.supabase import get_supabase

logger = logging.getLogger(__name__)

# ── Barème ─────────────────────────────────────────────────────────────────────

SCORING_RULES = {
    # Buts selon le poste
    "goal": {"GK": 10, "DEF": 6, "MID": 5, "FWD": 5},
    # Passes décisives (flat)
    "assist": 3,
    # Clean sheet (aucun but encaissé, 60+ min de jeu)
    "clean_sheet": {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0},
    # Temps de jeu
    "minutes_60_plus": 2,
    "minutes_1_to_59": 1,
    # Cartons
    "yellow_card": -1,
    "red_card": -3,
    # Arrêts (gardien uniquement, par tranche de 3)
    "saves_per_3": 1,
    # Tacles
    "tackle": 0.5,
    # Penalty
    "penalty_conceded": -2,
    "penalty_won": 1,
    # Perte de balle (≥ 5 dans le match)
    "possession_lost_threshold": 5,
    "possession_lost_penalty": -1,
    # Capitaine (multiplicateur, géré en dehors du moteur)
    "captain_multiplier": 2,
}


# ── Dataclass résultat ─────────────────────────────────────────────────────────

@dataclass
class PlayerPoints:
    player_id: str
    match_id: str
    position: str
    breakdown: dict = field(default_factory=dict)   # détail ligne par ligne
    total: float = 0.0

    def add(self, label: str, pts: float):
        if pts != 0:
            self.breakdown[label] = round(pts, 1)
            self.total += pts

    def as_jsonb(self) -> dict:
        return {"breakdown": self.breakdown, "total": round(self.total, 1)}


# ── Moteur de calcul ───────────────────────────────────────────────────────────

def compute_player_points(stats: dict, position: str) -> PlayerPoints:
    """
    Calcule les points fantasy d'un joueur depuis son dict stats Supabase.

    stats : row de player_match_stats
    position : 'GK' | 'DEF' | 'MID' | 'FWD'
    """
    pos = position.upper()
    r = SCORING_RULES

    result = PlayerPoints(
        player_id=str(stats["player_id"]),
        match_id=str(stats["match_id"]),
        position=pos,
    )

    # ── Temps de jeu ─────────────────────────────────────────────────────────
    minutes = int(stats.get("minutes") or 0)
    if minutes >= 60:
        result.add("time_60+", r["minutes_60_plus"])
    elif minutes >= 1:
        result.add("time_<60", r["minutes_1_to_59"])

    # ── Buts ─────────────────────────────────────────────────────────────────
    goals = int(stats.get("goals") or 0)
    if goals:
        pts_per_goal = r["goal"].get(pos, r["goal"]["FWD"])
        result.add(f"goals×{goals}", goals * pts_per_goal)

    # ── Passes décisives ─────────────────────────────────────────────────────
    assists = int(stats.get("assists") or 0)
    if assists:
        result.add(f"assists×{assists}", assists * r["assist"])

    # ── Clean sheet ──────────────────────────────────────────────────────────
    if stats.get("clean_sheet") and minutes >= 60:
        cs_pts = r["clean_sheet"].get(pos, 0)
        if cs_pts:
            result.add("clean_sheet", cs_pts)

    # ── Arrêts (GK) ──────────────────────────────────────────────────────────
    saves = int(stats.get("saves") or 0)
    if saves and pos == "GK":
        bonus = (saves // 3) * r["saves_per_3"]
        if bonus:
            result.add(f"saves({saves})", bonus)

    # ── Tacles ───────────────────────────────────────────────────────────────
    tackles = int(stats.get("tackles") or 0)
    if tackles:
        result.add(f"tackles×{tackles}", round(tackles * r["tackle"], 1))

    # ── Cartons ──────────────────────────────────────────────────────────────
    yellow = int(stats.get("yellow_cards") or 0)
    red = int(stats.get("red_cards") or 0)
    if yellow:
        result.add("yellow_card", yellow * r["yellow_card"])
    if red:
        result.add("red_card", red * r["red_card"])

    # ── Penalties ────────────────────────────────────────────────────────────
    pen_c = int(stats.get("penalties_conceded") or 0)
    pen_w = int(stats.get("penalties_won") or 0)
    if pen_c:
        result.add(f"pen_conceded×{pen_c}", pen_c * r["penalty_conceded"])
    if pen_w:
        result.add(f"pen_won×{pen_w}", pen_w * r["penalty_won"])

    # ── Pertes de balle ───────────────────────────────────────────────────────
    poss_lost = int(stats.get("possession_lost") or 0)
    if poss_lost >= r["possession_lost_threshold"]:
        result.add("poss_lost", r["possession_lost_penalty"])

    result.total = round(result.total, 1)
    return result


# ── Persistance ────────────────────────────────────────────────────────────────

def save_match_points(match_id: str, dry_run: bool = False) -> dict:
    """
    Calcule et persiste les points de TOUS les joueurs pour un match donné.
    Retourne un résumé {user_id: total_pts_ajoutés}.
    """
    sb = get_supabase()

    # 1. Charger toutes les stats du match
    stats_rows = (
        sb.table("player_match_stats")
        .select("*")
        .eq("match_id", match_id)
        .execute()
        .data
    )
    if not stats_rows:
        logger.warning(f"Aucune stat trouvée pour le match {match_id}")
        return {}

    # 2. Charger les positions des joueurs (une seule requête)
    player_ids = [str(s["player_id"]) for s in stats_rows]
    players_res = (
        sb.table("players")
        .select("id,position")
        .in_("id", player_ids)
        .execute()
        .data
    )
    pos_map = {str(p["id"]): p["position"] for p in players_res}

    # 3. Calculer les points par joueur
    points_by_player: dict[str, PlayerPoints] = {}
    for row in stats_rows:
        pid = str(row["player_id"])
        pos = pos_map.get(pid, "FWD")
        pp = compute_player_points(row, pos)
        points_by_player[pid] = pp
        logger.debug(f"  {pid} ({pos}): {pp.total} pts — {pp.breakdown}")

    if dry_run:
        logger.info(f"[DRY RUN] {len(points_by_player)} joueurs calculés pour match {match_id}")
        return {pid: pp.total for pid, pp in points_by_player.items()}

    # 4. Charger toutes les équipes fantasy qui ont ces joueurs
    #    On cherche dans le JSONB players->slots les player_id concernés
    all_teams = sb.table("fantasy_teams").select("id,user_id,players,coach_id").execute().data

    user_delta: dict[str, float] = {}  # user_id → points gagnés sur ce match

    for team in all_teams:
        meta = team.get("players") or {}
        slots: dict = meta.get("slots", {}) if isinstance(meta, dict) else {}
        captain_id: Optional[str] = meta.get("captain_id") if isinstance(meta, dict) else None

        match_total = 0.0
        team_breakdown: dict[str, dict] = {}

        for _slot, pid in slots.items():
            if not pid or pid not in points_by_player:
                continue
            pp = points_by_player[pid]
            pts = pp.total

            # Bonus capitaine
            if captain_id and str(pid) == str(captain_id):
                pts *= SCORING_RULES["captain_multiplier"]

            match_total += pts
            team_breakdown[pid] = {
                **pp.breakdown,
                "total": round(pts, 1),
                "is_captain": captain_id == pid,
            }

        match_total = round(match_total, 1)

        if match_total == 0:
            continue

        # Insérer / mettre à jour points_history
        existing = (
            sb.table("points_history")
            .select("id,total_points")
            .eq("user_id", team["user_id"])
            .eq("match_id", match_id)
            .execute()
            .data
        )
        history_payload = {
            "user_id": team["user_id"],
            "match_id": match_id,
            "points": team_breakdown,
            "total_points": match_total,
        }
        if existing:
            sb.table("points_history").update(history_payload).eq("id", existing[0]["id"]).execute()
        else:
            sb.table("points_history").insert(history_payload).execute()

        # Mettre à jour le total cumulé de l'équipe
        current_total = _get_team_total(team["user_id"])
        sb.table("fantasy_teams").update({"points": current_total + match_total}).eq("id", team["id"]).execute()

        user_delta[team["user_id"]] = match_total
        logger.info(f"  user {team['user_id']}: +{match_total} pts")

    logger.info(f"Match {match_id} — {len(user_delta)} équipes mises à jour.")
    return user_delta


def _get_team_total(user_id: str) -> float:
    sb = get_supabase()
    rows = (
        sb.table("points_history")
        .select("total_points")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return round(sum(float(r["total_points"] or 0) for r in rows), 1)


def recalculate_all(dry_run: bool = False) -> None:
    """Recalcule les points de tous les matchs terminés."""
    sb = get_supabase()
    finished = (
        sb.table("matches")
        .select("id,team_home,team_away")
        .eq("status", "finished")
        .execute()
        .data
    )
    logger.info(f"{len(finished)} matchs terminés à recalculer.")
    for m in finished:
        logger.info(f"--- {m['team_home']} vs {m['team_away']} ({m['id']})")
        save_match_points(m["id"], dry_run=dry_run)


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Points Engine — Fantasy Boulzazen")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--match", metavar="MATCH_ID", help="Calculer les points d'un match")
    group.add_argument("--recalculate-all", action="store_true", help="Recalculer tous les matchs terminés")
    parser.add_argument("--dry-run", action="store_true", help="Ne pas écrire en base")
    args = parser.parse_args()

    if args.match:
        result = save_match_points(args.match, dry_run=args.dry_run)
        print(f"\nRésultat : {len(result)} utilisateur(s) mis à jour")
        for uid, pts in result.items():
            print(f"  {uid}: +{pts} pts")
    else:
        recalculate_all(dry_run=args.dry_run)