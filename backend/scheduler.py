"""
Scheduler — Fantasy Boulzazen
==============================
Tâches périodiques :
  • Toutes les 2 min  → scrape les matchs live
    + détecte les matchs qui viennent de passer en "finished"
    + calcule automatiquement leurs points
  • Toutes les 5 min  → filet de sécurité : recalcule les matchs
    terminés sans points_history

Fix vs version précédente :
  - job_live() note les IDs "live" AVANT le scrape,
    puis calcule les points pour ceux qui sont passés "finished"
    pendant le scrape (= match venant de se terminer).
  - On évite un double-calcul grâce au check points_history.
"""

import schedule
import time
import asyncio
import logging

from app.services.scraper import scrape_live_matches
from app.services.points_engine import save_match_points
from core.supabase import get_supabase

logger = logging.getLogger(__name__)


def job_live() -> None:
    """
    1. Mémorise les IDs currently-live.
    2. Lance le scrape (met à jour scores + statuts en BDD).
    3. Pour chaque match qui vient de passer 'finished', calcule les points.
    """
    sb = get_supabase()

    # Snapshot avant scrape
    try:
        live_before: set[str] = {
            str(r["id"])
            for r in sb.table("matches").select("id").eq("status", "live").execute().data
        }
    except Exception as e:
        logger.error(f"job_live – impossible de lire les matchs live : {e}")
        return

    # Scrape (met à jour statuts)
    try:
        asyncio.run(scrape_live_matches())
    except Exception as e:
        logger.error(f"job_live – scrape_live_matches a échoué : {e}")

    if not live_before:
        return

    # Matchs qui viennent de terminer
    try:
        now_finished = [
            str(r["id"])
            for r in sb.table("matches")
            .select("id")
            .eq("status", "finished")
            .in_("id", list(live_before))
            .execute()
            .data
        ]
    except Exception as e:
        logger.error(f"job_live – vérification post-scrape : {e}")
        return

    if not now_finished:
        return

    try:
        already_scored: set[str] = {
            str(r["match_id"])
            for r in sb.table("points_history").select("match_id").execute().data
        }
    except Exception as e:
        logger.error(f"job_live – lecture points_history : {e}")
        already_scored = set()

    for match_id in now_finished:
        if match_id not in already_scored:
            logger.info(f"job_live → calcul des points pour match {match_id}")
            try:
                save_match_points(match_id)
            except Exception as e:
                logger.error(f"job_live – save_match_points({match_id}) : {e}")


def job_finished() -> None:
    """
    Filet de sécurité : recalcule les matchs 'finished' sans points_history.
    Utile si job_live a raté le créneau.
    """
    sb = get_supabase()
    try:
        done = sb.table("matches").select("id").eq("status", "finished").execute().data
        already = {
            str(r["match_id"])
            for r in sb.table("points_history").select("match_id").execute().data
        }
        pending = [str(m["id"]) for m in done if str(m["id"]) not in already]
        if pending:
            logger.info(f"job_finished → {len(pending)} match(s) sans points à calculer")
        for match_id in pending:
            try:
                save_match_points(match_id)
            except Exception as e:
                logger.error(f"job_finished – save_match_points({match_id}) : {e}")
    except Exception as e:
        logger.error(f"job_finished – erreur : {e}")


# ── Planification ──────────────────────────────────────────────────────────────
schedule.every(2).minutes.do(job_live)
schedule.every(5).minutes.do(job_finished)

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    logger.info("Scheduler démarré (live:2min / safety-net:5min)")
    while True:
        schedule.run_pending()
        time.sleep(10)