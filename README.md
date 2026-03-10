# WebRTC Presenter App — Development Diary

## Project Overview

A WebRTC application where a **desktop** acts as the presentation screen (running Reveal.js slides) and a **phone** acts as a private presenter view — receiving speaker notes, a timer, and slide navigation over a peer-to-peer data channel. No third-party relay service; the Socket.IO server only handles the initial signaling handshake.

---

## Step-by-Step Development Process

---

### WEEK 1
 
**Foundations: Socket.IO + QR Code** (2026-02-24)

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

---

#### Week 1 - Critical Reflection on AI Use

Through Phases 1-7, AI handled the core infrastructure (server, WebRTC, Reveal.js) while I drove design choices, integration testing, and systematic debugging.

**What I implemented / contributed:**
- **Brainstorming & concept selection** — I explored five project ideas and chose the presentation controller because it was "straight-forward, practical and covers the project requirements"
- **Device detection & view switching** — I wrote the `.hidden` class toggle logic to show/hide mobile vs. desktop views based on the AI-generated `isMobile()` function
- **Custom CSS styling** — I defined custom colors for the mobile header (`rgb(184, 30, 30)`) and designed all visual layouts for the phone presenter interface
- **QR code parameters** — I sourced the settings from the course README and integrated them into the AI's QR rendering
- **Debug instrumentation** — I added custom `console.log` strings (`'QR library available:'`, `'Got URL:'`) throughout the codebase during development and testing
- **Connection status UX** — I identified that polling was slow and proposed switching to event-driven status updates. I defined the three-color scheme (orange/green/red) and tested it by manually disconnecting/reconnecting the phone multiple times
- **Message routing** — I wrote the initial message-routing structure inside `setupDataChannel()`, establishing the `if/else` pattern for dispatching `'next'` and `'prev'` commands
- **Timing fixes** — I noticed `socket.emit('phone-ready')` fired before the RTCPeerConnection was ready and wrapped it in a `setTimeout(500ms)` to fix the race condition
- **Bug diagnosis & fixes** — I identified three critical bugs: (1) PDFs opening on slide 7 instead of slide 1, (2) phone scroll locked by desktop CSS, (3) slide counter showing wrong totals. For each, I traced the root cause before asking AI to implement the fix
- **Code organization** — I manually cleaned up `setupMobile()` after receiving fixes, grouping DOM-removal calls at the top and adding comments (`// 1. Switch views`, etc.) to make the sequence explicit
- **WebRTC debugging** — I captured the exact error messages from the browser console (`InvalidStateError: Failed to set local answer sdp`), which helped AI diagnose the double-offer bug. I also added the `phone-left` reset myself to enable reconnects without page reload

**What AI generated (infrastructure & rendering):**
- `networkInterfaces()` loop for local IP discovery + `/config` endpoint
- `isMobile()` regex function + overall server scaffold (express, http, Socket.IO)
- `setupDesktop()` and `setupMobile()` RTCPeerConnection wiring with STUN config
- Server-side broadcast relay for `offer`, `answer`, `candidate` events
- Entire Reveal.js initialization flow (`Reveal_Instance`, `initialize()`, `slidechanged` listener)
- PDF.js rendering pipeline (canvas-per-page → base64 URL → `<section>` injection)
- `parseMarkdownSlides()` and `sendAllNotesToPhone()` for slide + notes handling
- Full phone presenter HTML structure with notes area and slide counter
- Server-side `phones` Set tracking + `setConnectionStatus()` function
- Connection status overlay HTML/CSS with absolute positioning
- Bug fixes: `Reveal_Instance.slide(0, 0, 0)` for PDF reset, `#mobile { overflow-y: auto }` for scroll, `totalPhoneSlides` state variable
- WebRTC signaling safeguards: `offerSent` flag, `processingOffer` flag, `signalingState` guard

---

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

- **Planning for Week 2** 
- phone displays speaker notes
- phone displays presentation timer (start / pause)
- work on UI for the desktop screen


---

### WEEK 2 

**Bug Fixes, UI Polish & Timer Sync** (2026-03-02)

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

#### Week 2 - Critical Reflection on AI Use

Through Phases 8-11, I drove bug fixes and UI improvements through systematic testing and design iteration, while AI provided the core utility functions that I then integrated and styled.

