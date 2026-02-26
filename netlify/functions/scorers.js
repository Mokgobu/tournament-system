// Simple scorers.js with demo data
let scorers = [
  { id: 1, player: 'Erling Haaland', teamId: 1, goals: 18, assists: 5, matches: 22 },
  { id: 2, player: 'Mohamed Salah', teamId: 2, goals: 15, assists: 8, matches: 21 },
  { id: 3, player: 'Bukayo Saka', teamId: 3, goals: 12, assists: 10, matches: 22 }
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
      return new Response(JSON.stringify(scorers), { headers });
    }
    
    if (req.method === 'POST') {
      const newScorer = await req.json();
      newScorer.id = scorers.length + 1;
      scorers.push(newScorer);
      return new Response(JSON.stringify(newScorer), { status: 201, headers });
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
  path: "/api/scorers"
};