// Simple sponsors.js with demo data
let sponsors = [
  { id: 1, name: 'Nike', description: 'Official kit supplier', contact: 'John Smith' },
  { id: 2, name: 'Adidas', description: 'Sports equipment partner', contact: 'Sarah Johnson' },
  { id: 3, name: 'Emirates', description: 'Official airline partner', contact: 'Ahmed Hassan' }
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
      return new Response(JSON.stringify(sponsors), { headers });
    }
    
    if (req.method === 'POST') {
      const newSponsor = await req.json();
      newSponsor.id = sponsors.length + 1;
      sponsors.push(newSponsor);
      return new Response(JSON.stringify(newSponsor), { status: 201, headers });
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
  path: "/api/sponsors"
};
