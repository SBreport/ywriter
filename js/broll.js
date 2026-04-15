// broll.js — B-Roll 모드 (AUTOSAVE_KEY = 'broll-autosave' default in common.js)

// ── State ──
let state = {
  videoTitle: '',
  thumbnail: '',
  purpose: '',
  target: '',
  sections: [],   // { level: 1|2|3, title, bodyMd, tags, customTags, memo }
  version: 1,
  rawMd: '',
  columnRatio: 60  // percentage for script column
};

const DEFAULT_TAGS = [
  { type: 'screen',    label: '화면녹화' },
  { type: 'separate',  label: '별도녹화' },
  { type: 'stock',     label: '자료화면' }
];

// ── Hooks for common.js ──
window.getStateForSave = () => ({...state, savedAt: new Date().toISOString()});
window.getSections = () => state.sections;
window.onUndoRestore = (sections) => {
  state.sections = sections;
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
};

// ── File Upload ──
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    if (file.name.endsWith('.md')) parseMd(content);
    else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) loadFromHtml(content);
  };
  reader.readAsText(file, 'UTF-8');
}

// ── MD Parsing ──
function parseMd(md) {
  state.rawMd = md;
  const lines = md.split('\n');
  let title = '';
  let titleFound = false;
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (/^### /.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 3, title: line.replace(/^### /, '').trim(), bodyMd: '', tags: [], customTags: [], memo: '' };
    } else if (/^## /.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 2, title: line.replace(/^## /, '').trim(), bodyMd: '', tags: [], customTags: [], memo: '' };
    } else if (/^# /.test(line)) {
      if (!titleFound) {
        title = line.replace(/^# /, '').trim();
        titleFound = true;
      } else {
        if (currentSection) sections.push(currentSection);
        currentSection = { level: 1, title: line.replace(/^# /, '').trim(), bodyMd: '', tags: [], customTags: [], memo: '' };
      }
    } else if (currentSection) {
      currentSection.bodyMd += line + '\n';
    }
  }
  if (currentSection) sections.push(currentSection);

  state.videoTitle = title || '제목 없음';
  state.thumbnail = '';
  state.purpose = '';
  state.target = '';
  state.sections = sections;
  state.version = 1;
  state.columnRatio = 60;
  showEditor();
}

// ── Load from exported HTML ──
function loadFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const dataEl = doc.getElementById('broll-data');
  if (!dataEl) { alert('B-Roll 데이터가 포함된 HTML 파일이 아닙니다.'); return; }
  try {
    const data = JSON.parse(dataEl.textContent);
    state.videoTitle = data.videoTitle || '제목 없음';
    state.thumbnail = data.thumbnail || '';
    state.purpose = data.purpose || '';
    state.target = data.target || '';
    state.sections = data.sections || [];
    state.version = (data.version || 1) + 1;
    state.rawMd = data.rawMd || '';
    state.columnRatio = data.columnRatio || 60;
    showEditor();
  } catch (err) { alert('HTML 파일의 데이터를 파싱할 수 없습니다.'); }
}

// ── Show Editor ──
function showEditor() {
  document.getElementById('uploadScreen').style.display = 'none';
  document.getElementById('editorScreen').style.display = 'block';
  document.getElementById('exportBtn').style.display = 'inline-block';
  document.getElementById('newBtn').style.display = 'inline-block';

  document.getElementById('metaTitle').value = state.videoTitle;
  document.getElementById('metaThumbnail').value = state.thumbnail;
  document.getElementById('metaPurpose').value = state.purpose;
  document.getElementById('metaTarget').value = state.target;

  renderSections();
  updateToc();
  setupIntersectionObserver();
}

// ── Render Sections ──
function renderSections() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';
  container.style.setProperty('--col-ratio', state.columnRatio + '%');

  state.sections.forEach((sec, idx) => {
    if (idx === 0) container.appendChild(makeAddDivider(0));

    const level = sec.level || 2;
    const block = document.createElement('div');
    block.className = `section-block level-${level}`;
    block.id = `section-${idx}`;

    // Control bar
    const ctrl = document.createElement('div');
    ctrl.className = 'section-control';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'section-check';
    checkbox.checked = !!sec._selected;
    checkbox.onchange = () => {
      sec._selected = checkbox.checked;
      block.classList.toggle('selected', checkbox.checked);
      updateBulkBar();
    };

    const upBtn = document.createElement('button');
    upBtn.className = 'btn-icon'; upBtn.innerHTML = '&#9650;'; upBtn.title = '위로 이동';
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => moveSection(idx, -1);

    const downBtn = document.createElement('button');
    downBtn.className = 'btn-icon'; downBtn.innerHTML = '&#9660;'; downBtn.title = '아래로 이동';
    downBtn.disabled = idx === state.sections.length - 1;
    downBtn.onclick = () => moveSection(idx, 1);

    // Level badge (click to cycle)
    const levelBadge = document.createElement('span');
    levelBadge.className = `level-badge l${level}`;
    levelBadge.textContent = `H${level}`;
    levelBadge.title = '클릭: 레벨 변경 / 제목에서 Tab/Shift+Tab';
    levelBadge.onclick = () => {
      pushUndo();
      sec.level = sec.level >= 3 ? 1 : sec.level + 1;
      renderSections(); updateToc(); setupIntersectionObserver();
    };

    const titleInput = document.createElement('input');
    titleInput.className = 'section-title-input';
    titleInput.value = sec.title;
    titleInput.placeholder = '섹션 제목';
    titleInput.oninput = () => { sec.title = titleInput.value; updateToc(); markDirty(); };
    titleInput.onkeydown = (e) => {
      if (e.ctrlKey && ['1','2','3'].includes(e.key)) {
        e.preventDefault();
        const newLevel = parseInt(e.key);
        if (newLevel !== sec.level) {
          pushUndo();
          sec.level = newLevel;
          renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
          const newInput = document.querySelector(`#section-${idx} .section-title-input`);
          if (newInput) newInput.focus();
        }
      }
    };

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-icon'; addBtn.innerHTML = '+'; addBtn.title = '아래에 같은 레벨 섹션 추가';
    addBtn.onclick = () => addSection(idx + 1, level);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon danger'; delBtn.innerHTML = '&#10005;'; delBtn.title = '섹션 삭제';
    delBtn.onclick = () => deleteSection(idx);

    ctrl.append(checkbox, upBtn, downBtn, levelBadge, titleInput, addBtn, delBtn);

    // Body: script + handle + broll (only for level 2, 3)
    if (level >= 2) {
      const body = document.createElement('div');
      body.className = 'section-body';

      const scriptDiv = document.createElement('div');
      scriptDiv.className = 'section-script';
      const scriptTA = document.createElement('textarea');
      scriptTA.className = 'script-textarea';
      scriptTA.value = sec.bodyMd.trimEnd();
      scriptTA.placeholder = '대본을 입력하세요...';
      scriptTA.oninput = () => { sec.bodyMd = scriptTA.value + '\n'; autoResize(scriptTA); markDirty(); };
      scriptDiv.appendChild(scriptTA);

      // Resize handle
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.onmousedown = startResize;

      // B-roll
      const brollDiv = document.createElement('div');
      brollDiv.className = 'section-broll';

      const tagsArea = document.createElement('div');
      tagsArea.className = 'tags-area';

      DEFAULT_TAGS.forEach(tag => {
        const btn = document.createElement('span');
        btn.className = `tag-btn ${sec.tags.includes(tag.type) ? 'active' : 'inactive'}`;
        btn.setAttribute('data-tag-type', tag.type);
        btn.textContent = tag.label;
        btn.onclick = () => {
          const i = sec.tags.indexOf(tag.type);
          if (i >= 0) sec.tags.splice(i, 1); else sec.tags.push(tag.type);
          btn.className = `tag-btn ${sec.tags.includes(tag.type) ? 'active' : 'inactive'}`;
          btn.setAttribute('data-tag-type', tag.type);
          markDirty();
        };
        tagsArea.appendChild(btn);
      });

      (sec.customTags || []).forEach(ct => {
        tagsArea.appendChild(makeCustomTag(sec, ct, tagsArea));
      });

      const addTagBtn = document.createElement('span');
      addTagBtn.className = 'add-tag-btn'; addTagBtn.textContent = '+';
      addTagBtn.onclick = () => {
        const input = document.createElement('input');
        input.className = 'add-tag-input'; input.placeholder = '태그명';
        input.onkeydown = (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            const val = input.value.trim();
            if (!sec.customTags) sec.customTags = [];
            sec.customTags.push(val);
            tagsArea.insertBefore(makeCustomTag(sec, val, tagsArea), addTagBtn);
            input.remove();
          } else if (e.key === 'Escape') input.remove();
        };
        input.onblur = () => { if (!input.value.trim()) input.remove(); };
        tagsArea.insertBefore(input, addTagBtn);
        input.focus();
      };
      tagsArea.appendChild(addTagBtn);

      const memo = document.createElement('textarea');
      memo.className = 'broll-memo';
      memo.placeholder = 'B-roll 메모를 입력하세요...';
      memo.value = sec.memo || '';
      memo.oninput = () => { sec.memo = memo.value; markDirty(); };
      brollDiv.appendChild(memo);
      brollDiv.appendChild(tagsArea);

      body.append(scriptDiv, handle, brollDiv);
      block.append(ctrl, body);
      requestAnimationFrame(() => autoResize(scriptTA));
    } else {
      block.append(ctrl);
    }

    container.appendChild(block);
    container.appendChild(makeAddDivider(idx + 1));
  });
}

