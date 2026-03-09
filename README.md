# WebRTC Presenter App — Development Diary

## Project Overview

A WebRTC application where a **desktop** acts as the presentation screen (running Reveal.js slides) and a **phone** acts as a private presenter view — receiving speaker notes, a timer, and slide navigation over a peer-to-peer data channel. No third-party relay service; the Socket.IO server only handles the initial signaling handshake.

---

## Step-by-Step Development Process

---

### Week 1 — Foundations: Socket.IO + QR Code (2026-02-24)

At first I started by brainstorming with AI different possible concept ideas for the project. These were the ones I liked the most:

## 1. “Do Not Drop It”
**Phone:** motion controls
**Desktop:** fragile object (egg, glass, soul)

## Concept:
Sudden movement => crack
Smooth movement => safe

## 2. Retro Arcade "Brick Breaker”

## Concept: 
A classic breakout game on the desktop where the phone is the "paddle".
## Interaction: 
Slide your finger on the phone screen to move the paddle, or tilt the phone left/right.

## 3. Asymmetric "Bomb Defuser"

## Concept: 
The desktop shows a complex bomb with wires and timers. The phone shows the "Instruction Manual" or a different set of tools.
## Interaction: 
The phone user must "cut" specific wires by swiping, which updates the desktop state in real-time.

## 4. Remote Slideshow Presentation controller (through your phone)

## Concept: 
A professional tool for PowerPoint-style slides/pdfs.
## Interaction: 
Swipe left/right on the phone to change slides. The phone displays the "Speaker Notes" and a timer, which aren't visible on the desktop. Add timers, haptic sounds, tilt the phone to change slides, add laser point, etc.

## 5. "Punch-Out" Fitness Game

## Concept: 
A boxing game where the desktop shows the opponent.
## Interaction: 
Use a "flicking" motion with the phone to throw a punch. The desktop detects the $g-force$ to determine the power of the hit.

**My final choice** After consult I chose idea number 4 -> the remote slideshow presentation controller. I chose it because it's straight-forward, practical and covers the project requirements. 

**Goal:** Get a server running, detect which device is viewing the page, and show a QR code on desktop so the phone can connect easily.

**What was built:**
- Express + Socket.IO server (`index.js`) with local IP discovery using `networkInterfaces()`
- A `/config` endpoint to pass the IP-based URL to the frontend
- `isMobile()` user-agent detection to split desktop vs. phone views
- QR code rendering using `qrcode-generator` on the desktop side

**AI wrote:**
- The `networkInterfaces()` loop for finding the local IPv4 address
- The `/config` JSON endpoint
- The `isMobile()` regex function
- The overall server scaffold (`express`, `http`, `Server` from socket.io)

