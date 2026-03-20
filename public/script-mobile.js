// Mobile entry point — always runs setupMobile(), no device detection needed.
import { state } from './state.js';
import { initSocket } from './socket-init.js';
import { setupMobile } from './webrtc.js';

console.log('=== WebRTC Presenter App — Mobile ===');
state.isPhone = true;

let mobileSetupDone = false;

initSocket(() => {
  // Re-announce on every connect/reconnect so the server and desktop know
  // the phone is here and ready for a fresh WebRTC offer.
  state.socket.emit('phone-ready');

  // Only register setup listeners once — on reconnects we just re-emit
  // phone-ready above; setupMobile() and its socket listeners keep working.
  if (mobileSetupDone) return;

  state.socket.once('phone-rejected', () => {
    console.log('[PHONE] Connection rejected — session already in use');
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:30px;text-align:center;background:#1a1a2e;">
        <div style="font-size:48px;margin-bottom:20px;">🔒</div>
        <h2 style="color:#ffd700;margin-bottom:12px;">Session In Use</h2>
        <p style="color:rgba(255,255,255,0.8);font-size:16px;line-height:1.5;">
          Another phone is already connected to this presentation.
        </p>
      </div>`;
  });

  state.socket.once('phone-accepted', () => {
    console.log('[PHONE] Session available — starting mobile setup');
    mobileSetupDone = true;
    document.getElementById('connecting-overlay').style.display = 'none';
    setupMobile();
  });
});
