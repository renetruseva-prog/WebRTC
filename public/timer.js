// Presentation timer — controls the countdown/stopwatch shown on phone and desktop
import { state } from './state.js';
import { formatTime } from './utils.js';

// ─── Display ──────────────────────────────────────────────────────────────────

function updateTimerDisplay() {
  const timeStr = formatTime(state.timerState.elapsedSeconds);
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) timerDisplay.textContent = 'Timer: ' + timeStr;

  // Mirror the time on the desktop overlay as well
  const desktopTimer = document.getElementById('desktop-timer-display');
  if (desktopTimer) desktopTimer.textContent = timeStr;

  // Update progress bar and remaining time
  updateProgressBar();
  checkForWarnings();
}

function updateProgressBar() {
  if (!state.isPhone) return;

  const progressBar = document.getElementById('timer-progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const timeRemaining = document.getElementById('time-remaining');

  const totalSeconds = state.timerState.presentationDurationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - state.timerState.elapsedSeconds);
  const progressPercentage = Math.min(100, (state.timerState.elapsedSeconds / totalSeconds) * 100);

  if (state.timerState.isRunning && progressBar && progressFill && timeRemaining) {
    progressBar.style.display = 'block';
    progressFill.style.width = progressPercentage + '%';

    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingSecondsOnly = remainingSeconds % 60;
    timeRemaining.textContent = `${remainingMinutes}:${remainingSecondsOnly.toString().padStart(2, '0')} left`;
  } else if (progressBar) {
    progressBar.style.display = 'none';
  }
}

function checkForWarnings() {
  if (!state.isPhone || !state.timerState.isRunning) return;

  const totalSeconds = state.timerState.presentationDurationMinutes * 60;
  const remainingSeconds = totalSeconds - state.timerState.elapsedSeconds;

  // Check for first warning
  if (remainingSeconds <= state.timerState.warningOffset1 && !state.timerState.warningTriggered1 && remainingSeconds > 0) {
    state.timerState.warningTriggered1 = true;
    const message = `⏰ ${Math.floor(state.timerState.warningOffset1 / 60)} minute${state.timerState.warningOffset1 >= 120 ? 's' : ''} remaining!`;
    showWarning(message, false);
    sendWarningToDesktop(remainingSeconds, false);
    playMobileBuzzAlert(false);
  }

  // Check for final warning
  if (remainingSeconds <= state.timerState.warningOffset2 && !state.timerState.warningTriggered2 && remainingSeconds > 0) {
    state.timerState.warningTriggered2 = true;
    const message = `🚨 ${state.timerState.warningOffset2} seconds left!`;
    showWarning(message, true);
    sendWarningToDesktop(remainingSeconds, true);
    playMobileBuzzAlert(true);
  }

  // Time's up!
  if (remainingSeconds <= 0 && state.timerState.elapsedSeconds >= totalSeconds) {
    showWarning('⏰ Time\'s up! Presentation complete.', true);
    sendWarningToDesktop(0, true);
    // No buzzing when time is completely up - just visual notification
  }
}

function sendWarningToDesktop(remainingSeconds, isUrgent) {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    const message = remainingSeconds > 0
      ? `You have ${remainingSeconds} seconds left`
      : 'Time\'s up! Presentation complete';

    state.dataChannel.send(JSON.stringify({
      type: 'timer-warning',
      message: message,
      remainingSeconds: remainingSeconds,
      isUrgent: isUrgent
    }));
  }
}

export function showDesktopWarning(message, isUrgent = false) {
  const popup = document.getElementById('desktop-warning-popup');
  const popupText = document.getElementById('desktop-warning-text');
  const popupContent = popup?.querySelector('.warning-popup-content');

  if (popup && popupText && popupContent) {
    popupText.textContent = message;
    popupContent.className = 'warning-popup-content' + (isUrgent ? ' urgent' : '');

    // Show popup
    popup.classList.remove('hidden', 'fade-out');

    // Start fade out after 4 seconds, completely hide after 5 seconds
    setTimeout(() => {
      popup.classList.add('fade-out');
    }, 4000);

    setTimeout(() => {
      popup.classList.add('hidden');
      popup.classList.remove('fade-out');
    }, 5000);
  }
}

// ─── Audio Management ─────────────────────────────────────────────────────────

let buzzAudio = null;
let audioContextUnlocked = false;

export function initializeBuzzAudio() {
  if (!state.isPhone) return;

  try {
    buzzAudio = new Audio('/sounds/buzz_sound.mp3');
    buzzAudio.preload = 'auto';
    buzzAudio.load();

    // Try to unlock audio context on first user interaction
    const unlockAudio = () => {
      if (!audioContextUnlocked) {
        buzzAudio.play().then(() => {
          buzzAudio.pause();
          buzzAudio.currentTime = 0;
          audioContextUnlocked = true;
          console.log('Audio context unlocked successfully');
        }).catch(() => {
          console.log('Audio unlock failed, will use web audio fallback');
        });
      }
    };

    // Listen for user interaction to unlock audio
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
  } catch (error) {
    console.log('Failed to initialize buzz audio:', error);
  }
}

