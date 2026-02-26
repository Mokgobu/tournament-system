// Try different import approaches
import * as neon from '@neondatabase/serverless';

export async function getDatabase() {
  console.log('Attempting to connect to database...');
  
  // Try different ways to get the client
  const createClient = neon.createClient || neon.default?.createClient || neon.Client;
  
  if (!createClient) {
    console.error('Available exports:', Object.keys(neon));
    throw new Error('Could not find createClient in @neondatabase/serverless');
  }
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    throw new Error('Database connection not configured');
  }
  
  try {
    const client = createClient(databaseUrl);
    await client.connect();
    console.log('Database connected successfully');
    return client;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

export function handleError(error) {
  console.error('Function error:', error);
  return new Response(
    JSON.stringify({ 
      error: error.message,
      details: 'Check server logs for more information',
      stack: error.stack
    }),
    { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}