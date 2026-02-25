import { getDatabase, handleError } from './utils/database.js';

// GET /api/teams - List all teams
// POST /api/teams - Create new team
// DELETE /api/teams/:id - Delete team
export default async (req, context) => {
  const client = await getDatabase();
  
  try {
    const { pathname } = new URL(req.url);
    const method = req.method;
    
    // GET all teams
    if (method === 'GET' && pathname === '/api/teams') {
      const result = await client.query(
        'SELECT * FROM teams ORDER BY name'
      );
      
      return new Response(
        JSON.stringify(result.rows),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // POST new team
    if (method === 'POST' && pathname === '/api/teams') {
      const { name } = await req.json();
      
      if (!name || name.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Team name is required' }),
          { status: 400 }
        );
      }
      
      try {
        const result = await client.query(
          'INSERT INTO teams (name) VALUES ($1) RETURNING *',
          [name.trim()]
        );
        
        return new Response(
          JSON.stringify(result.rows[0]),
          { 
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      } catch (err) {
        if (err.code === '23505') { // Unique violation
          return new Response(
            JSON.stringify({ error: 'Team already exists' }),
            { status: 409 }
          );
        }
        throw err;
      }
    }
    
    // DELETE team
    if (method === 'DELETE' && pathname.startsWith('/api/teams/')) {
      const id = pathname.split('/').pop();
      
      // Check if team is used in any matches
      const matchCheck = await client.query(
        'SELECT COUNT(*) FROM matches WHERE team1_id = $1 OR team2_id = $1',
        [id]
      );
      
      if (parseInt(matchCheck.rows[0].count) > 0) {
        return new Response(
          JSON.stringify({ error: 'Cannot delete team with existing matches' }),
          { status: 409 }
        );
      }
      
      const result = await client.query(
        'DELETE FROM teams WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Team not found' }),
          { status: 404 }
        );
      }
      
      return new Response(
        JSON.stringify({ message: 'Team deleted successfully' }),
        { status: 200 }
      );
    }
    
    return new Response('Not found', { status: 404 });
    
  } catch (error) {
    return handleError(error);
  } finally {
    await client.end();
  }
};

export const config = {
  path: "/api/teams"
};