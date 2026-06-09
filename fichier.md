phase 4 :
Scoring Engine & Scraping
Non commencée
⬜
points_engine.py — buts / assists / temps de jeu / cartons / clean sheet
⬜
scraper.py — Playwright lazy-load Sofascore
⬜
sync.py — hook on_user_login + cache Redis

The user wants me to fix the 3 files and send them complete. Let me fix:

backend/app/api/routes/fantasy.py - fix import path and indentation
backend/app/api/routes/admin.py - add missing import and fix indentation of invalidate_players()
backend/database/schema.sql - add settings column to matches table

Let me prepare the corrected files.
For fantasy.py, the issues are:

from backend.app.services.sync import invalidate_user → from app.services.sync import invalidate_user
Indentation of invalidate_user(user["sub"]) - it has extra space

Looking at fantasy.py more carefully:
pythonfrom backend.app.services.sync import invalidate_user
This needs to change to from app.services.sync import invalidate_user
And:
python     invalidate_user(user["sub"])
Should be properly indented at 4 spaces inside the function.
For admin.py:

Add from app.services.sync import invalidate_players import
Fix invalidate_players() indentation - currently at module level (0 indentation), needs to be inside confirm_import() function before the return statement

Let me look at admin.py more carefully to understand the exact location:
python        except Exception as e:
            logger.error(f"Error inserting coach {c.name}: {e}")
            errors.append(f"Entraîneur {c.name}: {str(e)[:100]}")
            
invalidate_players()

    return {
        "success": True,
So invalidate_players() should be at 4 spaces indentation (inside the function), before the return statement. The return is currently at 4 spaces. So:
python        except Exception as e:
            logger.error(f"Error inserting coach {c.name}: {e}")
            errors.append(f"Entraîneur {c.name}: {str(e)[:100]}")
    
    invalidate_players()
    return {
        "success": True,
For schema.sql, add the settings column to the matches table. I need to either modify the CREATE TABLE statement or add an ALTER TABLE.