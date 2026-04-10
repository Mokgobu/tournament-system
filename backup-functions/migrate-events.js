import { neon } from '@netlify/neon';

export default async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      return new Response(
        JSON.stringify({ error: 'Database URL not found' }),
        { status: 500, headers }
      );
    }

    const sql = neon(databaseUrl);
    
    // Add venue column to events table
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS venue VARCHAR(200)
    `;
    console.log('Added venue column to events');

    // Add start_time column to events table
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS start_time TIMESTAMP
    `;
    console.log('Added start_time column to events');

    // Add venue column to matches table
    await sql`
      ALTER TABLE matches 
      ADD COLUMN IF NOT EXISTS venue VARCHAR(200)
    `;
    console.log('Added venue column to matches');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Venue and start_time columns added successfully!" 
      }),
      { status: 200, headers }
    );
    
  } catch (error) {
    console.error('Migration error:', error);
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
  path: "/api/migrate-events"
};