function makeCustomTag(sec, ct, tagsArea) {
  const btn = document.createElement('span');
  btn.className = 'tag-btn active';
  btn.setAttribute('data-tag-type', 'custom');
  btn.textContent = ct;
  btn.onclick = () => { sec.customTags = sec.customTags.filter(t => t !== ct); btn.remove(); };
  return btn;
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

// ── Bulk Selection ──
function getSelectedIndices() {
  return state.sections.map((s, i) => s._selected ? i : -1).filter(i => i >= 0);
}

function updateBulkBar() {
  const sel = getSelectedIndices();
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if (sel.length > 0) {
    bar.classList.add('show');
    count.textContent = `${sel.length}개 선택`;
  } else {
    bar.classList.remove('show');
  }
}

function clearSelection() {
  state.sections.forEach(s => delete s._selected);
  document.querySelectorAll('.section-check').forEach(cb => cb.checked = false);
  document.querySelectorAll('.section-block.selected').forEach(el => el.classList.remove('selected'));
  updateBulkBar();
}

function bulkMove(dir) {
  const indices = getSelectedIndices();
  if (indices.length === 0) return;
  pushUndo();

  if (dir === -1) {
    for (const idx of indices) {
      if (idx + dir < 0) return;
      [state.sections[idx], state.sections[idx + dir]] = [state.sections[idx + dir], state.sections[idx]];
    }
  } else {
    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      if (idx + dir >= state.sections.length) return;
      [state.sections[idx], state.sections[idx + dir]] = [state.sections[idx + dir], state.sections[idx]];
    }
  }
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
  updateBulkBar();
}

