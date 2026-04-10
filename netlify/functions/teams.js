const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Handle preflight requests
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
    
    // Parse the path to get the ID
    const pathParts = event.path.split('/');
    const id = pathParts[pathParts.length - 1];
    const hasId = id && !isNaN(parseInt(id)) && id !== 'teams';

    // ========== GET all teams ==========
    if (event.httpMethod === 'GET' && !hasId) {
      const teams = await sql`SELECT * FROM teams ORDER BY name`;
      return { statusCode: 200, headers, body: JSON.stringify(teams) };
    }

    // ========== GET single team ==========
    if (event.httpMethod === 'GET' && hasId) {
      const [team] = await sql`SELECT * FROM teams WHERE id = ${id}`;
      if (!team) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Team not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(team) };
    }

    // ========== POST create new team ==========
    if (event.httpMethod === 'POST') {
      const { name, abbreviation, color } = JSON.parse(event.body);
      
      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Team name is required' })
        };
      }
      
      const [newTeam] = await sql`
        INSERT INTO teams (name, abbreviation, color)
        VALUES (${name}, ${abbreviation || null}, ${color || '#00c853'})
        RETURNING *
      `;
      
      return { statusCode: 201, headers, body: JSON.stringify(newTeam) };
    }

    // ========== PUT update team ==========
    if (event.httpMethod === 'PUT' && hasId) {
      const { name, abbreviation, color } = JSON.parse(event.body);
      
      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Team name is required' })
        };
      }
      
      const [updatedTeam] = await sql`
        UPDATE teams 
        SET name = ${name},
            abbreviation = ${abbreviation || null},
            color = ${color || '#00c853'}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedTeam) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Team not found' }) };
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(updatedTeam) };
    }

    // ========== DELETE team ==========
    if (event.httpMethod === 'DELETE' && hasId) {
      // Check if team is used in any matches
      const [matchCheck] = await sql`
        SELECT COUNT(*) as count FROM matches 
        WHERE team1_id = ${id} OR team2_id = ${id}
      `;
      
      if (parseInt(matchCheck.count) > 0) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ 
            error: 'Cannot delete team because it has existing matches. Delete the matches first.' 
          })
        };
      }

      // Delete standings entries for this team
      await sql`DELETE FROM standings WHERE team_id = ${id}`;

      // Delete or update scorers (set team_id to NULL)
      await sql`UPDATE scorers SET team_id = NULL WHERE team_id = ${id}`;

      // Finally delete the team
      const [deletedTeam] = await sql`
        DELETE FROM teams WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedTeam) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Team not found' }) };
      }
      
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ message: 'Team deleted successfully', team: deletedTeam }) 
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    
  } catch (error) {
    console.error('Teams function error:', error);
    
    // Handle duplicate key error
    if (error.message && error.message.includes('duplicate key')) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'A team with this name already exists' })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};