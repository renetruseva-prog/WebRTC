const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { networkInterfaces } = require('os'); 

const port = 3000;

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

app.get('/config', (req, res) => {
  res.json({ url: `http://${localIp}:${port}` });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://${localIp}:${port}`);
});