function bulkDelete() {
  const sel = getSelectedIndices();
  if (sel.length === 0) return;
  if (sel.length >= state.sections.length) { alert('최소 1개 섹션이 필요합니다.'); return; }
  if (!confirm(`${sel.length}개 섹션을 삭제하시겠습니까?`)) return;
  pushUndo();
  for (let i = sel.length - 1; i >= 0; i--) {
    state.sections.splice(sel[i], 1);
  }
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
  updateBulkBar();
}

// ── Drag Resize ──
function startResize(e) {
  e.preventDefault();
  const container = document.querySelector('.sections-container');
  const startX = e.clientX;
  const startRatio = state.columnRatio;
  const totalW = container.getBoundingClientRect().width;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (e) => {
    const dx = e.clientX - startX;
    const newRatio = Math.min(80, Math.max(40, startRatio + (dx / totalW) * 100));
    state.columnRatio = Math.round(newRatio);
    container.style.setProperty('--col-ratio', state.columnRatio + '%');
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Section CRUD ──
function addSection(atIdx, level) {
  level = level || 2;
  pushUndo();
  state.sections.splice(atIdx, 0, { level, title: '새 섹션', bodyMd: '', tags: [], customTags: [], memo: '' });
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
  const el = document.getElementById(`section-${atIdx}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deleteSection(idx) {
  if (state.sections.length <= 1) { alert('최소 1개 섹션이 필요합니다.'); return; }
  if (!confirm(`"${state.sections[idx].title}" 섹션을 삭제하시겠습니까?`)) return;
  pushUndo();
  state.sections.splice(idx, 1);
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
}

function moveSection(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.sections.length) return;
  pushUndo();
  [state.sections[idx], state.sections[newIdx]] = [state.sections[newIdx], state.sections[idx]];
  renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
}

// ── TOC ──
let tocDragIdx = null;

function updateToc() {
  const list = document.getElementById('tocList');
  list.innerHTML = '';
  state.sections.forEach((sec, idx) => {
    const level = sec.level || 2;
    const item = document.createElement('button');
    item.className = `toc-item toc-level-${level}`;
    item.setAttribute('data-section-idx', idx);
    item.draggable = true;

    const grip = document.createElement('span');
    grip.className = 'toc-grip';
    grip.textContent = '\u2261';
    grip.onmousedown = (e) => e.stopPropagation();

    const label = document.createElement('span');
    label.className = 'toc-label';
    label.textContent = sec.title || '(제목 없음)';

    item.append(grip, label);

    item.onclick = (e) => {
      if (e.target === grip) return;
      const el = document.getElementById(`section-${idx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    item.ondragstart = (e) => {
      tocDragIdx = idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };
    item.ondragend = () => {
      tocDragIdx = null;
      item.classList.remove('dragging');
      list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    item.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (tocDragIdx !== null && tocDragIdx !== idx) item.classList.add('drag-over');
    };
    item.ondragleave = () => item.classList.remove('drag-over');
    item.ondrop = (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (tocDragIdx === null || tocDragIdx === idx) return;
      pushUndo();
      const [moved] = state.sections.splice(tocDragIdx, 1);
      state.sections.splice(idx, 0, moved);
      renderSections(); updateToc(); setupIntersectionObserver(); markDirty();
    };

    list.appendChild(item);
  });
}

function scrollToMeta() {
  document.getElementById('metaArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleToc() {
  const sidebar = document.getElementById('tocSidebar');
  const btn = document.getElementById('tocToggle');
  sidebar.classList.toggle('collapsed');
  btn.innerHTML = sidebar.classList.contains('collapsed') ? '&raquo;' : '&laquo;';
}

// ── Intersection Observer for TOC highlight ──
let observer = null;
function setupIntersectionObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = entry.target.id.replace('section-', '');
        document.querySelectorAll('.toc-item[data-section-idx]').forEach(item => {
          item.classList.toggle('active', item.getAttribute('data-section-idx') === idx);
        });
      }
    });
  }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });

  state.sections.forEach((_, idx) => {
    const el = document.getElementById(`section-${idx}`);
    if (el) observer.observe(el);
  });
}

