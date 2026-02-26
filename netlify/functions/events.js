import { neon } from '@netlify/neon';

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  const sql = neon(databaseUrl);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.length - 1];

    // GET all events
    if (req.method === 'GET' && !id) {
      const events = await sql`SELECT * FROM events ORDER BY created_at DESC`;
      return new Response(JSON.stringify(events), { headers });
    }

    // GET single event
    if (req.method === 'GET' && id) {
      const [event] = await sql`SELECT * FROM events WHERE id = ${id}`;
      if (!event) {
        return new Response('Event not found', { status: 404, headers });
      }
      
      // Get matches for this event
      const matches = await sql`
        SELECT m.*, 
               t1.name as team1_name, t1.abbreviation as team1_abbr,
               t2.name as team2_name, t2.abbreviation as team2_abbr
        FROM matches m
        LEFT JOIN teams t1 ON m.team1_id = t1.id
        LEFT JOIN teams t2 ON m.team2_id = t2.id
        WHERE m.event_id = ${id}
        ORDER BY m.round, m.match_date
      `;
      
      return new Response(JSON.stringify({ ...event, matches }), { headers });
    }
    
    // POST new event
    if (req.method === 'POST') {
      const { name, type, teams } = await req.json();
      
      const [newEvent] = await sql`
        INSERT INTO events (name, type, status)
        VALUES (${name}, ${type}, 'active')
        RETURNING *
      `;
      
      // Create standings entries
      for (const teamId of teams) {
        await sql`
          INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
          VALUES (${newEvent.id}, ${teamId}, 0, 0, 0, 0, 0, 0, 0)
        `;
      }
      
      // Generate matches
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

    // PUT (edit) event
    if (req.method === 'PUT' && id) {
      const { name, type, status } = await req.json();
      
      const [updatedEvent] = await sql`
        UPDATE events 
        SET name = ${name}, 
            type = ${type}, 
            status = ${status || 'active'}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedEvent) {
        return new Response('Event not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(updatedEvent), { headers });
    }

    // DELETE event
    if (req.method === 'DELETE' && id) {
      // Check if event has matches
      const [matchCheck] = await sql`
        SELECT COUNT(*) as count FROM matches WHERE event_id = ${id}
      `;
      
      if (matchCheck.count > 0) {
        // Delete matches first
        await sql`DELETE FROM matches WHERE event_id = ${id}`;
      }

      // Delete standings
      await sql`DELETE FROM standings WHERE event_id = ${id}`;

      const [deletedEvent] = await sql`
        DELETE FROM events WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedEvent) {
        return new Response('Event not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(deletedEvent), { headers });
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
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + (i * teams.length + j));
      
      await sql`
        INSERT INTO matches (event_id, team1_id, team2_id, match_date, status, round)
        VALUES (${eventId}, ${teams[i]}, ${teams[j]}, ${matchDate.toISOString()}, 'scheduled', 1)
      `;
    }
  }
}

async function generateKnockoutMatches(sql, eventId, teams) {
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() + 7);
      
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