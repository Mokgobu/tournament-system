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

    // Check if id is a number (for single item routes)
    const hasId = id && !isNaN(parseInt(id)) && id !== 'teams';

    // GET all teams
    if (req.method === 'GET' && !hasId) {
      console.log('Fetching all teams');
      const teams = await sql`SELECT * FROM teams ORDER BY name`;
      return new Response(JSON.stringify(teams), { headers });
    }

    // GET single team
    if (req.method === 'GET' && hasId) {
      console.log('Fetching team:', id);
      const [team] = await sql`SELECT * FROM teams WHERE id = ${id}`;
      if (!team) {
        return new Response('Team not found', { status: 404, headers });
      }
      return new Response(JSON.stringify(team), { headers });
    }
    
    // POST new team
    if (req.method === 'POST') {
      console.log('Creating new team');
      const { name, abbreviation, color } = await req.json();
      
      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Team name is required' }),
          { status: 400, headers }
        );
      }
      
      try {
        const [newTeam] = await sql`
          INSERT INTO teams (name, abbreviation, color)
          VALUES (${name}, ${abbreviation || null}, ${color || '#00c853'})
          RETURNING *
        `;
        
        console.log('Team created:', newTeam);
        return new Response(JSON.stringify(newTeam), { 
          status: 201, 
          headers 
        });
      } catch (insertError) {
        if (insertError.message.includes('duplicate key')) {
          return new Response(
            JSON.stringify({ error: `Team "${name}" already exists` }),
            { status: 409, headers }
          );
        }
        throw insertError;
      }
    }

    // PUT (update) team
    if (req.method === 'PUT' && hasId) {
      console.log('Updating team:', id);
      const { name, abbreviation, color } = await req.json();
      
      const [updatedTeam] = await sql`
        UPDATE teams 
        SET name = ${name},
            abbreviation = ${abbreviation || null},
            color = ${color || '#00c853'}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedTeam) {
        return new Response('Team not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(updatedTeam), { headers });
    }

    // DELETE team
    if (req.method === 'DELETE' && hasId) {
      console.log('Deleting team:', id);
      
      // Check if team is used in matches
      const [matchCheck] = await sql`
        SELECT COUNT(*) as count FROM matches 
        WHERE team1_id = ${id} OR team2_id = ${id}
      `;
      
      if (matchCheck.count > 0) {
        return new Response(
          JSON.stringify({ error: 'Cannot delete team with existing matches' }),
          { status: 409, headers }
        );
      }

      const [deletedTeam] = await sql`
        DELETE FROM teams WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedTeam) {
        return new Response('Team not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(deletedTeam), { headers });
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Function error:', error);
    
    // Handle table not exists error
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      return new Response(
        JSON.stringify({ 
          error: 'Database tables not set up',
          hint: 'Please visit /api/setup-db first'
        }),
        { status: 500, headers }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/teams"
};