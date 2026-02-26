import { neon } from '@netlify/neon';

export default async (req) => {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  const sql = neon(databaseUrl);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const teams = await sql`SELECT * FROM teams ORDER BY name`;
      return new Response(JSON.stringify(teams), { headers });
    }
    
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
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/teams"
};