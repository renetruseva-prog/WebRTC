// WebRTC connection, data channel messaging, and per-device setup (desktop / mobile)
import { state, webrtcConfig } from './state.js';
import { isMobile, showButtonFeedback, addListeners } from './utils.js';
import { startTimer, pauseTimer, resumeTimer, resetTimer, updateTimerDisplay, updateTimerButtonStates } from './timer.js';
import {
  loadSlides, loadPDFSlides, extractTextFromPDF,
  sendSlideNotesToPhone, sendSlideCountToPhone,
  updateNoteEditorForSlide, saveAndSendCurrentNote
} from './slides.js';
import { setupGyroscopeControl } from './gyroscope.js';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

// Attach console-log listeners for every RTCPeerConnection state change event
function _setupPeerConnectionLogging(pc, tag) {
  pc.onconnectionstatechange    = () => console.log(tag, 'Connection State Changed:', pc.connectionState);
  pc.oniceconnectionstatechange = () => console.log(tag, 'ICE Connection State Changed:', pc.iceConnectionState);
  pc.onicegatheringstatechange  = () => console.log(tag, 'ICE Gathering State Changed:', pc.iceGatheringState);
}

// ─── QR Code ──────────────────────────────────────────────────────────────────

function renderQRCode(url) {
  // qrcode is loaded from the CDN <script> tag in index.html
  const qr = qrcode(4, 'L');
  qr.addData(url);
  qr.make();
  document.getElementById('qr').innerHTML = qr.createImgTag(4);
}

// ─── Phone UI Helpers ─────────────────────────────────────────────────────────

function displayPhoneNote(slideIndex) {
  if (state.totalPhoneSlides === 0) {
    document.getElementById('speaker-notes').textContent = 'No presentation uploaded';
    document.getElementById('slide-info').textContent = '';
    return;
  }
  document.getElementById('speaker-notes').textContent =
    state.phoneNotes[slideIndex] || 'No notes for this slide';
  state.currentPhoneSlide = slideIndex;
  updateSlideInfo();
}

function updateSlideInfo() {
  const total = state.totalPhoneSlides > 0 ? state.totalPhoneSlides : '?';
  document.getElementById('slide-info').textContent =
    `Slide ${state.currentPhoneSlide + 1}/${total}`;
}

function updateSlideNavigationButtons() {
  const prevBtn = document.getElementById('prev-slide-btn');
  const nextBtn = document.getElementById('next-slide-btn');
  if (prevBtn) prevBtn.disabled = state.currentPhoneSlide <= 0;
  if (nextBtn) nextBtn.disabled =
    state.totalPhoneSlides === 0 || state.currentPhoneSlide >= state.totalPhoneSlides - 1;
}

// ─── Desktop Connection Status ────────────────────────────────────────────────

function setConnectionStatus(message, color, isConnected) {
  const statusDisplay = document.getElementById('connection-status-display');
  const statusText    = document.getElementById('connection-status-text');
  const sendBtn       = document.getElementById('send-notes-btn');
  const qrModalStatus = document.getElementById('connection-status');

  if (statusDisplay && statusText) {
    statusText.textContent       = message;
    statusDisplay.style.background = color;
    statusDisplay.style.display  = 'block';
  }

  if (qrModalStatus) {
    qrModalStatus.textContent  = message;
    qrModalStatus.style.color  = isConnected ? 'green' : '#333';
  }

  if (sendBtn) {
    sendBtn.disabled      = !isConnected;
    sendBtn.style.opacity = isConnected ? '1' : '0.5';
    sendBtn.title         = isConnected ? 'Send notes to phone' : 'Phone not connected';
  }

  console.log('[DESKTOP] Status:', message);
}

