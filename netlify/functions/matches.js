// Simple matches.js with demo data
let matches = [
  { 
    id: 1, 
    event_id: 1,
    team1_id: 1, 
    team2_id: 2, 
    team1_score: null, 
    team2_score: null,
    match_date: '2024-03-15T15:00:00', 
    status: 'scheduled',
    round: 1
  },
  { 
    id: 2, 
    event_id: 1,
    team1_id: 3, 
    team2_id: 4, 
    team1_score: 2, 
    team2_score: 1,
    match_date: '2024-03-10T14:00:00', 
    status: 'completed',
    round: 1
  }
];

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
    if (req.method === 'GET') {
      return new Response(JSON.stringify(matches), { headers });
    }
    
    if (req.method === 'PUT') {
      const url = new URL(req.url);
      const id = url.pathname.split('/').pop();
      const updates = await req.json();
      
      const index = matches.findIndex(m => m.id == id);
      if (index !== -1) {
        matches[index] = { ...matches[index], ...updates };
        return new Response(JSON.stringify(matches[index]), { headers });
      }
      return new Response('Match not found', { status: 404, headers });
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
  path: "/api/matches"
};