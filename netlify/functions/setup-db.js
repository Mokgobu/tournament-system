import { neon } from '@netlify/neon';
import 'dotenv/config';

export default async () => {
  // Get database URL from environment
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  
  console.log('Database URL available:', databaseUrl ? 'YES' : 'NO');
  
  if (!databaseUrl) {
    return new Response(
      JSON.stringify({ 
        error: 'Database URL not found',
        message: 'Please check your .env file'
      }),
      { status: 500 }
    );
  }

  try {
    // Connect using the URL
    const sql = neon(databaseUrl);
    
    // Create teams table
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        abbreviation VARCHAR(3),
        color VARCHAR(7) DEFAULT '#00c853',
        logo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Teams table created successfully!" 
      }),
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/setup-db"
};