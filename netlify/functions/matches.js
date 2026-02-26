import { neon } from '@netlify/neon';

export default async (req) => {
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
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers }
      );
    }

    const sql = neon(databaseUrl);
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.length - 1];

    // GET all matches
    if (req.method === 'GET' && !id) {
      console.log('Fetching all matches');
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
      return new Response(JSON.stringify(matches), { headers });
    }

    // GET single match
    if (req.method === 'GET' && id) {
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
        return new Response('Match not found', { status: 404, headers });
      }
      return new Response(JSON.stringify(match), { headers });
    }
    
    // UPDATE match score
    if (req.method === 'PUT' && id) {
      console.log('Updating match:', id);
      const { team1_score, team2_score, status } = await req.json();
      
      const [updatedMatch] = await sql`
        UPDATE matches 
        SET team1_score = ${team1_score}, 
            team2_score = ${team2_score},
            status = ${status || 'completed'}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedMatch) {
        return new Response('Match not found', { status: 404, headers });
      }
      
      // Update standings
      await updateStandings(sql, updatedMatch);
      
      return new Response(JSON.stringify(updatedMatch), { headers });
    }

    // DELETE match
    if (req.method === 'DELETE' && id) {
      console.log('Deleting match:', id);
      const [deletedMatch] = await sql`
        DELETE FROM matches WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedMatch) {
        return new Response('Match not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(deletedMatch), { headers });
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Matches function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

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

export const config = {
  path: "/api/matches"
};