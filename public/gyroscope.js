// Gyroscope-based slide control for mobile devices
// Tilt right (positive gamma) → next slide
// Tilt left (negative gamma) → previous slide
// Includes debounce and threshold to prevent accidental triggers

import { state } from './state.js';

export function setupGyroscopeControl() {
  // Configuration
  const THRESHOLD = 20;        // degrees of tilt required to trigger slide change
  const DEBOUNCE_TIME = 600;   // milliseconds between slide changes

  let lastTriggerTime = 0;
  let lastDirection = null;    // 'left' or 'right'
  let isInitialized = false;

  // Request permission for iOS 13+
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ requires explicit user permission
    const permissionBtn = document.getElementById('request-permission-btn');
    if (permissionBtn) {
      permissionBtn.style.display = 'block';
      permissionBtn.addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              initializeGyroscope();
              permissionBtn.style.display = 'none';
              console.log('[PHONE] Gyroscope permission granted');
            } else {
              console.warn('[PHONE] Gyroscope permission denied');
            }
          })
          .catch(console.error);
      });
    } else {
      // No button found, try to initialize anyway
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            initializeGyroscope();
          }
        })
        .catch(console.error);
    }
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    // Non-iOS or older iOS devices
    initializeGyroscope();
  } else {
    console.warn('[PHONE] DeviceOrientationEvent not supported');
  }

  function initializeGyroscope() {
    if (isInitialized) return;
    isInitialized = true;

    // Show tilt debug indicator
    const indicator = document.getElementById('gyro-indicator');
    const gammaEl   = document.getElementById('gyro-gamma');
    const statusEl  = document.getElementById('gyro-status');
    const barEl     = document.getElementById('gyro-bar');
    const actionEl  = document.getElementById('gyro-last-action');
    if (indicator) indicator.style.display = 'block';

    window.addEventListener('deviceorientation', (event) => {
      const gamma = event.gamma; // Left-right tilt (-90 to 90)
      const now = Date.now();

      // Update live indicator (clamp to ±90°)
      if (gammaEl && gamma !== null) {
        const clamped = Math.max(-90, Math.min(90, gamma));
        gammaEl.textContent = clamped.toFixed(1) + '°';
        // Position bar: 0% = left edge, 50% = center, 100% = right edge
        const pct = ((clamped + 90) / 180) * 100;
        if (barEl) barEl.style.left = pct + '%';
        if (statusEl) {
          if (clamped > THRESHOLD)       { statusEl.textContent = '→ right'; statusEl.style.color = '#4CAF50'; }
          else if (clamped < -THRESHOLD) { statusEl.textContent = '← left';  statusEl.style.color = '#4CAF50'; }
          else                           { statusEl.textContent = 'neutral';  statusEl.style.color = ''; }
        }
      }

      // Check if enough time has passed since last trigger (debounce)
      if (now - lastTriggerTime < DEBOUNCE_TIME) {
        return;
      }

      let currentDirection = null;

      // Determine current tilt direction
      if (gamma > THRESHOLD) {
        currentDirection = 'right';
      } else if (gamma < -THRESHOLD) {
        currentDirection = 'left';
      }

      // Trigger only on direction change when threshold is exceeded
      // No boundary check here — Reveal.js on the desktop handles that
      if (currentDirection && currentDirection !== lastDirection) {
        if (currentDirection === 'right') {
          sendGyroscopeCommand('next', actionEl);
          lastTriggerTime = now;
          console.log('[PHONE] Gyroscope: tilt right → next (gamma:', gamma.toFixed(1), '°)');
        } else if (currentDirection === 'left') {
          sendGyroscopeCommand('prev', actionEl);
          lastTriggerTime = now;
          console.log('[PHONE] Gyroscope: tilt left → prev (gamma:', gamma.toFixed(1), '°)');
        }
      }

      // Only update direction when beyond threshold
      if (Math.abs(gamma) > THRESHOLD) {
        lastDirection = currentDirection;
      } else {
        lastDirection = null;
      }
    });

    console.log('[PHONE] Gyroscope control initialized (threshold: ' + THRESHOLD + '°, debounce: ' + DEBOUNCE_TIME + 'ms)');
  }

  function sendGyroscopeCommand(direction, actionEl) {
    if (!state.dataChannel || state.dataChannel.readyState !== 'open') {
      console.warn('[PHONE] Data channel not ready, cannot send gyroscope command');
      if (actionEl) { actionEl.textContent = '⚠️ Not connected to desktop'; actionEl.style.color = '#f90'; }
      return;
    }

    const message = {
      type: 'gyroscope-slide',
      direction: direction // 'next' or 'prev'
    };

    try {
      state.dataChannel.send(JSON.stringify(message));
      const label = direction === 'next' ? '▶ next' : '◀ prev';
      if (actionEl) { actionEl.textContent = '✅ Sent: ' + label; actionEl.style.color = '#4CAF50'; }
      console.log('[PHONE] Gyroscope command sent:', direction);
    } catch (e) {
      if (actionEl) { actionEl.textContent = '❌ Send failed'; actionEl.style.color = '#f44'; }
      console.error('[PHONE] Error sending gyroscope command:', e);
    }
  }
}
