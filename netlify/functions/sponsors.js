const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database error' }) };
    }

    const sql = neon(databaseUrl);
    const pathParts = event.path.split('/');
    const id = pathParts[pathParts.length - 1];
    const isNumericId = id && /^\d+$/.test(id);

    // GET all sponsors
    if (event.httpMethod === 'GET' && !isNumericId) {
      const sponsors = await sql`SELECT * FROM sponsors ORDER BY name`;
      return { statusCode: 200, headers, body: JSON.stringify(sponsors) };
    }

    // POST new sponsor
    if (event.httpMethod === 'POST') {
      const { name, description, contact } = JSON.parse(event.body);
      const [newSponsor] = await sql`
        INSERT INTO sponsors (name, description, contact)
        VALUES (${name}, ${description || null}, ${contact || null})
        RETURNING *
      `;
      return { statusCode: 201, headers, body: JSON.stringify(newSponsor) };
    }

    // PUT update sponsor
    if (event.httpMethod === 'PUT' && isNumericId) {
      const { name, description, contact } = JSON.parse(event.body);
      const [updated] = await sql`
        UPDATE sponsors SET name=${name}, description=${description||null}, contact=${contact||null}
        WHERE id=${id} RETURNING *
      `;
      return { statusCode: 200, headers, body: JSON.stringify(updated) };
    }

    // DELETE sponsor
    if (event.httpMethod === 'DELETE' && isNumericId) {
      await sql`DELETE FROM sponsors WHERE id = ${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};