// ── Export ──
function openExportModal() {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');
  const safeTitle = state.videoTitle.replace(/[^가-힣a-zA-Z0-9]/g, '').substring(0, 30) || 'untitled';
  document.getElementById('exportFilename').value = `${dateStr}_${safeTitle}_v${state.version}.html`;
  document.getElementById('exportModal').classList.add('show');
}

function closeExportModal() { document.getElementById('exportModal').classList.remove('show'); }

function doExport() {
  const filename = document.getElementById('exportFilename').value.trim() || 'export.html';
  const data = {
    videoTitle: state.videoTitle,
    thumbnail: state.thumbnail,
    purpose: state.purpose,
    target: state.target,
    sections: state.sections,
    version: state.version,
    rawMd: state.rawMd,
    columnRatio: state.columnRatio,
    exportedAt: new Date().toISOString()
  };

  const exportHtml = buildExportHtml(data);
  const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : filename + '.html';
  a.click();
  URL.revokeObjectURL(url);
  clearAutosave();
  closeExportModal();
}

function buildExportHtml(data) {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  const bg = v('--bg'), surface = v('--surface'), border = v('--border');
  const text = v('--text'), textStrong = v('--text-strong'), textMuted = v('--text-muted');
  const accent = v('--accent'), brollBg = v('--broll-bg');

  const metaHtml = `
  <div style="background:${surface};border:1px solid ${border};border-radius:8px;padding:16px 20px;margin-bottom:12px;">
    <div style="font-size:18px;font-weight:700;color:${accent};margin-bottom:8px;">${escapeHtml(data.videoTitle)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:13px;">
      ${data.thumbnail ? `<div><span style="color:${textMuted};font-weight:600;">썸네일:</span> ${escapeHtml(data.thumbnail)}</div>` : ''}
      ${data.target ? `<div><span style="color:${textMuted};font-weight:600;">타겟:</span> ${escapeHtml(data.target)}</div>` : ''}
      ${data.purpose ? `<div style="grid-column:1/-1;"><span style="color:${textMuted};font-weight:600;">목적:</span> ${escapeHtml(data.purpose)}</div>` : ''}
    </div>
  </div>`;

  const ratio = data.columnRatio || 60;
  let sectionsHtml = '';
  data.sections.forEach(sec => {
    const level = sec.level || 2;

    if (level === 1) {
      sectionsHtml += `
      <div style="text-align:center;padding:10px 0 6px;margin:16px 0 4px;border-top:1px solid ${border};border-bottom:1px solid ${border};">
        <span style="font-size:12px;font-weight:700;color:${textMuted};text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(sec.title)}</span>
      </div>`;
      return;
    }

    const tagColors = {
      screen: v('--tag-screen'), separate: v('--tag-separate'), stock: v('--tag-stock')
    };
    const tagsHtml = [...DEFAULT_TAGS.filter(t => sec.tags.includes(t.type)).map(t =>
      `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;background:${tagColors[t.type]};color:#fff;margin-right:4px;margin-bottom:4px;">${escapeHtml(t.label)}</span>`
    ), ...(sec.customTags || []).map(ct =>
      `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;background:${v('--tag-custom')};color:#fff;margin-right:4px;margin-bottom:4px;">${escapeHtml(ct)}</span>`
    )].join('');

    const memoHtml = sec.memo ? `<div style="padding:8px 12px;background:${bg};border:1px solid ${border};border-radius:6px;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(sec.memo)}</div>` : '';
    const leftBorder = level === 3 ? `border-left:3px solid ${accent};border-radius:0 8px 8px 0;margin-left:16px;` : `border-radius:8px;`;
    const titleSize = level === 3 ? '13px' : '14px';

    sectionsHtml += `
    <div style="display:grid;grid-template-columns:${ratio}% 1fr;margin-bottom:2px;background:${surface};border:1px solid ${border};${leftBorder}overflow:hidden;">
      <div style="padding:16px 20px;border-right:1px solid ${border};">
        <h3 style="font-size:${titleSize};font-weight:600;color:${accent};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${border};">${escapeHtml(sec.title)}</h3>
        <div style="font-size:13px;line-height:1.8;white-space:pre-wrap;">${escapeHtml(sec.bodyMd.trim())}</div>
      </div>
      <div style="padding:16px 20px;background:${brollBg};">
        ${memoHtml}
        ${tagsHtml ? `<div style="margin-top:8px;">${tagsHtml}</div>` : ''}
      </div>
    </div>`;
  });

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(data.videoTitle)} — B-Roll</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${bg};color:${text};line-height:1.6;padding:16px;}strong{color:${textStrong};}em{color:${textMuted};}</style>
</head><body>
${metaHtml}
${sectionsHtml}
<script type="application/json" id="broll-data">${JSON.stringify(data)}<\/script>
</body></html>`;
}

// ── Reset ──
function resetToUpload() {
  state = { videoTitle: '', thumbnail: '', purpose: '', target: '', sections: [], version: 1, rawMd: '', columnRatio: 60 };
  document.getElementById('editorScreen').style.display = 'none';
  document.getElementById('uploadScreen').style.display = 'block';
  document.getElementById('exportBtn').style.display = 'none';
  document.getElementById('newBtn').style.display = 'none';
  fileInput.value = '';
  if (observer) observer.disconnect();
  clearAutosave();
}

// ── Help Modal ──
function openHelp() {
  const modal = document.getElementById('exportModal');
  modal.querySelector('.modal').style.width = '560px';
  modal.querySelector('.modal').innerHTML = `
    <h3>도움말</h3>
    <div class="help-content">
      <h4>시작하기</h4>
      <p><strong>.md 파일</strong>을 드래그 & 드롭하거나 파일 선택 버튼으로 업로드하세요.<br>
      이전에 내보낸 <strong>.html 파일</strong>을 업로드하면 이어 편집할 수 있습니다.</p>

      <h4>대본 구조 (MD 작성법)</h4>
      <ul>
        <li>첫 번째 <kbd># 제목</kbd> → 영상 제목</li>
        <li>이후 <kbd># 텍스트</kbd> → 대구간 구분선 (훅, 인트로, 본론, 아웃트로 등)</li>
        <li><kbd>## 텍스트</kbd> → 소제목 (대본 + B-roll 작성 영역)</li>
        <li><kbd>### 텍스트</kbd> → 하위 맥락 (소제목 안의 세부 항목)</li>
      </ul>

      <h4>B-roll 태그</h4>
      <p>각 섹션 오른쪽에서 촬영 유형을 태그로 지정하고 메모를 남기세요.</p>
      <ul>
        <li><span class="help-tag" style="background:var(--tag-screen)">화면녹화</span> 모니터/앱 화면을 녹화</li>
        <li><span class="help-tag" style="background:var(--tag-separate)">별도녹화</span> 대본 외 별도로 촬영할 장면</li>
        <li><span class="help-tag" style="background:var(--tag-stock)">자료화면</span> 외부 자료/이미지 삽입</li>
        <li><kbd>+</kbd> 버튼으로 커스텀 태그 추가 가능</li>
      </ul>

      <h4>섹션 관리</h4>
      <ul>
        <li><kbd>▲</kbd> <kbd>▼</kbd> 순서 이동 | <kbd>+</kbd> 섹션 추가 | <kbd>✕</kbd> 삭제</li>
        <li><strong>H1/H2/H3 뱃지</strong> 클릭으로 레벨 변경, 또는 제목 입력 중 <kbd>Ctrl+1/2/3</kbd></li>
        <li><strong>체크박스</strong>로 여러 섹션 선택 → 하단 바에서 일괄 이동/삭제</li>
        <li><strong>목차(TOC)</strong>의 <kbd>≡</kbd> 핸들을 드래그해서 순서 변경</li>
        <li>대본과 B-roll 사이 경계선을 드래그하면 컬럼 비율 조절</li>
      </ul>

      <h4>키보드 단축키</h4>
      <ul>
        <li><kbd>Ctrl+S</kbd> 수동 임시저장</li>
        <li><kbd>Ctrl+Z</kbd> 구조 되돌리기 (삭제/이동/레벨변경)</li>
        <li><kbd>Ctrl+E</kbd> HTML 내보내기</li>
        <li><kbd>Ctrl+P</kbd> 대본 모드 (텔레프롬프터)</li>
        <li><kbd>Esc</kbd> 모달/대본 모드 닫기</li>
      </ul>

      <h4>체크리스트</h4>
      <p>B-roll 태그와 메모를 기반으로 촬영 목록을 자동 생성합니다. 태그별로 그룹핑되며, 클립보드에 복사해서 폰 메모앱에 붙여넣어 촬영 현장에서 사용하세요.</p>

      <h4>대본 모드 (텔레프롬프터)</h4>
      <p>전체 화면으로 대본만 보여줍니다. 촬영 시 카메라 옆 모니터에 띄워 사용하세요.</p>
      <ul>
        <li><kbd>Space</kbd> 재생/일시정지</li>
        <li><kbd>↑</kbd> <kbd>↓</kbd> 스크롤 속도 조절</li>
        <li>문장별 하이라이트 + 자동 스크롤 (분당 글자수 기반)</li>
        <li><strong>인쇄</strong> 버튼으로 대본만 깔끔하게 인쇄</li>
      </ul>

      <h4>저장 & 내보내기</h4>
      <ul>
        <li><strong>임시저장</strong>: 편집 시작 시 자동 저장 (30초 간격). 브라우저를 닫아도 다음에 복구 가능</li>
        <li><strong>HTML 내보내기</strong>: 파일명 형식 <kbd>YYYYMMDD_제목_v번호.html</kbd></li>
        <li>내보낸 HTML을 다시 업로드하면 편집을 이어갈 수 있습니다 (버전 자동 +1)</li>
      </ul>
    </div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-secondary" onclick="closeHelp()">닫기</button>
    </div>`;
  modal.classList.add('show');
}

function closeHelp() {
  const modal = document.getElementById('exportModal');
  modal.classList.remove('show');
  modal.querySelector('.modal').style.width = '420px';
  modal.querySelector('.modal').innerHTML = `
    <h3>HTML 내보내기</h3>
    <label for="exportFilename">파일명</label>
    <input type="text" id="exportFilename" placeholder="YYYYMMDD_제목_v1.html">
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeExportModal()">취소</button>
      <button class="btn btn-primary" onclick="doExport()">내보내기</button>
    </div>`;
}

// ── Checklist ──
function openChecklist() {
  const byTag = {};
  const ungrouped = [];

  state.sections.forEach(sec => {
    if ((sec.level || 2) < 2) return;
    if (!sec.memo && sec.tags.length === 0 && (!sec.customTags || sec.customTags.length === 0)) return;

    const allTags = [
      ...sec.tags.map(t => DEFAULT_TAGS.find(d => d.type === t)?.label || t),
      ...(sec.customTags || [])
    ];
    const item = { section: sec.title, memo: sec.memo, tags: allTags };

    if (allTags.length === 0) {
      ungrouped.push(item);
    } else {
      allTags.forEach(tag => {
        if (!byTag[tag]) byTag[tag] = [];
        byTag[tag].push(item);
      });
    }
  });

  let html = '<div class="checklist-modal">';
  Object.keys(byTag).forEach(tag => {
    html += `<div class="checklist-group"><div class="checklist-group-title">${escapeHtml(tag)}</div>`;
    byTag[tag].forEach(item => {
      html += `<label class="checklist-item"><input type="checkbox"><div><strong>${escapeHtml(item.section)}</strong>${item.memo ? '<br>' + escapeHtml(item.memo) : ''}</div></label>`;
    });
    html += '</div>';
  });
  if (ungrouped.length) {
    html += '<div class="checklist-group"><div class="checklist-group-title">기타</div>';
    ungrouped.forEach(item => {
      html += `<label class="checklist-item"><input type="checkbox"><div><strong>${escapeHtml(item.section)}</strong>${item.memo ? '<br>' + escapeHtml(item.memo) : ''}</div></label>`;
    });
    html += '</div>';
  }
  html += '</div>';

  let copyText = '[ 촬영 체크리스트 ]\n';
  Object.keys(byTag).forEach(tag => {
    copyText += `\n■ ${tag}\n`;
    byTag[tag].forEach(item => {
      copyText += `□ ${item.section}${item.memo ? ' — ' + item.memo : ''}\n`;
    });
  });
  if (ungrouped.length) {
    copyText += '\n■ 기타\n';
    ungrouped.forEach(item => {
      copyText += `□ ${item.section}${item.memo ? ' — ' + item.memo : ''}\n`;
    });
  }

  const modal = document.getElementById('exportModal');
  modal.querySelector('.modal').innerHTML = `
    <h3>촬영 체크리스트</h3>
    ${html}
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(\`${copyText.replace(/`/g,'\\`').replace(/\\/g,'\\\\')}\`); this.textContent='복사됨!'">클립보드 복사</button>
      <button class="btn btn-secondary" onclick="closeChecklist()">닫기</button>
    </div>`;
  modal.classList.add('show');
}

