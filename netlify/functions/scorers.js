const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
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

    // GET all scorers
    if (event.httpMethod === 'GET' && !isNumericId) {
      const scorers = await sql`
        SELECT s.*, t.name as team_name, t.abbreviation as team_abbr
        FROM scorers s
        LEFT JOIN teams t ON s.team_id = t.id
        ORDER BY s.goals DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(scorers) };
    }

    // GET single scorer
    if (event.httpMethod === 'GET' && isNumericId) {
      const [scorer] = await sql`
        SELECT s.*, t.name as team_name
        FROM scorers s
        LEFT JOIN teams t ON s.team_id = t.id
        WHERE s.id = ${id}
      `;
      if (!scorer) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Scorer not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(scorer) };
    }
    
    // POST new scorer
    if (event.httpMethod === 'POST') {
      const { player, team_id, goals, assists, matches } = JSON.parse(event.body);
      
      if (!player || !team_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Player name and team are required' })
        };
      }
      
      const [newScorer] = await sql`
        INSERT INTO scorers (player, team_id, goals, assists, matches)
        VALUES (${player}, ${team_id}, ${goals || 0}, ${assists || 0}, ${matches || 0})
        RETURNING *
      `;
      
      return { statusCode: 201, headers, body: JSON.stringify(newScorer) };
    }

    // PUT (edit) scorer
    if (event.httpMethod === 'PUT' && isNumericId) {
      const { player, team_id, goals, assists, matches } = JSON.parse(event.body);
      
      const [updatedScorer] = await sql`
        UPDATE scorers 
        SET player = ${player},
            team_id = ${team_id},
            goals = ${goals || 0},
            assists = ${assists || 0},
            matches = ${matches || 0}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedScorer) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Scorer not found' }) };
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(updatedScorer) };
    }

    // DELETE scorer
    if (event.httpMethod === 'DELETE' && isNumericId) {
      const [deletedScorer] = await sql`
        DELETE FROM scorers WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedScorer) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Scorer not found' }) };
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(deletedScorer) };
    }
    
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    
  } catch (error) {
    console.error('Scorers function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};