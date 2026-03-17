const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const { Server } = require("socket.io");
const { networkInterfaces } = require('os'); 

const port = 3000;

const sslOptions = {
  key:  fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

const server = https.createServer(sslOptions, app);
const io = new Server(server);

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
  res.json({ url: `https://${localIp}:${port}` });
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
    if (phones.size > 0) {
      console.log(`Phone rejected (session in use): ${socket.id}`);
      socket.emit('phone-rejected');
      return;
    }
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
  console.log(`Server running at https://${localIp}:${port}`);
});

