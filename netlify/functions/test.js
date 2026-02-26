export default async () => {
  return new Response(
    JSON.stringify({ 
      message: "Test function is working!",
      time: new Date().toISOString()
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const config = {
  path: "/api/test"
};