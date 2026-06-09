phase 4 :
Scoring Engine & Scraping
Non commencée
⬜
points_engine.py — buts / assists / temps de jeu / cartons / clean sheet
⬜
scraper.py — Playwright lazy-load Sofascore
⬜
sync.py — hook on_user_login + cache Redis

1. Brancher on_user_login dans auth.py
Dans la route /login, juste avant le return final :
pythonfrom app.services.sync import on_user_login
import threading

# Dans async def login(...) :
# ... après avoir récupéré le profil et créé le token ...

# Lance en arrière-plan pour ne pas ralentir le login
threading.Thread(target=on_user_login, args=(res.user.id,), daemon=True).start()

return { "access_token": token, ... }
2. Invalider le cache après saveTeam dans fantasy.py
pythonfrom app.services.sync import invalidate_user

# À la fin de async def save_team(...), juste avant le return :
invalidate_user(user["sub"])
return { "success": True, ... }
3. Invalider le cache joueurs après un import admin dans admin.py
pythonfrom app.services.sync import invalidate_players

# À la fin de async def confirm_import(...) :
invalidate_players()
return { "success": True, ... }
4. Ajouter le sofascore_event_id aux matchs
Quand tu insères un match dans Supabase, ajoute le champ settings :
pythonsb.table("matches").insert({
    "team_home": "France",
    "team_away": "Argentine",
    "settings": {"sofascore_event_id": "12891234"},  # ← ID dans l'URL Sofascore
    ...
})
5. Installer Playwright (si pas encore fait)
bashcd backend
venv311\Scripts\activate
playwright install chromium
6. Mettre en place le cron de scraping
Crée backend/scheduler.py :
pythonimport schedule, time, asyncio, logging
from app.services.scraper import scrape_live_matches, scrape_finished_without_stats
from app.services.points_engine import save_match_points
from core.supabase import get_supabase

def job_live():
    asyncio.run(scrape_live_matches())

def job_finished():
    # Après chaque scrape terminé, calcule les points
    sb = get_supabase()
    done = sb.table("matches").select("id").eq("status", "finished").execute().data
    already = {r["match_id"] for r in sb.table("points_history").select("match_id").execute().data}
    for m in done:
        if str(m["id"]) not in already:
            save_match_points(str(m["id"]))

schedule.every(2).minutes.do(job_live)
schedule.every(5).minutes.do(job_finished)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Scheduler démarré")
    while True:
        schedule.run_pending()
        time.sleep(10)
Et ajoute schedule dans requirements.txt, puis lance-le dans un 3e terminal :
bashpython scheduler.py
7. Vérifier que Redis tourne
bashpython -c "from app.services.sync import redis_health; import json; print(json.dumps(redis_health(), indent=2))"
Si Redis n'est pas installé localement, le plus simple est Docker :
bashdocker run -d -p 6379:6379 redis:alpine
L'ordre logique d'un match : scraper détecte le match live → écrit les stats → scheduler appelle save_match_points → invalidate_match vide le cache → les users voient leurs points mis à jour.