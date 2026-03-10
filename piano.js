// ══════════════════════════════════════════════════════
//  LUMINIANO  ·  piano.js
// ══════════════════════════════════════════════════════

// ── Audio Context ──────────────────────────────────────
const AudioContext = window.AudioContext || window.webkitAudioContext;
let ctx = null;
let analyser = null;
let masterGain = null;

function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.65;
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);
}

// ── State ──────────────────────────────────────────────
let octave      = 4;
let sustainOn   = false;
let sustainTime = 1.5;
let rootKey     = 'C';
let scaleName   = 'major';

const activeOscillators = {};
const activeNoteNames   = new Set();

// ── Scale Definitions ──────────────────────────────────
const SCALES = {
  chromatic      : [0,1,2,3,4,5,6,7,8,9,10,11],
  major          : [0,2,4,5,7,9,11],
  minor          : [0,2,3,5,7,8,10],
  harmonic       : [0,2,3,5,7,8,11],
  pentatonic     : [0,2,4,7,9],
  pentatonicMinor: [0,3,5,7,10],
  blues          : [0,3,5,6,7,10],
  dorian         : [0,2,3,5,7,9,10],
  phrygian       : [0,1,3,5,7,8,10],
  lydian         : [0,2,4,6,7,9,11],
  mixolydian     : [0,2,4,5,7,9,10],
  locrian        : [0,1,3,5,6,8,10],
  wholeTone      : [0,2,4,6,8,10],
  diminished     : [0,2,3,5,6,8,9,11],
};

const NOTE_NAMES      = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_DISPLAY    = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const WHITE_SEMITONES = [0,2,4,5,7,9,11];
const BLACK_SEMITONES = [1,3,6,8,10];

// ── Serial Keyboard Layout ─────────────────────────────
// Keys go LEFT-TO-RIGHT, BOTTOM-TO-TOP on the physical keyboard.
// Z = lowest note, each next key = +1 semitone, ] = highest.
//
// Physical order low → high (bottom row first, then up):
//   z x c v b n m , . /          (10 keys, row 3)
//   a s d f g h j k l ; '        (11 keys, row 2)
//   q w e r t y u i o p [ ]      (12 keys, row 1)
//   1 2 3 4 5 6 7 8 9 0 - =      (12 keys, row 0)
//
// Total: 45 keys → covers 3 octaves + 9 semitones chromatically
const SERIAL_KEYS = [
  'z','x','c','v','b','n','m',',','.',  '/',   // row 3  (10)
  'a','s','d','f','g','h','j','k','l',  ';',"'"// row 2  (11)
  ,'q','w','e','r','t','y','u','i','o', 'p','[',']', // row 1  (12)
  '1','2','3','4','5','6','7','8','9',  '0','-','='  // row 0  (12)
];

// ── Build Key ↔ MIDI Maps ──────────────────────────────
// SERIAL_KEYS[0] (Z) maps to startMidi, each index = +1 semitone.
let keyToMidi = {};
let midiToKey = {};

function buildKeyMap() {
  keyToMidi = {};
  midiToKey = {};
  // Z starts at C of (octave - 1)
  const startMidi = (octave - 1) * 12;
  SERIAL_KEYS.forEach((k, i) => {
    const midi = startMidi + i;
    if (midi >= 0 && midi <= 127) {
      keyToMidi[k] = midi;
      midiToKey[midi] = k;
    }
  });
}

// ── Helpers ────────────────────────────────────────────
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function midiToName(midi) {
  return NOTE_DISPLAY[midi % 12] + Math.floor(midi / 12 - 1);
}
function getScaleNotes() {
  const rootIdx   = NOTE_NAMES.indexOf(rootKey);
  const intervals = SCALES[scaleName];
  const result    = new Set();
  for (let o = 0; o < 11; o++) {
    for (const iv of intervals) {
      const midi = o * 12 + rootIdx + iv;
      if (midi >= 0 && midi <= 127) result.add(midi);
    }
  }
  return result;
}

