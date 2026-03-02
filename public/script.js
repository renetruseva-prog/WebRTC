const socket = io();
let peerConnection;
let dataChannel;
let Reveal_Instance;
let socketConnected = false;

// Wait for socket to connect before proceeding
socket.on('connect', () => {
  socketConnected = true;
  console.log('✅ Socket.IO connected! ID:', socket.id);
  console.log('=== WebRTC Presenter App Starting ===');
  init();
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket.IO connection error:', error);
  alert('❌ Failed to connect to server. Make sure the server is running on port 3000.');
});

socket.on('disconnect', () => {
  console.log('⚠️ Socket.IO disconnected');
});

// Fallback: if socket doesn't connect in 5 seconds, show error
setTimeout(() => {
  if (!socketConnected) {
    console.error('❌ Socket.IO failed to connect after 5 seconds');
    alert('❌ Cannot connect to server. Check:\n1. Server is running (npm run dev)\n2. You are using the correct URL\n3. Both devices are on the same network');
  }
}, 5000);

// Timer State
let timerState = {
  isRunning: false,
  elapsedSeconds: 0,
  intervalId: null
};

// Custom Notes Store (per slide)
let customNotes = {};

// Phone Notes Store and Navigation
let phoneNotes = {};
let currentPhoneSlide = 0;
let totalPhoneSlides = 0;
let presentationName = 'No presentation uploaded';

// Data Channel State
let dataChannelReady = false;

// WebRTC Configuration
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// --- HELPER FUNCTIONS ---
function isMobile() {
  const userAgent = navigator.userAgent;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  return isMobileUA;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function extractTextFromPDF(arrayBuffer) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const slides = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      
      // Render page to canvas
      const scale = 2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      // Convert canvas to data URL (image)
      const imageUrl = canvas.toDataURL('image/png');

      // Try to extract text for notes
      let pageText = '';
      try {
        const textContent = await page.getTextContent();
        pageText = textContent.items.map(item => item.str).join(' ');
      } catch (e) {
        pageText = `Page ${i}`;
      }

      slides.push({
        imageUrl,
        text: pageText
      });
    }

    return slides;
  } catch (error) {
    console.error('Error extracting PDF:', error);
    throw new Error('Failed to parse PDF');
  }
}

function updateTimerDisplay() {
  const timeStr = formatTime(timerState.elapsedSeconds);
  document.getElementById('timer-display').textContent = timeStr;
  // Also update desktop timer if visible
  const desktopTimer = document.getElementById('desktop-timer-display');
  if (desktopTimer) {
    desktopTimer.textContent = timeStr;
  }
}

function updateTimerButtonStates() {
  const startBtn = document.getElementById('timer-start');
  const pauseBtn = document.getElementById('timer-pause');
  const resumeBtn = document.getElementById('timer-resume');
  
  if (!isMobile()) return; // Only on phone
  
  if (timerState.isRunning) {
    // Timer is running: show Pause button
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'block';
    if (resumeBtn) resumeBtn.style.display = 'none';
  } else if (timerState.elapsedSeconds > 0) {
    // Timer is paused with time elapsed: show Resume button
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'block';
  } else {
    // Timer is reset: show Start button
    if (startBtn) startBtn.style.display = 'block';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
  }
}

function sendTimerControlToDesktop(action) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'timer-control', action }));
  }
}

