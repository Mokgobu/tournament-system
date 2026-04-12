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
        body: JSON.stringify({ error: 'Database URL not configured' })
      };
    }

    const sql = neon(databaseUrl);

    // GET all events
    if (event.httpMethod === 'GET') {
      const events = await sql`SELECT * FROM events ORDER BY created_at DESC`;
      return { statusCode: 200, headers, body: JSON.stringify(events) };
    }

    // POST create event - WITHOUT venue and start_time
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { name, type, teams } = body;
      
      console.log('Creating event:', { name, type, teams });
      
      if (!name || !type || !teams || teams.length < 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Name, type, and at least 2 teams required' })
        };
      }
      
      // Insert event without venue/start_time
      const [newEvent] = await sql`
        INSERT INTO events (name, type, status)
        VALUES (${name}, ${type}, 'active')
        RETURNING *
      `;
      
      console.log('Event created:', newEvent);
      
      // Create standings entries
      for (const teamId of teams) {
        await sql`
          INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
          VALUES (${newEvent.id}, ${teamId}, 0, 0, 0, 0, 0, 0, 0)
        `;
      }
      
      // Generate league matches
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

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    
  } catch (error) {
    console.error('Events error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};