function sendAllNotesToPhone() {
  const sendBtn = document.getElementById('send-notes-btn');

  if (!state.dataChannel) {
    console.error('[DESKTOP] No data channel exists');
    showButtonFeedback(sendBtn, 'Reload & reconnect ⚠️', 3000);
    return;
  }

  if (state.dataChannel.readyState !== 'open') {
    console.error(`[DESKTOP] Data channel state is '${state.dataChannel.readyState}', not 'open'`);
    showButtonFeedback(sendBtn, 'Phone connecting... try again', 3000);
    return;
  }

  let allNotesSent = 0;
  for (const [slideIndex, noteContent] of Object.entries(state.customNotes)) {
    if (noteContent && noteContent.trim()) {
      state.dataChannel.send(JSON.stringify({
        type: 'slide-notes',
        slideIndex: parseInt(slideIndex),
        content: noteContent
      }));
      console.log(`Sent note for slide ${slideIndex}: ${noteContent.substring(0, 50)}...`);
      allNotesSent++;
    }
  }

  if (allNotesSent > 0) {
    showButtonFeedback(sendBtn, `Sent ${allNotesSent} note(s) ✅`);
  } else {
    showButtonFeedback(sendBtn, 'No notes to send ⚠️', 2500);
  }
}

// ─── Data Channel ─────────────────────────────────────────────────────────────

export function setupDataChannel(channel) {
  const deviceType = isMobile() ? '[PHONE]' : '[DESKTOP]';

  channel.onopen = () => {
    console.log(deviceType, 'WebRTC Data Channel OPENED - Ready State:', channel.readyState);
    state.dataChannelReady = true;
    if (!isMobile()) {
      setConnectionStatus('✅ Phone Connected — ready to send notes', 'rgba(0, 180, 0, 0.8)', true);
      sendSlideCountToPhone();
      sendSlideNotesToPhone(0);
    }
  };

  channel.onerror = (error) => {
    state.dataChannelReady = false;
    if (!isMobile()) setConnectionStatus('❌ Connection error', 'rgba(255, 0, 0, 0.8)', false);
    console.error(deviceType, 'Data Channel Error:', error);
  };

  channel.onclose = () => {
    console.log(deviceType, 'Data Channel CLOSED');
    state.dataChannelReady = false;
    if (!isMobile()) setConnectionStatus('❌ Phone Disconnected', 'rgba(255, 0, 0, 0.8)', false);
  };

  channel.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      console.log(deviceType, 'Non-JSON message received:', event.data);
      return;
    }
    console.log(deviceType, 'Received message:', msg.type);
    _handleMessage(msg);
  };
}

function _handleMessage(msg) {
  switch (msg.type) {
    case 'notes':
    case 'slide-notes':
      if (isMobile()) {
        // Store silently — never change which slide the phone is viewing
        state.phoneNotes[msg.slideIndex] = msg.content;
        // Only refresh display if this note is for the slide already on screen
        if (msg.slideIndex === state.currentPhoneSlide) {
          displayPhoneNote(state.currentPhoneSlide);
        }
        updateSlideNavigationButtons();
      }
      break;

    case 'slide-change':
      if (isMobile()) {
        // Desktop moved to a new slide — sync phone position
        displayPhoneNote(msg.slideIndex);
        updateSlideNavigationButtons();
      }
      break;

    case 'presentation-name':
      if (isMobile()) {
        state.presentationName = msg.name;
        document.getElementById('presentation-name').textContent = msg.name;
      }
      break;

    case 'slide-count':
      if (isMobile()) {
        state.totalPhoneSlides = msg.total;
        if (state.totalPhoneSlides > 0) displayPhoneNote(0);
        updateSlideInfo();
        updateSlideNavigationButtons();
      }
      break;

    case 'timer-control':
      if (!isMobile()) {
        const actions = { start: startTimer, pause: pauseTimer, resume: resumeTimer, reset: resetTimer };
        if (actions[msg.action]) actions[msg.action]();
      }
      break;

    case 'gyroscope-slide':
      if (!isMobile()) {
        if (msg.direction === 'next') {
          state.Reveal_Instance.next();
        } else if (msg.direction === 'prev') {
          state.Reveal_Instance.prev();
        }
        console.log('[DESKTOP] Slide changed via gyroscope:', msg.direction);
      }
      break;
  }
}

// ─── Desktop Setup ────────────────────────────────────────────────────────────

