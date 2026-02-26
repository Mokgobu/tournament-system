import { neon } from '@netlify/neon';

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  const sql = neon(databaseUrl);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.length - 1];

    // GET all teams
    if (req.method === 'GET' && !id) {
      const teams = await sql`SELECT * FROM teams ORDER BY name`;
      return new Response(JSON.stringify(teams), { headers });
    }

    // GET single team
    if (req.method === 'GET' && id) {
      const [team] = await sql`SELECT * FROM teams WHERE id = ${id}`;
      if (!team) {
        return new Response('Team not found', { status: 404, headers });
      }
      return new Response(JSON.stringify(team), { headers });
    }
    
    // POST new team
    if (req.method === 'POST') {
      const { name, abbreviation, color } = await req.json();
      
      const [newTeam] = await sql`
        INSERT INTO teams (name, abbreviation, color)
        VALUES (${name}, ${abbreviation || null}, ${color || '#00c853'})
        RETURNING *
      `;
      
      return new Response(JSON.stringify(newTeam), { 
        status: 201, 
        headers 
      });
    }

    // PUT (edit) team
    if (req.method === 'PUT' && id) {
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
    if (req.method === 'DELETE' && id) {
      // Check if team is used in any matches
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

      // Check if team is in any standings
      const [standingCheck] = await sql`
        SELECT COUNT(*) as count FROM standings WHERE team_id = ${id}
      `;
      
      if (standingCheck.count > 0) {
        // Delete standings first
        await sql`DELETE FROM standings WHERE team_id = ${id}`;
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
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/teams"
};