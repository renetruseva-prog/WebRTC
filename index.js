const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { networkInterfaces } = require('os'); // To find your IP

const port = 3000;

// Helper to find your computer's IP address
const nets = networkInterfaces();
let localIp = '127.0.0.1';
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      localIp = net.address;
    }
  }
}

app.use(express.static('public'));

// Route to provide the IP-based URL to the frontend
app.get('/config', (req, res) => {
  res.json({ url: `http://${localIp}:${port}` });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://${localIp}:${port}`);
});