function playMobileBuzzAlert(isUrgent = false) {
  console.log(`🔊 Playing mobile buzz alert - urgent: ${isUrgent}, audioUnlocked: ${audioContextUnlocked}`);

  // Vibrate phone if supported
  if (navigator.vibrate) {
    try {
      if (isUrgent) {
        // Urgent: longer, multiple bursts
        const pattern = [400, 100, 400, 100, 400];
        navigator.vibrate(pattern);
        console.log('✅ Urgent vibration triggered:', pattern);
      } else {
        // Regular: shorter, single burst
        const pattern = [250, 50, 250];
        navigator.vibrate(pattern);
        console.log('✅ Regular vibration triggered:', pattern);
      }
    } catch (error) {
      console.error('❌ Vibration failed:', error);
    }
  } else {
    console.warn('⚠️ Vibration API not supported on this device/browser');
    if ('vibrate' in navigator) {
      console.log('📱 Vibrate method exists but may be disabled');
    }
  }

  // Play buzz sound
  if (buzzAudio && audioContextUnlocked) {
    try {
      buzzAudio.volume = isUrgent ? 0.9 : 0.7;
      buzzAudio.currentTime = 0;

      buzzAudio.play().then(() => {
        console.log('✅ Buzz sound played successfully');
      }).catch(error => {
        console.error('❌ Buzz sound playback failed:', error);
        console.log('🔄 Falling back to web audio beep');
        playWarningSound(isUrgent);
      });
    } catch (error) {
      console.error('❌ Buzz sound error:', error);
      playWarningSound(isUrgent);
    }
  } else {
    const reason = !buzzAudio ? 'Audio not initialized' : 'Audio context not unlocked';
    console.warn(`⚠️ ${reason}, using web audio fallback`);
    playWarningSound(isUrgent);
  }
}

function showWarning(message, isUrgent = false) {
  const warningDiv = document.getElementById('timer-warning');
  const warningText = document.getElementById('warning-text');

  if (warningDiv && warningText) {
    warningText.textContent = message;
    warningDiv.className = 'timer-warning' + (isUrgent ? ' urgent' : '');
    warningDiv.style.display = 'flex';

    // Auto-hide warning after a few seconds
    setTimeout(() => {
      if (warningDiv) warningDiv.style.display = 'none';
    }, isUrgent ? 10000 : 5000);
  }
}

function playWarningSound(isUrgent = false) {
  try {
    // Create audio context for web audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Resume audio context if suspended (required on mobile)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure sound properties
    oscillator.frequency.setValueAtTime(isUrgent ? 800 : 500, audioContext.currentTime);
    oscillator.type = 'sine';

    // More prominent beep sound
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (isUrgent ? 0.7 : 0.4));

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + (isUrgent ? 0.7 : 0.4));

    console.log('Web audio beep played successfully');
  } catch (error) {
    console.log('Audio not supported or blocked:', error);
  }
}

function updateTimerButtonStates() {
  if (!state.isPhone) return; // Timer buttons only exist on phone
  const startBtn  = document.getElementById('timer-start');
  const pauseBtn  = document.getElementById('timer-pause');
  const resumeBtn = document.getElementById('timer-resume');

  const show = (el) => { if (el) el.style.display = 'block'; };
  const hide = (el) => { if (el) el.style.display = 'none'; };

  if (state.timerState.isRunning) {
    hide(startBtn); show(pauseBtn); hide(resumeBtn);
  } else if (state.timerState.elapsedSeconds > 0) {
    hide(startBtn); hide(pauseBtn); show(resumeBtn);
  } else {
    show(startBtn); hide(pauseBtn); hide(resumeBtn);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function onTick() {
  state.timerState.elapsedSeconds++;
  updateTimerDisplay();
}

function sendTimerControlToDesktop(action) {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify({ type: 'timer-control', action }));
  }
}

// startTimer and resumeTimer share the same body — only the action label differs
function _runTimer(action) {
  if (state.timerState.isRunning) return;
  state.timerState.isRunning  = true;
  state.timerState.intervalId = setInterval(onTick, 1000);
  updateTimerButtonStates();
  sendTimerControlToDesktop(action);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startTimer()  { _runTimer('start');  }
export function resumeTimer() { _runTimer('resume'); }

export function pauseTimer() {
  state.timerState.isRunning = false;
  if (state.timerState.intervalId) {
    clearInterval(state.timerState.intervalId);
    state.timerState.intervalId = null;
  }
  updateTimerButtonStates();
  sendTimerControlToDesktop('pause');
}

export function resetTimer() {
  pauseTimer();
  state.timerState.elapsedSeconds = 0;
  state.timerState.warningTriggered1 = false;
  state.timerState.warningTriggered2 = false;
  updateTimerDisplay();
  updateTimerButtonStates();
  sendTimerControlToDesktop('reset');

  // Hide warning and progress bar
  const warningDiv = document.getElementById('timer-warning');
  const progressBar = document.getElementById('timer-progress-bar');
  if (warningDiv) warningDiv.style.display = 'none';
  if (progressBar) progressBar.style.display = 'none';
}

// ─── Settings Event Handlers ─────────────────────────────────────────────────

export function setupTimerSettings() {
  if (!state.isPhone) return;

  const durationInput = document.getElementById('duration-input');
  const warning1Input = document.getElementById('warning1-input');
  const warning2Input = document.getElementById('warning2-input');
  const testAlertBtn = document.getElementById('test-alert-btn');

  if (durationInput) {
    durationInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (value >= 1 && value <= 180) {
        state.timerState.presentationDurationMinutes = value;
        updateProgressBar();
      }
    });
  }

  if (warning1Input) {
    warning1Input.addEventListener('change', (e) => {
      state.timerState.warningOffset1 = parseInt(e.target.value);
    });
  }

  if (warning2Input) {
    warning2Input.addEventListener('change', (e) => {
      state.timerState.warningOffset2 = parseInt(e.target.value);
    });
  }

  if (testAlertBtn) {
    testAlertBtn.addEventListener('click', () => {
      console.log('Testing mobile alert...');
      testAlertBtn.textContent = '🔔 Testing...';
      testAlertBtn.disabled = true;

      playMobileBuzzAlert(false);

      setTimeout(() => {
        testAlertBtn.textContent = '🔔 Test Buzz & Vibration';
        testAlertBtn.disabled = false;
      }, 2000);
    });
  }
}