function closeChecklist() {
  const modal = document.getElementById('exportModal');
  modal.classList.remove('show');
  modal.querySelector('.modal').innerHTML = `
    <h3>HTML 내보내기</h3>
    <label for="exportFilename">파일명</label>
    <input type="text" id="exportFilename" placeholder="YYYYMMDD_제목_v1.html">
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeExportModal()">취소</button>
      <button class="btn btn-primary" onclick="doExport()">내보내기</button>
    </div>`;
}

// ── Script Mode (Teleprompter) ──
let scriptModeEl = null;
let teleprompterTimer = null;
let teleprompterPlaying = false;
let currentSentenceIdx = 0;
let sentences = [];
let teleprompterSpeed = 280;

function openScriptMode() {
  if (!scriptModeEl) {
    scriptModeEl = document.createElement('div');
    scriptModeEl.className = 'script-mode';
    scriptModeEl.innerHTML = `
      <div class="script-mode-toolbar">
        <button id="smPlayBtn" onclick="toggleTeleprompter()">재생</button>
        <button onclick="resetTeleprompter()">처음으로</button>
        <span class="speed-label">속도</span>
        <button onclick="adjustSpeed(-40)">-</button>
        <span class="speed-value" id="smSpeed">280자/분</span>
        <button onclick="adjustSpeed(40)">+</button>
        <span style="margin-left:auto;font-size:11px;color:#666;">Space: 재생/정지 | ↑↓: 속도 | Esc: 닫기</span>
        <button onclick="window.print()">인쇄</button>
        <button onclick="closeScriptMode()">닫기</button>
      </div>
      <div class="script-mode-content" id="smContent"></div>`;
    document.body.appendChild(scriptModeEl);
  }

  buildScriptContent();
  scriptModeEl.classList.add('show');
  document.addEventListener('keydown', scriptModeKeyHandler);
}

