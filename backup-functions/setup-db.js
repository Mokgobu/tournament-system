import { neon } from '@netlify/neon';

export default async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return new Response(
        JSON.stringify({ error: 'Database URL not found' }),
        { status: 500, headers }
      );
    }

    const sql = neon(databaseUrl);
    
    // Create teams table
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        abbreviation VARCHAR(3),
        color VARCHAR(7) DEFAULT '#00c853',
        logo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Teams table created');

    // Create events table
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(20) CHECK (type IN ('league', 'knockout')),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Events table created');

    // Create matches table
    await sql`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        team1_id INTEGER REFERENCES teams(id),
        team2_id INTEGER REFERENCES teams(id),
        team1_score INTEGER DEFAULT 0,
        team2_score INTEGER DEFAULT 0,
        match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        round INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'scheduled'
      )
    `;
    console.log('Matches table created');

    // Create standings table
    await sql`
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
      )
    `;
    console.log('Standings table created');

    // Create scorers table
    await sql`
      CREATE TABLE IF NOT EXISTS scorers (
        id SERIAL PRIMARY KEY,
        player VARCHAR(100) NOT NULL,
        team_id INTEGER REFERENCES teams(id),
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        matches INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Scorers table created');

    // Create sponsors table
    await sql`
      CREATE TABLE IF NOT EXISTS sponsors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        contact VARCHAR(100),
        logo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Sponsors table created');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "All database tables created successfully!" 
      }),
      { status: 200, headers }
    );
    
  } catch (error) {
    console.error('Setup error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/setup-db"
};