// Pure utility / helper functions with no dependencies

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Register multiple event listeners from a map of { elementId: [event, handler] }
export function addListeners(map) {
  for (const [id, [event, handler]] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
}

export function showButtonFeedback(buttonElement, successMessage, duration = 3000) {
  const originalText = buttonElement.textContent;
  buttonElement.textContent = successMessage;
  buttonElement.style.opacity = '0.7';
  setTimeout(() => {
    buttonElement.textContent = originalText;
    buttonElement.style.opacity = '1';
  }, duration);
}
