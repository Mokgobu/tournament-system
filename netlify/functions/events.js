const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);
    const pathParts = event.path.split('/');
    const id = pathParts[pathParts.length - 1];
    const isNumericId = id && /^\d+$/.test(id);

    // ========== GET all events ==========
    if (event.httpMethod === 'GET' && !isNumericId) {
      const events = await sql`
        SELECT e.*,
               COUNT(DISTINCT m.id) as matches_count,
               COUNT(DISTINCT s.team_id) as teams_count
        FROM events e
        LEFT JOIN matches m ON e.id = m.event_id
        LEFT JOIN standings s ON e.id = s.event_id
        GROUP BY e.id
        ORDER BY e.created_at DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(events) };
    }

    // ========== GET single event ==========
    if (event.httpMethod === 'GET' && isNumericId) {
      const [eventData] = await sql`SELECT * FROM events WHERE id = ${id}`;
      if (!eventData) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Event not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(eventData) };
    }

    // ========== POST create event ==========
    if (event.httpMethod === 'POST') {
      const { name, type, teams, venue, start_time } = JSON.parse(event.body);
      
      if (!name || !type || !teams || teams.length < 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Name, type, and at least 2 teams required' })
        };
      }
      
      const [newEvent] = await sql`
        INSERT INTO events (name, type, status, venue, start_time)
        VALUES (${name}, ${type}, 'active', ${venue || null}, ${start_time || null})
        RETURNING *
      `;
      
      for (const teamId of teams) {
        await sql`
          INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
          VALUES (${newEvent.id}, ${teamId}, 0, 0, 0, 0, 0, 0, 0)
        `;
      }
      
      if (type === 'league') {
        for (let i = 0; i < teams.length; i++) {
          for (let j = i + 1; j < teams.length; j++) {
            const matchDate = new Date();
            matchDate.setDate(matchDate.getDate() + (i * teams.length + j));
            await sql`
              INSERT INTO matches (event_id, team1_id, team2_id, match_date, status, round)
              VALUES (${newEvent.id}, ${teams[i]}, ${teams[j]}, ${matchDate.toISOString()}, 'scheduled', 1)
            `;
          }
        }
      }
      
      return { statusCode: 201, headers, body: JSON.stringify(newEvent) };
    }

    // ========== PUT update event ==========
    if (event.httpMethod === 'PUT' && isNumericId) {
      const { name, type, status, venue, start_time } = JSON.parse(event.body);
      
      const [updatedEvent] = await sql`
        UPDATE events 
        SET name = ${name}, type = ${type}, status = ${status || 'active'},
            venue = ${venue || null}, start_time = ${start_time || null}
        WHERE id = ${id} RETURNING *
      `;
      
      if (!updatedEvent) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Event not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(updatedEvent) };
    }

    // ========== DELETE event ==========
    if (event.httpMethod === 'DELETE' && isNumericId) {
      console.log('DELETE request for event:', id);
      
      const [existingEvent] = await sql`SELECT * FROM events WHERE id = ${id}`;
      if (!existingEvent) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Event not found' })
        };
      }
      
      await sql`DELETE FROM matches WHERE event_id = ${id}`;
      await sql`DELETE FROM standings WHERE event_id = ${id}`;
      await sql`DELETE FROM events WHERE id = ${id}`;
      
      console.log(`Event ${id} deleted successfully`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Event and all associated matches deleted successfully' 
        })
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    
  } catch (error) {
    console.error('Events function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};