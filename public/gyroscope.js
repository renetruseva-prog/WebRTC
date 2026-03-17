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
  let isEnabled = false;
  let deviceOrientationListener = null;

  // Get UI elements
  const permissionBtn = document.getElementById('request-permission-btn');
  const gyroSection = document.getElementById('gyro-section');
  const disableBtn = document.getElementById('gyro-disable-btn');
  const directionIndicator = document.getElementById('direction-indicator');
  const directionText = document.getElementById('direction-text');

  // Request permission for iOS 13+
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ requires explicit user permission
    if (permissionBtn) {
      permissionBtn.style.display = 'block';
      permissionBtn.addEventListener('click', requestPermissionAndInit);
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
    // Non-iOS or older iOS devices - show enable button
    if (permissionBtn) {
      permissionBtn.style.display = 'block';
      permissionBtn.textContent = '🔄 Enable Gyroscope Control';
      permissionBtn.addEventListener('click', () => {
        initializeGyroscope();
      });
    } else {
      initializeGyroscope();
    }
  } else {
    console.warn('[PHONE] DeviceOrientationEvent not supported');
  }

  // Setup disable button
  if (disableBtn) {
    disableBtn.addEventListener('click', disableGyroscope);
  }

  function requestPermissionAndInit() {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          initializeGyroscope();
          console.log('[PHONE] Gyroscope permission granted');
        } else {
          console.warn('[PHONE] Gyroscope permission denied');
        }
      })
      .catch(console.error);
  }

  function initializeGyroscope() {
    if (isInitialized) return;
    isInitialized = true;
    isEnabled = true;

    // Hide permission button and show gyro section
    if (permissionBtn) permissionBtn.style.display = 'none';
    if (gyroSection) gyroSection.style.display = 'block';

    // Update initial UI state
    updateDirectionFeedback('neutral', null);

    // Create and add device orientation listener
    deviceOrientationListener = (event) => handleDeviceOrientation(event);
    window.addEventListener('deviceorientation', deviceOrientationListener);

    console.log('[PHONE] Gyroscope control initialized (threshold: ' + THRESHOLD + '°, debounce: ' + DEBOUNCE_TIME + 'ms)');
  }

  function disableGyroscope() {
    isEnabled = false;
    isInitialized = false;

    // Remove event listener
    if (deviceOrientationListener) {
      window.removeEventListener('deviceorientation', deviceOrientationListener);
      deviceOrientationListener = null;
    }

    // Hide gyro section and show permission button
    if (gyroSection) gyroSection.style.display = 'none';
    if (permissionBtn) {
      permissionBtn.style.display = 'block';
      permissionBtn.textContent = '🔄 Enable Gyroscope Control';
    }

    // Reset state
    lastDirection = null;
    lastTriggerTime = 0;

    console.log('[PHONE] Gyroscope control disabled');
  }

  function handleDeviceOrientation(event) {
    if (!isEnabled) return;

    const gamma = event.gamma; // Left-right tilt (-90 to 90)
    const now = Date.now();

    // Update visual feedback
    if (gamma !== null) {
      if (gamma > THRESHOLD) {
        updateDirectionFeedback('right', gamma);
      } else if (gamma < -THRESHOLD) {
        updateDirectionFeedback('left', gamma);
      } else {
        updateDirectionFeedback('neutral', gamma);
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
    if (currentDirection && currentDirection !== lastDirection) {
      if (currentDirection === 'right') {
        sendGyroscopeCommand('next');
        lastTriggerTime = now;
        console.log('[PHONE] Gyroscope: tilt right → next (gamma:', gamma.toFixed(1), '°)');
      } else if (currentDirection === 'left') {
        sendGyroscopeCommand('prev');
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
  }

  function updateDirectionFeedback(direction, gamma) {
    if (!directionIndicator || !directionText) return;

    switch (direction) {
      case 'left':
        directionIndicator.textContent = '⬅️';
        directionIndicator.style.transform = 'scale(1.2)';
        directionText.textContent = 'Tilting left - Previous slide';
        directionText.style.color = '#4CAF50';
        break;
      case 'right':
        directionIndicator.textContent = '➡️';
        directionIndicator.style.transform = 'scale(1.2)';
        directionText.textContent = 'Tilting right - Next slide';
        directionText.style.color = '#4CAF50';
        break;
      default:
        directionIndicator.textContent = '📱';
        directionIndicator.style.transform = 'scale(1)';
        directionText.textContent = 'Tilt left or right to navigate slides';
        directionText.style.color = '';
        break;
    }
  }

  function sendGyroscopeCommand(direction) {
    if (!state.dataChannel || state.dataChannel.readyState !== 'open') {
      console.warn('[PHONE] Data channel not ready, cannot send gyroscope command');
      if (directionText) {
        directionText.textContent = '⚠️ Not connected to desktop';
        directionText.style.color = '#f90';
      }
      return;
    }

    const message = {
      type: 'gyroscope-slide',
      direction: direction // 'next' or 'prev'
    };

    try {
      state.dataChannel.send(JSON.stringify(message));
      console.log('[PHONE] Gyroscope command sent:', direction);

      // Brief feedback
      const action = direction === 'next' ? 'Next slide' : 'Previous slide';
      if (directionText) {
        const originalText = directionText.textContent;
        const originalColor = directionText.style.color;
        directionText.textContent = `✅ ${action} sent`;
        directionText.style.color = '#4CAF50';

        setTimeout(() => {
          directionText.textContent = originalText;
          directionText.style.color = originalColor;
        }, 1000);
      }
    } catch (e) {
      console.error('[PHONE] Error sending gyroscope command:', e);
      if (directionText) {
        directionText.textContent = '❌ Send failed';
        directionText.style.color = '#f44';
      }
    }
  }
}
