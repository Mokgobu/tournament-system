import { createClient } from '@neondatabase/serverless';

// Database connection utility
export async function getDatabase() {
  const client = createClient(process.env.DATABASE_URL);
  await client.connect();
  return client;
}

// Initialize database tables (run once)
export async function initializeDatabase() {
  const client = await getDatabase();
  try {
    // You can run schema.sql here or set up migrations
    console.log('Database connected successfully');
  } finally {
    await client.end();
  }
}

// Helper to handle errors
export function handleError(error) {
  console.error('Database error:', error);
  return new Response(
    JSON.stringify({ error: error.message }),
    { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}