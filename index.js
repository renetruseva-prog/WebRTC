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

const phones = new Set();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Relay WebRTC signaling data
  socket.on('offer', (data) => socket.broadcast.emit('offer', data));
  socket.on('answer', (data) => socket.broadcast.emit('answer', data));
  socket.on('candidate', (data) => socket.broadcast.emit('candidate', data));

  // Track phone connections - phone emits this when it loads
  socket.on('phone-ready', () => {
    console.log(`Phone ready: ${socket.id}`);
    phones.add(socket.id);
    // Notify desktops that a phone joined
    socket.broadcast.emit('phone-joined');
    // Also relay phone-ready so desktop can send its offer
    socket.broadcast.emit('phone-ready');
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (phones.has(socket.id)) {
      phones.delete(socket.id);
      console.log(`Phone left: ${socket.id}`);
      // Only notify desktops when a PHONE disconnects
      socket.broadcast.emit('phone-left');
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://${localIp}:${port}`);
});

