import schedule
import time
import asyncio
import logging
from app.services.scraper import scrape_live_matches, scrape_finished_without_stats
from app.services.points_engine import save_match_points
from core.supabase import get_supabase


def job_live():
    asyncio.run(scrape_live_matches())


def job_finished():
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