// Shared Socket.IO bootstrap — imported by both script-desktop.js and script-mobile.js.
// Sets up the socket connection, registers shared event listeners, and calls the
// device-specific setup function once the socket is connected.
import { state } from './state.js';

export function initSocket(onConnectCallback) {
  // io() is provided by the socket.io CDN <script> loaded before this module
  const socket = io();
  state.socket = socket;

  socket.on('connect', () => {
    state.socketConnected = true;
    console.log('✅ Socket.IO connected! ID:', socket.id);
    onConnectCallback();
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Socket.IO connection error:', error);
    alert('❌ Failed to connect to server. Make sure the server is running on port 3000.');
  });

  socket.on('disconnect', () => {
    console.log('⚠️ Socket.IO disconnected');
  });

  // Fallback alert if socket never connects
  setTimeout(() => {
    if (!state.socketConnected) {
      console.error('❌ Socket.IO failed to connect after 5 seconds');
      alert('❌ Cannot connect to server. Check:\n1. Server is running (npm run dev)\n2. You are using the correct URL\n3. Both devices are on the same network');
    }
  }, 5000);
}
