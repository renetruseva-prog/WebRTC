// camera management — phone captures video, desktop displays remote stream

import { state } from './state.js';

// ─── Mobile: Camera capture setup ──────────────────────────────────────────

export function setupCameraControl() {
  if (!state.isPhone) return;

  const toggleBtn = document.getElementById('toggle-camera-btn');
  if (!toggleBtn) {
    console.warn('[CAMERA] Camera toggle button not found in mobile UI');
    return;
  }

  let cameraEnabled = false;

  toggleBtn.addEventListener('click', async () => {
    if (!cameraEnabled) {
      await enableCamera();
    } else {
      disableCamera();
    }
  });

  async function enableCamera() {
    try {
      console.log('[CAMERA] Requesting camera access...');

      // request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'  // front camera on mobile
        },
        audio: false  // video-only
      });

      console.log('[CAMERA] Camera access granted');
      state.cameraState.stream = stream;
      state.cameraState.hasPermission = true;

      // get video track
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track available');
      }

      state.cameraState.videoTrack = videoTrack;

      // add video track to peer connection
      if (!state.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('[CAMERA] Adding video track to peer connection');
      console.log('[CAMERA] Peer connection state:', state.peerConnection.signalingState);
      console.log('[CAMERA] Peer connection ICE state:', state.peerConnection.iceConnectionState);

      const sender = state.peerConnection.addTrack(videoTrack, stream);
      console.log('[CAMERA] Track added, sender:', sender);
      console.log('[CAMERA] Signaling state after addTrack:', state.peerConnection.signalingState);

      // update UI
      cameraEnabled = true;
      state.cameraState.enabled = true;
      toggleBtn.textContent = '📹 Disable Camera';
      toggleBtn.classList.add('recording');

      console.log('[CAMERA] Camera enabled and streaming to desktop');
    } catch (error) {
      console.error('[CAMERA] Failed to enable camera:', error.message);

      // handle specific error cases
      if (error.name === 'NotAllowedError') {
        alert('❌ Camera permission denied. Please allow camera access in browser settings.');
      } else if (error.name === 'NotFoundError') {
        alert('❌ No camera found on this device.');
      } else if (error.name === 'NotReadableError') {
        alert('❌ Camera is already in use by another application.');
      } else {
        alert('❌ Error accessing camera: ' + error.message);
      }

      state.cameraState.hasPermission = false;
    }
  }

  function disableCamera() {
    try {
      console.log('[CAMERA] Disabling camera');

      // stop the video track
      if (state.cameraState.videoTrack) {
        state.cameraState.videoTrack.stop();
        console.log('[CAMERA] Video track stopped');
      }

      // stop the stream
      if (state.cameraState.stream) {
        state.cameraState.stream.getTracks().forEach(track => {
          track.stop();
        });
        state.cameraState.stream = null;
      }

      // update state
      cameraEnabled = false;
      state.cameraState.enabled = false;
      state.cameraState.videoTrack = null;

      // update UI
      toggleBtn.textContent = '📹 Enable Camera';
      toggleBtn.classList.remove('recording');

      // notify desktop to hide the video feed
      if (state.dataChannel && state.dataChannel.readyState === 'open') {
        state.dataChannel.send(JSON.stringify({ type: 'camera-disabled' }));
      }

      console.log('[CAMERA] Camera disabled');
    } catch (error) {
      console.error('[CAMERA] Error disabling camera:', error);
    }
  }

  // cleanup on page unload
  window.addEventListener('beforeunload', disableCamera);
}

// ─── desktop: Remote video display ────────────────────────────────────────

export function setupRemoteVideoDisplay() {
  if (state.isPhone) return;

  // This function is called from setupDesktop() to establish the ontrack handler
  // The actual handler is set directly in setupDesktop() for better control
  console.log('[CAMERA] Remote video display setup initialized (handler in webrtc.js)');
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

export function cleanupCamera() {
  console.log('[CAMERA] Cleaning up camera resources');

  // stop local video track
  if (state.cameraState.videoTrack) {
    state.cameraState.videoTrack.stop();
  }

  // stop local stream
  if (state.cameraState.stream) {
    state.cameraState.stream.getTracks().forEach(track => {
      track.stop();
    });
  }

  // clear remote video
  const remoteVideo = document.getElementById('remote-video');
  if (remoteVideo) {
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none';
  }

  // reset state
  state.cameraState.enabled = false;
  state.cameraState.stream = null;
  state.cameraState.videoTrack = null;
}
