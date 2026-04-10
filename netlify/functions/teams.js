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

    // ========== DELETE team with cascade (auto-delete matches) ==========
    if (event.httpMethod === 'DELETE' && hasId) {
      // Step 1: Get all events this team participated in
      const affectedEvents = await sql`
        SELECT DISTINCT event_id FROM matches 
        WHERE team1_id = ${id} OR team2_id = ${id}
      `;
      
      // Step 2: Delete all matches involving this team
      await sql`
        DELETE FROM matches 
        WHERE team1_id = ${id} OR team2_id = ${id}
      `;

      // Step 3: Delete standings entries for this team
      await sql`DELETE FROM standings WHERE team_id = ${id}`;

      // Step 4: Update scorers (set team_id to NULL)
      await sql`UPDATE scorers SET team_id = NULL WHERE team_id = ${id}`;

      // Step 5: Recalculate standings for affected events
      for (const event of affectedEvents) {
        await recalculateEventStandings(sql, event.event_id);
      }

      // Step 6: Finally delete the team
      const [deletedTeam] = await sql`
        DELETE FROM teams WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedTeam) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Team not found' }) };
      }
      
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ 
          message: 'Team and all associated matches deleted successfully',
          team: deletedTeam 
        }) 
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

// ========== HELPER FUNCTIONS ==========

async function recalculateEventStandings(sql, eventId) {
  // Reset all standings for this event to zero
  await sql`
    UPDATE standings 
    SET played = 0, won = 0, drawn = 0, lost = 0, 
        goals_for = 0, goals_against = 0, points = 0
    WHERE event_id = ${eventId}
  `;

  // Get all completed matches for this event
  const matches = await sql`
    SELECT * FROM matches 
    WHERE event_id = ${eventId} AND status = 'completed'
  `;

  // Recalculate from matches
  for (const match of matches) {
    // Update team1
    await updateTeamStanding(sql, eventId, match.team1_id, 
      match.team1_score, match.team2_score);
    
    // Update team2
    await updateTeamStanding(sql, eventId, match.team2_id, 
      match.team2_score, match.team1_score);
  }
}

async function updateTeamStanding(sql, eventId, teamId, goalsFor, goalsAgainst) {
  const isWin = goalsFor > goalsAgainst;
  const isDraw = goalsFor === goalsAgainst;
  const isLoss = goalsFor < goalsAgainst;
  
  // Check if standing exists
  const [existing] = await sql`
    SELECT * FROM standings 
    WHERE event_id = ${eventId} AND team_id = ${teamId}
  `;
  
  if (!existing) {
    // Create new standing
    await sql`
      INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
      VALUES (${eventId}, ${teamId}, 1, 
        ${isWin ? 1 : 0},
        ${isDraw ? 1 : 0},
        ${isLoss ? 1 : 0},
        ${goalsFor}, ${goalsAgainst},
        ${isWin ? 3 : (isDraw ? 1 : 0)}
      )
    `;
  } else {
    // Update existing standing
    await sql`
      UPDATE standings 
      SET played = played + 1,
          won = won + ${isWin ? 1 : 0},
          drawn = drawn + ${isDraw ? 1 : 0},
          lost = lost + ${isLoss ? 1 : 0},
          goals_for = goals_for + ${goalsFor},
          goals_against = goals_against + ${goalsAgainst},
          points = points + ${isWin ? 3 : (isDraw ? 1 : 0)}
      WHERE event_id = ${eventId} AND team_id = ${teamId}
    `;
  }
}