export async function setupDesktop() {
  const response = await fetch('/config');
  const data = await response.json();
  console.log('[DESKTOP] Server URL:', data.url);
  console.log('[DESKTOP] Socket ID:', state.socket.id);

  // Only send the offer once even if multiple phone events fire
  let offerSent = false;

  // ── Event handlers ─────────────────────────────────────────────────────────
  function toggleUploadOverlay() {
    document.getElementById('upload-overlay').classList.toggle('hidden');
  }
  function closeUploadOverlay() {
    document.getElementById('upload-overlay').classList.add('hidden');
  }
  function openQROverlay() {
    renderQRCode(data.url);
    document.getElementById('qr-overlay').classList.remove('hidden');
  }
  function closeQROverlay() {
    document.getElementById('qr-overlay').classList.add('hidden');
  }
  function onUploadFileClick() {
    const fileInput = document.getElementById('file-upload');
    if (fileInput.files.length === 0) { alert('Please select a file first'); return; }
    const file   = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const pdfSlides = await extractTextFromPDF(e.target.result);
          loadPDFSlides(pdfSlides, file.name);
          console.log('PDF loaded with', pdfSlides.length, 'pages');
        } else {
          loadSlides(e.target.result, file.name);
          console.log('Slides loaded from file:', file.name);
        }
      } catch (error) {
        alert('Error processing file: ' + error.message);
      }
    };
    reader.onerror = () => alert('Error reading file');
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }
  function onSlideChanged() {
    const slideIndex = state.Reveal_Instance.getState().indexh;
    sendSlideNotesToPhone(slideIndex);
    // Separate message so the phone can sync its current slide position
    // without getting confused by manual note sends for other slides
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify({ type: 'slide-change', slideIndex }));
    }
  }
  function onPhoneLeft() {
    console.log('[DESKTOP] Phone left!');
    state.dataChannelReady = false;
    offerSent = false; // Allow re-offer on reconnect
    setConnectionStatus('❌ Phone Disconnected', 'rgba(255, 0, 0, 0.8)', false);
  }
  async function onAnswer(answer) {
    try {
      if (state.peerConnection.signalingState !== 'have-local-offer') {
        console.warn('[DESKTOP] Ignoring duplicate answer — signalingState:', state.peerConnection.signalingState);
        return;
      }
      console.log('[DESKTOP] Received answer from phone');
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[DESKTOP] Remote description set — WebRTC handshake complete');
    } catch (error) {
      console.error('[DESKTOP] Error handling answer:', error);
    }
  }

  // ── Bind all UI event listeners ────────────────────────────────────────────
  addListeners({
    'toggle-overlay-btn': ['click',  toggleUploadOverlay],
    'close-overlay-btn':  ['click',  closeUploadOverlay],
    'show-qr-btn':        ['click',  openQROverlay],
    'close-qr-btn':       ['click',  closeQROverlay],
    'upload-file-btn':    ['click',  onUploadFileClick],
    'note-slide-select':  ['change', updateNoteEditorForSlide],
    'send-notes-btn':     ['click',  saveAndSendCurrentNote],
  });

  // ── Reveal.js presentation ─────────────────────────────────────────────────
  state.Reveal_Instance = new Reveal({
    hash: true, width: '100%', height: '100%',
    margin: 0.1, minScale: 0.2, maxScale: 2.0,
    controlsTutorial: false,
    plugins: [RevealMarkdown, RevealNotes]
  });
  state.Reveal_Instance.initialize().then(() => {
    state.Reveal_Instance.on('slidechanged', onSlideChanged);
  });

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  state.peerConnection = new RTCPeerConnection(webrtcConfig);
  console.log('[DESKTOP] RTCPeerConnection created');


  _setupPeerConnectionLogging(state.peerConnection, '[DESKTOP]');

  function onIceCandidateDesktop(event) {
    if (event.candidate) {
      console.log('[DESKTOP] Sending ICE candidate');
      state.socket.emit('candidate', event.candidate);
    }
  }
  state.peerConnection.onicecandidate = onIceCandidateDesktop;

  state.dataChannel = state.peerConnection.createDataChannel('controls');
  console.log('[DESKTOP] Data channel created, state:', state.dataChannel.readyState);
  setupDataChannel(state.dataChannel);
  setConnectionStatus('📡 Waiting for phone...', 'rgba(255, 165, 0, 0.8)', false);

  const offer = await state.peerConnection.createOffer();
  await state.peerConnection.setLocalDescription(offer);
  console.log('[DESKTOP] Offer ready, waiting for phone...');

  const sendOffer = (reason) => {
    if (offerSent) { console.log('[DESKTOP] Offer already sent, ignoring:', reason); return; }
    offerSent = true;
    console.log('[DESKTOP] Sending offer to phone (trigger:', reason, ')');
    setConnectionStatus('⏳ Phone on page, establishing connection...', 'rgba(255, 165, 0, 0.8)', false);
    state.socket.emit('offer', offer);
  };

  state.socket.on('phone-joined', () => sendOffer('phone-joined'));
  state.socket.on('phone-ready',  () => sendOffer('phone-ready'));
  state.socket.on('phone-left', onPhoneLeft);
  state.socket.on('answer', onAnswer);
}

