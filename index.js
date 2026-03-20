const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const { networkInterfaces } = require('os');

const port = 3000;

async function ensureCerts() {
  if (!fs.existsSync('key.pem') || !fs.existsSync('cert.pem')) {
    console.log('🔐 SSL certificates not found — generating self-signed certificates...');
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    fs.writeFileSync('key.pem', pems.private);
    fs.writeFileSync('cert.pem', pems.cert);
    console.log('✅ Certificates generated: key.pem + cert.pem');
  }
}

async function startServer() {
  await ensureCerts();

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

  // Desktop opens root URL → gets desktop page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-desktop.html'));
  });

  app.use(express.static('public'));

  app.get('/config', (req, res) => {
    // QR code URL points to /index.html so phones get the mobile page
    res.json({ url: `https://${localIp}:${port}/index.html` });
  });

  let activePhone = null; // Direct reference to the connected phone's socket

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Relay WebRTC signaling data
    socket.on('offer', (data) => socket.broadcast.emit('offer', data));
    socket.on('answer', (data) => socket.broadcast.emit('answer', data));
    socket.on('candidate', (data) => socket.broadcast.emit('candidate', data));
    socket.on('renegotiate', (data) => socket.broadcast.emit('renegotiate', data));
    socket.on('renegotiate-answer', (data) => socket.broadcast.emit('renegotiate-answer', data));

    // Track phone connections - phone emits this when it loads
    socket.on('phone-ready', () => {
      if (activePhone) {
        console.log(`Phone rejected (session in use): ${socket.id}`);
        socket.emit('phone-rejected');
        return;
      }
      console.log(`Phone ready: ${socket.id}`);
      activePhone = socket;
      socket.emit('phone-accepted');
      // Notify desktops that a phone joined
      socket.broadcast.emit('phone-joined');
      // Also relay phone-ready so desktop can send its offer
      socket.broadcast.emit('phone-ready');
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      if (activePhone && activePhone.id === socket.id) {
        activePhone = null;
        console.log(`Phone left: ${socket.id}`);
        // Only notify desktops when a PHONE disconnects
        socket.broadcast.emit('phone-left');
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running at https://${localIp}:${port}`);
  });
}

startServer();