// ── Build Piano UI ─────────────────────────────────────
function buildPiano() {
  buildKeyMap();

  const container  = document.getElementById('pianoKeys');
  container.innerHTML = '';

  const scaleNotes = getScaleNotes();
  const KEY_W      = 46;

  // Show 4 full octaves starting from (octave - 1)
  const startOct = octave - 1;
  const numOcts  = 4;

  const whiteKeys = [];
  const blackKeys = [];

  for (let o = startOct; o < startOct + numOcts; o++) {
    WHITE_SEMITONES.forEach(semi => {
      const midi = (o + 1) * 12 + semi;
      if (midi >= 0 && midi <= 127) whiteKeys.push({ midi, semi });
    });
  }
  // Trailing C
  const trailMidi = (startOct + numOcts + 1) * 12;
  if (trailMidi <= 127) whiteKeys.push({ midi: trailMidi, semi: 0 });

  container.style.width  = (whiteKeys.length * KEY_W) + 'px';
  container.style.height = '180px';

  whiteKeys.forEach((k, i) => {
    const inScale = scaleName !== 'chromatic' && scaleNotes.has(k.midi);
    const kbKey   = midiToKey[k.midi];

    const el = document.createElement('div');
    el.className    = 'white-key' + (inScale ? ' in-scale' : '');
    el.dataset.midi = k.midi;
    el.style.left   = (i * KEY_W) + 'px';
    el.style.width  = (KEY_W - 2) + 'px';

    const noteLabel = document.createElement('span');
    noteLabel.className   = 'key-label';
    noteLabel.textContent = NOTE_DISPLAY[k.midi % 12];
    el.appendChild(noteLabel);

    if (kbKey) {
      const hint = document.createElement('span');
      hint.className = 'key-label';
      hint.style.cssText = 'font-size:8px;color:rgba(0,0,0,0.22);display:block;margin-top:2px;';
      hint.textContent = kbKey.toUpperCase();
      el.appendChild(hint);
    }

    attachNoteEvents(el, k.midi);
    container.appendChild(el);

    // Black key to the right
    const nextSemi = k.semi + 1;
    if (BLACK_SEMITONES.includes(nextSemi)) {
      const bMidi = Math.floor(k.midi / 12) * 12 + nextSemi;
      if (bMidi >= 0 && bMidi <= 127) {
        blackKeys.push({ midi: bMidi, x: i * KEY_W + KEY_W - 15 });
      }
    }
  });

  blackKeys.forEach(k => {
    const inScale = scaleName !== 'chromatic' && scaleNotes.has(k.midi);
    const kbKey   = midiToKey[k.midi];

    const el = document.createElement('div');
    el.className    = 'black-key' + (inScale ? ' in-scale' : '');
    el.dataset.midi = k.midi;
    el.style.left   = k.x + 'px';

    const noteLabel = document.createElement('span');
    noteLabel.className   = 'key-label';
    noteLabel.textContent = NOTE_DISPLAY[k.midi % 12];
    el.appendChild(noteLabel);

    if (kbKey) {
      const hint = document.createElement('span');
      hint.className = 'key-label';
      hint.style.cssText = 'font-size:7px;color:rgba(255,255,255,0.25);display:block;margin-top:1px;';
      hint.textContent = kbKey.toUpperCase();
      el.appendChild(hint);
    }

    attachNoteEvents(el, k.midi);
    container.appendChild(el);
  });

  updateKbHintBar();
}

function attachNoteEvents(el, midi) {
  el.addEventListener('mousedown',  e => { e.preventDefault(); playNote(midi); });
  el.addEventListener('mouseenter', e => { if (e.buttons === 1) playNote(midi); });
  el.addEventListener('mouseup',    ()  => stopNote(midi));
  el.addEventListener('mouseleave', ()  => { if (!sustainOn) stopNote(midi); });
  el.addEventListener('touchstart', e  => { e.preventDefault(); playNote(midi); }, { passive: false });
  el.addEventListener('touchend',   ()  => stopNote(midi));
}

// ── Play / Stop ────────────────────────────────────────
function playNote(midi) {
  initAudio();
  if (activeOscillators[midi]) return;

  const freq  = midiToFreq(midi);
  const osc   = ctx.createOscillator();
  const gain  = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  const osc2  = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);
  gain2.gain.value = 0.12;
  osc2.connect(gain2); gain2.connect(gain);

  const osc3  = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3, ctx.currentTime);
  gain3.gain.value = 0.04;
  osc3.connect(gain3); gain3.connect(gain);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.4,  ctx.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.12);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(); osc2.start(); osc3.start();

  activeOscillators[midi] = { osc, osc2, osc3, gain };

  const el = document.querySelector(`[data-midi="${midi}"]`);
  if (el) el.classList.add('active');
  activeNoteNames.add(midiToName(midi));
  updateNoteDisplay();
}

function stopNote(midi) {
  const entry = activeOscillators[midi];
  if (!entry) return;
  const { osc, osc2, osc3, gain } = entry;
  const decay = sustainOn ? sustainTime : 0.22;

  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
  osc.stop(ctx.currentTime + decay);
  osc2.stop(ctx.currentTime + decay);
  osc3.stop(ctx.currentTime + decay);
  delete activeOscillators[midi];

  const el = document.querySelector(`[data-midi="${midi}"]`);
  if (el) el.classList.remove('active');
  activeNoteNames.delete(midiToName(midi));
  updateNoteDisplay();
}

function stopAllNotes() {
  Object.keys(activeOscillators).forEach(m => stopNote(parseInt(m)));
}

