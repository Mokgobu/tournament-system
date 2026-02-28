import { neon } from '@netlify/neon';

export default async (req) => {
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
    // Check if database URL exists
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      console.error('NETLIFY_DATABASE_URL environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { status: 500, headers }
      );
    }

    const sql = neon(databaseUrl);
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.length - 1];

    // Check if this is a request for a specific team (has an ID)
    const hasId = id && !isNaN(parseInt(id)) && id !== 'teams';

    // Test database connection
    try {
      await sql`SELECT 1`;
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return new Response(
        JSON.stringify({ error: 'Database connection failed' }),
        { status: 500, headers }
      );
    }

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
        return new Response(JSON.stringify({ error: 'Team not found' }), { 
          status: 404, 
          headers 
        });
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

    // PUT (edit) team - FIXED
    if (req.method === 'PUT' && hasId) {
      console.log('Updating team:', id);
      const { name, abbreviation, color } = await req.json();
      
      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Team name is required' }),
          { status: 400, headers }
        );
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
        return new Response(JSON.stringify({ error: 'Team not found' }), { 
          status: 404, 
          headers 
        });
      }
      
      console.log('Team updated:', updatedTeam);
      return new Response(JSON.stringify(updatedTeam), { headers });
    }

    // DELETE team - FIXED
    if (req.method === 'DELETE' && hasId) {
      console.log('Deleting team:', id);
      
      // Check if team is used in any matches
      const [matchCheck] = await sql`
        SELECT COUNT(*) as count FROM matches 
        WHERE team1_id = ${id} OR team2_id = ${id}
      `;
      
      if (parseInt(matchCheck.count) > 0) {
        return new Response(
          JSON.stringify({ 
            error: 'Cannot delete team because it has existing matches. Delete the matches first.' 
          }),
          { status: 409, headers }
        );
      }

      // Check if team is in any standings
      const [standingCheck] = await sql`
        SELECT COUNT(*) as count FROM standings WHERE team_id = ${id}
      `;
      
      if (parseInt(standingCheck.count) > 0) {
        // Delete standings entries first
        await sql`DELETE FROM standings WHERE team_id = ${id}`;
      }

      // Check if team is in any scorers
      const [scorerCheck] = await sql`
        SELECT COUNT(*) as count FROM scorers WHERE team_id = ${id}
      `;
      
      if (parseInt(scorerCheck.count) > 0) {
        // Delete or update scorers (setting team_id to NULL)
        await sql`UPDATE scorers SET team_id = NULL WHERE team_id = ${id}`;
      }

      // Finally delete the team
      const [deletedTeam] = await sql`
        DELETE FROM teams WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedTeam) {
        return new Response(JSON.stringify({ error: 'Team not found' }), { 
          status: 404, 
          headers 
        });
      }
      
      console.log('Team deleted:', deletedTeam);
      return new Response(JSON.stringify({ 
        message: 'Team deleted successfully',
        team: deletedTeam 
      }), { headers });
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), { 
      status: 404, 
      headers 
    });
    
  } catch (error) {
    console.error('Function error:', error);
    
    // Handle table not exists error
    if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      return new Response(
        JSON.stringify({ 
          error: 'Database tables not set up. Please visit /api/setup-db first.',
          hint: 'Run the setup-db function to create tables'
        }),
        { status: 500, headers }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/teams"
};