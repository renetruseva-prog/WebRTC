// Presentation timer — controls the countdown/stopwatch shown on phone and desktop
import { state } from './state.js';
import { isMobile, formatTime } from './utils.js';

// ─── Display ──────────────────────────────────────────────────────────────────

export function updateTimerDisplay() {
  const timeStr = formatTime(state.timerState.elapsedSeconds);
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) timerDisplay.textContent = timeStr;
  // Mirror the time on the desktop overlay as well
  const desktopTimer = document.getElementById('desktop-timer-display');
  if (desktopTimer) desktopTimer.textContent = timeStr;
}

export function updateTimerButtonStates() {
  if (!isMobile()) return; // Timer buttons only exist on phone
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
  updateTimerDisplay();
  updateTimerButtonStates();
  sendTimerControlToDesktop('reset');
}
