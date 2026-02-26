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
    if (req.method === 'GET' && !id) {
      console.log('Fetching all teams');
      const teams = await sql`SELECT * FROM teams ORDER BY name`;
      return new Response(JSON.stringify(teams), { headers });
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
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Function error:', error);
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