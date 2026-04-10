import { neon } from '@netlify/neon';

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
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
    const eventId = pathParts[pathParts.length - 1];

    // Only allow GET requests
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    // If eventId is provided and is a number, get standings for specific event
    if (eventId && !isNaN(parseInt(eventId)) && eventId !== 'standings') {
      return await getEventStandings(sql, parseInt(eventId), headers);
    } else {
      // Otherwise get all standings grouped by event
      return await getAllStandings(sql, headers);
    }

  } catch (error) {
    console.error('Standings function error:', error);
    
    // Handle table not exists error
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      return new Response(
        JSON.stringify({ 
          error: 'Database tables not set up',
          hint: 'Please visit /api/setup-db first',
          standings: []
        }),
        { status: 200, headers } // Return 200 with empty array so UI doesn't break
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        standings: []
      }),
      { status: 500, headers }
    );
  }
};

async function getEventStandings(sql, eventId, headers) {
  try {
    // First check if event exists
    const [event] = await sql`SELECT * FROM events WHERE id = ${eventId}`;
    if (!event) {
      return new Response(
        JSON.stringify({ 
          error: 'Event not found',
          standings: []
        }),
        { status: 404, headers }
      );
    }

    // Get all teams in this event from standings table
    const standings = await sql`
      SELECT 
        s.*,
        t.name as team_name,
        t.abbreviation as team_abbr,
        t.color as team_color,
        t.logo as team_logo
      FROM standings s
      JOIN teams t ON s.team_id = t.id
      WHERE s.event_id = ${eventId}
      ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC, s.goals_for DESC
    `;

    // If no standings entries yet, create them from teams in event
    if (standings.length === 0) {
      // Get teams that are part of this event (from matches)
      const teamsInEvent = await sql`
        SELECT DISTINCT 
          t.id, t.name, t.abbreviation, t.color, t.logo
        FROM teams t
        JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
        WHERE m.event_id = ${eventId}
      `;

      if (teamsInEvent.length > 0) {
        // Create standings entries
        for (const team of teamsInEvent) {
          await sql`
            INSERT INTO standings (event_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
            VALUES (${eventId}, ${team.id}, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (event_id, team_id) DO NOTHING
          `;
        }

        // Recalculate all standings from matches
        await recalculateEventStandings(sql, eventId);

        // Fetch the updated standings
        const updatedStandings = await sql`
          SELECT 
            s.*,
            t.name as team_name,
            t.abbreviation as team_abbr,
            t.color as team_color,
            t.logo as team_logo
          FROM standings s
          JOIN teams t ON s.team_id = t.id
          WHERE s.event_id = ${eventId}
          ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC, s.goals_for DESC
        `;

        return new Response(
          JSON.stringify({
            event: {
              id: event.id,
              name: event.name,
              type: event.type
            },
            standings: updatedStandings
          }),
          { headers }
        );
      }
    }

    return new Response(
      JSON.stringify({
        event: {
          id: event.id,
          name: event.name,
          type: event.type
        },
        standings: standings
      }),
      { headers }
    );

  } catch (error) {
    console.error('Error getting event standings:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        standings: []
      }),
      { status: 500, headers }
    );
  }
}

async function getAllStandings(sql, headers) {
  try {
    // Get all events with their standings
    const events = await sql`
      SELECT 
        e.id,
        e.name,
        e.type,
        e.status
      FROM events e
      ORDER BY e.created_at DESC
    `;

    const result = [];

    for (const event of events) {
      const standings = await sql`
        SELECT 
          s.*,
          t.name as team_name,
          t.abbreviation as team_abbr,
          t.color as team_color,
          t.logo as team_logo
        FROM standings s
        JOIN teams t ON s.team_id = t.id
        WHERE s.event_id = ${event.id}
        ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC, s.goals_for DESC
      `;

      result.push({
        ...event,
        standings: standings
      });
    }

    return new Response(JSON.stringify(result), { headers });

  } catch (error) {
    console.error('Error getting all standings:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        standings: []
      }),
      { status: 500, headers }
    );
  }
}

async function recalculateEventStandings(sql, eventId) {
  try {
    // Get all completed matches for this event
    const matches = await sql`
      SELECT * FROM matches 
      WHERE event_id = ${eventId} AND status = 'completed'
    `;

    // Reset all standings for this event to zero
    await sql`
      UPDATE standings 
      SET played = 0, won = 0, drawn = 0, lost = 0, 
          goals_for = 0, goals_against = 0, points = 0
      WHERE event_id = ${eventId}
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

  } catch (error) {
    console.error('Error recalculating standings:', error);
    throw error;
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

export const config = {
  path: "/api/standings"
};