function closeScriptMode() {
  if (scriptModeEl) scriptModeEl.classList.remove('show');
  stopTeleprompter();
  document.removeEventListener('keydown', scriptModeKeyHandler);
}

function buildScriptContent() {
  const content = document.getElementById('smContent');
  sentences = [];
  let html = '';
  let sentIdx = 0;

  state.sections.forEach(sec => {
    const level = sec.level || 2;
    if (level === 1) {
      html += `<div class="sm-divider">${escapeHtml(sec.title)}</div>`;
      return;
    }
    html += `<div class="sm-section-title">${escapeHtml(sec.title)}</div><div>`;
    const text = sec.bodyMd.trim();
    if (!text) { html += '</div>'; return; }

    const parts = text.split(/(?<=[.?!。？！\n])\s*/);
    parts.forEach(part => {
      if (!part.trim()) return;
      const chars = part.replace(/\s/g, '').length;
      html += `<span class="sm-sentence dim" data-sent="${sentIdx}">${escapeHtml(part)} </span>`;
      sentences.push({ idx: sentIdx, chars, el: null });
      sentIdx++;
    });
    html += '</div>';
  });

  content.innerHTML = html;
  sentences.forEach((s, i) => {
    s.el = content.querySelector(`[data-sent="${i}"]`);
  });
  currentSentenceIdx = 0;
  highlightSentence(0);
}