function startTimer() {
  if (timerState.isRunning) return;
  timerState.isRunning = true;
  timerState.intervalId = setInterval(() => {
    timerState.elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
  updateTimerButtonStates();
  sendTimerControlToDesktop('start');
}

function pauseTimer() {
  timerState.isRunning = false;
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  updateTimerButtonStates();
  sendTimerControlToDesktop('pause');
}

function resumeTimer() {
  if (timerState.isRunning) return;
  timerState.isRunning = true;
  timerState.intervalId = setInterval(() => {
    timerState.elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
  updateTimerButtonStates();
  sendTimerControlToDesktop('resume');
}

function resetTimer() {
  pauseTimer();
  timerState.elapsedSeconds = 0;
  updateTimerDisplay();
  updateTimerButtonStates();
  sendTimerControlToDesktop('reset');
}

function renderQRCode(url) {
  const typeNumber = 4;
  const errorCorrectionLevel = 'L';
  const qr = qrcode(typeNumber, errorCorrectionLevel);
  qr.addData(url);
  qr.make();
  document.getElementById('qr').innerHTML = qr.createImgTag(4);
}

function parseMarkdownSlides(markdown) {
  const slides = markdown.split('---').map(s => s.trim()).filter(s => s.length > 0);
  return slides.map(slide => {
    const lines = slide.split('\n');
    let content = '';
    let notes = '';
    
    // Split content and notes by "Notes:" marker
    const notesIndex = slide.indexOf('Notes:');
    if (notesIndex !== -1) {
      content = slide.substring(0, notesIndex).trim();
      notes = slide.substring(notesIndex + 6).trim();
    } else {
      content = slide;
    }

    return { content, notes };
  });
}

function loadSlides(markdown, fileName = 'Presentation') {
  presentationName = fileName.replace(/\.(md|markdown|txt)$/i, '');
  const slides = parseMarkdownSlides(markdown);
  const slidesContainer = document.getElementById('slides-container');
  slidesContainer.innerHTML = '';

  slides.forEach((slideData, index) => {
    const section = document.createElement('section');
    section.setAttribute('data-notes', slideData.notes);
    
    let htmlContent = slideData.content;
    // Try to use marked if available, otherwise use plain text
    if (typeof marked !== 'undefined') {
      try {
        htmlContent = marked.parse(slideData.content);
      } catch (e) {
        console.warn('Marked parsing failed, using plain text:', e);
        htmlContent = `<pre>${slideData.content}</pre>`;
      }
    } else {
      // Fallback: convert basic markdown to HTML manually
      htmlContent = slideData.content
        .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/\n/g, '<br>');
    }

    section.innerHTML = `
      <div style="background: rgba(255,255,255,0.1); padding: 40px; border-radius: 8px;">
        ${htmlContent}
      </div>
    `;
    slidesContainer.appendChild(section);
  });

  // Reinitialize Reveal.js after adding slides
  if (Reveal_Instance) {
    Reveal_Instance.initialize();
    Reveal_Instance.sync();
    Reveal_Instance.slide(0, 0, 0); // Always start from first slide
  }

  // Populate slide dropdown and show timer
  populateSlideDropdown();
  document.getElementById('desktop-timer').style.display = 'block';
  
  // Clear custom notes for new slides
  customNotes = {};

  // Send presentation name, slide count and initial notes to phone
  sendPresentationNametoPhone();
  sendSlideCountToPhone();
  sendSlideNotestoPhone(0);
}

function loadPDFSlides(pdfSlides, fileName = 'Presentation') {
  presentationName = fileName.replace(/\.pdf$/i, '');
  const slidesContainer = document.getElementById('slides-container');
  slidesContainer.innerHTML = '';

  pdfSlides.forEach((slideData, index) => {
    const section = document.createElement('section');
    section.setAttribute('data-notes', slideData.text || `Page ${index + 1}`);
    section.innerHTML = `
      <img src="${slideData.imageUrl}" style="max-width: 90vw; max-height: 90vh; width: auto; height: auto;" />
    `;
    slidesContainer.appendChild(section);
  });

  // Reinitialize Reveal.js after adding slides
  if (Reveal_Instance) {
    Reveal_Instance.initialize();
    Reveal_Instance.sync();
    Reveal_Instance.slide(0, 0, 0); // Always start from first slide
  }

  // Populate slide dropdown and show timer
  populateSlideDropdown();
  document.getElementById('desktop-timer').style.display = 'block';
  
  // Clear custom notes for new slides
  customNotes = {};

  // Send presentation name, slide count and initial notes to phone
  sendPresentationNametoPhone();
  sendSlideCountToPhone();
  sendSlideNotestoPhone(0);
}

function sendPresentationNametoPhone() {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'presentation-name', name: presentationName }));
    console.log('[DESKTOP] Sent presentation name to phone:', presentationName);
  }
}

function sendSlideNotestoPhone(slideIndex) {
  // Only use user-written custom notes — never fall back to slide content
  const notes = customNotes[slideIndex] || 'No notes for this slide';

  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'notes', slideIndex, content: notes }));
  }
}

