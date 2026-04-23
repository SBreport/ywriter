// chapter2-script.js — 원고 작성 (벤치마킹 참고)

(function() {
  function project() { return ProjectShell.getProject(); }
  let benchmarks = []; // {name, content, rendered}
  let activeBenchTab = 0;

  function show() {
    // Load benchmarks from project
    benchmarks = (project().scriptWriting.benchmarks || []).map(b => ({
      name: b.name,
      content: b.content,
      rendered: isTimestampFile(b.content) ? parseTimestampText(b.content) : escapeHtml(b.content)
    }));
    render();
    renderBenchPanel();
  }

  function render() {
    renderSections();
    renderHookBanner();
    updateRuntime();
  }

  // ── Bench panel ──
  function renderBenchPanel() {
    const tabs = document.getElementById('c2BenchTabs');
    const content = document.getElementById('c2BenchContent');

    if (benchmarks.length === 0) {
      tabs.innerHTML = '';
      content.innerHTML = `
        <div class="bench-upload" id="c2BenchUploadArea">
          <p>벤치마킹 원고 업로드</p>
          <p style="font-size:11px;">.txt (타임스탬프) / .md</p>
          <div class="file-input-wrap">
            <button class="btn btn-secondary">파일 선택</button>
            <input type="file" accept=".txt,.md" id="c2BenchFile">
          </div>
        </div>`;
      document.getElementById('c2BenchFile').onchange = (e) => handleBenchFile(e.target.files[0]);
      setupBenchDrop();
      return;
    }

    let tabsHtml = '';
    benchmarks.forEach((b, i) => {
      tabsHtml += `<button class="bench-tab ${i === activeBenchTab ? 'active' : ''}" data-i="${i}">${escapeHtml(b.name)}<span class="bench-tab-close" data-i="${i}">×</span></button>`;
    });
    if (benchmarks.length < 2) {
      tabsHtml += `<label class="bench-tab-add" title="추가">+<input type="file" accept=".txt,.md" style="display:none"></label>`;
    }
    tabs.innerHTML = tabsHtml;
    tabs.querySelectorAll('.bench-tab').forEach(tab => {
      tab.onclick = (e) => {
        if (e.target.classList.contains('bench-tab-close')) {
          const i = parseInt(e.target.dataset.i);
          benchmarks.splice(i, 1);
          if (activeBenchTab >= benchmarks.length) activeBenchTab = Math.max(0, benchmarks.length - 1);
          saveBenchmarks();
          renderBenchPanel();
          return;
        }
        activeBenchTab = parseInt(tab.dataset.i);
        renderBenchPanel();
      };
    });
    const addInput = tabs.querySelector('.bench-tab-add input');
    if (addInput) addInput.onchange = (e) => handleBenchFile(e.target.files[0]);

    content.innerHTML = `<div class="bench-content">${benchmarks[activeBenchTab].rendered}</div>`;
  }

  function handleBenchFile(file) {
    if (!file || benchmarks.length >= 2) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      benchmarks.push({
        name: file.name.replace(/\.[^.]+$/, ''),
        content: text,
        rendered: isTimestampFile(text) ? parseTimestampText(text) : escapeHtml(text)
      });
      activeBenchTab = benchmarks.length - 1;
      saveBenchmarks();
      renderBenchPanel();
    };
    reader.readAsText(file, 'UTF-8');
  }

  function setupBenchDrop() {
    const area = document.getElementById('c2BenchUploadArea');
    if (!area) return;
    const panel = area.closest('.bench-panel') || area.parentElement;
    panel.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
    panel.addEventListener('dragleave', () => area.classList.remove('dragover'));
    panel.addEventListener('drop', (e) => {
      e.preventDefault(); area.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleBenchFile(e.dataTransfer.files[0]);
    });
  }

  function isTimestampFile(content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) return false;
    const tsLines = lines.filter(l => /^\d{1,2}:\d{2}/.test(l));
    return tsLines.length / lines.length > 0.5;
  }
  function parseTimestampText(text) {
    const lines = text.split('\n');
    let result = '';
    const re = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) result += `<span class="timestamp">[${m[1]}]</span>${escapeHtml(m[2])}\n`;
      else if (line.trim()) result += escapeHtml(line) + '\n';
      else result += '\n';
    }
    return result;
  }

  function saveBenchmarks() {
    project().scriptWriting.benchmarks = benchmarks.map(b => ({ name: b.name, content: b.content }));
    ProjectShell.save();
  }

  // ── Hook banner ──
  function renderHookBanner() {
    const banner = document.getElementById('hookBanner');
    const dismissed = project().scriptWriting.hookBannerDismissed;
    banner.style.display = dismissed ? 'none' : 'flex';
    document.getElementById('hookBannerClose').onclick = () => {
      project().scriptWriting.hookBannerDismissed = true;
      ProjectShell.save();
      banner.style.display = 'none';
    };
  }

  // ── Sections ──
  function sections() { return project().scriptWriting.sections; }

  function renderSections() {
    const container = document.getElementById('c2Sections');
    container.innerHTML = '';
    container.style.setProperty('--col-ratio', (project().scriptWriting.columnRatio || 50) + '%');

    const secs = sections();
    if (secs.length === 0) {
      container.appendChild(makeAddDivider(0));
    }

    secs.forEach((sec, idx) => {
      if (idx === 0) container.appendChild(makeAddDivider(0));
      const isHook = _isHookSection(sec, idx);
      const level = sec.level || 2;
      const block = document.createElement('div');
      block.className = `section-block level-${level} ${isHook ? 'hook-section' : ''}`;
      block.id = `c2-section-${idx}`;

      const ctrl = document.createElement('div');
      ctrl.className = 'section-control';

      const upBtn = _btn('▲', '위로', () => move(idx, -1), idx === 0);
      const downBtn = _btn('▼', '아래로', () => move(idx, 1), idx === secs.length - 1);
      const levelBadge = document.createElement('span');
      levelBadge.className = `level-badge l${level}`;
      levelBadge.textContent = `H${level}`;
      levelBadge.onclick = () => { sec.level = sec.level >= 3 ? 1 : sec.level + 1; save(); };

      const titleInput = document.createElement('input');
      titleInput.className = 'section-title-input';
      titleInput.value = sec.title;
      titleInput.placeholder = '섹션 제목';
      titleInput.oninput = () => { sec.title = titleInput.value; save(); };
      titleInput.onkeydown = (e) => {
        if (e.ctrlKey && ['1','2','3'].includes(e.key)) {
          e.preventDefault();
          sec.level = parseInt(e.key);
          save();
          const next = document.querySelector(`#c2-section-${idx} .section-title-input`);
          if (next) next.focus();
        }
      };

      const addBtn = _btn('+', '아래에 추가', () => add(idx + 1, level));
      const delBtn = _btn('✕', '삭제', () => del(idx));
      delBtn.classList.add('danger');

      // Runtime
      const rt = document.createElement('span');
      rt.className = 'section-runtime';
      if (level >= 2) {
        const chars = getTextLength(sec.bodyMd);
        rt.textContent = '~' + formatTime((chars / CHARS_PER_MIN) * 60);
      }

      ctrl.append(upBtn, downBtn, levelBadge, titleInput, addBtn, delBtn, rt);

      if (level >= 2) {
        if (isHook) {
          const hookLabel = document.createElement('div');
          hookLabel.className = 'hook-label';
          hookLabel.innerHTML = '⚡ <strong>도입 30초 영역</strong> — 시청자 이탈이 가장 많이 일어나는 구간입니다';
          block.appendChild(hookLabel);
        }
        const body = document.createElement('div');
        body.className = 'section-script';
        body.style.padding = '16px 20px';
        const ta = document.createElement('textarea');
        ta.className = 'script-textarea';
        ta.value = sec.bodyMd.trimEnd();
        ta.placeholder = '대본을 입력하세요...';
        ta.oninput = () => { sec.bodyMd = ta.value + '\n'; autoResize(ta); save(); updateRuntime(); };
        body.appendChild(ta);
        block.append(ctrl, body);
        requestAnimationFrame(() => autoResize(ta));
      } else {
        block.append(ctrl);
      }

      container.appendChild(block);
      container.appendChild(makeAddDivider(idx + 1));
    });
    updateTOC();
  }

  function _isHookSection(sec, idx) {
    // First H2 section, or title includes "훅"/"Hook"
    if (/훅|hook/i.test(sec.title || '')) return true;
    // First H2 from top (ignoring H1)
    const secs = sections();
    for (let i = 0; i < secs.length; i++) {
      if ((secs[i].level || 2) === 2) {
        return i === idx;
      }
    }
    return false;
  }

  function _btn(html, title, onclick, disabled) {
    const b = document.createElement('button');
    b.className = 'btn-icon';
    b.innerHTML = html; b.title = title;
    b.onclick = onclick;
    if (disabled) b.disabled = true;
    return b;
  }

  function makeAddDivider(insertIdx) {
    const div = document.createElement('div');
    div.className = 'add-section-divider';
    const btn = document.createElement('button');
    btn.textContent = '+ 섹션 추가';
    btn.onclick = () => add(insertIdx);
    div.appendChild(btn);
    return div;
  }

  // ── Section CRUD ──
  function add(atIdx, level) {
    sections().splice(atIdx, 0, { level: level || 2, title: '새 섹션', bodyMd: '' });
    _syncBrollSections();
    save(); renderSections();
  }
  function del(idx) {
    if (sections().length <= 0) return;
    if (!confirm(`"${sections()[idx].title}" 섹션을 삭제하시겠습니까?`)) return;
    sections().splice(idx, 1);
    _syncBrollSections();
    save(); renderSections();
  }
  function move(idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= sections().length) return;
    [sections()[idx], sections()[ni]] = [sections()[ni], sections()[idx]];
    // Also move broll data
    const bs = project().brollPlanning.sectionsBroll;
    if (bs[idx] && bs[ni]) [bs[idx], bs[ni]] = [bs[ni], bs[idx]];
    // Also move edit plan data
    const es = project().editPlanning?.sectionsEdit;
    if (es && es[idx] && es[ni]) [es[idx], es[ni]] = [es[ni], es[idx]];
    save(); renderSections();
  }

  function _syncBrollSections() {
    // Keep brollPlanning.sectionsBroll in sync with sections length
    const bp = project().brollPlanning;
    if (!bp.sectionsBroll) bp.sectionsBroll = [];
    while (bp.sectionsBroll.length < sections().length) {
      bp.sectionsBroll.push({ tags: [], customTags: [], memo: '' });
    }
    while (bp.sectionsBroll.length > sections().length) {
      bp.sectionsBroll.pop();
    }
    _syncEditSections();
  }

  function _syncEditSections() {
    // Keep editPlanning.sectionsEdit in sync with sections length
    const p = project();
    if (!p.editPlanning) {
      p.editPlanning = {
        completed: false, briefExpanded: true,
        brief: { targetDuration: '', tone: '', references: [], subtitleStyle: '', bgmMood: '', colorLook: '', transitionStyle: '', deadline: '', misc: '' },
        sectionsEdit: []
      };
    }
    const ep = p.editPlanning;
    if (!ep.sectionsEdit) ep.sectionsEdit = [];
    while (ep.sectionsEdit.length < sections().length) {
      ep.sectionsEdit.push({ tags: [], customTags: [], subtitleText: '', memo: '' });
    }
    while (ep.sectionsEdit.length > sections().length) {
      ep.sectionsEdit.pop();
    }
  }

  // ── TOC ──
  function updateTOC() {
    const list = document.getElementById('c2TocList');
    if (!list) return;
    list.innerHTML = '';
    sections().forEach((sec, idx) => {
      const item = document.createElement('button');
      item.className = `toc-item toc-level-${sec.level || 2}`;
      item.textContent = sec.title || '(제목 없음)';
      item.onclick = () => document.getElementById(`c2-section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      list.appendChild(item);
    });
  }

  // ── Runtime ──
  function updateRuntime() {
    let total = 0;
    sections().forEach(s => { if ((s.level || 2) >= 2) total += getTextLength(s.bodyMd); });
    const el = document.getElementById('c2RuntimeTotal');
    if (el) el.textContent = '약 ' + formatTime((total / CHARS_PER_MIN) * 60);
    document.querySelectorAll('#c2Sections .section-runtime').forEach((rt, i) => {
      const sec = sections().filter(s => (s.level || 2) >= 2)[i];
      if (sec) {
        const chars = getTextLength(sec.bodyMd);
        rt.textContent = '~' + formatTime((chars / CHARS_PER_MIN) * 60);
      }
    });
  }

  // ── Resize handle (col-ratio) ──
  // Simplified: no inter-column resize for now (keep col-ratio editable via settings later)

  function save() {
    _syncBrollSections();
    project().scriptWriting.completed = sections().length >= 1;
    ProjectShell.save();
    ProjectShell.refreshTabs();
  }

  // ── Navigation ──
  document.getElementById('c2PrevBtn').onclick = () => ProjectShell.switchChapter(1);
  document.getElementById('c2NextBtn').onclick = () => {
    if (sections().length === 0) { alert('최소 1개 이상의 섹션을 작성해주세요.'); return; }
    save();
    ProjectShell.switchChapter(3);
  };

  window.Chapter2 = { show };
})();
