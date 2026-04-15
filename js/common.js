// common.js — shared utilities for 유튜브 스크립트 & B-Roll

// Each page must define these before using save/undo:
// window.getStateForSave = () => {...}  — returns state object to save
// window.onUndoRestore = (sections) => {...}  — called when undo restores sections
// window.getSections = () => [...] — returns current sections array for undo

// ── Theme ──
function getTheme() { return localStorage.getItem('broll-theme') || 'dark'; }

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  var icon = document.getElementById('themeIcon');
  if (icon) icon.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
  localStorage.setItem('broll-theme', theme);
}

function toggleTheme() { applyTheme(getTheme() === 'dark' ? 'light' : 'dark'); }

applyTheme(getTheme());

// ── Autosave ──
// Each page should set window.AUTOSAVE_KEY before loading common.js, or it defaults to 'broll-autosave'
var AUTOSAVE_KEY = window.AUTOSAVE_KEY || 'broll-autosave';
var AUTOSAVE_INTERVAL = 30000; // 30초
var autosaveTimer = null;
var isDirty = false;

function markDirty() {
  if (!isDirty) {
    isDirty = true;
    startAutosave();
  }
}

function startAutosave() {
  if (autosaveTimer) return;
  saveNow(); // 첫 변경 시 즉시 1회 저장
  autosaveTimer = setInterval(saveNow, AUTOSAVE_INTERVAL);
}

function stopAutosave() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
  isDirty = false;
}

function saveNow() {
  try {
    var data = window.getStateForSave();
    if (!data) return;
    data.savedAt = new Date().toISOString();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    showSaveIndicator();
  } catch (e) { /* localStorage full — ignore */ }
}

function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
  stopAutosave();
}

function showSaveIndicator() {
  var el = document.getElementById('saveIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'saveIndicator';
    el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-muted);z-index:150;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(el);
  }
  var time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  el.textContent = '\uC784\uC2DC\uC800\uC7A5 \uC644\uB8CC ' + time;
  el.style.opacity = '1';
  setTimeout(function() { el.style.opacity = '0'; }, 2000);
}

// ── Undo (structural changes only) ──
var undoStack = [];
var MAX_UNDO = 30;

function pushUndo() {
  undoStack.push(JSON.stringify(window.getSections()));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) return;
  var sections = JSON.parse(undoStack.pop());
  window.onUndoRestore(sections);
  showUndoToast();
}

function showUndoToast() {
  var el = document.getElementById('undoToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undoToast';
    el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-muted);z-index:150;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = '\uB418\uB3CC\uB9AC\uAE30 \uC644\uB8CC (' + undoStack.length + '\uB2E8\uACC4 \uB0A8\uC74C)';
  el.style.opacity = '1';
  setTimeout(function() { el.style.opacity = '0'; }, 2000);
}

// ── Utility ──
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
}

var CHARS_PER_MIN = 280;

function getTextLength(md) {
  return md.replace(/[#*\-_>\[\]()`~\n\r]/g, '').replace(/\s+/g, '').length;
}

function formatTime(seconds) {
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  return m + ':' + s.toString().padStart(2, '0');
}

function updateRuntime() {
  var sections = window.getSections();
  var totalChars = 0;
  sections.forEach(function(sec) {
    if ((sec.level || 2) >= 2) totalChars += getTextLength(sec.bodyMd);
  });
  var totalSec = (totalChars / CHARS_PER_MIN) * 60;
  var el = document.getElementById('runtimeDisplay');
  if (el) el.textContent = '\uC57D ' + formatTime(totalSec);

  // Per-section runtime
  document.querySelectorAll('.section-runtime').forEach(function(rt, i) {
    var filtered = sections.filter(function(s) { return (s.level || 2) >= 2; });
    var sec = filtered[i];
    if (sec) {
      var chars = getTextLength(sec.bodyMd);
      var secs = (chars / CHARS_PER_MIN) * 60;
      rt.textContent = '~' + formatTime(secs);
    }
  });
}

// ── File transfer between pages ──
function storePendingFile(name, content) {
  try {
    localStorage.setItem('pending-file', JSON.stringify({ name: name, content: content }));
  } catch (e) { /* localStorage full — ignore */ }
}

function getPendingFile() {
  try {
    var raw = localStorage.getItem('pending-file');
    if (!raw) return null;
    localStorage.removeItem('pending-file');
    return JSON.parse(raw);
  } catch (e) { return null; }
}