```javascript
// AI-generated server scaffold
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { networkInterfaces } = require('os');

const nets = networkInterfaces();
let localIp = '127.0.0.1';
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      localIp = net.address;
    }
  }
}

app.get('/config', (req, res) => {
  res.json({ url: `http://${localIp}:${port}` });
});
```

**I wrote:**
- The `.hidden` class toggle so the mobile greeting only shows on phones:
  ```javascript
  document.getElementById('desktop').classList.add('hidden');
  document.getElementById('mobile').classList.remove('hidden');
  ```
- Custom CSS colors for the mobile header (`rgb(184, 30, 30)`)
- The `typeNumber = 4` and `errorCorrectionLevel = 'L'` QR parameters from the course README
- Custom `console.log` debug strings (`'QR library available:'`, `'Got URL:'`) used during testing

---

### Week 2 — Signaling: WebRTC Handshake (2026-02-24)

**Goal:** Implement the WebRTC offer/answer/ICE candidate exchange using Socket.IO as the signaling channel.

**What was built:**
- Server relay for `offer`, `answer`, `candidate` events via `socket.broadcast.emit`
- `RTCPeerConnection` setup with STUN server config
- `setupDesktop()` creates the data channel and sends the offer
- `setupMobile()` receives the offer and sends back an answer
- `setupDataChannel()` to consolidate `onopen`/`onmessage`/`onerror` handlers for both devices

**AI wrote:**
- The complete `setupDesktop()` and `setupMobile()` RTCPeerConnection wiring
- The server-side broadcast relay:
  ```javascript
  socket.on('offer', (data) => socket.broadcast.emit('offer', data));
  socket.on('answer', (data) => socket.broadcast.emit('answer', data));
  socket.on('candidate', (data) => socket.broadcast.emit('candidate', data));
  ```

**I wrote / modified:**
- Integrated `renderQRCode()` inside `setupDesktop()` to keep Week 1 working
- Wrote the initial message-routing structure inside `setupDataChannel()` — checking `event.data` and dispatching to the right handler:
  ```javascript
  channel.onmessage = (event) => {
    if (event.data === 'next') {
      console.log("Moving to next slide...");
    } else if (event.data === 'prev') {
      console.log("Moving to previous slide...");
    }
  };
  ```
- Wrapped `socket.emit('phone-ready')` in a `setTimeout` of 500ms after noticing it fired before the `RTCPeerConnection` was constructed:
  ```javascript
  setTimeout(() => {
    socket.emit('phone-ready');
  }, 500);
  ```
- Spotted that `isMobile()` went missing from the refactored snippet and added it back to fix the `ReferenceError`

---

### Phase 3 — Presenter Feature: Reveal.js + Speaker Notes (2026-02-24 → 2026-02-28)

**Goal:** Turn the desktop into a real presentation tool — load markdown or PDF slides into Reveal.js, write per-slide speaker notes, and send them to the phone over the data channel.

**What was built:**
- Reveal.js 4.5.0 embedded in the desktop view
- PDF.js pipeline converting uploaded PDFs into per-page slide images
- Markdown parser (splitting on `---`) with `marked.js` rendering
- Per-slide notes editor (`customNotes{}` object, slide dropdown select, Save Note button)
- `sendAllNotesToPhone()` — sends each note as `{ type: 'slide-notes', slideIndex, content }`
- Phone presenter view: `phoneNotes{}` storage, `displayPhoneNote()`, prev/next navigation, countdown timer, `slide-info` counter

**AI wrote:**
- The entire Reveal.js initialization flow (`Reveal_Instance`, `initialize()`, `sync()`, `slidechanged` listener)
- The PDF.js rendering pipeline (canvas-per-page → base64 URL → `<section>` injection)
- `parseMarkdownSlides()` and `sendAllNotesToPhone()`
- The full phone presenter HTML structure

**I wrote:**
- The `displayPhoneNote()` function — looking up the stored note and updating the DOM:
  ```javascript
  function displayPhoneNote(slideIndex) {
    const note = phoneNotes[slideIndex] || 'No notes for this slide';
    document.getElementById('speaker-notes').textContent = note;
    currentPhoneSlide = slideIndex;
    updateSlideInfo();
  }
  ```
- The `updateSlideInfo()` function that shows the current slide position in the header:
  ```javascript
  function updateSlideInfo() {
    const total = totalPhoneSlides > 0 ? totalPhoneSlides : '?';
    document.getElementById('slide-info').textContent = `Slide ${currentPhoneSlide + 1}/${total}`;
  }
  ```
- The Save Note button handler that persists notes locally before sending:
  ```javascript
  document.getElementById('save-note-btn').addEventListener('click', () => {
    const slideIndex = parseInt(select.value);
    const noteContent = noteEditor.value.trim();
    if (noteContent) {
      customNotes[slideIndex] = noteContent;
    }
  });
  ```
- The `populateSlideDropdown()` logic that fills the notes editor select with slide titles:
  ```javascript
  function populateSlideDropdown() {
    const slides = document.querySelectorAll('.reveal .slides section');
    const select = document.getElementById('note-slide-select');
    select.innerHTML = '';
    slides.forEach((slide, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Slide ${index + 1}: ${slide.textContent.substring(0, 30)}`;
      select.appendChild(option);
    });
  }
  ```
- The gradient background CSS on `#mobile`, `.slide-nav-buttons` flex layout, `.timer-container` border styles, and the `📝 Speaker Notes` label markup
- Added `display: none` as default on `#desktop-timer` so it only appears after slides load

---

### Phase 4 — Real-Time Connection Status (2026-02-28)

**Goal:** Show on the desktop whether a phone is connected — without page refresh.

**Problem:** Early attempt used `setInterval` polling a `/status` endpoint. The status lagged by several seconds and kept showing stale data after the phone disconnected.

**Solution:** Server-side tracking — `phones = new Set()` in `index.js`, emitting `phone-joined` on `phone-ready` and `phone-left` on disconnect. Desktop reacts to events directly.

**AI wrote:**
- Server-side `phones` Set tracking and event emission logic
- The full `setConnectionStatus(message, color, isConnected)` function and all its call sites
- The connection status overlay HTML and absolute-positioning CSS

**I wrote:**
- The decision to scrap polling and switch to event-driven status — I proposed this after observing the lag
- The color scheme for each state, which I defined as constants before asking the AI to wire them in:
  - Orange `rgba(255, 165, 0, 0.8)` = waiting
  - Green `rgba(0, 180, 0, 0.8)` = connected
  - Red `rgba(255, 0, 0, 0.8)` = disconnected
- Added `display: none` initial style on `#connection-status-display` so it doesn't flash on page load
- Tested and confirmed the overlay updated correctly by disconnecting and reconnecting the phone multiple times

---

### Phase 5 — Bug Fixes: Slide Counter, PDF Reset, Mobile Scroll (2026-03-01)

#### Bug 1 — PDFs don't start from slide 1
**Cause:** `Reveal_Instance.sync()` preserves internal slide state from the previous load.  
**Fix (AI):** Added `Reveal_Instance.slide(0, 0, 0)` after every `sync()` in `loadSlides()` and `loadPDFSlides()`.  
**I identified:** Noticed the issue during testing with a 10-page PDF — it opened on page 7 every time because that was the last slide viewed.

#### Bug 2 — Phone vertically locked
**Cause:** `body { overflow: hidden }` (required for Reveal.js desktop) cascaded to mobile.  
**Fix (AI):** Changed `#mobile` to `min-height: 100vh; overflow-y: auto`. In `setupMobile()`, override `document.body.style.overflow = 'auto'` at runtime.  
**I wrote:** Set `min-height: 150px` on `.notes-area` so the notes box doesn't collapse on short content, and changed the notes-area `overflow-y` from `auto` to `scroll` for consistent iOS behaviour.

#### Bug 3 — Slide counter shows "Slide 4/2"
**Cause:** `updateSlideInfo()` was using `Object.keys(phoneNotes).length` as the total — so the denominator only counted slides that had already received notes, not the full deck.  
**I diagnosed:** Traced the bug to `updateSlideInfo()` and identified the wrong variable being used as the total before the AI suggested the `totalPhoneSlides` solution.  
**Fix (AI):** Added `totalPhoneSlides` variable; desktop sends `{ type: 'slide-count', total: N }` over the data channel when slides load.  
**I wrote:** The `slide-count` message handler on the phone side, after understanding the pattern from the existing `slide-notes` handler:
```javascript
 else if (parsedMessage.type === 'slide-count') {
  if (isMobile()) {
    totalPhoneSlides = parsedMessage.total;
    updateSlideInfo();
    updateSlideNavigationButtons();
  }
}
```

---

### Phase 6 — Mobile Layout Cleanup (2026-03-01)

**Bugs I reported after visual testing:**
- `#desktop.hidden` was still rendering visibly on the phone  
- `div.reveal` was still visible and taking up space on mobile  
- "Start the process" button was appearing at the bottom of the phone screen

**Fixes (AI):**
- `#desktop.hidden { display: none !important; }` — override the specificity clash
- `document.querySelector('.reveal-container').remove()` in `setupMobile()`
- `document.getElementById('toggle-overlay-btn').style.display = 'none'` in `setupMobile()`

**I wrote:** After the AI provided the three fixes, I also cleaned up `setupMobile()` to group all DOM-removal calls together at the top of the function so the sequence was explicit and easy to follow:
```javascript
async function setupMobile() {
  // 1. Switch views
  document.getElementById('desktop').classList.add('hidden');
  document.getElementById('mobile').classList.remove('hidden');
  // 2. Fix body scroll
  document.body.style.overflow = 'auto';
  // 3. Strip desktop-only elements
  document.querySelector('.reveal-container')?.remove();
  document.getElementById('toggle-overlay-btn').style.display = 'none';
  // ... rest of setup
}
```

---

### Phase 7 — WebRTC Signaling Race Conditions (2026-03-02)

**Errors I reported from the browser console:**
```
[PHONE] Error handling offer: InvalidStateError: Failed to set local answer sdp: Called in wrong state: stable
[DESKTOP] Error handling answer: InvalidStateError: Failed to set remote answer sdp: Called in wrong state: stable
```

**Root cause (AI diagnosis):** The desktop was sending the offer twice — both `phone-joined` and `phone-ready` fired for the same connection event, and both reached the phone while `signalingState` was still `stable`.

**Fixes (AI):** `offerSent` flag on desktop, `processingOffer` flag on phone, `signalingState` guard on the desktop answer handler.

**I modified:** After the AI provided the `offerSent` pattern, I added the `phone-left` reset myself so reconnects would work without a full page reload:
```javascript
socket.on('phone-left', () => {
  dataChannelReady = false;
  offerSent = false; // I added this line — allows re-offer on reconnect
  setConnectionStatus('❌ Phone Disconnected', 'rgba(255, 0, 0, 0.8)', false);
});
```

**To-fix**
- **FIX** the notes showing the text from the slides instead of notes the user inputed themselves!!!! - ✅

**UI-improvements** (make a branch)
- "Save note" button and "Send Notes to Phone" button should give visual feedback to the user instead of an alert -> that's annoying, slow and frustrating - ✅
- the phone view should show when there is no presentation (now it says "No notes for this slide + Slide 1/1 but there are no slides") - ✅
- on Desktop you should be able to open and close the .upload-overlay so it doesn't cover the slides -> and it should remember the typed/input information even when closed - ✅
- fix **horizontal overflow** on **.upload-overlay** - ✅
- create better UX/UI for phone layout for slides -> when you click on the buttons, it's a bit hard and sometimes it zooms instead of going to the next slide - ✅
- when the timer starts on the phone, it should start on the desktop too -> and same with pause and reset - ✅
- create a better/prettier phone UI (no purple) - ?

---

### Week 2 — Bug Fixes, UI Polish & Timer Sync (2026-03-02)

### Phase 8 — Bug Fix: Notes showing slide content instead of user input

**Bug I reported:** On the phone, the speaker notes panel was displaying the actual text from the slide instead of the custom notes I typed on desktop.

**Root cause:** `sendSlideNotestoPhone()` had a fallback that read `data-notes` when no custom note existed. Because `parseMarkdownSlides()` set `data-notes` to the slide text, the phone always received slide text.

**Fix (AI):** Removed the `data-notes` fallback entirely — custom notes now only come from `customNotes[slideIndex]`.

```javascript
// Before (broken)
const notes = customNotes[slideIndex]
  || document.querySelectorAll('.reveal section')[slideIndex]?.getAttribute('data-notes')
  || 'No notes for this slide';

// After (fixed)
const notes = customNotes[slideIndex] || 'No notes for this slide';
```

**I diagnosed:** Typed "Hello world" into the notes editor, sent it to the phone, and saw raw slide markdown appear instead. Confirmed it was a fallback problem, not a send/receive issue.

---

### Phase 9 — UI Improvements (branch: feature/view-UI-optimize)

#### 9a — Button feedback instead of alerts

**Problem I raised:** Save and Send buttons used `alert()` — blocking and jarring on mobile, which is frustrating for the user and not very UI-friendly.

**AI wrote:** The `showButtonFeedback()` utility function.

**I wrote:** All the feedback label strings (`'Note Saved ✅'`, `'Select a slide first ⚠️'`, `'Sent N note(s) ✅'`) and manually replaced every `alert()` call by searching through the file.

#### 9b — Empty state on phone when no slides loaded

**I wrote:** The early-return guard at the top of `displayPhoneNote()`:

```javascript
if (totalPhoneSlides === 0) {
  document.getElementById('speaker-notes').textContent = 'No presentation uploaded';
  document.getElementById('slide-info').textContent = '';
  return;
}
```

#### 9c — Upload overlay toggle

**Problem I noticed :** The overlay had no close button and permanently covered the slides.

**I wrote:** Close button HTML, event handlers, and the CSS slide-out transition using `transform + pointer-events: none`.

**I suggested:** Using `transform` instead of `display: none` to preserve textarea content when hidden. Added `pointer-events: none` after looking it up on MDN.

#### 9d — Horizontal overflow fix

**I wrote:** `overflow-x: hidden` on `.upload-overlay` and `box-sizing: border-box` on inner inputs and buttons after noticing the panel was wider than the screen on small phones.

#### 9e — Double-tap Zoom prevention on the slide prev/next buttons on mobile

**I wrote:** Added these two properties to button CSS after finding them on MDN:

```css
touch-action: manipulation;
user-select: none;
```

**AI explained** that `touch-action: manipulation` disables double-tap zoom while preserving pinch-to-zoom.

---

### Phase 10 — Timer sync: Phone controls Desktop (branch: feature/timer)

**Goal:** Tapping Start/Pause/Resume/Reset on the phone mirrors the timer on desktop in real time.

**AI wrote:** `startTimer()`, `pauseTimer()`, `resumeTimer()`, `resetTimer()` with full `setInterval`/`clearInterval` management, the `timer-control` desktop message handler, and `updateTimerButtonStates()` show/hide logic.

**I wrote:**
- `sendTimerControlToDesktop()` — one-liner wrapper sending the action over the data channel
- `formatTime()` — zero-pads minutes and seconds into `MM:SS`
- Timer CSS — chose 48px Courier New, text-shadow, and `#ffd700` gold for `.timer-btn` to match the phone header colour
- Added `style="display: none;"` on the Pause and Resume buttons in HTML so only Start is visible on load

---

### Phase 11 — Code organisation: separate CSS and JS Files

**Context:** `index.html` had grown to 1474 lines with inline `<style>` and `<script>` blocks. Splitting into separate files improves maintainability and enables proper syntax highlighting.

**I did:**
- Extracted all `<style>` content into `style.css` (303 lines) and all `<script>` content into `script.js`, then updated `index.html` to reference both.
- Checked the external library load order was preserved (Reveal.js CSS, QR library, Reveal.js JS, Socket.IO, marked, PDF.js — then `script.js` last so all globals exist when app code runs)

**AI did:**
- Reorganised CSS comment headings into logical groups: base → mobile presenter → timer → upload overlay → Reveal.js container → QR modal

---

- **For week3** -> introduce the slides changing by tilting the phone
- introduce a feature where the user can type in how long the presentation should be and at what point (1 minute left? 30 seconds left?) should the phone buzz to remind the speaker they should be finishing the presentation soon. (branch **feature/timer**)
- add instructions on how to use the phone tilt to the user
