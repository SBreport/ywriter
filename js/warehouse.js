// warehouse.js — 썸네일 창고 (글로벌 aggregate view)
// 읽기 전용 (title/url 편집 불가) + 태그/메모/즐겨찾기는 편집 가능

(function() {
  const state = {
    entries: [],   // flattened refs with projectId/projectName
    filter: {
      search: '',
      project: 'all',
      tag: 'all',
      favoriteOnly: false,
      sort: 'collectedDesc'  // collectedDesc | collectedAsc | channelAsc | projectAsc
    }
  };
  const revokeUrls = [];

  // ── Aggregate + backfill missing fields ──
  function loadEntries() {
    state.entries = [];
    const projects = ProjectsDB.list();
    for (const entry of projects) {
      const p = ProjectsDB.load(entry.id);
      if (!p) continue;
      const refs = p.thumbResearch?.references || [];
      let changed = false;
      for (const ref of refs) {
        if (!ref.collectedAt) { ref.collectedAt = p.createdAt || p.updatedAt || ProjectsDB.nowISO(); changed = true; }
        if (!Array.isArray(ref.tags)) { ref.tags = []; changed = true; }
        if (typeof ref.favorite !== 'boolean') { ref.favorite = false; changed = true; }
        if (typeof ref.warehouseMemo !== 'string') { ref.warehouseMemo = ''; changed = true; }
        state.entries.push({
          ...ref,
          projectId: p.id,
          projectName: p.name || p.thumbResearch?.myVideoTitle || '제목 없음'
        });
      }
      if (changed) ProjectsDB.save(p);
    }
  }

  function applyFilters() {
    const q = state.filter.search.toLowerCase().trim();
    let list = state.entries.filter(e => {
      if (state.filter.project !== 'all' && e.projectId !== state.filter.project) return false;
      if (state.filter.tag !== 'all') {
        if (!(e.tags || []).includes(state.filter.tag)) return false;
      }
      if (state.filter.favoriteOnly && !e.favorite) return false;
      if (q) {
        const hay = [
          e.sourceTitle || '',
          e.channelName || '',
          e.memo || '',
          e.warehouseMemo || '',
          (e.tags || []).join(' '),
          e.projectName || ''
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Sort
    list.sort((a, b) => {
      switch (state.filter.sort) {
        case 'collectedAsc': return (a.collectedAt || '').localeCompare(b.collectedAt || '');
        case 'collectedDesc': return (b.collectedAt || '').localeCompare(a.collectedAt || '');
        case 'channelAsc': return (a.channelName || '').localeCompare(b.channelName || '');
        case 'projectAsc': return (a.projectName || '').localeCompare(b.projectName || '');
        default: return 0;
      }
    });
    return list;
  }

  // ── Render ──
  async function render() {
    // Cleanup old URLs
    revokeUrls.forEach(u => URL.revokeObjectURL(u));
    revokeUrls.length = 0;

    loadEntries();
    _renderFilters();
    _renderCount();

    const list = applyFilters();
    const grid = document.getElementById('whGrid');
    const empty = document.getElementById('whEmpty');
    grid.innerHTML = '';

    if (list.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    for (const e of list) {
      grid.appendChild(await _renderCard(e));
    }
  }

  function _renderCount() {
    const total = state.entries.length;
    const filtered = applyFilters().length;
    const countEl = document.getElementById('whCount');
    if (!countEl) return;
    if (total === filtered) countEl.textContent = `${total}개`;
    else countEl.textContent = `${filtered}개 / 전체 ${total}개`;
  }

  function _renderFilters() {
    // Projects dropdown
    const projectSel = document.getElementById('whFilterProject');
    if (projectSel) {
      const current = projectSel.value || 'all';
      const projects = [...new Map(state.entries.map(e => [e.projectId, e.projectName])).entries()];
      projectSel.innerHTML = '<option value="all">모든 프로젝트</option>' +
        projects.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
      projectSel.value = current;
    }

    // Tags dropdown
    const tagSel = document.getElementById('whFilterTag');
    if (tagSel) {
      const current = tagSel.value || 'all';
      const allTags = [...new Set(state.entries.flatMap(e => e.tags || []))].sort();
      tagSel.innerHTML = '<option value="all">모든 태그</option>' +
        allTags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
      tagSel.value = current;
    }
  }

  async function _renderCard(e) {
    const card = document.createElement('div');
    card.className = 'wh-card';
    card.dataset.refId = e.id;

    // Image
    let imgHtml = '<div class="ref-placeholder">이미지 없음</div>';
    if (e.imageId) {
      const url = await ProjectsDB.loadImageUrl(e.imageId);
      if (url) {
        revokeUrls.push(url);
        imgHtml = `<img src="${url}" alt="ref">`;
      }
    } else if (e.thumbnailUrl) {
      imgHtml = `<img src="${escapeHtml(e.thumbnailUrl)}" alt="ref" referrerpolicy="no-referrer">`;
    }

    const hasUrl = !!(e.url && e.url.trim());
    const safeUrl = _safeUrl(e.url);

    const dateLabel = e.uploadedAt ? YouTubeAPI.formatUploadDate(e.uploadedAt) : '';
    const collectedLabel = e.collectedAt ? YouTubeAPI.formatUploadDate(e.collectedAt) : '';
    const metaParts = [];
    if (e.channelName) metaParts.push(escapeHtml(e.channelName));
    if (dateLabel) metaParts.push(escapeHtml(dateLabel));
    if (e.duration) metaParts.push(escapeHtml(e.duration));

    card.innerHTML = `
      <div class="wh-card-image">
        ${imgHtml}
        <button class="wh-fav ${e.favorite ? 'on' : ''}" title="즐겨찾기">★</button>
        ${hasUrl ? `<a class="ref-image-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="영상 보기">↗</a>` : ''}
      </div>
      <div class="wh-card-body">
        <div class="wh-card-title">${escapeHtml(e.sourceTitle || '(제목 없음)')}</div>
        ${metaParts.length ? `<div class="wh-card-meta">${metaParts.join(' · ')}</div>` : ''}
        ${e.memo ? `<div class="wh-card-project-memo" title="프로젝트 메모">📝 ${escapeHtml(e.memo)}</div>` : ''}

        <div class="wh-tags" data-tag-area>
          ${(e.tags || []).map(t => `<span class="wh-tag"><span>${escapeHtml(t)}</span><button class="wh-tag-rm" data-tag="${escapeHtml(t)}" title="제거">×</button></span>`).join('')}
          <button class="wh-tag-add" title="태그 추가">+ 태그</button>
        </div>

        <textarea class="wh-memo" placeholder="창고 메모 (프로젝트와 별도)" rows="2">${escapeHtml(e.warehouseMemo || '')}</textarea>

        <div class="wh-card-footer">
          <span class="wh-collected" title="수집일">수집: ${collectedLabel || '—'}</span>
          <a class="wh-project-link" href="project.html?id=${encodeURIComponent(e.projectId)}&c=1" title="원 프로젝트로 이동">${escapeHtml(e.projectName)} →</a>
        </div>
      </div>
    `;

    // Event wiring
    card.querySelector('.wh-fav').onclick = async () => {
      const p = ProjectsDB.load(e.projectId);
      const ref = p.thumbResearch.references.find(r => r.id === e.id);
      if (!ref) return;
      ref.favorite = !ref.favorite;
      ProjectsDB.save(p);
      render();
    };

    const memoEl = card.querySelector('.wh-memo');
    let memoTimer = null;
    memoEl.oninput = () => {
      clearTimeout(memoTimer);
      memoTimer = setTimeout(() => {
        const p = ProjectsDB.load(e.projectId);
        const ref = p.thumbResearch.references.find(r => r.id === e.id);
        if (!ref) return;
        ref.warehouseMemo = memoEl.value;
        ProjectsDB.save(p);
        // don't re-render (preserve focus)
      }, 400);
    };

    // Tag remove
    card.querySelectorAll('.wh-tag-rm').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const tag = btn.dataset.tag;
        const p = ProjectsDB.load(e.projectId);
        const ref = p.thumbResearch.references.find(r => r.id === e.id);
        if (!ref) return;
        ref.tags = (ref.tags || []).filter(t => t !== tag);
        ProjectsDB.save(p);
        render();
      };
    });

    // Tag add
    card.querySelector('.wh-tag-add').onclick = () => {
      const area = card.querySelector('[data-tag-area]');
      const existingInput = area.querySelector('.wh-tag-input');
      if (existingInput) { existingInput.focus(); return; }

      const input = document.createElement('input');
      input.className = 'wh-tag-input';
      input.placeholder = '태그';
      input.maxLength = 20;
      const addBtn = area.querySelector('.wh-tag-add');
      area.insertBefore(input, addBtn);
      input.focus();
      input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const val = input.value.trim();
          if (!val) { input.remove(); return; }
          const p = ProjectsDB.load(e.projectId);
          const ref = p.thumbResearch.references.find(r => r.id === e.id);
          if (!ref) return;
          if (!ref.tags) ref.tags = [];
          if (!ref.tags.includes(val)) ref.tags.push(val);
          ProjectsDB.save(p);
          render();
        } else if (ev.key === 'Escape') {
          input.remove();
        }
      };
      input.onblur = () => { if (!input.value.trim()) input.remove(); };
    };

    return card;
  }

  function _safeUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (!/^https?:\/\//i.test(u)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
      else return '';
    }
    return u.replace(/"/g, '%22');
  }

  // ── Init ──
  function init() {
    const searchEl = document.getElementById('whSearch');
    if (searchEl) {
      searchEl.oninput = (e) => { state.filter.search = e.target.value; render(); };
    }
    const projectSel = document.getElementById('whFilterProject');
    if (projectSel) projectSel.onchange = (e) => { state.filter.project = e.target.value; render(); };
    const tagSel = document.getElementById('whFilterTag');
    if (tagSel) tagSel.onchange = (e) => { state.filter.tag = e.target.value; render(); };
    const favBtn = document.getElementById('whFavOnly');
    if (favBtn) {
      favBtn.onclick = () => {
        state.filter.favoriteOnly = !state.filter.favoriteOnly;
        favBtn.classList.toggle('active', state.filter.favoriteOnly);
        render();
      };
    }
    const sortSel = document.getElementById('whSort');
    if (sortSel) sortSel.onchange = (e) => { state.filter.sort = e.target.value; render(); };

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', () => {
    revokeUrls.forEach(u => URL.revokeObjectURL(u));
  });
})();
