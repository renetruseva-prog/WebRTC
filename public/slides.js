// Slide loading, parsing, notes management, and sending data to phone
import { state } from './state.js';
import { showButtonFeedback } from './utils.js';

// --- PDF Parsing ---

export async function extractTextFromPDF(arrayBuffer) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const slides = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      // Render page to canvas at 2x scale for sharpness
      const scale = 2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;

      const imageUrl = canvas.toDataURL('image/png');

      // Try to extract text for use as speaker notes
      let pageText = '';
      try {
        const textContent = await page.getTextContent();
        pageText = textContent.items.map(item => item.str).join(' ');
      } catch (e) {
        pageText = `Page ${i}`;
      }

      slides.push({ imageUrl, text: pageText });
    }
    return slides;
  } catch (error) {
    console.error('Error extracting PDF:', error);
    throw new Error('Failed to parse PDF');
  }
}

// --- Default Slides ---

const DEFAULT_SLIDES = `# 🎯 WebRTC Presenter
## Interactive Presentation Tool

Welcome to your new presentation platform!

---

# 📱 Phone Remote Control
## Turn Your Phone into a Presenter Remote

- **Navigate slides** with gyroscope tilting
- **View speaker notes** synced from desktop
- **Control presentation timer**
- **Use laser pointer** to highlight content

---

# 🚀 Getting Started
## Three Simple Steps

**1.** Load your slides (markdown or PDF)
**2.** Connect your phone via QR code
**3.** Add speaker notes (optional)

Then you're ready to present!

---

# 📝 Speaker Notes
## Add Notes for Each Slide

Notes you write on desktop appear on your phone:
- Talking points and reminders
- Technical details
- Audience interaction cues
- Time estimates per slide

Notes: This slide demonstrates how speaker notes work. These notes would appear on your phone as a presenter aid!

---

# ⏱️ Timer & Controls
## Keep Track of Your Presentation

- **Timer controls** on your phone
- **Slide navigation** with gestures
- **Laser pointer** for highlighting
- **Real-time sync** between devices

---

# 🎨 Upload Your Own
## Replace These Demo Slides

Click **"Load Presentation"** above to:
- Upload markdown files (.md)
- Upload PDF presentations
- Use **---** to separate slides in markdown
- Add **Notes:** sections for speaker notes

---

# 💡 Pro Tips
## Make the Most of Your Presentations

- **Practice** with the gyroscope controls
- **Test** your phone connection beforehand
- **Prepare** speaker notes in advance
- **Keep** slides simple and visual

Ready to create amazing presentations!`;

// --- Default Slide Loading ---

export function loadDefaultSlides() {
  console.log('[SLIDES] Loading default demo slides...');
  loadSlides(DEFAULT_SLIDES, 'Demo Presentation');
}

function parseMarkdownSlides(markdown) {
  const slides = markdown.split('---').map(s => s.trim()).filter(s => s.length > 0);
  return slides.map(slide => {
    const notesIndex = slide.indexOf('Notes:');
    if (notesIndex !== -1) {
      return {
        content: slide.substring(0, notesIndex).trim(),
        notes:   slide.substring(notesIndex + 6).trim()
      };
    }
    return { content: slide, notes: '' };
  });
}

// --- Slide Loading ---

