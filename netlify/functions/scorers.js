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

    // GET all scorers
    if (req.method === 'GET' && !id) {
      console.log('Fetching all scorers');
      const scorers = await sql`
        SELECT s.*, t.name as team_name, t.abbreviation as team_abbr
        FROM scorers s
        LEFT JOIN teams t ON s.team_id = t.id
        ORDER BY s.goals DESC
      `;
      return new Response(JSON.stringify(scorers), { headers });
    }

    // GET single scorer
    if (req.method === 'GET' && id) {
      const [scorer] = await sql`
        SELECT s.*, t.name as team_name
        FROM scorers s
        LEFT JOIN teams t ON s.team_id = t.id
        WHERE s.id = ${id}
      `;
      
      if (!scorer) {
        return new Response('Scorer not found', { status: 404, headers });
      }
      return new Response(JSON.stringify(scorer), { headers });
    }
    
    // POST new scorer
    if (req.method === 'POST') {
      console.log('Creating new scorer');
      const { player, teamId, goals, assists, matches } = await req.json();
      
      if (!player || !teamId) {
        return new Response(
          JSON.stringify({ error: 'Player name and team are required' }),
          { status: 400, headers }
        );
      }
      
      const [newScorer] = await sql`
        INSERT INTO scorers (player, team_id, goals, assists, matches)
        VALUES (${player}, ${teamId}, ${goals || 0}, ${assists || 0}, ${matches || 0})
        RETURNING *
      `;
      
      console.log('Scorer created:', newScorer);
      return new Response(JSON.stringify(newScorer), { 
        status: 201, 
        headers 
      });
    }

    // PUT (edit) scorer
    if (req.method === 'PUT' && id) {
      console.log('Updating scorer:', id);
      const { player, teamId, goals, assists, matches } = await req.json();
      
      const [updatedScorer] = await sql`
        UPDATE scorers 
        SET player = ${player},
            team_id = ${teamId},
            goals = ${goals || 0},
            assists = ${assists || 0},
            matches = ${matches || 0}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedScorer) {
        return new Response('Scorer not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(updatedScorer), { headers });
    }

    // DELETE scorer
    if (req.method === 'DELETE' && id) {
      console.log('Deleting scorer:', id);
      const [deletedScorer] = await sql`
        DELETE FROM scorers WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedScorer) {
        return new Response('Scorer not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(deletedScorer), { headers });
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Scorers function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/scorers"
};