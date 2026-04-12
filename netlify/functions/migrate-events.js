const { neon } = require('@netlify/neon');

exports.handler = async function(event, context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database URL not found' })
      };
    }

    const sql = neon(databaseUrl);
    
    // Add missing columns to events table
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS venue VARCHAR(200)`;
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TIMESTAMP`;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Columns added!' })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};