function sendSlideCountToPhone() {
  const slides = document.querySelectorAll('.reveal .slides section');
  const total = slides.length;
  if (total > 0 && dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'slide-count', total }));
    console.log('[DESKTOP] Sent slide count to phone:', total);
  }
}

function populateSlideDropdown() {
  const slides = document.querySelectorAll('.reveal .slides section');
  const select = document.getElementById('note-slide-select');
  select.innerHTML = '';
  
  slides.forEach((slide, index) => {
    const option = document.createElement('option');
    const slideTitle = slide.textContent.split('\n')[0].substring(0, 30) || `Slide ${index + 1}`;
    option.value = index;
    option.textContent = `Slide ${index + 1}: ${slideTitle}`;
    select.appendChild(option);
  });
}

function updateNoteEditorForSlide() {
  const select = document.getElementById('note-slide-select');
  const noteEditor = document.getElementById('note-editor');
  const slideIndex = parseInt(select.value);
  
  if (slideIndex >= 0) {
    noteEditor.value = customNotes[slideIndex] || '';
  } else {
    noteEditor.value = '';
  }
}

function showButtonFeedback(buttonElement, successMessage, duration = 3000) {
  const originalText = buttonElement.textContent;
  buttonElement.textContent = successMessage;
  buttonElement.style.opacity = '0.7';
  
  setTimeout(() => {
    buttonElement.textContent = originalText;
    buttonElement.style.opacity = '1';
  }, duration);
}

function saveNoteForSlide() {
  const select = document.getElementById('note-slide-select');
  const noteEditor = document.getElementById('note-editor');
  const slideIndex = parseInt(select.value);
  const saveBtn = document.getElementById('save-note-btn');
  
  if (slideIndex >= 0) {
    customNotes[slideIndex] = noteEditor.value;
    showButtonFeedback(saveBtn, 'Note Saved ✅');
  } else {
    showButtonFeedback(saveBtn, 'Select a slide first ⚠️', 2000);
  }
}

function displayPhoneNote(slideIndex) {
  if (totalPhoneSlides === 0) {
    document.getElementById('speaker-notes').textContent = 'No presentation uploaded';
    document.getElementById('slide-info').textContent = '';
    return;
  }
  const note = phoneNotes[slideIndex] || 'No notes for this slide';
  document.getElementById('speaker-notes').textContent = note;
  currentPhoneSlide = slideIndex;
  updateSlideInfo();
}

function updateSlideInfo() {
  const total = totalPhoneSlides > 0 ? totalPhoneSlides : '?';
  document.getElementById('slide-info').textContent = `Slide ${currentPhoneSlide + 1}/${total}`;
}

function updateSlideNavigationButtons() {
  const prevBtn = document.getElementById('prev-slide-btn');
  const nextBtn = document.getElementById('next-slide-btn');
  if (prevBtn) prevBtn.disabled = currentPhoneSlide <= 0;
  if (nextBtn) nextBtn.disabled = totalPhoneSlides === 0 || currentPhoneSlide >= totalPhoneSlides - 1;
}

// Single source-of-truth status setter — called directly from events, no polling
function setConnectionStatus(message, color, isConnected) {
  const statusDisplay = document.getElementById('connection-status-display');
  const statusText = document.getElementById('connection-status-text');
  const sendBtn = document.getElementById('send-notes-btn');
  const qrModalStatus = document.getElementById('connection-status');

  if (statusDisplay && statusText) {
    statusText.textContent = message;
    statusDisplay.style.background = color;
    statusDisplay.style.display = 'block';
  }

  if (qrModalStatus) {
    qrModalStatus.textContent = message;
    qrModalStatus.style.color = isConnected ? 'green' : '#333';
  }

  if (sendBtn) {
    sendBtn.disabled = !isConnected;
    sendBtn.style.opacity = isConnected ? '1' : '0.5';
    sendBtn.title = isConnected ? 'Send notes to phone' : 'Phone not connected';
  }

  console.log('[DESKTOP] Status:', message);
}