function highlightSentence(idx) {
  sentences.forEach((s, i) => {
    if (!s.el) return;
    s.el.className = 'sm-sentence ' + (i < idx ? 'done' : i === idx ? 'current' : 'dim');
  });
  if (sentences[idx]?.el) {
    sentences[idx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function toggleTeleprompter() {
  if (teleprompterPlaying) stopTeleprompter();
  else startTeleprompter();
}

function startTeleprompter() {
  teleprompterPlaying = true;
  const btn = document.getElementById('smPlayBtn');
  if (btn) { btn.textContent = '일시정지'; btn.classList.add('active'); }
  advanceSentence();
}

function stopTeleprompter() {
  teleprompterPlaying = false;
  if (teleprompterTimer) { clearTimeout(teleprompterTimer); teleprompterTimer = null; }
  const btn = document.getElementById('smPlayBtn');
  if (btn) { btn.textContent = '재생'; btn.classList.remove('active'); }
}

function advanceSentence() {
  if (!teleprompterPlaying || currentSentenceIdx >= sentences.length) {
    stopTeleprompter();
    return;
  }
  highlightSentence(currentSentenceIdx);
  const chars = sentences[currentSentenceIdx].chars || 10;
  const ms = (chars / teleprompterSpeed) * 60000;
  teleprompterTimer = setTimeout(() => {
    currentSentenceIdx++;
    advanceSentence();
  }, Math.max(500, ms));
}

function resetTeleprompter() {
  stopTeleprompter();
  currentSentenceIdx = 0;
  highlightSentence(0);
}

function adjustSpeed(delta) {
  teleprompterSpeed = Math.max(120, Math.min(500, teleprompterSpeed + delta));
  document.getElementById('smSpeed').textContent = teleprompterSpeed + '자/분';
}

function scriptModeKeyHandler(e) {
  if (e.key === ' ') { e.preventDefault(); toggleTeleprompter(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); adjustSpeed(20); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); adjustSpeed(-20); }
  else if (e.key === 'Escape') { closeScriptMode(); }
}

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', (e) => {
  if (scriptModeEl?.classList.contains('show')) return;

  if (e.ctrlKey && e.key === 'z' && !e.target.matches('textarea, input')) {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveNow();
  } else if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    if (state.sections.length > 0) openExportModal();
  } else if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    if (state.sections.length > 0) openScriptMode();
  } else if (e.key === 'Escape') {
    closeExportModal();
  }
});

