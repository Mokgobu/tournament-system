const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS'
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
    const hasId = id && !isNaN(parseInt(id)) && id !== 'matches';

    // ========== GET all matches ==========
    if (event.httpMethod === 'GET' && !hasId) {
      const matches = await sql`
        SELECT m.*, 
               t1.name as team1_name, t1.abbreviation as team1_abbr, t1.color as team1_color,
               t2.name as team2_name, t2.abbreviation as team2_abbr, t2.color as team2_color,
               e.name as event_name
        FROM matches m
        LEFT JOIN teams t1 ON m.team1_id = t1.id
        LEFT JOIN teams t2 ON m.team2_id = t2.id
        LEFT JOIN events e ON m.event_id = e.id
        ORDER BY m.match_date DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(matches) };
    }

    // ========== GET single match ==========
    if (event.httpMethod === 'GET' && hasId) {
      const [match] = await sql`
        SELECT m.*, 
               t1.name as team1_name, t1.abbreviation as team1_abbr,
               t2.name as team2_name, t2.abbreviation as team2_abbr,
               e.name as event_name
        FROM matches m
        LEFT JOIN teams t1 ON m.team1_id = t1.id
        LEFT JOIN teams t2 ON m.team2_id = t2.id
        LEFT JOIN events e ON m.event_id = e.id
        WHERE m.id = ${id}
      `;
      
      if (!match) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Match not found' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(match) };
    }

    // ========== PUT update match score ==========
    if (event.httpMethod === 'PUT' && hasId) {
      const { team1_score, team2_score, status } = JSON.parse(event.body);
      
      const [updatedMatch] = await sql`
        UPDATE matches 
        SET team1_score = ${team1_score}, 
            team2_score = ${team2_score},
            status = ${status || 'completed'}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedMatch) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Match not found' }) };
      }
      
      // Update standings
      await updateStandings(sql, updatedMatch);
      
      return { statusCode: 200, headers, body: JSON.stringify(updatedMatch) };
    }

    // ========== DELETE match ==========
    if (event.httpMethod === 'DELETE' && hasId) {
      // Get the match first to know which event
      const [match] = await sql`SELECT * FROM matches WHERE id = ${id}`;
      if (!match) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Match not found' }) };
      }
      
      await sql`DELETE FROM matches WHERE id = ${id}`;
      
      // Recalculate standings for the event
      await recalculateEventStandings(sql, match.event_id);
      
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ message: 'Match deleted successfully' }) 
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    
  } catch (error) {
    console.error('Matches function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// ========== HELPER FUNCTIONS ==========

async function updateStandings(sql, match) {
  // Update team1 standings
  await updateTeamStanding(sql, match.event_id, match.team1_id, 
    match.team1_score, match.team2_score);
  
  // Update team2 standings
  await updateTeamStanding(sql, match.event_id, match.team2_id, 
    match.team2_score, match.team1_score);
}

async function updateTeamStanding(sql, eventId, teamId, goalsFor, goalsAgainst) {
  const isWin = goalsFor > goalsAgainst;
  const isDraw = goalsFor === goalsAgainst;
  const isLoss = goalsFor < goalsAgainst;
  
  const [existing] = await sql`
    SELECT * FROM standings 
    WHERE event_id = ${eventId} AND team_id = ${teamId}
  `;
  
  if (!existing) {
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
    await updateTeamStanding(sql, eventId, match.team1_id, 
      match.team1_score, match.team2_score);
    await updateTeamStanding(sql, eventId, match.team2_id, 
      match.team2_score, match.team1_score);
  }
}