// ── Note Display ───────────────────────────────────────
function updateNoteDisplay() {
  const container = document.getElementById('activeNotes');
  container.innerHTML = '';
  if (activeNoteNames.size === 0) {
    container.innerHTML = '<span style="font-size:11px;color:var(--text-dim);letter-spacing:1px;">— touch a key —</span>';
    return;
  }
  activeNoteNames.forEach(name => {
    const pill = document.createElement('span');
    pill.className   = 'note-pill';
    pill.textContent = name;
    container.appendChild(pill);
  });
}

// ── Keyboard Hint Bar ──────────────────────────────────
function updateKbHintBar() {
  const bar = document.getElementById('kbHintBar');
  if (!bar) return;
  const startMidi = (octave - 1) * 12;
  const endMidi   = Math.min(startMidi + SERIAL_KEYS.length - 1, 127);
  bar.textContent =
    `Z = ${midiToName(startMidi)}  →  ] = ${midiToName(endMidi)}  ·  each key = +1 semitone  ·  ← → arrows: shift octave`;
}

// ── Keyboard Input ─────────────────────────────────────
const heldKeys = new Set();

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.repeat) return;

  if (e.key === 'ArrowLeft')  { changeOctave(-1); return; }
  if (e.key === 'ArrowRight') { changeOctave(+1); return; }

  const key = e.key.toLowerCase();
  if (heldKeys.has(key)) return;
  heldKeys.add(key);

  const midi = keyToMidi[key];
  if (midi !== undefined) {
    e.preventDefault();
    playNote(midi);
  }
});

document.addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  heldKeys.delete(key);
  const midi = keyToMidi[key];
  if (midi !== undefined) stopNote(midi);
});

// ── Octave Control ─────────────────────────────────────
function changeOctave(delta) {
  stopAllNotes();
  octave = Math.max(2, Math.min(6, octave + delta));
  document.getElementById('octDisplay').textContent = octave;
  buildPiano();
}

document.getElementById('octDown').addEventListener('click', () => changeOctave(-1));
document.getElementById('octUp').addEventListener('click',   () => changeOctave(+1));

// ── Sustain ────────────────────────────────────────────
document.getElementById('sustainToggle').addEventListener('click', () => {
  sustainOn = !sustainOn;
  const el = document.getElementById('sustainToggle');
  el.classList.toggle('active', sustainOn);
  el.querySelector('.toggle-label').textContent = sustainOn ? 'On' : 'Off';
});
document.getElementById('sustainAmount').addEventListener('input', e => {
  sustainTime = parseFloat(e.target.value);
});

// ── Root Key / Scale ───────────────────────────────────
document.getElementById('rootKey').addEventListener('change', e => {
  rootKey = e.target.value; stopAllNotes(); buildPiano();
});
document.getElementById('scale').addEventListener('change', e => {
  scaleName = e.target.value; stopAllNotes(); buildPiano();
});

// ── Visualizer ─────────────────────────────────────────
const canvas    = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); buildPiano(); });

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  canvasCtx.fillStyle = '#0e1117';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  if (!analyser) {
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = 'rgba(201,168,76,0.12)';
    canvasCtx.lineWidth = 1;
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
    return;
  }

  const bufLen = analyser.frequencyBinCount;
  const data   = new Uint8Array(bufLen);
  analyser.getByteTimeDomainData(data);
  const sliceW = canvas.width / bufLen;

  // Glow
  canvasCtx.beginPath();
  canvasCtx.lineWidth = 5;
  const g1 = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
  g1.addColorStop(0,   'rgba(201,168,76,0)');
  g1.addColorStop(0.3, 'rgba(201,168,76,0.08)');
  g1.addColorStop(0.7, 'rgba(79,195,247,0.08)');
  g1.addColorStop(1,   'rgba(79,195,247,0)');
  canvasCtx.strokeStyle = g1;
  drawWave(data, bufLen, sliceW);
  canvasCtx.stroke();

  // Line
  canvasCtx.beginPath();
  canvasCtx.lineWidth = 1.5;
  const g2 = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
  g2.addColorStop(0,   'rgb(255, 255, 255)');
  g2.addColorStop(0.3, 'rgba(201, 168, 76, 0.95)');
  g2.addColorStop(0.7, 'rgba(201, 168, 76, 0.95)');
  g2.addColorStop(1,   'rgba(255, 255, 255, 0.92)');
  canvasCtx.strokeStyle = g2;
  drawWave(data, bufLen, sliceW);
  canvasCtx.stroke();
}

function drawWave(data, bufLen, sliceW) {
  let x = 0;
  for (let i = 0; i < bufLen; i++) {
    const y = (data[i] / 128.0) * (canvas.height / 2);
    i === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
    x += sliceW;
  }
}

// ── Init ───────────────────────────────────────────────
buildPiano();
drawVisualizer();
