// Mobile entry point — always runs setupMobile(), no device detection needed.
import { state } from './state.js';
import { initSocket } from './socket-init.js';
import { setupMobile } from './webrtc.js';

console.log('=== WebRTC Presenter App — Mobile ===');
state.isPhone = true;
initSocket(setupMobile);
