import { getDatabase, handleError } from './utils/database.js';

export default async (req, context) => {
  const client = await getDatabase();
  
  try {
    const { pathname } = new URL(req.url);
    const method = req.method;
    const id = pathname.split('/').pop();
    
    // GET all events
    if (method === 'GET' && pathname === '/api/events') {
      const result = await client.query(
        'SELECT * FROM events ORDER BY created_at DESC'
      );
      
      return new Response(
        JSON.stringify(result.rows),
        { status: 200 }
      );
    }
    
    // GET single event with details
    if (method === 'GET' && pathname.startsWith('/api/events/') && id && !isNaN(id)) {
      // Get event details
      const eventResult = await client.query(
        'SELECT * FROM events WHERE id = $1',
        [id]
      );
      
      if (eventResult.rows.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Event not found' }),
          { status: 404 }
        );
      }
      
      const event = eventResult.rows[0];
      
      // Get matches for this event
      const matchesResult = await client.query(
        `SELECT m.*, t1.name as team1_name, t2.name as team2_name 
         FROM matches m
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         WHERE m.event_id = $1
         ORDER BY m.round, m.id`,
        [id]
      );
      
      // Get standings for league events
      let standings = [];
      if (event.type === 'league') {
        const standingsResult = await client.query(
          `SELECT s.*, t.name 
           FROM standings s
           JOIN teams t ON s.team_id = t.id
           WHERE s.event_id = $1
           ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC`,
          [id]
        );
        standings = standingsResult.rows;
      }
      
      return new Response(
        JSON.stringify({
          ...event,
          matches: matchesResult.rows,
          standings
        }),
        { status: 200 }
      );
    }
    
    // POST new event
    if (method === 'POST' && pathname === '/api/events') {
      const { name, type, teams } = await req.json();
      
      if (!name || !type || !teams || teams.length < 2) {
        return new Response(
          JSON.stringify({ error: 'Name, type, and at least 2 teams required' }),
          { status: 400 }
        );
      }
      
      // Start transaction
      await client.query('BEGIN');
      
      try {
        // Create event
        const eventResult = await client.query(
          'INSERT INTO events (name, type) VALUES ($1, $2) RETURNING *',
          [name, type]
        );
        
        const event = eventResult.rows[0];
        
        // Initialize standings for each team
        for (const teamId of teams) {
          await client.query(
            `INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
             VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0)`,
            [event.id, teamId]
          );
        }
        
        // Generate matches based on tournament type
        if (type === 'league') {
          await generateLeagueMatches(client, event.id, teams);
        } else {
          await generateKnockoutMatches(client, event.id, teams);
        }
        
        await client.query('COMMIT');
        
        return new Response(
          JSON.stringify(event),
          { status: 201 }
        );
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    
    return new Response('Not found', { status: 404 });
    
  } catch (error) {
    return handleError(error);
  } finally {
    await client.end();
  }
};

// Helper to generate league matches (round-robin)
async function generateLeagueMatches(client, eventId, teams) {
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      await client.query(
        `INSERT INTO matches (event_id, team1_id, team2_id, round)
         VALUES ($1, $2, $3, 1)`,
        [eventId, teams[i], teams[j]]
      );
    }
  }
}

// Helper to generate knockout matches
async function generateKnockoutMatches(client, eventId, teams) {
  // Simple bracket generation (assumes power of 2 teams)
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      await client.query(
        `INSERT INTO matches (event_id, team1_id, team2_id, round)
         VALUES ($1, $2, $3, 1)`,
        [eventId, shuffled[i], shuffled[i + 1]]
      );
    }
  }
}

export const config = {
  path: "/api/events"
};