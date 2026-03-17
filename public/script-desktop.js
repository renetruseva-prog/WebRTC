// Desktop entry point — always runs setupDesktop(), no device detection needed.
import { initSocket } from './socket-init.js';
import { setupDesktop } from './webrtc.js';

console.log('=== WebRTC Presenter App — Desktop ===');
initSocket(setupDesktop);

