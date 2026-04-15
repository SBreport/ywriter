// writing.js — 원고 작성 모드

// ── State ──
let state = {
  videoTitle: '',
  purpose: '',
  target: '',
  sections: [],   // { level: 1|2|3, title, bodyMd }
  version: 1,
  columnRatio: 50
};

let benchmarks = []; // [{name, content, rendered}] max 2
let activeBenchTab = 0;

// AUTOSAVE_KEY set via window.AUTOSAVE_KEY in writing.html before common.js loads

// ── Hooks for common.js ──
window.getStateForSave = () => ({
  videoTitle: state.videoTitle,
  purpose: state.purpose,
  target: state.target,
  sections: state.sections,
  version: state.version,
  columnRatio: state.columnRatio,
  benchmarks: benchmarks.map(b => ({ name: b.name, content: b.content })),
  savedAt: new Date().toISOString()
});

window.getSections = () => state.sections;
window.onUndoRestore = (sections) => {
  state.sections = sections;
  renderSections();
  updateToc();
};

// ── Timestamp text → formatted content ──
function parseTimestampText(text) {
  const lines = text.split('\n');
  let result = '';
  const tsRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;
  for (const line of lines) {
    const m = line.match(tsRegex);
    if (m) {
      result += `<span class="timestamp">[${m[1]}]</span>${escapeHtml(m[2])}\n`;
    } else if (line.trim()) {
      result += escapeHtml(line) + '\n';
    } else {
      result += '\n';
    }
  }
  return result;
}

function isTimestampFile(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 3) return false;
  const tsLines = lines.filter(l => /^\d{1,2}:\d{2}/.test(l));
  return tsLines.length / lines.length > 0.5;
}

// ── Benchmark panel ──
function addBenchmark(name, content) {
  if (benchmarks.length >= 2) {
    alert('벤치마킹 원고는 최대 2개까지 가능합니다.');
    return;
  }
  const rendered = isTimestampFile(content) ? parseTimestampText(content) : escapeHtml(content);
  benchmarks.push({ name, content, rendered });
  activeBenchTab = benchmarks.length - 1;
  renderBenchPanel();
}

function renderBenchPanel() {
  const tabs = document.getElementById('benchTabs');
  const content = document.getElementById('benchContent');

  if (benchmarks.length === 0) {
    tabs.innerHTML = '';
    content.innerHTML = `
      <div class="bench-upload" id="benchUploadArea">
        <p>벤치마킹 원고를 업로드하세요</p>
        <p style="font-size:11px;">.txt (타임스탬프 자막) 또는 .md</p>
        <div class="file-input-wrap">
          <button class="btn btn-secondary">파일 선택</button>
          <input type="file" accept=".txt,.md" onchange="handleBenchFile(this.files[0])">
        </div>
      </div>`;
    setupBenchDrop();
    return;
  }

  // Render tabs
  let tabsHtml = '';
  benchmarks.forEach((b, i) => {
    tabsHtml += `<button class="bench-tab ${i === activeBenchTab ? 'active' : ''}" onclick="switchBenchTab(${i})">${escapeHtml(b.name)}</button>`;
  });
  if (benchmarks.length < 2) {
    tabsHtml += `<label class="bench-tab-add" title="벤치마킹 추가">+<input type="file" accept=".txt,.md" style="display:none" onchange="handleBenchFile(this.files[0])"></label>`;
  }
  tabs.innerHTML = tabsHtml;

  // Render content
  content.innerHTML = `<div class="bench-content">${benchmarks[activeBenchTab].rendered}</div>`;
}

function switchBenchTab(idx) {
  activeBenchTab = idx;
  renderBenchPanel();
}

function handleBenchFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    addBenchmark(file.name.replace(/\.[^.]+$/, ''), e.target.result);
  };
  reader.readAsText(file, 'UTF-8');
}

function setupBenchDrop() {
  const area = document.getElementById('benchUploadArea');
  if (!area) return;
  const panel = area.closest('.bench-panel');
  if (!panel) return;
  panel.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = 'var(--accent)'; });
  panel.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    if (e.dataTransfer.files.length) handleBenchFile(e.dataTransfer.files[0]);
  });
}

