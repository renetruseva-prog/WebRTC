// WebRTC connection, data channel messaging, and per-device setup (desktop / mobile)
import { state, webrtcConfig } from './state.js';
import { showButtonFeedback, addListeners } from './utils.js';
import { startTimer, pauseTimer, resumeTimer, resetTimer, setupTimerSettings, showDesktopWarning, initializeBuzzAudio } from './timer.js';
import {
  loadSlides, loadPDFSlides, extractTextFromPDF,
  sendSlideNotesToPhone,
  updateNoteEditorForSlide, saveAndSendCurrentNote,
  loadDefaultSlides, syncAllSlidesToPhone
} from './slides.js';
import { setupGyroscopeControl } from './gyroscope.js';
import { setupLaserPointer, clearLaserCanvas, drawLaserDot } from './laser.js';

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

function setConnectionStatus(message, isConnected) {
  const statusIndicator = document.getElementById('connection-status-inline');
  const sendBtn = document.getElementById('send-notes-btn');
  const qrModalStatus = document.getElementById('connection-status');

  if (statusIndicator) {
    statusIndicator.textContent = message;
    statusIndicator.className = isConnected ? 'status-indicator connected' : 'status-indicator';
  }

  if (qrModalStatus) {
    qrModalStatus.textContent = message;
    qrModalStatus.style.color = isConnected ? 'green' : '#333';
  }

  if (sendBtn) {
    sendBtn.disabled = !isConnected;
    sendBtn.title = isConnected ? 'Send notes to phone' : 'Phone not connected';
  }

  // Update persistent badge in header
  const badge = document.getElementById('phone-status-badge');
  const label = document.getElementById('phone-status-label');
  if (badge && label) {
    const isConnecting = !isConnected && message.includes('Connecting');
    badge.className = 'phone-status-badge' + (isConnected ? ' connected' : isConnecting ? ' connecting' : '');
    label.textContent = isConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'No phone';
  }

  // Enable step 3 when phone is connected
  if (isConnected) {
    // Auto-close the QR modal when phone connects
    const qrOverlay = document.getElementById('qr-overlay');
    if (qrOverlay) qrOverlay.classList.add('hidden');

    maxStepReached = Math.max(maxStepReached, 3);
    if (currentStep < 3) {
      nextStep();
    } else {
      updateNavigationButtons();
    }
  }

  console.log('[DESKTOP] Status:', message);
}

// ─── Step Management ──────────────────────────────────────────────────────────

let currentStep = 1;
let maxStepReached = 1; // Track the highest step the user has reached

function showStep(stepNumber) {
  // Hide all steps
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById(`step-${i}`);
    if (step) {
      step.classList.add('hidden');
    }
  }

  // Show current step
  const targetStep = document.getElementById(`step-${stepNumber}`);
  if (targetStep) {
    targetStep.classList.remove('hidden');
    currentStep = stepNumber;

    // Update step dots visual state
    updateStepDots();

    // Update navigation buttons
    updateNavigationButtons();
  }
}

function updateStepDots() {
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      dot.classList.remove('active', 'available');

      if (i === currentStep) {
        dot.classList.add('active');
      } else if (i <= maxStepReached) {
        dot.classList.add('available');
      }
    }
  }
}

function updateNavigationButtons() {
  const prevBtn = document.getElementById('prev-step-btn');
  const nextBtn = document.getElementById('next-step-btn');

  if (prevBtn) {
    prevBtn.disabled = currentStep <= 1;
  }

  if (nextBtn) {
    // Can skip forward if not on the last step and has reached beyond current step
    nextBtn.disabled = currentStep >= 3 || currentStep >= maxStepReached;
    nextBtn.textContent = currentStep === 3 ? 'Done' : 'Skip →';
  }
}

function nextStep() {
  if (currentStep < 3) {
    const nextStepNumber = currentStep + 1;
    maxStepReached = Math.max(maxStepReached, nextStepNumber);
    showStep(nextStepNumber);
  }
}

function prevStep() {
  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
}

