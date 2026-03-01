exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      status: "ok", 
      message: "API is working!",
      timestamp: new Date().toISOString()
    })
  };
};