export function loadSlides(markdown, fileName = 'Presentation') {
  state.presentationName = fileName.replace(/\.(md|markdown|txt)$/i, '');
  const slides = parseMarkdownSlides(markdown);
  const slidesContainer = document.getElementById('slides-container');
  slidesContainer.innerHTML = '';

  slides.forEach((slideData) => {
    const section = document.createElement('section');
    section.setAttribute('data-notes', slideData.notes);

    let htmlContent = slideData.content;
    if (typeof marked !== 'undefined') {
      try {
        htmlContent = marked.parse(slideData.content);
      } catch (e) {
        htmlContent = `<pre>${slideData.content}</pre>`;
      }
    } else {
      // Fallback: convert basic markdown headings manually
      htmlContent = slideData.content
        .replace(/^# (.*?)$/gm,   '<h1>$1</h1>')
        .replace(/^## (.*?)$/gm,  '<h2>$1</h2>')
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

  _finalizeSlideLoad();
}

export function loadPDFSlides(pdfSlides, fileName = 'Presentation') {
  state.presentationName = fileName.replace(/\.pdf$/i, '');
  const slidesContainer = document.getElementById('slides-container');
  slidesContainer.innerHTML = '';

  pdfSlides.forEach((slideData, index) => {
    const section = document.createElement('section');
    section.setAttribute('data-notes', slideData.text || `Page ${index + 1}`);
    section.innerHTML = `<img src="${slideData.imageUrl}" style="max-width: 90vw; max-height: 90vh; width: auto; height: auto;" />`;
    slidesContainer.appendChild(section);
  });

  _finalizeSlideLoad();
}

function _reinitReveal() {
  if (state.Reveal_Instance) {
    state.Reveal_Instance.initialize();
    state.Reveal_Instance.sync();
    state.Reveal_Instance.slide(0, 0, 0);
  }
}

function _finalizeSlideLoad() {
  _reinitReveal();
  populateSlideDropdown();
  document.getElementById('desktop-timer').style.display = 'block';
  state.customNotes = {};

  // Always send data to phone (if connected) and store for when phone connects
  sendPresentationNameToPhone();
  sendSlideCountToPhone();
  sendSlideNotesToPhone(0);

  // Force sync all slide data with phone if connected
  syncAllSlidesToPhone();

  console.log('[SLIDES] Slide loading complete, synced with phone');
}

// --- Sending Data to Phone ---

// Shared guard: only send when the data channel is open
function _sendToPhone(payload) {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify(payload));
    console.log('[SLIDES] Sent to phone:', payload.type, payload);
    return true;
  } else {
    console.log('[SLIDES] Cannot send to phone - data channel not ready:',
      state.dataChannel ? state.dataChannel.readyState : 'no channel');
    return false;
  }
}

function sendPresentationNameToPhone() {
  _sendToPhone({ type: 'presentation-name', name: state.presentationName });
  console.log('[DESKTOP] Sent presentation name to phone:', state.presentationName);
}

export function sendSlideNotesToPhone(slideIndex) {
  // Only send user-written notes — never fall back to slide content
  const content = state.customNotes[slideIndex] || 'No notes for this slide';
  _sendToPhone({ type: 'notes', slideIndex, content });
}

function sendSlideCountToPhone() {
  const total = document.querySelectorAll('.reveal .slides section').length;
  if (total > 0) {
    _sendToPhone({ type: 'slide-count', total });
    console.log('[DESKTOP] Sent slide count to phone:', total);
  }
}

// Force sync all slide data when slides change or phone connects
export function syncAllSlidesToPhone() {
  if (!state.dataChannel || state.dataChannel.readyState !== 'open') {
    console.log('[SLIDES] Phone not connected, will sync when connected');
    return;
  }

  // Send presentation info
  sendPresentationNameToPhone();
  sendSlideCountToPhone();

  // Send notes for current slide
  const currentSlideIndex = state.Reveal_Instance ? state.Reveal_Instance.getState().indexh : 0;
  sendSlideNotesToPhone(currentSlideIndex);

  console.log('[SLIDES] Complete slide sync sent to phone');
}

// --- Notes Editor UI ---

function populateSlideDropdown() {
  const slides  = document.querySelectorAll('.reveal .slides section');
  const select  = document.getElementById('note-slide-select');
  select.innerHTML = '';

  slides.forEach((slide, index) => {
    const option = document.createElement('option');
    const slideTitle = slide.textContent.split('\n')[0].substring(0, 30) || `Slide ${index + 1}`;
    option.value       = index;
    option.textContent = `Slide ${index + 1}: ${slideTitle}`;
    select.appendChild(option);
  });
}

export function updateNoteEditorForSlide() {
  const select     = document.getElementById('note-slide-select');
  const noteEditor = document.getElementById('note-editor');
  const slideIndex = parseInt(select.value);
  noteEditor.value = (slideIndex >= 0) ? (state.customNotes[slideIndex] || '') : '';
}

// Save the current note and immediately send it to the phone in one action
export function saveAndSendCurrentNote() {
  const select     = document.getElementById('note-slide-select');
  const noteEditor = document.getElementById('note-editor');
  const sendBtn    = document.getElementById('send-notes-btn');
  const slideIndex = parseInt(select.value);

  if (isNaN(slideIndex) || slideIndex < 0) {
    showButtonFeedback(sendBtn, 'Select a slide first ⚠️', 2000);
    return;
  }

  const content = noteEditor.value || 'No notes for this slide';
  state.customNotes[slideIndex] = noteEditor.value;
  _sendToPhone({ type: 'notes', slideIndex, content });
  showButtonFeedback(sendBtn, 'Sent ✅');
}