// ── Patch showEditor to show new buttons + runtime ──
const _origShowEditor = showEditor;
showEditor = function() {
  _origShowEditor();
  document.getElementById('runtimeDisplay').style.display = 'inline-block';
  document.getElementById('checklistBtn').style.display = 'inline-block';
  document.getElementById('scriptModeBtn').style.display = 'inline-block';
  updateRuntime();
};

// ── Patch renderSections to add per-section runtime + update total ──
const _origRenderSections = renderSections;
renderSections = function() {
  _origRenderSections();
  let runtimeIdx = 0;
  state.sections.forEach((sec, idx) => {
    if ((sec.level || 2) < 2) return;
    const ctrl = document.querySelector(`#section-${idx} .section-control`);
    if (ctrl) {
      const rt = document.createElement('span');
      rt.className = 'section-runtime';
      const chars = getTextLength(sec.bodyMd);
      const secs = (chars / CHARS_PER_MIN) * 60;
      rt.textContent = `~${formatTime(secs)}`;
      ctrl.appendChild(rt);
    }
    runtimeIdx++;
  });
  updateRuntime();
};

// ── Patch resetToUpload to hide new buttons ──
const _origReset = resetToUpload;
resetToUpload = function() {
  _origReset();
  document.getElementById('runtimeDisplay').style.display = 'none';
  document.getElementById('checklistBtn').style.display = 'none';
  document.getElementById('scriptModeBtn').style.display = 'none';
};

// ── Patch markDirty to update runtime ──
const _origMarkDirty = markDirty;
markDirty = function() {
  _origMarkDirty();
  updateRuntime();
};

// ── Broll-specific autosave recovery ──
function checkBrollAutosave() {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (!data.sections || data.sections.length === 0) return;
    const savedAt = new Date(data.savedAt);
    const timeStr = savedAt.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    showRecoveryBanner(data, timeStr);
  } catch (e) { clearAutosave(); }
}

function showRecoveryBanner(data, timeStr) {
  const banner = document.createElement('div');
  banner.id = 'recoveryBanner';
  banner.style.cssText = 'position:fixed;top:48px;left:0;right:0;z-index:110;padding:12px 24px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:500;';
  banner.innerHTML = `
    <span>이전 작업이 남아있습니다 — "${escapeHtml(data.videoTitle)}" (${timeStr})</span>
    <span style="display:flex;gap:8px;">
      <button id="recoverYes" style="padding:5px 14px;border:1.5px solid #fff;border-radius:6px;background:transparent;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">복구하기</button>
      <button id="recoverNo" style="padding:5px 14px;border:none;border-radius:6px;background:rgba(0,0,0,0.2);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">삭제</button>
    </span>`;
  document.body.appendChild(banner);

  document.getElementById('recoverYes').onclick = () => {
    state.videoTitle = data.videoTitle || '';
    state.thumbnail = data.thumbnail || '';
    state.purpose = data.purpose || '';
    state.target = data.target || '';
    state.sections = data.sections || [];
    state.version = data.version || 1;
    state.rawMd = data.rawMd || '';
    state.columnRatio = data.columnRatio || 60;
    banner.remove();
    showEditor();
  };
  document.getElementById('recoverNo').onclick = () => {
    clearAutosave();
    banner.remove();
  };
}

// ── Check for pending file from landing page ──
(function checkPendingFile() {
  const pending = localStorage.getItem('pending-file');
  if (pending) {
    localStorage.removeItem('pending-file');
    try {
      const { name, content } = JSON.parse(pending);
      if (name.endsWith('.md')) parseMd(content);
      else if (name.endsWith('.html') || name.endsWith('.htm')) loadFromHtml(content);
      return;
    } catch(e) {}
  }
  // If no pending file, check autosave
  checkBrollAutosave();
})();
