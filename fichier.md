phase 6: 
Dashboard complet & finitions UI
Non commencée
⬜
Dashboard.tsx — stats réelles + prochain match + widget classement
⬜
Transfers.tsx — remplacement joueurs avant lock
⬜
Responsive mobile + animations + tests complets

D'après le code existant, voici le plan complet pour la phase 6 :

**Dashboard.tsx** — ce qui manque :
- Stats réelles depuis les `player_match_stats` (buts, passes, clean sheets)
- Widget "prochain match" avec compte à rebours live
- Widget classement mini (top 5 + ma position)
- Historique des points match par match (graphique ou liste)

**Transfers.tsx** — ce qui manque :
- La route `/transfers` n'est pas dans `App.tsx`
- Le lien dans la nav de Fantasy/Dashboard
- Deadline lock visuelle (compte à rebours avant verrouillage)

**Responsive + animations** :
- Breakpoints mobile sur Fantasy.tsx (terrain en colonne)
- Animations d'entrée sur les cartes Dashboard
- Transition sur les slots du terrain
- Toast notifications au lieu des banners statiques

**Backend manquant** :
- `GET /api/v1/admin/team-stats` — endpoint référencé dans Admin.tsx mais absent
- `GET /api/v1/dashboard/stats` — stats agrégées pour le dashboard

En regardant le code, voici mon ordre recommandé :

**1. Transfers.tsx d'abord** — c'est le plus rapide à débloquer : le composant existe déjà, il manque juste la route dans `App.tsx` et le lien dans la nav. 5 minutes de travail.

**2. Backend manquant** — `GET /api/v1/admin/team-stats` et `GET /api/v1/dashboard/stats` bloquent des fonctionnalités déjà codées côté front.

**3. Responsive + animations** — en dernier, c'est du polish.

On attaque lequel ? Je propose de commencer par **Transfers + routes** car c'est le rapport effort/valeur le meilleur. Je te prépare :

- Ajout de la route `/transfers` dans `App.tsx`
- Lien dans la nav de `Dashboard.tsx` et `Fantasy.tsx`
- Endpoint `GET /api/v1/admin/team-stats` dans `admin.py`

En regardant le code, `Transfers.tsx` existe déjà et est bien écrit. Il manque juste 3 choses pour débloquer la phase 6. Voici ce qu'on fait dans l'ordre :

**1. Route `/transfers` dans `App.tsx`**

```tsx
import Transfers from './pages/Transfers'

// Ajouter dans <Routes> :
<Route path="/transfers" element={
  <ProtectedRoute><Transfers /></ProtectedRoute>
} />
```

**2. Lien dans la nav** — `Dashboard.tsx` (ligne ~200, tableau des nav buttons) :

```tsx
{ to: '/transfers', label: '🔄 Transferts' },
```

Idem dans `Fantasy.tsx` (ligne ~284) :

```tsx
{ to: '/transfers', label: '🔄 Transferts' },
```

**3. Endpoint `GET /api/v1/admin/team-stats`** dans `backend/app/api/routes/admin.py` — à ajouter après `admin_stats` :

```python
@router.get("/team-stats")
async def team_stats(_admin=Depends(require_admin)):
    sb = get_supabase()
    players = sb.table("players").select("team, position").execute().data
    coaches = sb.table("coaches").select("team").execute().data

    stats: dict[str, dict] = {}
    for p in players:
        key = p["team"]
        if key not in stats:
            stats[key] = {"players": 0, "coaches": 0}
        stats[key]["players"] += 1
    for c in coaches:
        key = c["team"]
        if key not in stats:
            stats[key] = {"players": 0, "coaches": 0}
        stats[key]["coaches"] += 1

    return {"stats": stats}
```

**4. Endpoint `GET /api/v1/dashboard/stats`** — créer `backend/app/api/routes/dashboard.py` :

```python
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
```

Puis dans `main.py` :
```python
from app.api.routes import dashboard
# ...
api_router.include_router(dashboard.router)
```