**What I implemented / contributed:**
- **Notes bug diagnosis** — I noticed the phone was displaying raw slide markdown instead of my custom notes. I traced it to a fallback problem by typing "Hello world" and confirming the slide text appeared instead. This directly led to the fix.
- **Alert → feedback UX overhaul** — I identified that `alert()` boxes were frustrating on mobile. I wrote all the feedback label strings (`'Note Saved ✅'`, `'Select a slide first ⚠️'`, `'Sent N note(s) ✅'`) and manually searched and replaced every `alert()` call with `showButtonFeedback()` integration.
- **Empty state UI** — I wrote the guard condition at the top of `displayPhoneNote()` to show "No presentation uploaded" when no slides are present, fixing a confusing state where the phone said "Slide 1/1" for nothing.
- **Upload overlay toggle** — I noticed the overlay permanently covered the slides with no way to close it. I wrote the close button HTML, wired the event handlers, and designed the CSS transition using `transform + pointer-events: none` to keep textarea content intact when hidden.
- **Horizontal overflow fix** — After noticing the panel was wider than the screen on small phones, I added `overflow-x: hidden` on `.upload-overlay` and `box-sizing: border-box` on inputs/buttons.
- **Double-tap zoom prevention** — I researched on MDN and added `touch-action: manipulation` and `user-select: none` to prevent accidental zoom when tapping the prev/next buttons.
- **Timer feature implementation** — I wrote the `sendTimerControlToDesktop()` wrapper, `formatTime()` function for MM:SS display, chose the timer CSS styling (48px Courier New, text-shadow, `#ffd700` gold to match the phone header), and added `style="display: none;"` to Pause/Resume buttons in HTML.
- **Code extraction & organization** — I manually extracted all `<style>` content into `style.css` (303 lines) and all `<script>` content into `script.js`, then updated HTML to reference both. I verified the library load order was preserved (Reveal.js CSS → QR → Reveal.js JS → Socket.IO → marked → PDF.js → script.js).

**What AI generated (utilities & timer logic):**
- `showButtonFeedback()` utility function that displays temporary feedback labels in the UI
- Removed the `data-notes` fallback from notes sending — simplified logic to rely only on `customNotes[slideIndex]`
- `startTimer()`, `pauseTimer()`, `resumeTimer()`, `resetTimer()` with full `setInterval`/`clearInterval` lifecycle management
- `timer-control` data channel message handler on the desktop side
- `updateTimerButtonStates()` show/hide logic for toggling button visibility based on timer state
- Explanation of `touch-action: manipulation` behavior and pinch-to-zoom preservation
- CSS comment reorganization into logical groups: base → mobile presenter → timer → upload overlay → Reveal.js container → QR modal

---

- **Planning for Week 3** 
- introduce the slides changing by tilting the phone
- introduce a feature where the user can type in how long the presentation should be and at what point (1 minute left? 30 seconds left?) should the phone buzz to remind the speaker they should be finishing the presentation soon. (branch **feature/timer**)
- add instructions on how to use the phone tilt to the user
- feature laser pointer where the finger moves on phone screen and a red dot/line moves on the desktop slides in real time as a highlight


### WEEK 3

**Refactoring & UI Fixes** (branch: `feature/fix-issues-week2`)

**Context:** After splitting CSS and JS into external files (Phase 11), the single `script.js` had grown to nearly 1000 lines and was becoming hard to review. The goal of this branch was to clean it up structurally and fix confusing UI patterns in the upload overlay.

---

#### Phase 12 — Separate HTML for Desktop and Phone

**Problem:** Both devices shared one `index.html`. The desktop received unused phone markup and vice versa, which made the layout harder to reason about.

**What was done:**
- Created `index-desktop.html` — desktop-only markup (Reveal.js container, upload overlay, connection status, QR modal)
- Created `index-phone.html` — phone-only markup (timer, speaker notes, slide nav buttons)
- `index.html` kept as legacy fallback; server still serves it via `express.static`

The two files load the same `script.js` entry point; the JS detects the device and runs only the relevant setup path.

---

#### Phase 13 — Split `script.js` into ES Modules

**Problem:** `script.js` mixed state management, utilities, timer logic, slide loading, and WebRTC setup in one file — making it hard to navigate and review.

**What AI did:** Split the different logicall functionalities into six separate files with a clear dependency chain:

