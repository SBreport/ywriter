// project.js — 프로젝트 쉘 (챕터 전환 + 컨텍스트 바)
// 공통 상태 관리자. 각 챕터 모듈은 window.ProjectShell API를 사용.

(function() {
  let project = null;
  let activeChapter = 1;

  // ── Hook for common.js autosave ──
  window.AUTOSAVE_KEY = 'yw-project-shell-dummy'; // not used, each save updates project directly

  function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (!id) { location.href = 'index.html'; return; }
    project = ProjectsDB.load(id);
    if (!project) {
      alert('프로젝트를 찾을 수 없습니다.');
      location.href = 'index.html';
      return;
    }

    // Initial chapter from URL or default
    const c = parseInt(params.get('c'));
    if (c >= 1 && c <= 3) activeChapter = c;

    document.getElementById('projectName').value = project.name || '';
    document.getElementById('projectName').oninput = (e) => {
      project.name = e.target.value;
      saveProject();
    };

    _renderTabs();
    _renderContextBar();
    switchChapter(activeChapter, true);

    document.getElementById('exportProjectBtn').onclick = () => ProjectZip.exportProject(project.id);
    document.getElementById('homeBtn').onclick = () => location.href = 'index.html';

    // Help
    document.getElementById('helpBtn').onclick = () => document.getElementById('helpModal').classList.add('show');
    document.getElementById('helpCloseBtn').onclick = () => document.getElementById('helpModal').classList.remove('show');

    // Global keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('helpModal').classList.remove('show');
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveProject(true); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); ProjectZip.exportProject(project.id); }
    });
  }

  function saveProject(showIndicator) {
    if (!project) return;
    ProjectsDB.save(project);
    if (showIndicator) _showSaveIndicator();
  }

  function _showSaveIndicator() {
    let el = document.getElementById('saveIndicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'saveIndicator';
      el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:6px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-muted);z-index:150;opacity:0;transition:opacity 0.3s;pointer-events:none;';
      document.body.appendChild(el);
    }
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = '저장 완료 ' + time;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  // ── Chapter progression ──
  function canAccessChapter(n) {
    if (n === 1) return true;
    if (n === 2) {
      const t = project.thumbResearch || {};
      return !!(t.myVideoTitle && t.audience && t.purpose);
    }
    if (n === 3) {
      if (!canAccessChapter(2)) return false;
      return (project.scriptWriting?.sections?.length || 0) >= 1;
    }
    return false;
  }

  function chapterLockReason(n) {
    if (n === 2) return '1. 기획 단계에서 영상 제목, 독자, 목적을 모두 입력해주세요.';
    if (n === 3) {
      if (!canAccessChapter(2)) return chapterLockReason(2);
      return '2. 원고 단계에서 섹션을 최소 1개 이상 작성해주세요.';
    }
    return '';
  }

  function _renderTabs() {
    const tabs = document.getElementById('chapterTabs');
    const labels = ['1. 기획', '2. 원고', '3. B-roll'];
    tabs.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const btn = document.createElement('button');
      const locked = !canAccessChapter(i);
      const completed = _isChapterCompleted(i);
      btn.className = `chapter-tab ${activeChapter === i ? 'active' : ''} ${locked ? 'locked' : ''} ${completed ? 'completed' : ''}`;
      btn.innerHTML = `${labels[i-1]} <span class="chapter-tab-status">${completed ? '●' : (locked ? '🔒' : '○')}</span>`;
      btn.title = locked ? chapterLockReason(i) : labels[i-1];
      btn.onclick = () => {
        if (locked) { alert(chapterLockReason(i)); return; }
        switchChapter(i);
      };
      tabs.appendChild(btn);
    }
  }

  function _isChapterCompleted(n) {
    if (n === 1) return !!project.thumbResearch?.completed;
    if (n === 2) return !!project.scriptWriting?.completed;
    if (n === 3) return !!project.brollPlanning?.completed;
    return false;
  }

  function _renderContextBar() {
    const bar = document.getElementById('contextBar');
    if (!bar) return;
    const t = project.thumbResearch || {};
    const show = activeChapter >= 2;
    if (!show) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `
      <div class="context-item"><span class="context-label">🎬 제목</span><span class="context-value">${_truncate(t.myVideoTitle, 40) || '—'}</span></div>
      <div class="context-item"><span class="context-label">🖼 썸네일</span><span class="context-value">${_truncate(t.myThumbTitle, 30) || '—'}</span></div>
      <div class="context-item"><span class="context-label">👥 독자</span><span class="context-value">${_truncate(t.audience, 30) || '—'}</span></div>
      <div class="context-item"><span class="context-label">🎯 목적</span><span class="context-value">${_truncate(t.purpose, 40) || '—'}</span></div>
      <button class="context-edit-btn" title="기획으로 돌아가 수정">편집</button>
    `;
    bar.querySelector('.context-edit-btn').onclick = () => switchChapter(1);
  }

  function _truncate(s, n) {
    if (!s) return '';
    s = String(s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function switchChapter(n, initial) {
    if (!canAccessChapter(n)) {
      if (initial) { activeChapter = 1; n = 1; }
      else { alert(chapterLockReason(n)); return; }
    }
    activeChapter = n;
    // Update URL without reload
    const url = new URL(location.href);
    url.searchParams.set('c', n);
    history.replaceState(null, '', url);

    _renderTabs();
    _renderContextBar();

    // Show/hide chapter panels
    document.querySelectorAll('.chapter-panel').forEach(el => el.style.display = 'none');
    const panel = document.getElementById('chapter' + n);
    if (panel) panel.style.display = 'block';

    // Notify chapter modules
    if (window.Chapter1 && n === 1) Chapter1.show();
    if (window.Chapter2 && n === 2) Chapter2.show();
    if (window.Chapter3 && n === 3) Chapter3.show();
  }

  // ── Public API for chapter modules ──
  window.ProjectShell = {
    getProject: () => project,
    save: saveProject,
    switchChapter,
    refreshTabs: () => { _renderTabs(); _renderContextBar(); },
    setChapterCompleted: (n, val) => {
      if (n === 1 && project.thumbResearch) project.thumbResearch.completed = val;
      if (n === 2 && project.scriptWriting) project.scriptWriting.completed = val;
      if (n === 3 && project.brollPlanning) project.brollPlanning.completed = val;
      saveProject();
      _renderTabs();
    }
  };

  // ── Init when DOM ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
