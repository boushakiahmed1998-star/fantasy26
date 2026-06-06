-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDRE DE CRÉATION IMPORTANT :
--   1. users (sans league_id FK au départ)
--   2. leagues (références users.id via owner_id)
--   3. ALTER TABLE users ADD CONSTRAINT fk_league (référence leagues.id)
--
-- Cela résout la dépendance circulaire users ↔ leagues.
-- ─────────────────────────────────────────────────────────────────────────────

-- Users table (league_id ajouté sans FK pour l'instant — contrainte ajoutée plus bas)
CREATE TABLE IF NOT EXISTS users (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT    NOT NULL UNIQUE,
  username     TEXT    NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  role         TEXT    DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  league_id    UUID,                        -- FK ajoutée après création de leagues
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description TEXT,
  settings    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix dépendance circulaire : on ajoute la FK users→leagues maintenant que leagues existe
ALTER TABLE users
  ADD CONSTRAINT fk_users_league
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE SET NULL;

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  nationality TEXT NOT NULL,
  position    TEXT NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  team        TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  stats       JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coaches table
CREATE TABLE IF NOT EXISTS coaches (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                        TEXT NOT NULL,
  nationality                 TEXT NOT NULL,
  team                        TEXT NOT NULL,
  price                       INTEGER NOT NULL CHECK (price >= 0),
  forbidden_players_nationality TEXT[] DEFAULT '{}',
  created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fantasy Teams table
CREATE TABLE IF NOT EXISTS fantasy_teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name        TEXT DEFAULT 'Ma Sélection',
  players     JSONB NOT NULL DEFAULT '[]'::jsonb,
  coach_id    UUID REFERENCES coaches(id) ON DELETE SET NULL,
  budget_used INTEGER DEFAULT 0 CHECK (budget_used >= 0),
  points      INTEGER DEFAULT 0,
  locked      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_home  TEXT NOT NULL,
  team_away  TEXT NOT NULL,
  score_home INTEGER CHECK (score_home >= 0),
  score_away INTEGER CHECK (score_away >= 0),
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'finished')),
  start_time TIMESTAMP NOT NULL,
  "group"    TEXT,
  stage      TEXT DEFAULT 'group' CHECK (stage IN ('group', 'knockout')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Match Stats table
CREATE TABLE IF NOT EXISTS player_match_stats (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id            UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  goals               INTEGER DEFAULT 0 CHECK (goals >= 0),
  assists             INTEGER DEFAULT 0 CHECK (assists >= 0),
  minutes             INTEGER DEFAULT 0 CHECK (minutes >= 0),
  yellow_cards        INTEGER DEFAULT 0 CHECK (yellow_cards BETWEEN 0 AND 2),
  red_cards           INTEGER DEFAULT 0 CHECK (red_cards BETWEEN 0 AND 1),
  saves               INTEGER DEFAULT 0 CHECK (saves >= 0),
  tackles             INTEGER DEFAULT 0 CHECK (tackles >= 0),
  clean_sheet         BOOLEAN DEFAULT FALSE,
  possession_lost     INTEGER DEFAULT 0 CHECK (possession_lost >= 0),
  penalties_won       INTEGER DEFAULT 0 CHECK (penalties_won >= 0),
  penalties_conceded  INTEGER DEFAULT 0 CHECK (penalties_conceded >= 0),
  substitution_on     BOOLEAN DEFAULT FALSE,
  substitution_off    BOOLEAN DEFAULT FALSE,
  UNIQUE (player_id, match_id),             -- un joueur ne peut avoir qu'une ligne par match
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Points History table
CREATE TABLE IF NOT EXISTS points_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  points       JSONB DEFAULT '{}'::jsonb,
  total_points INTEGER DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pronostics table
CREATE TABLE IF NOT EXISTS pronostics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   UUID REFERENCES matches(id) ON DELETE SET NULL,
  prediction JSONB NOT NULL DEFAULT '{}'::jsonb,
  points     INTEGER DEFAULT 0,
  locked     BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complaints table
CREATE TABLE IF NOT EXISTS complaints (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id       UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  description    TEXT,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_response TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at    TIMESTAMP
);

-- Admin Settings table
CREATE TABLE IF NOT EXISTS admin_settings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key   TEXT NOT NULL UNIQUE,
  setting_value JSONB DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Index pour performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_league              ON users(league_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_teams_user        ON fantasy_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_teams_league      ON fantasy_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_status            ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_group             ON matches("group");
CREATE INDEX IF NOT EXISTS idx_player_match_stats_player ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_match_stats_match  ON player_match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_pronostics_user           ON pronostics(user_id);
CREATE INDEX IF NOT EXISTS idx_pronostics_match          ON pronostics(match_id);
CREATE INDEX IF NOT EXISTS idx_players_team              ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_position          ON players(position);