| File | Responsibility |
|------|---------------|
| `state.js` | Single shared mutable state object + WebRTC config |
| `utils.js` | Pure helpers: `isMobile()`, `formatTime()`, `showButtonFeedback()` |
| `timer.js` | Stopwatch: start / pause / resume / reset |
| `slides.js` | PDF/Markdown parsing, Reveal.js loading, notes editor, data channel sends |
| `webrtc.js` | RTCPeerConnection, DataChannel, `setupDesktop()`, `setupMobile()`, QR render |
| `script.js` | Entry point only — Socket.IO init, device detection, `init()` call |

All three HTML files updated to `<script type="module" src="script.js">`.

**Dependency chain (no circular imports):**
```
state.js ← utils.js ← timer.js ← slides.js ← webrtc.js ← script.js
```

**I wrote:**
- The breakdown decision — I specified which concerns belonged in which file before the AI restructured anything
- Verified that `io()` (a CDN global) cannot be imported as an ES module, so `script.js` calls it directly and assigns the result to `state.socket`

---

#### Phase 14 — Named Event Handlers

**Problem:** Functions like `setupDesktop()` contained dozens of anonymous arrow callbacks inline:

```javascript
// Before — hard to skim
document.getElementById('toggle-overlay-btn').addEventListener('click', () => {
  overlay.classList.toggle('hidden');
});
```

**What I did:** Every inline callback in `webrtc.js` extracted into a named function above the `addListeners` call:

```javascript
// After — handler name is self-documenting
function toggleUploadOverlay() {
  overlay.classList.toggle('hidden');
}
// ...
document.getElementById('toggle-overlay-btn').addEventListener('click', toggleUploadOverlay);
```

Named handlers extracted: `toggleUploadOverlay`, `closeUploadOverlay`, `openQROverlay`, `closeQROverlay`, `onUploadFileClick`, `onSlideChanged`, `onPhoneLeft`, `onAnswer`, `onPrevSlide`, `onNextSlide`, `onOffer`.

---

#### Phase 15 — DRY Refactor Across All Files

**Problem:** After extracting named handlers, I noticed repeated patterns across all modules.

**What was done (AI):**

- **`timer.js`** — `startTimer` and `resumeTimer` shared almost identical bodies; extracted `_runTimer(action)` so both delegate to it. `onTick()` extracted. `_showBtn` / `_hideBtn` helpers for button visibility.
- **`slides.js`** — Repeated `dataChannel.send(JSON.stringify(...))` pattern extracted to `_sendToPhone(payload)`. Post-load steps (reinit Reveal.js → dropdown → send slide count → send notes) extracted to `_finalizeSlideLoad()`.
- **`webrtc.js`** — All three `pc.on*` state-change listeners repeated for both desktop and phone peer connections; extracted `_setupPeerConnectionLogging(pc, tag)`.
- **`script.js`** — All four `socket.on()` callbacks changed to named functions (`onConnect`, `onConnectError`, `onDisconnect`, `onCandidate`). The `localStorage` force-mode pattern extracted to `_applyForceMode(value, label)`.

---

#### Phase 16 — `addListeners` Utility Helper

**Problem:** Both `setupDesktop()` and `setupMobile()` contained blocks of repetitive `document.getElementById(id).addEventListener(event, fn)` calls.

**What AI did:** Added `addListeners(map)` to `utils.js`:

```javascript
export function addListeners(map) {
  for (const [id, [event, handler]] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
}
```

Both setup functions now use a single `addListeners({...})` call with an object mapping element IDs to `[eventName, handlerFn]` pairs. Null-safe — silently skips missing elements.

---

#### Phase 17 — Upload Overlay UI Simplification

**Problem:** The upload overlay had too many buttons and a confusing flow:
- A "Paste manually" textarea that duplicated the notes editor
- A separate "Save Note" button before the send step
- The QR button was buried in the middle of the panel
- There was no visual indicator for the overlay when it was closed

**What was done:**

**HTML (both `index.html` and `index-desktop.html`):**
- Removed the "Paste manually" textarea entirely
- Removed the `#save-note-btn` button — saving is now implicit
- Merged save + send into a single `#send-notes-btn` labelled **"Send to Phone"**
- Moved `#show-qr-btn` directly under the overlay header (first actionable item)

**`slides.js`:**
- Added `saveAndSendCurrentNote()` — saves the note to `state.customNotes` and immediately sends it over the data channel in one step, replacing the old two-button flow

**`webrtc.js`:**
- `send-notes-btn` now calls `saveAndSendCurrentNote` instead of the old `saveNoteForSlide`
- Removed `onLoadSlidesClick` handler (the separate "Load Slides" button was removed)

