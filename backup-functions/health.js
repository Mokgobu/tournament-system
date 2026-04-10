export default async () => {
  return new Response(
    JSON.stringify({ 
      status: "ok", 
      message: "API is working!",
      timestamp: new Date().toISOString(),
      functions: ["teams", "events", "matches", "standings"]
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const config = {
  path: "/api/health"
};