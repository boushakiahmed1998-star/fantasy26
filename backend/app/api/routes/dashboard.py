from fastapi import APIRouter, Depends
from core.security import get_current_user
from core.supabase import get_supabase

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    sb = get_supabase()
    uid = user["sub"]

    team = sb.table("fantasy_teams").select("points,budget_used,name").eq("user_id", uid).limit(1).execute().data
    pronos = sb.table("pronostics").select("points").eq("user_id", uid).execute().data
    history = sb.table("points_history").select("total_points,match_id").eq("user_id", uid).order("created_at", desc=True).execute().data
    ranking = sb.table("fantasy_teams").select("user_id,points").order("points", desc=True).execute().data

    my_rank = next((i+1 for i, t in enumerate(ranking) if t["user_id"] == uid), None)
    prono_total = sum(int(p.get("points") or 0) for p in pronos)
    fantasy_pts = int(team[0]["points"] or 0) if team else 0

    return {
        "fantasy_points": fantasy_pts,
        "prono_points": prono_total,
        "total_points": fantasy_pts + prono_total,
        "rank": my_rank,
        "total_participants": len(ranking),
        "budget_used": team[0]["budget_used"] if team else 0,
        "team_name": team[0]["name"] if team else None,
        "points_history": history[:10],
    }