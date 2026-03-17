// Entry point — sets up the Socket.IO connection and kicks off device-specific initialisation.
// All feature logic lives in the imported modules below.
import { state } from './state.js';
import { isMobile } from './utils.js';
import { setupDesktop, setupMobile } from './webrtc.js';

// io() is provided by the socket.io CDN <script> loaded before this module
const socket = io();
state.socket = socket;

// ─── Socket Event Handlers ────────────────────────────────────────────────────

function onConnect() {
  state.socketConnected = true;
  console.log('✅ Socket.IO connected! ID:', socket.id);
  console.log('=== WebRTC Presenter App Starting ===');
  init();
}

function onConnectError(error) {
  console.error('❌ Socket.IO connection error:', error);
  alert('❌ Failed to connect to server. Make sure the server is running on port 3000.');
}

function onDisconnect() {
  console.log('⚠️ Socket.IO disconnected');
}

// Relay ICE candidates to the peer connection regardless of device role
async function onCandidate(candidate) {
  try {
    await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('ICE candidate added successfully');
  } catch (e) {
    console.error('Error adding ICE candidate', e);
  }
}

socket.on('connect',       onConnect);
socket.on('connect_error', onConnectError);
socket.on('disconnect',    onDisconnect);
socket.on('candidate',     onCandidate);

// Fallback alert if socket never connects
setTimeout(() => {
  if (!state.socketConnected) {
    console.error('❌ Socket.IO failed to connect after 5 seconds');
    alert('❌ Cannot connect to server. Check:\n1. Server is running (npm run dev)\n2. You are using the correct URL\n3. Both devices are on the same network');
  }
}, 5000);

// ─── Device Detection & Init ──────────────────────────────────────────────────

async function init() {
  const isMobileDevice = isMobile();
  const forceMode      = localStorage.getItem('forceMode');

  console.log('=== Device Detection ===');
  console.log('Auto-detected as:', isMobileDevice ? 'MOBILE' : 'DESKTOP');
  console.log('Force mode override:', forceMode || 'none');

  const shouldBePhone =
    forceMode === 'phone'   ? true  :
    forceMode === 'desktop' ? false :
    isMobileDevice;

  console.log('Final mode:', shouldBePhone ? 'MOBILE' : 'DESKTOP');
  shouldBePhone ? setupMobile() : setupDesktop();
}