**CSS (`style.css`):**
- Toggle button (`.toggle-overlay-btn`) restyled to a small 40×40 px icon (`☰`) anchored `bottom: 16px; left: 16px` — unobtrusive when the overlay is closed
- Toggle button hidden via CSS sibling selector when the overlay is open (so it doesn't overlap)
- Close button (`.close-overlay-btn`) changed to a solid red circle (`background: #cc2222; border-radius: 50%`) — clearly destructive, always visible
- Overlay position changed to `bottom: 60px; left: 16px; width: 300px` to match the new toggle position; slide-in animation changed from `translateX` to `translateY(20px)`

---

**Implementing gyroscopic control and a laser pointer**

### Phase 18 — Gyroscope Slide Control (branch: `feature/gyroscope-control`) (2026-03-09)

**Goal:** Tilting the phone left/right changes slides on the desktop in real time, with debounce and threshold to prevent accidental triggers.

---

#### 18a — New module: `gyroscope.js`

**AI wrote:** The `gyroscope.js` module structure — `DeviceOrientationEvent` listener setup, iOS 13+ permission flow, direction-change detection logic, and the data channel send.

**I set the tuning values** after testing on my own phone — 20° felt right as a threshold (low enough to be responsive, high enough not to misfire when I just adjusted my grip), and 600 ms debounce prevented the slide from skipping two steps when I tilted decisively:

```javascript
const THRESHOLD = 20;      // degrees — I chose this after testing
const DEBOUNCE_TIME = 600; // ms — I chose this after testing
```

**AI diagnosed:** The gyroscope was silently receiving `null` values because iOS 13+ blocks `DeviceOrientationEvent` on plain HTTP — something I had not accounted for.

**I ran the openssl command** to generate the self-signed certificate once AI explained what was needed:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'
```

**AI rewrote** the server to use the new certificates:

```javascript
const https = require('https');
const fs    = require('fs');
const sslOptions = {
  key:  fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};
const server = https.createServer(sslOptions, app);
```

**I decided:** To keep `key.pem` and `cert.pem` in the project root rather than inside `public/`, so they are never accidentally served as static files. Added both to `.gitignore`.

---

#### 18b — Wiring gyroscope into `webrtc.js`

**AI wrote:** The import, the `setupGyroscopeControl()` call inside `setupMobile()`, and the `'gyroscope-slide'` case in `_handleMessage()`:

```javascript
case 'gyroscope-slide':
  if (!isMobile()) {
    if (msg.direction === 'next') state.Reveal_Instance.next();
    else if (msg.direction === 'prev') state.Reveal_Instance.prev();
  }
  break;
```

**I tested:** Confirmed it worked end-to-end by tilting my phone and watching the desktop.

---

#### 18c — Bug: tilt fired but slides never changed

**Problem I noticed and reported:** The tilt indicator showed values but the desktop slides never moved.

**AI diagnosed and fixed:** Two silent bugs:
1. A boundary guard (`currentPhoneSlide < totalPhoneSlides - 1`) was always `false` because `totalPhoneSlides` was still 0 on the phone — removed entirely (Reveal.js handles its own boundaries).
2. The phone's `currentPhoneSlide` was stuck at 0 because the `'notes'` handler only updated it if the index already matched.

AI also discovered a follow-on problem from the fix: with the "always follow" correction, note saves could now cause the phone to jump slides unexpectedly.

---

**Why did I use key.pem and cert.pem?**
* SSL/TLS certificate is a digital object that allows systems to verify the identity & subsequently establish an encrypted network connection to another system using the Secure Sockets Layer/Transport Layer Security (SSL/TLS) protocol. **//information for me**

- They're self-signed SSL certificatse that makes the server run over HTTPS instead of HTTP.
- key.pem —> the private key (the server's secret used to encrypt traffic)
- cert.pem —> the public certificate (sent to browsers to identify the server)
Together they enable HTTPS, which is required for two things in this project:

- Gyroscope access —> **iOS 13+ refuses** to fire DeviceOrientationEvent on plain HTTP; HTTPS is mandatory.
- WebRTC —> browsers block camera/mic/peer connections on non-secure origins
- The certificates were generated with openssl and are self-signed, meaning no certificate authority (like Let's Encrypt) vouches for them — which is why browsers show the "Not Secure" warning. It should be fine for local development on my own network since I am the source.


#### 18d — Bug Fix: Note sends must not move the phone's current slide (2026-03-09)

**Problem I noticed during testing:** If I was on slide 3 on the phone and a note was saved for slide 7 on the desktop, the phone jumped to slide 7.

**I traced and diagnosed the bug:** The `'notes'` handler on the phone was unconditionally calling `displayPhoneNote(msg.slideIndex)` every time a note arrived — even if it was just saving a note for a background slide. Every note delivery was being treated as a navigation event.

**I designed the fix:** Separate the two message types:
- Notes come in and are **stored silently** without navigating; the display only updates if you're already looking at that slide
- Slide navigation happens only on a dedicated `'slide-change'` message sent when the desktop actually moves

**AI implemented the code** to carry out this design:

```javascript
// Desktop — onSlideChanged()
function onSlideChanged() {
  const slideIndex = state.Reveal_Instance.getState().indexh;
  sendSlideNotesToPhone(slideIndex);
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify({ type: 'slide-change', slideIndex }));
  }
}