function gotoStep(stepNumber) {
  // Only allow going to steps that have been unlocked
  if (stepNumber >= 1 && stepNumber <= maxStepReached) {
    showStep(stepNumber);
  }
}

function disableStep(stepNumber) {
  // If we're on this step and it becomes unavailable, go back to a previous step
  if (stepNumber === currentStep && stepNumber > 1) {
    // Don't reduce maxStepReached, just go back
    showStep(Math.min(currentStep - 1, maxStepReached));
  }
}

function startPresentation() {
  const setupFlow = document.getElementById('setup-flow');
  const menuToggleBtn = document.getElementById('menu-toggle-btn');

  if (setupFlow) {
    setupFlow.style.display = 'none';
  }

  // Show toggle button when setup is hidden
  if (menuToggleBtn) {
    menuToggleBtn.classList.remove('hidden');
  }

  // Adjust reveal container to full screen
  const revealContainer = document.querySelector('.reveal-container');
  if (revealContainer) {
    revealContainer.style.top = '0';
    revealContainer.style.height = '100%';
  }

  console.log('[DESKTOP] Presentation started - setup flow hidden');
}

function showSetupMenu() {
  const setupFlow = document.getElementById('setup-flow');
  const menuToggleBtn = document.getElementById('menu-toggle-btn');

  if (setupFlow) {
    setupFlow.style.display = 'block';
  }

  // Hide toggle button when setup is visible
  if (menuToggleBtn) {
    menuToggleBtn.classList.add('hidden');
  }

  // Adjust reveal container back to account for setup
  const revealContainer = document.querySelector('.reveal-container');
  if (revealContainer) {
    revealContainer.style.top = '140px';
    revealContainer.style.height = 'calc(100% - 140px)';
  }

  console.log('[DESKTOP] Setup menu shown - toggle button hidden');
}

// ─── Data Channel ─────────────────────────────────────────────────────────────