// ── MD Parsing (same as broll) ──
function parseMd(md) {
  const lines = md.split('\n');
  let title = '';
  let titleFound = false;
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (/^### /.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 3, title: line.replace(/^### /, '').trim(), bodyMd: '' };
    } else if (/^## /.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 2, title: line.replace(/^## /, '').trim(), bodyMd: '' };
    } else if (/^# /.test(line)) {
      if (!titleFound) { title = line.replace(/^# /, '').trim(); titleFound = true; }
      else {
        if (currentSection) sections.push(currentSection);
        currentSection = { level: 1, title: line.replace(/^# /, '').trim(), bodyMd: '' };
      }
    } else if (currentSection) {
      currentSection.bodyMd += line + '\n';
    }
  }
  if (currentSection) sections.push(currentSection);

  state.videoTitle = title || '제목 없음';
  state.sections = sections;
  state.version = 1;
}

// ── Show Editor ──
function showEditor() {
  document.getElementById('metaTitle').value = state.videoTitle;
  document.getElementById('metaPurpose').value = state.purpose || '';
  document.getElementById('metaTarget').value = state.target || '';
  renderSections();
  updateToc();
  renderBenchPanel();
  updateRuntime();
}

// ── Render Sections (writing mode — no broll, no tags) ──
function renderSections() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';

  state.sections.forEach((sec, idx) => {
    if (idx === 0) container.appendChild(makeAddDivider(0));

    const level = sec.level || 2;
    const block = document.createElement('div');
    block.className = `section-block level-${level}`;
    block.id = `section-${idx}`;

    // Control bar
    const ctrl = document.createElement('div');
    ctrl.className = 'section-control';

    const upBtn = document.createElement('button');
    upBtn.className = 'btn-icon'; upBtn.innerHTML = '&#9650;';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => moveSection(idx, -1);

    const downBtn = document.createElement('button');
    downBtn.className = 'btn-icon'; downBtn.innerHTML = '&#9660;';
    downBtn.disabled = idx === state.sections.length - 1;
    downBtn.onclick = () => moveSection(idx, 1);

    const levelBadge = document.createElement('span');
    levelBadge.className = `level-badge l${level}`;
    levelBadge.textContent = `H${level}`;
    levelBadge.onclick = () => {
      pushUndo();
      sec.level = sec.level >= 3 ? 1 : sec.level + 1;
      renderSections(); updateToc(); markDirty();
    };

    const titleInput = document.createElement('input');
    titleInput.className = 'section-title-input';
    titleInput.value = sec.title;
    titleInput.placeholder = '섹션 제목';
    titleInput.oninput = () => { sec.title = titleInput.value; updateToc(); markDirty(); };
    titleInput.onkeydown = (e) => {
      if (e.ctrlKey && ['1','2','3'].includes(e.key)) {
        e.preventDefault();
        const nl = parseInt(e.key);
        if (nl !== sec.level) { pushUndo(); sec.level = nl; renderSections(); updateToc(); markDirty(); }
      }
    };

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-icon'; addBtn.innerHTML = '+';
    addBtn.onclick = () => addSection(idx + 1, level);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon danger'; delBtn.innerHTML = '&#10005;';
    delBtn.onclick = () => deleteSection(idx);

    // Runtime per section
    const rt = document.createElement('span');
    rt.className = 'section-runtime';
    if (level >= 2) {
      const chars = getTextLength(sec.bodyMd);
      const secs = (chars / CHARS_PER_MIN) * 60;
      rt.textContent = `~${formatTime(secs)}`;
    }

    ctrl.append(upBtn, downBtn, levelBadge, titleInput, addBtn, delBtn, rt);

    // Body (level 2/3 only — just textarea, no broll)
    if (level >= 2) {
      const body = document.createElement('div');
      body.className = 'section-script';
      body.style.padding = '16px 20px';
      const ta = document.createElement('textarea');
      ta.className = 'script-textarea';
      ta.value = sec.bodyMd.trimEnd();
      ta.placeholder = '대본을 입력하세요...';
      ta.oninput = () => { sec.bodyMd = ta.value + '\n'; autoResize(ta); markDirty(); updateRuntime(); };
      body.appendChild(ta);
      block.append(ctrl, body);
      requestAnimationFrame(() => autoResize(ta));
    } else {
      block.append(ctrl);
    }

    container.appendChild(block);
    container.appendChild(makeAddDivider(idx + 1));
  });
}

function makeAddDivider(insertIdx) {
  const div = document.createElement('div');
  div.className = 'add-section-divider';
  const btn = document.createElement('button');
  btn.textContent = '+ 섹션 추가';
  btn.onclick = () => addSection(insertIdx);
  div.appendChild(btn);
  return div;
}

// ── Section CRUD ──
function addSection(atIdx, level) {
  level = level || 2;
  pushUndo();
  state.sections.splice(atIdx, 0, { level, title: '새 섹션', bodyMd: '' });
  renderSections(); updateToc(); markDirty();
}

function deleteSection(idx) {
  if (state.sections.length <= 1) return;
  if (!confirm(`"${state.sections[idx].title}" 삭제?`)) return;
  pushUndo();
  state.sections.splice(idx, 1);
  renderSections(); updateToc(); markDirty();
}

function moveSection(idx, dir) {
  const ni = idx + dir;
  if (ni < 0 || ni >= state.sections.length) return;
  pushUndo();
  [state.sections[idx], state.sections[ni]] = [state.sections[ni], state.sections[idx]];
  renderSections(); updateToc(); markDirty();
}

// ── TOC ──
function updateToc() {
  const list = document.getElementById('tocList');
  if (!list) return;
  list.innerHTML = '';
  state.sections.forEach((sec, idx) => {
    const level = sec.level || 2;
    const item = document.createElement('button');
    item.className = `toc-item toc-level-${level}`;
    item.setAttribute('data-section-idx', idx);

    const grip = document.createElement('span');
    grip.className = 'toc-grip'; grip.textContent = '≡';
    const label = document.createElement('span');
    label.className = 'toc-label'; label.textContent = sec.title || '(제목 없음)';

    item.append(grip, label);
    item.onclick = (e) => {
      if (e.target === grip) return;
      document.getElementById(`section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    list.appendChild(item);
  });
}

function scrollToMeta() {
  document.getElementById('writingMeta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleToc() {
  const sidebar = document.getElementById('tocSidebar');
  const btn = document.getElementById('tocToggle');
  sidebar.classList.toggle('collapsed');
  btn.innerHTML = sidebar.classList.contains('collapsed') ? '&raquo;' : '&laquo;';
}

// ── Runtime ──
function updateRuntime() {
  let total = 0;
  state.sections.forEach(s => { if ((s.level || 2) >= 2) total += getTextLength(s.bodyMd); });
  const el = document.getElementById('runtimeDisplay');
  if (el) el.textContent = `약 ${formatTime((total / CHARS_PER_MIN) * 60)}`;
}

// ── Export ──
function exportAsMd() {
  let md = `# ${state.videoTitle}\n\n`;
  state.sections.forEach(sec => {
    const prefix = '#'.repeat(sec.level || 2);
    md += `${prefix} ${sec.title}\n${sec.bodyMd}\n`;
  });
  downloadFile(`${state.videoTitle || 'script'}.md`, md, 'text/markdown');
}

function goToBroll() {
  // Export as MD and store for broll mode
  let md = `# ${state.videoTitle}\n\n`;
  state.sections.forEach(sec => {
    const prefix = '#'.repeat(sec.level || 2);
    md += `${prefix} ${sec.title}\n${sec.bodyMd}\n`;
  });
  localStorage.setItem('pending-file', JSON.stringify({ name: 'script.md', content: md }));
  window.location.href = 'broll.html';
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z' && !e.target.matches('textarea, input')) { e.preventDefault(); undo(); }
  else if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveNow(); }
  else if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportAsMd(); }
});

// ── Init ──
(function init() {
  // Check for pending file from landing page
  const pending = localStorage.getItem('pending-file');
  if (pending) {
    localStorage.removeItem('pending-file');
    try {
      const { name, content } = JSON.parse(pending);
      if (name.endsWith('.md')) {
        parseMd(content);
        showEditor();
      } else {
        // txt file → add as benchmark
        addBenchmark(name.replace(/\.[^.]+$/, ''), content);
        // Start with empty script
        state.sections = [{ level: 1, title: '인트로', bodyMd: '' }, { level: 2, title: '오프닝', bodyMd: '' }];
        showEditor();
      }
      return;
    } catch(e) {}
  }

  // Check autosave
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.sections?.length > 0) {
        const t = new Date(data.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        if (confirm(`이전 작업이 남아있습니다 (${t}, "${data.videoTitle}").\n복구하시겠습니까?`)) {
          state.videoTitle = data.videoTitle || '';
          state.purpose = data.purpose || '';
          state.target = data.target || '';
          state.sections = data.sections || [];
          state.version = data.version || 1;
          if (data.benchmarks) {
            data.benchmarks.forEach(b => addBenchmark(b.name, b.content));
          }
          showEditor();
          return;
        }
      }
    } catch(e) {}
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  // Default empty state
  state.sections = [
    { level: 1, title: '인트로', bodyMd: '' },
    { level: 2, title: '오프닝 멘트', bodyMd: '' }
  ];
  showEditor();
})();
