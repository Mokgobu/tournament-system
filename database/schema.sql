-- Create tables for tournament management system

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table (base for League/Knockout)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('league', 'knockout')),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    team1_id INTEGER REFERENCES teams(id),
    team2_id INTEGER REFERENCES teams(id),
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    round INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'scheduled',
    winner_id INTEGER REFERENCES teams(id),
    UNIQUE(event_id, team1_id, team2_id, round)
);

-- League standings
CREATE TABLE IF NOT EXISTS standings (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id),
    played INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    drawn INTEGER DEFAULT 0,
    lost INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    UNIQUE(event_id, team_id)
);

-- Create indexes for better performance
CREATE INDEX idx_matches_event ON matches(event_id);
CREATE INDEX idx_standings_event ON standings(event_id);
CREATE INDEX idx_standings_points ON standings(points DESC);