// chapter2-script.js — 원고 작성 (벤치마킹 참고)

(function() {
  function project() { return ProjectShell.getProject(); }
  let benchmarks = []; // {name, content, rendered}
  let activeBenchTab = 0;

  // ── BPT 스타일 템플릿 (YouTube 시청자 이탈 데이터 기반) ──
  const BPT_TEMPLATE = [
    { level: 1, title: '훅 (0-10초)', bodyMd:
`> 🎯 시청자가 "계속 봐야 할 이유"를 한 문장으로.
> 충격적 사실 / 질문 / 역발상 / 강한 공감 중 선택.
> 예: "90%의 유튜버가 이것 때문에 실패합니다."
` },
    { level: 1, title: '도입 (10초-1분)', bodyMd: '' },
    { level: 2, title: '문제 정의', bodyMd:
`> 💬 시청자가 공감할 문제 상황을 제시하세요.
> "혹시 이런 경험 있으신가요?" 식으로 시청자의 맥을 짚는 문장.
` },
    { level: 2, title: '얻을 것 약속', bodyMd:
`> 🎁 이 영상 끝까지 보면 구체적으로 무엇을 얻는지.
> "오늘 이 영상 끝까지 보시면 [X], [Y], [Z]를 알게 됩니다."
` },
    { level: 2, title: '신뢰 구축 (선택)', bodyMd:
`> 🎓 왜 내가 이 이야기를 할 자격이 있는지 짧게.
> 경험, 결과, 실적 중 가장 설득력 있는 것 하나만.
` },
    { level: 1, title: '본론', bodyMd: '' },
    { level: 2, title: '포인트 1 — [핵심 메시지]', bodyMd:
`> 🔑 한 줄로 핵심 메시지를 먼저 선언.

> 💡 설명: 왜 이게 중요한지.

> 📌 예시/증명: 구체적 예시, 데이터, 경험담.
` },
    { level: 2, title: '포인트 2 — [핵심 메시지]', bodyMd:
`> 🔑 한 줄로 핵심 메시지를 먼저 선언.

> 💡 설명: 왜 이게 중요한지.

> 📌 예시/증명: 구체적 예시, 데이터, 경험담.
` },
    { level: 2, title: '포인트 3 — [핵심 메시지]', bodyMd:
`> 🔑 한 줄로 핵심 메시지를 먼저 선언.

> 💡 설명: 왜 이게 중요한지.

> 📌 예시/증명: 구체적 예시, 데이터, 경험담.
` },
    { level: 1, title: '아웃트로', bodyMd: '' },
    { level: 2, title: '핵심 요약', bodyMd:
`> 📝 본론 3-5문장으로 압축. 같은 말 반복이 아니라 재조합.
` },
    { level: 2, title: 'CTA (Call To Action)', bodyMd:
`> 👍 구독·좋아요·댓글을 자연스럽게.
> "도움이 되셨다면" 같은 전제 대신, 구체적 리턴을 약속.
> 예: "다음 영상 알림 받고 싶으시면 구독 눌러주세요."
` },
    { level: 2, title: '다음 영상 예고', bodyMd:
`> 🎬 재생 유도. "다음에는 [X]를 다뤄볼게요."
> 시청자가 다음 영상을 기대하게 만들 한 문장.
` }
  ];

  function _applyBpt() {
    project().scriptWriting.sections = BPT_TEMPLATE.map(s => ({ ...s }));
    save();
    render();
  }

  function _applyEmpty() {
    project().scriptWriting.sections = [
      { level: 2, title: '새 섹션', bodyMd: '' }
    ];
    save();
    render();
  }

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

    // 접기 상태면 최소한만 표시
    const benchPanel = document.getElementById('c2BenchPanel');
    const collapsed = project().scriptWriting.benchCollapsed === true;
    if (benchPanel) benchPanel.classList.toggle('bench-collapsed', collapsed);

    if (benchmarks.length === 0) {
      tabs.innerHTML = `<button class="bench-collapse-btn" id="c2BenchCollapse" title="${collapsed ? '벤치마킹 패널 펼치기' : '벤치마킹 패널 접기'}">${collapsed ? '⇢' : '⇠'}</button>`;
      content.innerHTML = `
        <div class="bench-upload" id="c2BenchUploadArea">
          <p>벤치마킹 원고 업로드</p>
          <p style="font-size:11px;">.txt (타임스탬프) / .md</p>
          <div class="file-input-wrap">
            <button class="btn btn-secondary">파일 선택</button>
            <input type="file" accept=".txt,.md" id="c2BenchFile">
          </div>
          <p class="bench-upload-hint">벤치마킹 없이 바로 작성하려면 우측 원고 영역을 사용하세요.</p>
        </div>`;
      document.getElementById('c2BenchFile').onchange = (e) => handleBenchFile(e.target.files[0]);
      document.getElementById('c2BenchCollapse').onclick = () => {
        project().scriptWriting.benchCollapsed = !collapsed;
        save(); renderBenchPanel();
      };
      setupBenchDrop();
      return;
    }

    let tabsHtml = `<button class="bench-collapse-btn" id="c2BenchCollapse" title="${collapsed ? '벤치마킹 패널 펼치기' : '벤치마킹 패널 접기'}">${collapsed ? '⇢' : '⇠'}</button>`;
    benchmarks.forEach((b, i) => {
      tabsHtml += `<button class="bench-tab ${i === activeBenchTab ? 'active' : ''}" data-i="${i}">${escapeHtml(b.name)}<span class="bench-tab-close" data-i="${i}">×</span></button>`;
    });
    if (benchmarks.length < 2) {
      tabsHtml += `<label class="bench-tab-add" title="추가">+<input type="file" accept=".txt,.md" style="display:none"></label>`;
    }
    tabs.innerHTML = tabsHtml;
    const collapseBtn = document.getElementById('c2BenchCollapse');
    if (collapseBtn) collapseBtn.onclick = () => {
      project().scriptWriting.benchCollapsed = !collapsed;
      save(); renderBenchPanel();
    };
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
      // 빈 상태 — 3가지 시작 방법 선택 카드
      const startPicker = document.createElement('div');
      startPicker.className = 'start-picker';
      startPicker.innerHTML = `
        <h3>어떻게 시작하시겠어요?</h3>
        <p class="start-picker-desc">원고 작성을 어떤 방식으로 시작할지 선택하세요. 이후에도 자유롭게 섹션을 추가/삭제할 수 있습니다.</p>
        <div class="start-cards">
          <button class="start-card recommended" data-action="bpt">
            <div class="start-card-badge">추천</div>
            <div class="start-card-icon">📋</div>
            <div class="start-card-title">BPT 템플릿</div>
            <div class="start-card-desc">
              훅 → 도입 → 본론 → 아웃트로의 구조화된 뼈대.<br>
              각 섹션에 작성 가이드가 들어있어 덮어쓰며 쓸 수 있음.
            </div>
          </button>
          <button class="start-card" data-action="empty">
            <div class="start-card-icon">🆕</div>
            <div class="start-card-title">빈 원고</div>
            <div class="start-card-desc">
              백지 상태로 시작.<br>
              내가 원하는 구조를 자유롭게 잡고 싶을 때.
            </div>
          </button>
          <button class="start-card" data-action="bench">
            <div class="start-card-icon">📂</div>
            <div class="start-card-title">벤치마킹 업로드</div>
            <div class="start-card-desc">
              참고할 자막/대본 파일을 먼저 불러와<br>
              옆에 띄우고 쓰기.
            </div>
          </button>
        </div>
      `;
      startPicker.querySelector('[data-action="bpt"]').onclick = () => _applyBpt();
      startPicker.querySelector('[data-action="empty"]').onclick = () => _applyEmpty();
      startPicker.querySelector('[data-action="bench"]').onclick = () => {
        // 벤치마킹 패널 확장 + 파일 선택 유도
        const benchPanel = document.getElementById('c2BenchPanel');
        if (benchPanel) benchPanel.classList.remove('bench-collapsed');
        const fileInput = document.getElementById('c2BenchFile');
        if (fileInput) fileInput.click();
      };
      container.appendChild(startPicker);
      updateTOC();
      return;
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
