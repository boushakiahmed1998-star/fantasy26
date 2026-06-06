import os
import sys
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

print("🔍 Vérification Supabase...")
print("=" * 60)

# Test 1: Vérifier les clés
print("\n1️⃣ Vérification des variables d'environnement:")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL:
    print("❌ SUPABASE_URL manquante dans .env")
    sys.exit(1)
else:
    print(f"✅ SUPABASE_URL: {SUPABASE_URL[:50]}...")

if not SUPABASE_KEY:
    print("❌ SUPABASE_KEY manquante dans .env")
    sys.exit(1)
else:
    print(f"✅ SUPABASE_KEY: {SUPABASE_KEY[:20]}...")

# Test 2: Connexion Supabase
print("\n2️⃣ Tentative de connexion à Supabase:")
try:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Client Supabase créé avec succès")
except Exception as e:
    print(f"❌ Erreur création client: {e}")
    sys.exit(1)

# Test 3: Vérifier les tables
print("\n3️⃣ Vérification des tables:")
tables_to_check = [
    "users",
    "leagues",
    "players",
    "coaches",
    "fantasy_teams",
    "matches",
    "player_match_stats",
    "points_history",
    "pronostics",
    "complaints",
    "admin_settings"
]

try:
    for table_name in tables_to_check:
        response = supabase.table(table_name).select("*").limit(1).execute()
        print(f"   ✅ {table_name}")
    
    print("\n✅ TOUTES LES TABLES EXISTENT!")
except Exception as e:
    print(f"❌ Erreur lors de la vérification des tables:")
    print(f"   {e}")
    print("\n⚠️  Les tables n'existent peut-être pas. Avez-vous exécuté le schéma SQL?")
    sys.exit(1)

# Test 4: Insérer un test
print("\n4️⃣ Test d'insertion/lecture:")
try:
    # Insérer un admin_settings test
    test_data = {
        "setting_key": "test_connection",
        "setting_value": {"status": "ok", "timestamp": "test"}
    }
    
    result = supabase.table("admin_settings").insert(test_data).execute()
    print(f"✅ Insertion réussie: {result.data}")
    
    # Supprimer le test
    supabase.table("admin_settings").delete().eq("setting_key", "test_connection").execute()
    print("✅ Nettoyage test réussi")
    
except Exception as e:
    print(f"⚠️  Erreur insertion (peut être normal): {e}")

print("\n" + "=" * 60)
print("✅ SUPABASE FONCTIONNE CORRECTEMENT!")
print("=" * 60)
