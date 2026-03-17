// Shared mutable application state — imported by all modules
export const state = {
  socket: null,
  peerConnection: null,
  dataChannel: null,
  Reveal_Instance: null,
  socketConnected: false,
  dataChannelReady: false,
  isPhone: false,          // set to true by script-mobile.js before setup runs
  presentationName: 'No presentation uploaded',
  customNotes: {},
  phoneNotes: {},
  currentPhoneSlide: 0,
  totalPhoneSlides: 0,
  timerState: {
    isRunning: false,
    elapsedSeconds: 0,
    intervalId: null,
    presentationDurationMinutes: 30, // Default 30-minute presentation
    warningOffset1: 60, // First warning at 60 seconds before end
    warningOffset2: 30, // Second warning at 30 seconds before end
    warningTriggered1: false,
    warningTriggered2: false
  }
};

// WebRTC ICE server configuration
export const webrtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