// ─── Mobile Setup ─────────────────────────────────────────────────────────────

export async function setupMobile() {
  console.log('[PHONE] Mobile setup starting...');
  console.log('[PHONE] Socket ID:', state.socket.id);

  // Switch UI to phone view
  const desktopEl = document.getElementById('desktop');
  if (desktopEl) desktopEl.classList.add('hidden');
  document.getElementById('mobile').classList.remove('hidden');
  document.body.style.overflow = 'auto';

  const revealContainer = document.querySelector('.reveal-container');
  if (revealContainer) revealContainer.remove();
  const toggleBtn = document.getElementById('toggle-overlay-btn');
  if (toggleBtn) toggleBtn.style.display = 'none';

  console.log('[PHONE] UI switched to mobile mode');

  let processingOffer = false;

  // ── Event handlers ─────────────────────────────────────────────────────────
  function onPrevSlide() {
    if (state.currentPhoneSlide > 0) {
      displayPhoneNote(state.currentPhoneSlide - 1);
      updateSlideNavigationButtons();
    }
  }
  function onNextSlide() {
    if (state.totalPhoneSlides > 0 && state.currentPhoneSlide < state.totalPhoneSlides - 1) {
      displayPhoneNote(state.currentPhoneSlide + 1);
      updateSlideNavigationButtons();
    }
  }
  async function onOffer(offer) {
    try {
      if (processingOffer || state.peerConnection.signalingState !== 'stable') {
        console.warn('[PHONE] Ignoring duplicate offer — processingOffer:', processingOffer, 'signalingState:', state.peerConnection.signalingState);
        return;
      }
      processingOffer = true;
      console.log('[PHONE] Received offer from desktop');
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);
      state.socket.emit('answer', answer);
      console.log('[PHONE] Answer sent to desktop');
    } catch (error) {
      console.error('[PHONE] Error handling offer:', error);
    } finally {
      processingOffer = false;
    }
  }

  // ── Bind all UI event listeners ────────────────────────────────────────────
  addListeners({
    'timer-start':    ['click', startTimer],
    'timer-pause':    ['click', pauseTimer],
    'timer-resume':   ['click', resumeTimer],
    'timer-reset':    ['click', resetTimer],
    'prev-slide-btn': ['click', onPrevSlide],
    'next-slide-btn': ['click', onNextSlide],
  });

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  state.peerConnection = new RTCPeerConnection(webrtcConfig);
  console.log('[PHONE] RTCPeerConnection created');

  _setupPeerConnectionLogging(state.peerConnection, '[PHONE]');
  state.peerConnection.onerror = (err) => console.error('[PHONE] RTCPeerConnection error:', err);

  function onDataChannel(event) {
    console.log('[PHONE] Data channel received:', event.channel.label);
    state.dataChannel = event.channel;
    setupDataChannel(state.dataChannel);
  }
  function onIceCandidatePhone(event) {
    if (event.candidate) {
      console.log('[PHONE] Sending ICE candidate');
      state.socket.emit('candidate', event.candidate);
    }
  }
  state.peerConnection.ondatachannel  = onDataChannel;
  state.peerConnection.onicecandidate = onIceCandidatePhone;

  state.socket.on('offer', onOffer);

  // Setup gyroscope control for slide navigation
  setupGyroscopeControl();

  // Signal desktop that phone is ready (slight delay to ensure socket is registered)
  setTimeout(() => {
    console.log('[PHONE] Emitting phone-ready signal to desktop');
    state.socket.emit('phone-ready');
  }, 500);
}