function sendAllNotesToPhone() {
  const sendBtn = document.getElementById('send-notes-btn');
  
  if (!dataChannel) {
    console.error('[DESKTOP] No data channel exists');
    showButtonFeedback(sendBtn, 'Reload & reconnect ⚠️', 3000);
    return;
  }
  
  if (dataChannel.readyState !== 'open') {
    console.error(`[DESKTOP] Data channel state is '${dataChannel.readyState}', not 'open'`);
    console.error('[DESKTOP] Connection details:', {
      peerConnectionState: peerConnection?.connectionState,
      iceConnectionState: peerConnection?.iceConnectionState,
      dataChannelReady: dataChannelReady
    });
    showButtonFeedback(sendBtn, 'Phone connecting... try again', 3000);
    return;
  }

  let allNotesSent = 0;
  
  // Send all custom notes using Object.entries for more robust iteration
  for (const [slideIndex, noteContent] of Object.entries(customNotes)) {
    if (noteContent && noteContent.trim()) {
      dataChannel.send(JSON.stringify({ 
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

function setupDataChannel(channel) {
  const deviceType = isMobile() ? '[PHONE]' : '[DESKTOP]';
  
  channel.onopen = () => {
    console.log(deviceType, "WebRTC Data Channel OPENED - Ready State:", channel.readyState);
    dataChannelReady = true;
    if (!isMobile()) {
      setConnectionStatus('✅ Phone Connected — ready to send notes', 'rgba(0, 180, 0, 0.8)', true);
      console.log('[DESKTOP] Sending initial notes and slide count to phone');
      sendSlideCountToPhone();
      sendSlideNotestoPhone(0);
    }
  };

  channel.onerror = (error) => {
    dataChannelReady = false;
    if (!isMobile()) {
      setConnectionStatus('❌ Connection error', 'rgba(255, 0, 0, 0.8)', false);
    }
    console.error(deviceType, 'Data Channel Error:', error);
    console.error('  - Channel state:', channel.readyState);
    console.error('  - RTCPeerConnection state:', peerConnection ? peerConnection.connectionState : 'No peer connection');
    console.error('  - RTCPeerConnection ICE state:', peerConnection ? peerConnection.iceConnectionState : 'No ICE state');
  };

  channel.onclose = () => {
    console.log(deviceType, 'Data Channel CLOSED');
    dataChannelReady = false;
    if (!isMobile()) {
      setConnectionStatus('❌ Phone Disconnected', 'rgba(255, 0, 0, 0.8)', false);
    }
  };

  channel.onmessage = (event) => {
    const message = event.data;
    console.log(deviceType, "Received message:", message);
    
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.log(deviceType, "Message is not JSON:", message);
      return;
    }

    if (parsedMessage.type === 'notes') {
      if (!isMobile()) {
        console.log("[Desktop] Ignoring notes message");
      } else {
        console.log(`[PHONE] Received notes for slide ${parsedMessage.slideIndex}: ${parsedMessage.content.substring(0, 50)}...`);
        // Store notes for this slide consistently with slide-notes messages
        phoneNotes[parsedMessage.slideIndex] = parsedMessage.content;
        // If this is the current slide, display the updated note
        if (parsedMessage.slideIndex === currentPhoneSlide) {
          displayPhoneNote(currentPhoneSlide);
        }
      }
    } else if (parsedMessage.type === 'slide-notes') {
      if (isMobile()) {
        console.log(`[Phone] Received notes for slide ${parsedMessage.slideIndex}: ${parsedMessage.content.substring(0, 50)}...`);
        // Store notes for this slide
        phoneNotes[parsedMessage.slideIndex] = parsedMessage.content;
        // If this is the first note received for current slide, display it
        if (parsedMessage.slideIndex === currentPhoneSlide) {
          displayPhoneNote(currentPhoneSlide);
        }
        updateSlideNavigationButtons();
      }
    } else if (parsedMessage.type === 'presentation-name') {
      if (isMobile()) {
        console.log(`[Phone] Received presentation name: ${parsedMessage.name}`);
        presentationName = parsedMessage.name;
        document.getElementById('presentation-name').textContent = presentationName;
      }
    } else if (parsedMessage.type === 'slide-count') {
      if (isMobile()) {
        console.log(`[Phone] Received total slide count: ${parsedMessage.total}`);
        totalPhoneSlides = parsedMessage.total;
        if (totalPhoneSlides > 0) {
          displayPhoneNote(0);
        }
        updateSlideInfo();
        updateSlideNavigationButtons();
      }
    } else if (parsedMessage.type === 'timer-control') {
      if (!isMobile()) {
        console.log(`[Desktop] Received timer control: ${parsedMessage.action}`);
        if (parsedMessage.action === 'start') {
          startTimer();
        } else if (parsedMessage.action === 'pause') {
          pauseTimer();
        } else if (parsedMessage.action === 'resume') {
          resumeTimer();
        } else if (parsedMessage.action === 'reset') {
          resetTimer();
        }
      }
    } else if (parsedMessage.type === 'next') {
      if (!isMobile()) {
        console.log("[Desktop] Moving to next slide...");
      }
    } else if (parsedMessage.type === 'prev') {
      if (!isMobile()) {
        console.log("[Desktop] Moving to previous slide...");
      }
    }
  };
}

// --- CORE LOGIC ---
const init = async () => {
  const isMobileDevice = isMobile();
  const forceMode = localStorage.getItem('forceMode'); // Check for override
  
  console.log('=== Device Detection ===');
  console.log('User Agent:', navigator.userAgent);
  console.log('Auto-detected as:', isMobileDevice ? 'MOBILE' : 'DESKTOP');
  console.log('Force mode override:', forceMode || 'none');
  
  // Use override if set, otherwise use auto-detection
  const shouldBePhone = forceMode === 'phone' ? true : (forceMode === 'desktop' ? false : isMobileDevice);
  
  console.log('Final mode:', shouldBePhone ? 'MOBILE' : 'DESKTOP');
  
  if (!shouldBePhone) {
    console.log('Setting up DESKTOP mode...');
    setupDesktop();
  } else {
    console.log('Setting up MOBILE mode...');
    setupMobile();
  }
};

// Add console commands for testing
window.forcePhone = () => {
  localStorage.setItem('forceMode', 'phone');
  console.log('Force mode set to PHONE. Reload page to apply.');
  alert('Force mode set to PHONE. Reloading page...');
  location.reload();
};

window.forceDesktop = () => {
  localStorage.setItem('forceMode', 'desktop');
  console.log('Force mode set to DESKTOP. Reload page to apply.');
  alert('Force mode set to DESKTOP. Reloading page...');
  location.reload();
};

window.clearForce = () => {
  localStorage.removeItem('forceMode');
  console.log('Force mode cleared. Reload page to apply.');
  alert('Force mode cleared. Reloading page...');
  location.reload();
};

console.log('💡 For testing, use these commands in console:');
console.log('  forcePhone()   - Force phone mode');
console.log('  forceDesktop() - Force desktop mode');
console.log('  clearForce()   - Clear override and auto-detect');

async function setupDesktop() {
  // Get URL and initial QR (don't show yet)
  const response = await fetch('/config');
  const data = await response.json();
  console.log('[DESKTOP] Server URL:', data.url);
  console.log('[DESKTOP] Socket ID:', socket.id);

  // Setup toggle overlay button
  document.getElementById('toggle-overlay-btn').addEventListener('click', () => {
    const overlay = document.getElementById('upload-overlay');
    overlay.classList.toggle('hidden');
  });

  // Setup close overlay button
  document.getElementById('close-overlay-btn').addEventListener('click', () => {
    const overlay = document.getElementById('upload-overlay');
    overlay.classList.add('hidden');
  });

  // Setup QR button listener
  document.getElementById('show-qr-btn').addEventListener('click', () => {
    renderQRCode(data.url);
    document.getElementById('qr-overlay').classList.remove('hidden');
    console.log('[DESKTOP] QR code displayed');
  });

  document.getElementById('close-qr-btn').addEventListener('click', () => {
    document.getElementById('qr-overlay').classList.add('hidden');
  });

  // Setup slide loading
  document.getElementById('load-slides-btn').addEventListener('click', () => {
    const markdown = document.getElementById('markdown-input').value;
    if (markdown.trim()) {
      loadSlides(markdown, 'Pasted Presentation');
    }
  });

  // Setup file upload
  document.getElementById('upload-file-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('file-upload');
    if (fileInput.files.length === 0) {
      alert('Please select a file first');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // Handle PDF - render pages as images
          const pdfSlides = await extractTextFromPDF(e.target.result);
          loadPDFSlides(pdfSlides, file.name);
          console.log('PDF loaded with', pdfSlides.length, 'pages');
        } else {
          // Handle text files
          const content = e.target.result;
          document.getElementById('markdown-input').value = content;
          loadSlides(content, file.name);
          console.log('Slides loaded from file:', file.name);
        }
      } catch (error) {
        alert('Error processing file: ' + error.message);
      }
    };

    reader.onerror = () => {
      alert('Error reading file');
    };

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });

  // Setup note editor controls
  document.getElementById('note-slide-select').addEventListener('change', updateNoteEditorForSlide);
  document.getElementById('save-note-btn').addEventListener('click', saveNoteForSlide);
  document.getElementById('send-notes-btn').addEventListener('click', sendAllNotesToPhone);

  // Initialize Reveal.js
  Reveal_Instance = new Reveal({
    hash: true,
    width: '100%',
    height: '100%',
    margin: 0.1,
    minScale: 0.2,
    maxScale: 2.0,
    controlsTutorial: false,
    plugins: [ RevealMarkdown, RevealNotes ]
  });

  Reveal_Instance.initialize().then(() => {
    // Listen for slide changes
    Reveal_Instance.on('slidechanged', (event) => {
      const slideIndex = Reveal_Instance.getState().indexh;
      sendSlideNotestoPhone(slideIndex);
    });
  });

  // Prepare WebRTC
  peerConnection = new RTCPeerConnection(config);
  console.log('[DESKTOP] RTCPeerConnection created');
  
  // Add peer connection state monitors (logging only)
  peerConnection.onconnectionstatechange = () => {
    console.log('[DESKTOP] Connection State Changed:', peerConnection.connectionState);
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    console.log('[DESKTOP] ICE Connection State Changed:', peerConnection.iceConnectionState);
  };
  
  peerConnection.onicegatheringstatechange = () => {
    console.log('[DESKTOP] ICE Gathering State Changed:', peerConnection.iceGatheringState);
  };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[DESKTOP] Sending ICE candidate');
      socket.emit('candidate', event.candidate);
    }
  };
  
  dataChannel = peerConnection.createDataChannel("controls");
  console.log('[DESKTOP] Data channel created, state:', dataChannel.readyState);
  setupDataChannel(dataChannel);
  setConnectionStatus('📡 Waiting for phone...', 'rgba(255, 165, 0, 0.8)', false);

  const offer = await peerConnection.createOffer();
  console.log('[DESKTOP] Offer created');
  
  await peerConnection.setLocalDescription(offer);
  console.log('[DESKTOP] Local description set');

  // Guard: only send the offer once, even if multiple phone events fire
  let offerSent = false;
  const sendOffer = (reason) => {
    if (offerSent) {
      console.log('[DESKTOP] Offer already sent, ignoring duplicate trigger:', reason);
      return;
    }
    offerSent = true;
    console.log('[DESKTOP] Sending offer to phone (trigger:', reason, ')');
    setConnectionStatus('⏳ Phone on page, establishing connection...', 'rgba(255, 165, 0, 0.8)', false);
    socket.emit('offer', offer);
  };

  // Socket.IO: phone-joined fires the INSTANT phone connects (server-driven)
  socket.on('phone-joined', () => sendOffer('phone-joined'));

  // phone-ready is a client-side fallback (500ms after phone-joined)
  socket.on('phone-ready', () => sendOffer('phone-ready'));

  // Socket.IO: phone-left fires the INSTANT phone disconnects
  socket.on('phone-left', () => {
    console.log('[DESKTOP] Phone left!');
    dataChannelReady = false;
    offerSent = false; // Allow re-offer if phone reconnects
    setConnectionStatus('❌ Phone Disconnected', 'rgba(255, 0, 0, 0.8)', false);
  });

  socket.on('answer', async (answer) => {
    try {
      if (peerConnection.signalingState !== 'have-local-offer') {
        console.warn('[DESKTOP] Ignoring duplicate answer — signalingState:', peerConnection.signalingState);
        return;
      }
      console.log('[DESKTOP] Received answer from phone');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[DESKTOP] Remote description set - WebRTC handshake complete');
    } catch (error) {
      console.error('[DESKTOP] Error handling answer:', error);
    }
  });
}

