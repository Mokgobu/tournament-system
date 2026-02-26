import { neon } from '@netlify/neon';

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  const sql = neon(databaseUrl);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // GET all events
    if (req.method === 'GET') {
      const events = await sql`SELECT * FROM events ORDER BY created_at DESC`;
      return new Response(JSON.stringify(events), { headers });
    }
    
    // POST new event
    if (req.method === 'POST') {
      const { name, type, teams } = await req.json();
      
      // Start a transaction
      const [newEvent] = await sql`
        INSERT INTO events (name, type, status)
        VALUES (${name}, ${type}, 'active')
        RETURNING *
      `;
      
      // Create standings entries for each team
      for (const teamId of teams) {
        await sql`
          INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
          VALUES (${newEvent.id}, ${teamId}, 0, 0, 0, 0, 0, 0, 0)
        `;
      }
      
      // Generate matches based on tournament type
      if (type === 'league') {
        await generateLeagueMatches(sql, newEvent.id, teams);
      } else {
        await generateKnockoutMatches(sql, newEvent.id, teams);
      }
      
      return new Response(JSON.stringify(newEvent), { 
        status: 201, 
        headers 
      });
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

async function generateLeagueMatches(sql, eventId, teams) {
  // Round-robin: each team plays every other team once
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + (i * teams.length + j)); // Spread out dates
      
      await sql`
        INSERT INTO matches (event_id, team1_id, team2_id, match_date, status, round)
        VALUES (${eventId}, ${teams[i]}, ${teams[j]}, ${matchDate.toISOString()}, 'scheduled', 1)
      `;
    }
  }
}

async function generateKnockoutMatches(sql, eventId, teams) {
  // Simple knockout: random draw, assumes power of 2 teams
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + 7); // First round in 7 days
      
      await sql`
        INSERT INTO matches (event_id, team1_id, team2_id, match_date, status, round)
        VALUES (${eventId}, ${shuffled[i]}, ${shuffled[i + 1]}, ${matchDate.toISOString()}, 'scheduled', 1)
      `;
    }
  }
}

export const config = {
  path: "/api/events"
};