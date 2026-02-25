import { getDatabase, handleError } from './utils/database.js';

export default async (req, context) => {
  const client = await getDatabase();
  
  try {
    const { pathname } = new URL(req.url);
    const method = req.method;
    const id = pathname.split('/').pop();
    
    // GET all matches
    if (method === 'GET' && pathname === '/api/matches') {
      const result = await client.query(
        `SELECT m.*, 
                t1.name as team1_name, 
                t2.name as team2_name,
                e.name as event_name
         FROM matches m
         JOIN events e ON m.event_id = e.id
         LEFT JOIN teams t1 ON m.team1_id = t1.id
         LEFT JOIN teams t2 ON m.team2_id = t2.id
         ORDER BY m.match_date DESC`
      );
      
      return new Response(
        JSON.stringify(result.rows),
        { status: 200 }
      );
    }
    
    // PUT update match score
    if (method === 'PUT' && pathname.startsWith('/api/matches/')) {
      const { team1_score, team2_score } = await req.json();
      const matchId = id;
      
      // Start transaction
      await client.query('BEGIN');
      
      try {
        // Get match details
        const matchResult = await client.query(
          'SELECT * FROM matches WHERE id = $1',
          [matchId]
        );
        
        if (matchResult.rows.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Match not found' }),
            { status: 404 }
          );
        }
        
        const match = matchResult.rows[0];
        
        // Update match
        const winnerId = team1_score > team2_score ? match.team1_id : 
                        team2_score > team1_score ? match.team2_id : null;
        
        await client.query(
          `UPDATE matches 
           SET team1_score = $1, team2_score = $2, 
               winner_id = $3, status = 'completed'
           WHERE id = $4`,
          [team1_score, team2_score, winnerId, matchId]
        );
        
        // Update standings for league events
        const eventResult = await client.query(
          'SELECT type FROM events WHERE id = $1',
          [match.event_id]
        );
        
        if (eventResult.rows[0].type === 'league') {
          await updateStandings(client, match, team1_score, team2_score);
        } else {
          // For knockout, generate next round matches
          await updateKnockoutBracket(client, match, winnerId);
        }
        
        await client.query('COMMIT');
        
        return new Response(
          JSON.stringify({ message: 'Match updated successfully' }),
          { status: 200 }
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

async function updateStandings(client, match, score1, score2) {
  // Update team1 stats
  await updateTeamStanding(client, match.event_id, match.team1_id, 
    score1, score2, score1 > score2, score1 === score2);
  
  // Update team2 stats
  await updateTeamStanding(client, match.event_id, match.team2_id, 
    score2, score1, score2 > score1, score1 === score2);
}

async function updateTeamStanding(client, eventId, teamId, goalsFor, goalsAgainst, won, drawn) {
  const pointsEarned = won ? 3 : (drawn ? 1 : 0);
  
  await client.query(
    `UPDATE standings 
     SET played = played + 1,
         won = won + $1,
         drawn = drawn + $2,
         lost = lost + $3,
         goals_for = goals_for + $4,
         goals_against = goals_against + $5,
         points = points + $6
     WHERE event_id = $7 AND team_id = $8`,
    [won ? 1 : 0, drawn ? 1 : 0, (!won && !drawn) ? 1 : 0, 
     goalsFor, goalsAgainst, pointsEarned, eventId, teamId]
  );
}

async function updateKnockoutBracket(client, match, winnerId) {
  // Find next match in bracket
  const nextMatches = await client.query(
    `SELECT * FROM matches 
     WHERE event_id = $1 AND round = $2 
     ORDER BY id`,
    [match.event_id, match.round + 1]
  );
  
  if (nextMatches.rows.length > 0) {
    // Find which position in next match this winner goes to
    const nextMatchIndex = Math.floor((match.id % 2 === 0 ? match.id - 1 : match.id) / 2);
    
    if (nextMatchIndex < nextMatches.rows.length) {
      const nextMatch = nextMatches.rows[nextMatchIndex];
      
      // Update the next match with this winner
      if (!nextMatch.team1_id) {
        await client.query(
          'UPDATE matches SET team1_id = $1 WHERE id = $2',
          [winnerId, nextMatch.id]
        );
      } else if (!nextMatch.team2_id) {
        await client.query(
          'UPDATE matches SET team2_id = $1 WHERE id = $2',
          [winnerId, nextMatch.id]
        );
      }
    }
  }
}

export const config = {
  path: "/api/matches"
};