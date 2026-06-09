"""
Scraper Sofascore — Fantasy Boulzazen
=======================================
Récupère les stats des joueurs après chaque match via Playwright.
Gère le lazy-load / SPA de Sofascore et insère dans player_match_stats.

Usage :
  python scraper.py --match-sofascore <sofascore_event_id>
  python scraper.py --live          # scrape tous les matchs "live" en BDD
  python scraper.py --finished      # scrape tous les matchs terminés sans stats

Dépendances : playwright, beautifulsoup4
  playwright install chromium   (une fois)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Optional

import argparse

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from app.config import settings
from core.supabase import get_supabase

logger = logging.getLogger(__name__)

BASE_URL = "https://www.sofascore.com"
TIMEOUT_MS = settings.SCRAPER_TIMEOUT          # 3000 ms par défaut
NAVIGATION_TIMEOUT = 20_000                    # 20 s pour la navigation complète

# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize_name(name: str) -> str:
    """Normalise un nom pour la comparaison."""
    return name.lower().strip()


def _int(val, default=0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _bool(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).lower() in ("true", "1", "yes", "oui")


# ── Sofascore API JSON (interne) ───────────────────────────────────────────────

async def fetch_event_stats(page: Page, event_id: str) -> list[dict]:
    """
    Sofascore expose ses données via une API interne JSON.
    On intercepte les requêtes réseau pour récupérer le payload brut
    plutôt que de parser le DOM (plus robuste aux changements CSS).
    """
    collected: list[dict] = []

    async def handle_response(response):
        url = response.url
        # L'endpoint stats ressemble à : /api/v1/event/<id>/lineups
        if f"/api/v1/event/{event_id}/lineups" in url and response.status == 200:
            try:
                data = await response.json()
                collected.append(data)
            except Exception:
                pass

    page.on("response", handle_response)

    match_url = f"{BASE_URL}/fr/match/_/_/{event_id}#id:{event_id}"
    logger.info(f"Navigation → {match_url}")
    await page.goto(match_url, timeout=NAVIGATION_TIMEOUT, wait_until="domcontentloaded")

    # Attendre le chargement lazy du contenu principal
    try:
        await page.wait_for_selector('[data-testid="lineup_container"]', timeout=TIMEOUT_MS)
    except PWTimeout:
        logger.warning("Selector lineup_container non trouvé, tentative API directe.")

    # Délai pour laisser les requêtes XHR se terminer
    await asyncio.sleep(1.5)

    # Fallback : appel direct à l'API interne si l'interception a raté
    if not collected:
        api_url = f"https://api.sofascore.com/api/v1/event/{event_id}/lineups"
        resp = await page.evaluate(
            f"""async () => {{
              const r = await fetch('{api_url}', {{
                headers: {{'x-requested-with': 'XMLHttpRequest'}}
              }});
              return r.ok ? r.json() : null;
            }}"""
        )
        if resp:
            collected.append(resp)

    return collected


def _parse_lineups_payload(payload: dict) -> list[dict]:
    """
    Extrait une liste de dicts normalisés depuis le payload /lineups Sofascore.
    Retourne : [{name, position, minutes, goals, assists, yellow_cards,
                 red_cards, saves, tackles, rating, ...}, ...]
    """
    players: list[dict] = []

    for side in ("home", "away"):
        team_data = payload.get(side, {})
        for player_entry in team_data.get("players", []):
            p = player_entry.get("player", {})
            stats = player_entry.get("statistics", {})

            # Déduction du clean sheet : 0 buts encaissés côté adverse
            # (simplifié — le moteur de points raffinera via score_home/away)
            minutes = _int(stats.get("minutesPlayed", stats.get("minutePlayed")))

            entry = {
                "sofascore_id": str(p.get("id", "")),
                "name": p.get("name", ""),
                "shirt_number": _int(p.get("shirtNumber")),
                "position_raw": p.get("position", ""),     # GK / D / M / F
                "minutes": minutes,
                "goals": _int(stats.get("goals")),
                "assists": _int(stats.get("goalAssist", stats.get("assists"))),
                "yellow_cards": _int(stats.get("yellowCards")),
                "red_cards": _int(stats.get("redCards")),
                "saves": _int(stats.get("saves")),
                "tackles": _int(stats.get("tackles", stats.get("totalTackle"))),
                "possession_lost": _int(stats.get("possessionLostCtrl", stats.get("dispossessed"))),
                "penalties_won": _int(stats.get("penaltyWon")),
                "penalties_conceded": _int(stats.get("penaltyConceded")),
                "substitution_on": _bool(stats.get("substituteOn")),
                "substitution_off": _bool(stats.get("substituteOff")),
                "rating": float(stats.get("rating", 0) or 0),
                "side": side,
            }
            players.append(entry)

    return players


def _map_position(raw: str) -> str:
    """GK→GK, D→DEF, M→MID, F→FWD, autres→MID."""
    mapping = {"gk": "GK", "g": "GK", "d": "DEF", "m": "MID", "f": "FWD", "a": "FWD"}
    return mapping.get(raw.lower(), "MID")


# ── Résolution joueur en base ─────────────────────────────────────────────────

def _find_player_id(sb, scraped_name: str, position: str) -> Optional[str]:
    """
    Cherche un joueur dans Supabase par nom approché.
    Stratégie : ilike sur le nom + filtre position (optionnel).
    """
    # Prend le nom de famille (dernier mot) pour éviter les faux négatifs
    last_name = scraped_name.strip().split()[-1] if scraped_name.strip() else ""
    if not last_name:
        return None

    rows = (
        sb.table("players")
        .select("id,name,position")
        .ilike("name", f"%{last_name}%")
        .execute()
        .data
    )
    if not rows:
        return None
    # Filtrer par position si plusieurs résultats
    if len(rows) > 1:
        pos_filtered = [r for r in rows if r["position"] == position]
        rows = pos_filtered or rows
    return str(rows[0]["id"])


# ── Écriture en base ──────────────────────────────────────────────────────────

def upsert_player_stats(match_id: str, scraped_players: list[dict], clean_sheet_sides: set[str]) -> int:
    """
    Insère ou met à jour les stats dans player_match_stats.
    clean_sheet_sides : {"home"} ou {"away"} ou set() si aucune CS.
    Retourne le nombre de lignes écrites.
    """
    sb = get_supabase()
    written = 0

    for sp in scraped_players:
        pos = _map_position(sp["position_raw"])
        player_id = _find_player_id(sb, sp["name"], pos)
        if not player_id:
            logger.debug(f"  Joueur non résolu : {sp['name']} ({pos})")
            continue

        is_cs = (sp["side"] in clean_sheet_sides) and (sp["minutes"] >= 60)

        payload = {
            "player_id": player_id,
            "match_id": match_id,
            "goals": sp["goals"],
            "assists": sp["assists"],
            "minutes": sp["minutes"],
            "yellow_cards": sp["yellow_cards"],
            "red_cards": sp["red_cards"],
            "saves": sp["saves"],
            "tackles": sp["tackles"],
            "clean_sheet": is_cs,
            "possession_lost": sp["possession_lost"],
            "penalties_won": sp["penalties_won"],
            "penalties_conceded": sp["penalties_conceded"],
            "substitution_on": sp["substitution_on"],
            "substitution_off": sp["substitution_off"],
        }

        # Upsert par (player_id, match_id) — contrainte UNIQUE dans le schéma
        existing = (
            sb.table("player_match_stats")
            .select("id")
            .eq("player_id", player_id)
            .eq("match_id", match_id)
            .execute()
            .data
        )
        if existing:
            sb.table("player_match_stats").update(payload).eq("id", existing[0]["id"]).execute()
        else:
            sb.table("player_match_stats").insert(payload).execute()

        written += 1

    logger.info(f"  {written}/{len(scraped_players)} joueurs écrits en base.")
    return written


# ── Point d'entrée principal ───────────────────────────────────────────────────

async def scrape_match(match_id: str, sofascore_event_id: str) -> bool:
    """
    Scrape un match Sofascore et insère les stats.
    match_id : UUID du match dans notre BDD.
    sofascore_event_id : ID numérique Sofascore (visible dans l'URL).
    """
    sb = get_supabase()

    # Récupérer le score pour déduire les clean sheets
    match_row = sb.table("matches").select("score_home,score_away").eq("id", match_id).single().execute().data
    clean_sheet_sides: set[str] = set()
    if match_row:
        if _int(match_row.get("score_away")) == 0:
            clean_sheet_sides.add("home")
        if _int(match_row.get("score_home")) == 0:
            clean_sheet_sides.add("away")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="fr-FR",
        )
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT_MS)

        try:
            payloads = await fetch_event_stats(page, sofascore_event_id)
        except Exception as exc:
            logger.error(f"Erreur scraping {sofascore_event_id}: {exc}")
            await browser.close()
            return False

        await browser.close()

    if not payloads:
        logger.warning(f"Aucune donnée récupérée pour l'événement {sofascore_event_id}")
        return False

    all_players: list[dict] = []
    for payload in payloads:
        all_players.extend(_parse_lineups_payload(payload))

    logger.info(f"Sofascore → {len(all_players)} joueurs parsés pour match {match_id}")
    written = upsert_player_stats(match_id, all_players, clean_sheet_sides)

    # Marquer le match comme terminé si toutes les stats sont là
    if written >= 22:
        sb.table("matches").update({"status": "finished"}).eq("id", match_id).execute()

    return written > 0


async def scrape_live_matches() -> None:
    """Scrape tous les matchs actuellement 'live' en base."""
    sb = get_supabase()
    rows = (
        sb.table("matches")
        .select("id,team_home,team_away,settings")
        .eq("status", "live")
        .execute()
        .data
    )
    logger.info(f"{len(rows)} matchs live trouvés.")
    for row in rows:
        sid = (row.get("settings") or {}).get("sofascore_event_id")
        if not sid:
            logger.warning(f"Pas de sofascore_event_id pour {row['team_home']} vs {row['team_away']}")
            continue
        logger.info(f"▶ {row['team_home']} vs {row['team_away']} (event {sid})")
        await scrape_match(str(row["id"]), str(sid))


async def scrape_finished_without_stats() -> None:
    """Scrape les matchs terminés qui n'ont pas encore de stats."""
    sb = get_supabase()
    matches = sb.table("matches").select("id,team_home,team_away,settings").eq("status", "finished").execute().data
    already_done = {
        str(r["match_id"])
        for r in sb.table("player_match_stats").select("match_id").execute().data
    }
    to_scrape = [m for m in matches if str(m["id"]) not in already_done]
    logger.info(f"{len(to_scrape)} matchs terminés sans stats.")
    for row in to_scrape:
        sid = (row.get("settings") or {}).get("sofascore_event_id")
        if not sid:
            continue
        await scrape_match(str(row["id"]), str(sid))


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Scraper Sofascore — Fantasy Boulzazen")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--match-sofascore", nargs=2, metavar=("MATCH_DB_ID", "SOFASCORE_EVENT_ID"),
                       help="Scrape un match précis")
    group.add_argument("--live", action="store_true", help="Scrape tous les matchs live")
    group.add_argument("--finished", action="store_true", help="Scrape les matchs terminés sans stats")
    args = parser.parse_args()

    if args.match_sofascore:
        asyncio.run(scrape_match(args.match_sofascore[0], args.match_sofascore[1]))
    elif args.live:
        asyncio.run(scrape_live_matches())
    else:
        asyncio.run(scrape_finished_without_stats())