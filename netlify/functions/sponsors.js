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

    // GET all sponsors
    if (req.method === 'GET' && !id) {
      console.log('Fetching all sponsors');
      const sponsors = await sql`SELECT * FROM sponsors ORDER BY name`;
      return new Response(JSON.stringify(sponsors), { headers });
    }

    // GET single sponsor
    if (req.method === 'GET' && id) {
      const [sponsor] = await sql`SELECT * FROM sponsors WHERE id = ${id}`;
      if (!sponsor) {
        return new Response('Sponsor not found', { status: 404, headers });
      }
      return new Response(JSON.stringify(sponsor), { headers });
    }
    
    // POST new sponsor
    if (req.method === 'POST') {
      console.log('Creating new sponsor');
      const { name, description, contact, logo } = await req.json();
      
      if (!name) {
        return new Response(
          JSON.stringify({ error: 'Sponsor name is required' }),
          { status: 400, headers }
        );
      }
      
      const [newSponsor] = await sql`
        INSERT INTO sponsors (name, description, contact, logo)
        VALUES (${name}, ${description || null}, ${contact || null}, ${logo || null})
        RETURNING *
      `;
      
      console.log('Sponsor created:', newSponsor);
      return new Response(JSON.stringify(newSponsor), { 
        status: 201, 
        headers 
      });
    }

    // PUT (edit) sponsor
    if (req.method === 'PUT' && id) {
      console.log('Updating sponsor:', id);
      const { name, description, contact, logo } = await req.json();
      
      const [updatedSponsor] = await sql`
        UPDATE sponsors 
        SET name = ${name},
            description = ${description || null},
            contact = ${contact || null},
            logo = ${logo || null}
        WHERE id = ${id}
        RETURNING *
      `;
      
      if (!updatedSponsor) {
        return new Response('Sponsor not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(updatedSponsor), { headers });
    }

    // DELETE sponsor
    if (req.method === 'DELETE' && id) {
      console.log('Deleting sponsor:', id);
      const [deletedSponsor] = await sql`
        DELETE FROM sponsors WHERE id = ${id} RETURNING *
      `;
      
      if (!deletedSponsor) {
        return new Response('Sponsor not found', { status: 404, headers });
      }
      
      return new Response(JSON.stringify(deletedSponsor), { headers });
    }
    
    return new Response('Not found', { status: 404, headers });
    
  } catch (error) {
    console.error('Sponsors function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: "/api/sponsors"
};