// Phone — _handleMessage()
case 'notes':
case 'slide-notes':
  state.phoneNotes[msg.slideIndex] = msg.content; // always store silently
  if (msg.slideIndex === state.currentPhoneSlide) {
    displayPhoneNote(state.currentPhoneSlide); // only refresh if already on screen
  }
  break;

case 'slide-change':
  displayPhoneNote(msg.slideIndex); // desktop navigated → follow
  break;
```

---

#### 18e — Live tilt debug indicator

**Problem I noticed:** My gyroscope events were initially not firing and there was no visual feedback to confirm if they were firing on my phone screen or not.

**AI wrote:** A live tilt bar added to the phone UI in `index.html` — shows the `gamma` value numerically, a bar sliding left/right, red threshold markers at ±20°, and a last-action label showing `✅ Sent: ▶ next` or `⚠️ Not connected to desktop`.

**I contributed:** The elements had been added to `index-phone.html` only. I moved them to `index.html` — the file phones actually load via the QR code URL. I also noticed the bar was missing on my phone screen and reported which URL the phone loads.

---

#### 18f — Prev/Next buttons sync with gyroscope

**Problem I raised:** The prev/next tap buttons on the phone only updated the phone locally and didn't change slides on the desktop.

**AI designed the solution:** Rather than duplicate the Reveal.js navigation logic on the phone side, re-use the existing `'gyroscope-slide'` message type. This way tilt and buttons go through the exact same code path on the desktop.

**I implemented thr button handlers:**

```javascript
function onPrevSlide() {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify({ type: 'gyroscope-slide', direction: 'prev' }));
  }
}
function onNextSlide() {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify({ type: 'gyroscope-slide', direction: 'next' }));
  }
}
```

**AI had already implemented** the `'gyroscope-slide'` message handler on the desktop side, so the buttons just worked immediately once wired.

The loop now completes: desktop navigates (keyboard or button) → fires `onSlideChanged` → sends `'slide-change'` back → phone updates. Tilt, buttons, and desktop keyboard all stay in sync using the same path.

**I confirmed:** Tested that tapping the buttons changed the desktop slide correctly.

---

#### 18g — Timer display label

**Issue:** The timer should read `Timer: 00:00` instead of just `00:00`.

**I modified** `updateTimerDisplay()` in `timer.js`:

```javascript
if (timerDisplay) timerDisplay.textContent = 'Timer: ' + timeStr;
```

Desktop overlay kept as plain `mm:ss` (no label needed there).

---

### Phase 19 — Laser Pointer (branch: `feature/laser-pointer`) (2026-03-10)

**Goal:** Moving a finger on a touch pad on the phone projects a red glowing dot onto the desktop slide in real time. The dot clears automatically when the slide changes.

---

#### 19a — New module: `laser.js`

**I designed and implemented the phone touch pad** (`setupLaserPointer`) — the core feature that makes the laser work:

```javascript
export function setupLaserPointer() {
  const laserPad = document.getElementById('laser-pad');
  const laserToggle = document.getElementById('laser-toggle-btn');
  let isActive = false;

  // Listen for finger movement on the pad
  laserPad.addEventListener('touchstart', (e) => {
    if (!isActive) return;
    const touch = e.touches[0];
    const rect = laserPad.getBoundingClientRect();
    // Normalise coordinates 0–1, clamped -> AI helped with the math and the equation logic
    const normX = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
    // Send to desktop
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify({ type: 'laser', x: normX, y: normY }));
    }
  });

  // Toggle button logic
  laserToggle.addEventListener('click', () => {
    isActive = !isActive;
    laserToggle.style.background = isActive ? '#cc0000' : '#177b0e';
  });
}
```

**AI wrote** the desktop rendering functions that draw the actual dot on the slide:

```javascript
export function drawLaserDot(normX, normY) {
  const canvas = document.getElementById('laser-canvas');
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width;
  canvas.height = rect.height;
  const x = normX * canvas.width;
  const y = normY * canvas.height;
  // radial glow + solid red dot via Canvas 2D API
}
export function clearLaserCanvas() {
  const canvas = document.getElementById('laser-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
```

**I wrote** the canvas overlay HTML in `index.html`:

```html
<canvas id="laser-canvas"
  style="position: absolute; inset: 0; width: 100%; height: 100%;
         pointer-events: none; z-index: 10;">
</canvas>
```

**I decided:** The touch pad uses a 16:9 `aspect-ratio` to intuitively match the slide proportions, so finger position maps correctly. I also chose both colours — `#177b0e` (green, laser off) and `#cc0000` (red, laser on) — to clearly signal the toggle state.

---

#### 19b — Wiring laser into `webrtc.js`

**AI wrote:** The imports, `'laser'`/`'laser-clear'` message cases, and the `clearLaserCanvas()` call in `onSlideChanged()`:

```javascript
import { setupLaserPointer, clearLaserCanvas, drawLaserDot } from './laser.js';

// In _handleMessage():
case 'laser':
  if (!isMobile()) drawLaserDot(msg.x, msg.y);
  break;
case 'laser-clear':
  if (!isMobile()) clearLaserCanvas();
  break;

// In onSlideChanged():
clearLaserCanvas(); // auto-clear on every slide navigation
```

**I added:** The `setupLaserPointer()` call inside `setupMobile()` alongside `setupGyroscopeControl()`.

---

#### Week 3 - Critical Reflection on AI Use

Through Phases 18 and 19, AI helped me with architecture, diagnosis, and heavy lifting in canvas rendering — while I drove feature tuning, solving bugs, implementing some of the phone logic, and making design decisions.

**What I implemented / contributed:**
- **Gyroscope tuning & HTTPS setup** — I tested the gyroscope on my phone and chose THRESHOLD=20° and DEBOUNCE_TIME=600ms. I ran the `openssl` command to generate self-signed certificates and decided to keep them in the project root (not `public/`). 
- **Laser pointer touch pad** — I designed and implemented `setupLaserPointer()` in `laser.js`, including touch listeners, coordinate normalization, debouncing, and toggle button state management. I also wrote the canvas overlay HTML and decided the 16:9 `aspect-ratio` with both colour choices (`#177b0e` green, `#cc0000` red).
- **Slide-change message type** — I traced the note-send bug to its root cause (unconditional `displayPhoneNote()` on every note arrival). I designed the separation between silent note storage and explicit `'slide-change'` navigation, then wired both message handlers on the phone side.
- **Prev/next button sync** — I designed the unified navigation solution: reuse the existing `'gyroscope-slide'` message type so buttons, tilt, and desktop keyboard all flow through the same Reveal.js code path. I implemented both `onPrevSlide()` and `onNextSlide()` button handlers.
- **Live tilt debug bar** — I moved the indicator elements from `index-phone.html` to `index.html` (the actual file phones load), fixing a critical issue where the UI wasn't visible.

**What AI generated (canvas rendering & message handling):**
- `gyroscope.js` — `DeviceOrientationEvent` listener setup, iOS 13+ permission flow with `requestPermission()`, direction detection logic
- `laser.js` — `drawLaserDot()` and `clearLaserCanvas()` canvas rendering functions with radial glow gradient
- HTTPS server rewrite — AI diagnosed the iOS 13+ HTTPS requirement, set up the SSL config (`https` module, `sslOptions`, `fs.readFileSync()`)
- Boundary guard removal — AI identified the silent `totalPhoneSlides=0` blocker and removed it
- `'laser'` and `'laser-clear'` message handlers in `webrtc.js` — canvas drawing and clearing on the desktop side

---

- **Planning for Week 4** 
- feature that gives you a warning 30/60 seconds before the end of your presentation (you can choose the time yourself?)
- phone vibrates to give audio feedback -> haptics
- enable / disable gyro