async function setupMobile() {
  console.log('[PHONE] Mobile setup starting...');
  console.log('[PHONE] Socket ID:', socket.id);
  
  document.getElementById('desktop').classList.add('hidden');
  document.getElementById('mobile').classList.remove('hidden');

  // Allow the page to scroll naturally on mobile
  document.body.style.overflow = 'auto';

  // Remove Reveal.js container entirely — not needed on mobile
  const revealContainer = document.querySelector('.reveal-container');
  if (revealContainer) revealContainer.remove();

  // Hide the desktop-only "Start the process" button
  const toggleBtn = document.getElementById('toggle-overlay-btn');
  if (toggleBtn) toggleBtn.style.display = 'none';

  console.log('[PHONE] UI switched to mobile mode');

  // Setup timer controls
  document.getElementById('timer-start').addEventListener('click', startTimer);
  document.getElementById('timer-pause').addEventListener('click', pauseTimer);
  document.getElementById('timer-resume').addEventListener('click', resumeTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);

  // Setup slide navigation controls
  const prevBtn = document.getElementById('prev-slide-btn');
  const nextBtn = document.getElementById('next-slide-btn');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPhoneSlide > 0) {
        displayPhoneNote(currentPhoneSlide - 1);
        updateSlideNavigationButtons();
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (totalPhoneSlides > 0 && currentPhoneSlide < totalPhoneSlides - 1) {
        displayPhoneNote(currentPhoneSlide + 1);
        updateSlideNavigationButtons();
      }
    });
  }

  peerConnection = new RTCPeerConnection(config);
  console.log('[PHONE] RTCPeerConnection created');
  
  // Add peer connection state monitors
  peerConnection.onconnectionstatechange = () => {
    console.log('[PHONE] Connection State Changed:', peerConnection.connectionState);
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    console.log('[PHONE] ICE Connection State Changed:', peerConnection.iceConnectionState);
  };
  
  peerConnection.onicegatheringstatechange = () => {
    console.log('[PHONE] ICE Gathering State Changed:', peerConnection.iceGatheringState);
  };

  peerConnection.ondatachannel = (event) => {
    console.log('[PHONE] Data channel received:', event.channel.label, '- State:', event.channel.readyState);
    dataChannel = event.channel;
    setupDataChannel(dataChannel);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[PHONE] Sending ICE candidate');
      socket.emit('candidate', event.candidate);
    }
  };

  peerConnection.onerror = (error) => {
    console.error('[PHONE] RTCPeerConnection error:', error);
  };

  let processingOffer = false;
  socket.on('offer', async (offer) => {
    try {
      // Ignore offers that arrive while already processing one
      if (processingOffer || peerConnection.signalingState !== 'stable') {
        console.warn('[PHONE] Ignoring duplicate offer — processingOffer:', processingOffer, 'signalingState:', peerConnection.signalingState);
        return;
      }
      processingOffer = true;
      console.log('[PHONE] Received offer from desktop');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[PHONE] Remote description set');
      
      const answer = await peerConnection.createAnswer();
      console.log('[PHONE] Answer created');
      
      await peerConnection.setLocalDescription(answer);
      console.log('[PHONE] Local description set');
      
      socket.emit('answer', answer);
      console.log('[PHONE] Answer sent to desktop');
    } catch (error) {
      console.error('[PHONE] Error handling offer:', error);
    } finally {
      processingOffer = false;
    }
  });

  console.log('[PHONE] Waiting for offer from desktop...');
  
  // Signal to desktop that phone is ready to receive offer
  setTimeout(() => {
    console.log('[PHONE] Emitting phone-ready signal to desktop');
    socket.emit('phone-ready');
  }, 500);
}

socket.on('candidate', async (candidate) => {
  try {
    console.log('Received ICE candidate');
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('ICE candidate added successfully');
  } catch (e) { 
    console.error("Error adding ice candidate", e); 
  }
});

// init() will be called automatically when socket.io connects (see socket.on('connect') above)
