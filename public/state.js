// Shared mutable application state — imported by all modules
export const state = {
  socket: null,
  peerConnection: null,
  dataChannel: null,
  Reveal_Instance: null,
  socketConnected: false,
  dataChannelReady: false,
  presentationName: 'No presentation uploaded',
  customNotes: {},
  phoneNotes: {},
  currentPhoneSlide: 0,
  totalPhoneSlides: 0,
  timerState: {
    isRunning: false,
    elapsedSeconds: 0,
    intervalId: null
  }
};

// WebRTC ICE server configuration
export const webrtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