export function setupDataChannel(channel) {
  const deviceType = state.isPhone ? '[PHONE]' : '[DESKTOP]';

  channel.onopen = () => {
    console.log(deviceType, 'WebRTC Data Channel OPENED - Ready State:', channel.readyState);
    state.dataChannelReady = true;
    if (!state.isPhone) {
      setConnectionStatus('✅ Phone Connected — ready to send notes', true);

      // Sync all current slide data with the newly connected phone
      syncAllSlidesToPhone();
    }
  };

  channel.onerror = (error) => {
    state.dataChannelReady = false;
    if (!state.isPhone) setConnectionStatus('❌ Connection error', false);
    console.error(deviceType, 'Data Channel Error:', error);
  };

  channel.onclose = () => {
    console.log(deviceType, 'Data Channel CLOSED');
    state.dataChannelReady = false;
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
      if (state.isPhone) {
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
      if (state.isPhone) {
        // Desktop moved to a new slide — sync phone position
        displayPhoneNote(msg.slideIndex);
        updateSlideNavigationButtons();
      }
      break;

    case 'presentation-name':
      if (state.isPhone) {
        state.presentationName = msg.name;
        document.getElementById('presentation-name').textContent = msg.name;
      }
      break;

    case 'slide-count':
      if (state.isPhone) {
        state.totalPhoneSlides = msg.total;
        if (state.totalPhoneSlides > 0) displayPhoneNote(0);
        updateSlideInfo();
        updateSlideNavigationButtons();
      }
      break;

    case 'timer-control':
      if (!state.isPhone) {
        const actions = { start: startTimer, pause: pauseTimer, resume: resumeTimer, reset: resetTimer };
        if (actions[msg.action]) actions[msg.action]();
      }
      break;

    case 'timer-warning':
      if (!state.isPhone) {
        showDesktopWarning(msg.message, msg.isUrgent);
      }
      break;

    case 'gyroscope-slide':
      if (!state.isPhone) {
        if (msg.direction === 'next') {
          state.Reveal_Instance.next();
        } else if (msg.direction === 'prev') {
          state.Reveal_Instance.prev();
        }
        console.log('[DESKTOP] Slide changed via gyroscope:', msg.direction);
      }
      break;

    case 'laser':
      if (!state.isPhone) drawLaserDot(msg.x, msg.y);
      break;

    case 'laser-clear':
      if (!state.isPhone) clearLaserCanvas();
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
  function openQROverlay() {
    renderQRCode(data.url);
    document.getElementById('qr-overlay').classList.remove('hidden');
  }
  function closeQROverlay() {
    document.getElementById('qr-overlay').classList.add('hidden');
  }
  function onFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileInput = document.getElementById('file-upload');
    fileInput.disabled = true;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const pdfSlides = await extractTextFromPDF(e.target.result);
          loadPDFSlides(pdfSlides, file.name);
        } else {
          loadSlides(e.target.result, file.name);
        }

        // Enable step 2 once slides are loaded and update navigation
        maxStepReached = Math.max(maxStepReached, 2);
        if (currentStep === 1) {
          nextStep();
        } else {
          updateNavigationButtons();
        }
      } catch (error) {
        alert('Error processing file: ' + error.message);
      } finally {
        fileInput.disabled = false;
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
    clearLaserCanvas();
    // Separate message so the phone can sync its current slide position
    // without getting confused by manual note sends for other slides
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify({ type: 'slide-change', slideIndex }));
    }
  }
  async function onAnswer(answer) {
    try {
      if (!state.peerConnection || state.peerConnection.signalingState !== 'have-local-offer') {
        console.warn('[DESKTOP] Ignoring answer, state:', state.peerConnection?.signalingState);
        return;
      }
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[DESKTOP] Remote description set — handshake complete');
    } catch (error) {
      console.error('[DESKTOP] Error handling answer:', error);
    }
  }

  // ── Bind all UI event listeners ────────────────────────────────────────────
  addListeners({
    'show-qr-btn':        ['click',  openQROverlay],
    'close-qr-btn':       ['click',  closeQROverlay],
    'file-upload':        ['change', onFileChange],
    'note-slide-select':  ['change', updateNoteEditorForSlide],
    'send-notes-btn':     ['click',  saveAndSendCurrentNote],
    'start-presentation-btn': ['click', startPresentation],
    'menu-toggle-btn':    ['click',  showSetupMenu],
    'close-setup-btn':    ['click',  startPresentation], // Same as start presentation
    'prev-step-btn':      ['click',  prevStep],
    'next-step-btn':      ['click',  nextStep],
    'dot-1':             ['click',  () => gotoStep(1)],
    'dot-2':             ['click',  () => gotoStep(2)],
    'dot-3':             ['click',  () => gotoStep(3)],
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

    // Load default demo slides to show users what the tool does
    loadDefaultSlides();

    // Since we have default slides, user can access step 2
    maxStepReached = 2;
    updateNavigationButtons();

    console.log('[DESKTOP] Default demo slides loaded');
  });

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  let offer;

  function onIceCandidateDesktop(event) {
    if (event.candidate) {
      state.socket.emit('candidate', event.candidate);
    }
  }

  async function prepareOffer() {
    // Clean up any old connection
    if (state.peerConnection) {
      state.peerConnection.close();
    }

    state.peerConnection = new RTCPeerConnection(webrtcConfig);
    _setupPeerConnectionLogging(state.peerConnection, '[DESKTOP]');
    state.peerConnection.onicecandidate = onIceCandidateDesktop;

    state.dataChannel = state.peerConnection.createDataChannel('controls');
    setupDataChannel(state.dataChannel);

    offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    console.log('[DESKTOP] Offer prepared');
  }

  // Prepare the first offer
  await prepareOffer();
  setConnectionStatus('📡 Waiting for phone...', false);

  // Simple guard: only send the offer once per connection cycle
  const sendOffer = () => {
    if (offerSent) return;
    offerSent = true;
    console.log('[DESKTOP] Sending offer to phone');
    setConnectionStatus('⏳ Connecting to phone...', false);
    state.socket.emit('offer', offer);
  };

  state.socket.on('phone-joined', sendOffer);
  state.socket.on('phone-ready', sendOffer);

  // When phone leaves: clean up and prepare a fresh offer for next connection
  state.socket.on('phone-left', async () => {
    console.log('[DESKTOP] Phone left, preparing for reconnection');
    setConnectionStatus('❌ Phone Disconnected', false);
    disableStep(3);
    offerSent = false;
    await prepareOffer();
    setConnectionStatus('📡 Waiting for phone...', false);
  });

  state.socket.on('answer', onAnswer);

  state.socket.on('candidate', async (candidate) => {
    try {
      if (state.peerConnection && state.peerConnection.remoteDescription) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (e) {
      console.error('[DESKTOP] Error adding ICE candidate:', e);
    }
  });
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

  console.log('[PHONE] UI switched to mobile mode');

  let processingOffer = false;

  // ── Event handlers ─────────────────────────────────────────────────────────
  function onPrevSlide() {
    // Send to desktop to change slide there; it will send back 'slide-change'
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify({ type: 'gyroscope-slide', direction: 'prev' }));
      console.log('[PHONE] Prev button pressed, command sent to desktop');
    } else {
      console.warn('[PHONE] Data channel not ready for prev slide');
    }
  }
  function onNextSlide() {
    // Send to desktop to change slide there; it will send back 'slide-change'
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify({ type: 'gyroscope-slide', direction: 'next' }));
      console.log('[PHONE] Next button pressed, command sent to desktop');
    } else {
      console.warn('[PHONE] Data channel not ready for next slide');
    }
  }
  async function onOffer(offer) {
    if (processingOffer) return;
    processingOffer = true;

    try {
      console.log('[PHONE] Received offer from desktop');

      // Always create a fresh peer connection for each offer
      if (state.peerConnection) {
        state.peerConnection.close();
      }

      state.peerConnection = new RTCPeerConnection(webrtcConfig);
      _setupPeerConnectionLogging(state.peerConnection, '[PHONE]');
      state.peerConnection.ondatachannel = onDataChannel;
      state.peerConnection.onicecandidate = onIceCandidatePhone;

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
  function onDataChannel(event) {
    console.log('[PHONE] Data channel received:', event.channel.label);
    state.dataChannel = event.channel;
    setupDataChannel(state.dataChannel);
  }
  function onIceCandidatePhone(event) {
    if (event.candidate) {
      state.socket.emit('candidate', event.candidate);
    }
  }

  // Initial peer connection (will be replaced by onOffer on each connection)
  state.peerConnection = new RTCPeerConnection(webrtcConfig);
  state.peerConnection.ondatachannel = onDataChannel;
  state.peerConnection.onicecandidate = onIceCandidatePhone;

  state.socket.on('offer', onOffer);

  // Handle ICE candidates from desktop
  state.socket.on('candidate', async (candidate) => {
    try {
      if (state.peerConnection && state.peerConnection.remoteDescription) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[PHONE] Added ICE candidate from desktop');
      } else {
        console.log('[PHONE] Received ICE candidate but no remote description yet');
      }
    } catch (error) {
      console.error('[PHONE] Error adding ICE candidate:', error);
    }
  });

  // Setup gyroscope control for slide navigation
  setupGyroscopeControl();

  // Setup laser pointer touch pad
  setupLaserPointer();

  // Setup timer settings and warnings
  setupTimerSettings();

  // Initialize buzz audio for mobile alerts
  initializeBuzzAudio();

  // Signal desktop that phone is ready (slight delay to ensure socket is registered)
  setTimeout(() => {
    console.log('[PHONE] Emitting phone-ready signal to desktop');
    state.socket.emit('phone-ready');
  }, 500);

  state.socket.on('phone-rejected', () => {
    console.log('[PHONE] Connection rejected — session already in use');
    document.getElementById('mobile').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:30px;text-align:center;">
        <div style="font-size:48px;margin-bottom:20px;">🔒</div>
        <h2 style="color:#ffd700;margin-bottom:12px;">Session In Use</h2>
        <p style="color:rgba(255,255,255,0.8);font-size:16px;line-height:1.5;">
          Another phone is already connected to this presentation.
        </p>
      </div>`;
  });
}
