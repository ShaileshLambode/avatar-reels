const http = require("http");

const postData = JSON.stringify({
  prompt: "A futuristic cyberpunk marketing agency vertical reel",
  config: {
    tone: "energetic",
    voice: "male_heroic"
  }
});

const options = {
  hostname: "localhost",
  port: 4001,
  path: "/api/reels",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding("utf8");
  
  let body = "";
  res.on("data", (chunk) => {
    body += chunk;
  });
  
  res.on("end", () => {
    console.log("BODY:");
    console.log(body);
  });
});

req.on("error", (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(postData);
req.end();
