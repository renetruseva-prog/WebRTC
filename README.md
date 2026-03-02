# WebRTC Presenter App — Development Diary

## Project Overview

A WebRTC application where a **desktop** acts as the presentation screen (running Reveal.js slides) and a **phone** acts as a private presenter view — receiving speaker notes, a timer, and slide navigation over a peer-to-peer data channel. No third-party relay service; the Socket.IO server only handles the initial signaling handshake.

---

## Step-by-Step Development Process

---

### Week 1 — Foundations: Socket.IO + QR Code (2026-02-24)

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
- on Desktop you should be able to open and close the .upload-overlay so it doesn't cover the slides -> and it should remember the typed/input information even when closed ✅
- fix **horizontal overflow** on **.upload-overlay**
- create better UX/UI for phone layout for slides -> when you click on the buttons, it's a bit hard and sometimes it zooms instead of going to the next slide 
- when the timer starts on the phone, it should start on the desktop too -> and same with pause and reset
- create a better/prettier phone UI (no purple)

- **For week2** -> introduce the slides changing by tilting the phone
- introduce a feature where the user can type in how long the presentation should be and at what point (1 minute left? 30 seconds left?) should the phone buzz to remind the speaker they should be finishing the presentation soon. (branch **feature/timer**)
- add instructions on how to use the phone tilt to the user
