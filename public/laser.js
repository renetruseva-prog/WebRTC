// Laser pointer — phone sends normalised touch coords, desktop renders a red dot
import { state } from './state.js';

// ─── Desktop rendering ────────────────────────────────────────────────────────

export function clearLaserCanvas() {
  const canvas = document.getElementById('laser-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawLaserDot(normX, normY) {
  const canvas = document.getElementById('laser-canvas');
  if (!canvas) return;

  // Keep canvas pixel size in sync with its CSS size
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const x = normX * canvas.width;
  const y = normY * canvas.height;
  const r = Math.max(canvas.width, canvas.height) * 0.008; // ~1.8% of screen

  // Outer glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  glow.addColorStop(0,   'rgba(255, 0, 0, 0.35)');
  glow.addColorStop(1,   'rgba(255, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Solid dot
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 30, 30, 0.95)';
  ctx.fill();
}

// ─── Phone touch pad ──────────────────────────────────────────────────────────

export function setupLaserPointer() {
  const pad    = document.getElementById('laser-pad');
  const toggle = document.getElementById('laser-toggle-btn');
  if (!pad || !toggle) return;

  let active = false;

  toggle.addEventListener('click', () => {
    active = !active;
    pad.style.display       = active ? 'block' : 'none';
    toggle.textContent      = active ? '✅ Laser on' : '🔴 Activate laser';
    toggle.style.background = active ? '#cc0000' : '#177b0e';
    if (!active) _sendClear();
  });

  function _normCoords(touch) {
    const rect = pad.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (touch.clientX - rect.left)  / rect.width)),
      y: Math.max(0, Math.min(1, (touch.clientY - rect.top)   / rect.height))
    };
  }

  function _sendPosition(touch) {
    if (!state.dataChannel || state.dataChannel.readyState !== 'open') return;
    const { x, y } = _normCoords(touch);
    state.dataChannel.send(JSON.stringify({ type: 'laser', x, y }));
  }

  function _sendClear() {
    if (!state.dataChannel || state.dataChannel.readyState !== 'open') return;
    state.dataChannel.send(JSON.stringify({ type: 'laser-clear' }));
  }

  pad.addEventListener('touchstart', (e) => { e.preventDefault(); _sendPosition(e.touches[0]); }, { passive: false });
  pad.addEventListener('touchmove',  (e) => { e.preventDefault(); _sendPosition(e.touches[0]); }, { passive: false });
  pad.addEventListener('touchend',   (e) => { e.preventDefault(); }, { passive: false });
}
