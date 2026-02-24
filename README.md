# WebRTC Project Development Diary

## Development Diary

### 2026-02-24
- Set up Socket.io server and client for real-time messaging
- Implemented QR code generation for easy mobile access
- Added device detection: desktop shows QR code, mobile shows greeting
- Debugged QR code rendering and server endpoint issues
- Added error handling and logging for QR code generation

---

### AI reflection

I started off by using the provided tutorial.

```javascript
// --- index.js (Server Logic) ---
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { networkInterfaces } = require('os'); 

const port = 3000;

// Logic to find the computer's Local IP address
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

// Endpoint to provide the IP-based URL to the frontend
app.get('/config', (req, res) => {
  res.json({ url: `http://${localIp}:${port}` });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://${localIp}:${port}`);
});

```

#### What the AI Provided:

* **IP Discovery Logic:** The AI provided the `networkInterfaces()` loop used to find the computer's local IPv4 address. This was essential because, as the guide notes, a smartphone cannot connect to a server using `localhost`.
* **The `/config` Endpoint:** The AI suggested creating a dedicated route to pass the dynamically generated IP-based URL from the server to the frontend.
* **Role Detection Regex:** The `isMobile()` function using `navigator.userAgent` was provided by the AI to programmatically swap between the two views.

#### What I Added:

* **The "Hello" Logic:** I added the specific lines to toggle the `.hidden` class so that the "Hello from my phone!" message only displays on mobile devices.
* **Visual Styling:** I customized the CSS colors, specifically setting the mobile header to `rgb(184, 30, 30)` to make the "Hello" message stand out visually.
* **Manual QR Parameters:** I manually set `typeNumber = 4` and `errorCorrectionLevel = 'L'` inside the `init()` function to follow the specific instructions in the course README for the QR generator library.
* **Console Debugging:** I wrote custom `console.log` strings (e.g., `'QR library available:'`, `'Got URL:'`) to monitor the handshake process in the browser console during development.
