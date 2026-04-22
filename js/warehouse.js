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
      sort: 'collectedDesc',  // collectedDesc | collectedAsc | channelAsc | projectAsc
      folderId: 'all'  // 'all' | 'unassigned' | folderId
    }
  };
  const revokeUrls = [];

  // ── Aggregate + backfill missing fields ──
  function loadEntries() {
    state.entries = [];
    const projects = ProjectsDB.listWithWarehouse();  // include warehouse project
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
        if (!('folderId' in ref)) { ref.folderId = null; changed = true; }
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
    // Folder scope: 'all' = everything; 'unassigned' = folderId is null; folderId = that folder + descendants
    let scopedIds = null;
    if (state.filter.folderId && state.filter.folderId !== 'all' && state.filter.folderId !== 'unassigned') {
      scopedIds = new Set(FoldersDB.getFolderAndDescendants(state.filter.folderId));
    }
    let list = state.entries.filter(e => {
      if (state.filter.folderId === 'unassigned' && e.folderId) return false;
      if (scopedIds && !scopedIds.has(e.folderId)) return false;
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
    _renderFolderTree();
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

  function _renderFolderTree() {
    const treeEl = document.getElementById('whFolderTree');
    if (!treeEl) return;

    // Count helpers
    const countAll = state.entries.length;
    const countUnassigned = state.entries.filter(e => !e.folderId).length;
    const countByFolder = {};
    for (const e of state.entries) {
      if (e.folderId) countByFolder[e.folderId] = (countByFolder[e.folderId] || 0) + 1;
    }
    // For parents, include all descendants
    function countIncludingChildren(folderId) {
      const ids = FoldersDB.getFolderAndDescendants(folderId);
      let n = 0;
      for (const id of ids) n += (countByFolder[id] || 0);
      return n;
    }

    const tree = FoldersDB.tree();
    const active = state.filter.folderId;

    let html = '';
    html += _folderRowHtml({ id: 'all', name: '전체', icon: '📂', count: countAll, isSystem: true }, active);
    html += _folderRowHtml({ id: 'unassigned', name: '미분류', icon: '📥', count: countUnassigned, isSystem: true }, active);
    html += '<div class="wh-folder-divider"></div>';

    for (const parent of tree) {
      html += _folderRowHtml({
        id: parent.id, name: parent.name, icon: '📁', count: countIncludingChildren(parent.id),
        hasChildren: parent.children.length > 0, depth: 0
      }, active);
      for (const child of parent.children) {
        html += _folderRowHtml({
          id: child.id, name: child.name, icon: '📄', count: countByFolder[child.id] || 0, depth: 1
        }, active);
      }
    }

    treeEl.innerHTML = html;

    // Event wiring
    treeEl.querySelectorAll('.wh-folder').forEach(el => {
      const id = el.dataset.fid;
      const isSystem = id === 'all' || id === 'unassigned';

      el.addEventListener('click', (e) => {
        if (e.target.closest('.wh-folder-action')) return; // ignore action btn click
        state.filter.folderId = id;
        render();
      });

      // Make folders (non-system) draggable themselves
      if (!isSystem) {
        el.draggable = true;
        el.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'folder', folderId: id
          }));
          el.classList.add('dragging');
          // Small delay so dataTransfer commits before dragover fires
        });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
      }

      // Drop target
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        let parsed;
        try { parsed = JSON.parse(data); } catch { return; }

        if (parsed.type === 'ref') {
          // 'all' = not a valid drop target for refs
          if (id === 'all') return;
          const targetFolderId = id === 'unassigned' ? null : id;
          FoldersDB.assignRefToFolder(parsed.projectId, parsed.refId, targetFolderId);
          render();
        } else if (parsed.type === 'folder') {
          _handleFolderDrop(parsed.folderId, id);
        }
      });
    });

    // Action buttons (rename/delete/add-subfolder)
    treeEl.querySelectorAll('.wh-folder-action').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.closest('.wh-folder').dataset.fid;
        const action = btn.dataset.act;
        const folder = FoldersDB.get(id);
        if (!folder) return;
        if (action === 'rename') {
          const name = prompt('새 폴더 이름:', folder.name);
          if (name === null) return;
          FoldersDB.rename(id, name);
          render();
        } else if (action === 'delete') {
          const isParent = !folder.parentId;
          const msg = isParent
            ? `"${folder.name}" 폴더를 삭제할까요?\n(하위 폴더도 함께 삭제되며, 포함된 썸네일은 미분류로 이동합니다)`
            : `"${folder.name}" 폴더를 삭제할까요?\n(포함된 썸네일은 미분류로 이동합니다)`;
          if (!confirm(msg)) return;
          FoldersDB.remove(id);
          if (state.filter.folderId === id) state.filter.folderId = 'all';
          render();
        } else if (action === 'sub') {
          const name = prompt('새 하위 폴더 이름:', '');
          if (!name) return;
          try {
            FoldersDB.create(name, id);
            render();
          } catch (err) {
            if (err.message === 'MAX_DEPTH') alert('하위 폴더는 2단까지만 가능합니다.');
          }
        }
      };
    });
  }

  function _handleFolderDrop(sourceFolderId, targetId) {
    if (sourceFolderId === targetId) return;
    // Determine new parent:
    // - drop on 'all' or 'unassigned' → promote to top-level (parentId = null)
    // - drop on folder → become child of that folder (or sibling if target is a child, handled in moveFolder)
    let newParentId;
    if (targetId === 'all' || targetId === 'unassigned') {
      newParentId = null;
    } else {
      newParentId = targetId;
    }

    const result = FoldersDB.moveFolder(sourceFolderId, newParentId);
    if (!result.ok) {
      if (result.reason === 'DEPTH') {
        alert('하위 폴더를 가진 폴더는 다른 폴더 안으로 이동할 수 없습니다.\n(폴더는 최대 2단계까지만 가능합니다)');
      } else if (result.reason === 'SELF') {
        // silent
      } else if (result.reason === 'SAME') {
        // silent
      }
      return;
    }
    render();
  }

  function _folderRowHtml(f, activeId) {
    const isActive = activeId === f.id;
    const cls = `wh-folder ${isActive ? 'active' : ''} ${f.depth === 1 ? 'wh-folder-child' : ''}`;
    const actions = f.isSystem ? '' : `
      ${f.depth === 0 ? '<button class="wh-folder-action" data-act="sub" title="하위 폴더 추가">+</button>' : ''}
      <button class="wh-folder-action" data-act="rename" title="이름 변경">✎</button>
      <button class="wh-folder-action" data-act="delete" title="삭제">×</button>`;
    return `
      <div class="${cls}" data-fid="${escapeHtml(f.id)}">
        <span class="wh-folder-icon">${f.icon}</span>
        <span class="wh-folder-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="wh-folder-count">${f.count}</span>
        <span class="wh-folder-actions">${actions}</span>
      </div>`;
  }

  function _renderFilters() {
    // Projects dropdown (excludes warehouse, adds "창고 전용" option)
    const projectSel = document.getElementById('whFilterProject');
    if (projectSel) {
      const current = projectSel.value || 'all';
      const entriesNonWh = state.entries.filter(e => !ProjectsDB.isWarehouseProject(e.projectId));
      const projects = [...new Map(entriesNonWh.map(e => [e.projectId, e.projectName])).entries()];
      const hasWarehouse = state.entries.some(e => ProjectsDB.isWarehouseProject(e.projectId));
      projectSel.innerHTML = '<option value="all">모든 프로젝트</option>' +
        projects.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('') +
        (hasWarehouse ? `<option value="${ProjectsDB.WAREHOUSE_PROJECT_ID}">📦 창고 전용</option>` : '');
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
    card.draggable = true;
    card.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'ref', refId: e.id, projectId: e.projectId
      }));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

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

        <div class="wh-card-folder-row">
          ${_folderBadge(e.folderId)}
        </div>
        <div class="wh-card-footer">
          <span class="wh-collected" title="수집일">수집: ${collectedLabel || '—'}</span>
          ${ProjectsDB.isWarehouseProject(e.projectId)
            ? `<button class="wh-warehouse-only" title="창고에만 보관된 정보입니다">📦 창고 전용</button>`
            : `<a class="wh-project-link" href="project.html?id=${encodeURIComponent(e.projectId)}&c=1" title="원 프로젝트로 이동">${escapeHtml(e.projectName)} →</a>`}
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

    // Warehouse-only badge click → info toast
    const whOnlyBtn = card.querySelector('.wh-warehouse-only');
    if (whOnlyBtn) {
      whOnlyBtn.onclick = (ev) => {
        ev.preventDefault();
        _toast('창고에만 보관된 정보입니다. 프로젝트와 연동되지 않았습니다.');
      };
    }

    // Folder badge click → remove from folder (move to unassigned)
    const folderBadgeBtn = card.querySelector('.wh-folder-badge-rm');
    if (folderBadgeBtn) {
      folderBadgeBtn.onclick = (ev) => {
        ev.stopPropagation();
        FoldersDB.assignRefToFolder(e.projectId, e.id, null);
        render();
      };
    }

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

  function _folderBadge(folderId) {
    if (!folderId) {
      return `<span class="wh-folder-badge unassigned" title="폴더 없음 — 좌측 폴더로 드래그하세요">📥 미분류</span>`;
    }
    const folder = FoldersDB.get(folderId);
    if (!folder) return '';
    // If child, show "parent › child"
    let label = folder.name;
    if (folder.parentId) {
      const parent = FoldersDB.get(folder.parentId);
      if (parent) label = `${parent.name} › ${folder.name}`;
    }
    return `<span class="wh-folder-badge" data-fid="${escapeHtml(folderId)}" title="클릭: 미분류로 이동">📁 ${escapeHtml(label)}<button class="wh-folder-badge-rm" title="미분류로 이동">×</button></span>`;
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

    const newFolderBtn = document.getElementById('whNewFolderBtn');
    if (newFolderBtn) {
      newFolderBtn.onclick = () => {
        const name = prompt('새 폴더 이름:', '');
        if (!name) return;
        FoldersDB.create(name, null);
        render();
      };
    }

    // Export / Import warehouse ZIP
    const exportBtn = document.getElementById('whExportBtn');
    if (exportBtn) exportBtn.onclick = async () => {
      await ProjectZip.exportWarehouse();
    };
    const importBtn = document.getElementById('whImportBtn');
    const importFile = document.getElementById('whImportFile');
    if (importBtn && importFile) {
      importBtn.onclick = () => importFile.click();
      importFile.onchange = async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        try {
          const result = await ProjectZip.importZip(file);
          if (result?.type === 'warehouse') {
            _toast(`창고 불러오기 완료: ${result.refCount}개 썸네일 + ${result.folderCount}개 폴더 추가`);
          } else {
            _toast('프로젝트 ZIP을 불러왔습니다.');
          }
          render();
        } catch (e) {
          _toast('ZIP을 읽을 수 없습니다: ' + e.message, 'error');
        }
        importFile.value = '';
      };
    }

    // Quick Add (warehouse-direct collection)
    const quickInput = document.getElementById('whQuickUrl');
    const quickBtn = document.getElementById('whQuickAddBtn');
    if (quickInput) {
      quickInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); _quickAdd(); }
      });
      quickInput.addEventListener('paste', (ev) => {
        const text = ev.clipboardData?.getData('text') || '';
        const urls = _splitUrls(text);
        if (urls.length > 1) {
          ev.preventDefault();
          quickInput.value = '';
          _quickAddUrls(urls);
        }
      });
    }
    if (quickBtn) quickBtn.onclick = _quickAdd;

    render();
  }

  function _splitUrls(raw) {
    return (raw || '').split(/[\s,]+/).map(u => u.trim()).filter(u => u.length > 0);
  }

  async function _quickAdd() {
    const input = document.getElementById('whQuickUrl');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const urls = _splitUrls(raw);
    input.value = '';
    await _quickAddUrls(urls);
  }

  async function _quickAddUrls(urls) {
    if (!urls || urls.length === 0) return;
    if (!YouTubeAPI.hasApiKey()) {
      if (!confirm('YouTube API 키가 설정되지 않았습니다.\n\n키 없이 추가하면 URL만 저장되고, 썸네일/제목 등은 자동으로 가져오지 않습니다.\n프로젝트 페이지의 ⚙ 버튼에서 API 키를 설정할 수 있습니다.\n\n그래도 진행하시겠습니까?')) return;
    }

    const wp = ProjectsDB.getOrCreateWarehouseProject();
    const newRefs = [];
    for (const url of urls) {
      const ref = {
        id: ProjectsDB.uuid(),
        imageId: null,
        sourceTitle: '',
        url,
        memo: '',
        warehouseMemo: '',
        tags: [],
        favorite: false,
        collectedAt: ProjectsDB.nowISO(),
        folderId: state.filter.folderId && state.filter.folderId !== 'all' && state.filter.folderId !== 'unassigned' ? state.filter.folderId : null
      };
      wp.thumbResearch.references.push(ref);
      newRefs.push(ref);
    }
    ProjectsDB.save(wp);
    await render();

    // Fetch metadata sequentially
    let youtubeCount = 0, otherCount = 0;
    for (const ref of newRefs) {
      const videoId = YouTubeAPI.extractVideoId(ref.url);
      if (!videoId) { otherCount++; continue; }
      youtubeCount++;
      if (!YouTubeAPI.hasApiKey()) continue;
      // Fetch
      const card = document.querySelector(`.wh-card[data-ref-id="${ref.id}"]`);
      const loading = card?.querySelector('.wh-card-image');
      if (loading) {
        const overlay = document.createElement('div');
        overlay.className = 'ref-loading';
        overlay.innerHTML = '<div class="ref-loading-spinner"></div>';
        loading.appendChild(overlay);
      }
      try {
        const info = await YouTubeAPI.fetchVideoInfo(videoId);
        ref.sourceTitle = info.title || ref.sourceTitle;
        ref.channelName = info.channelName;
        ref.uploadedAt = info.uploadedAt;
        ref.uploadedAtLabel = info.uploadedAtLabel;
        ref.duration = info.duration;
        if (info.thumbnailUrl) {
          try {
            const blob = await YouTubeAPI.fetchThumbnailBlob(info.thumbnailUrl);
            ref.imageId = await ProjectsDB.saveImage(wp.id, blob, 'ref', `yt-${videoId}.jpg`);
          } catch {
            ref.thumbnailUrl = info.thumbnailUrl;
          }
        }
        ProjectsDB.save(wp);
      } catch (e) {
        let msg = e.message || 'unknown';
        if (msg.startsWith('INVALID_KEY')) msg = 'API 키가 유효하지 않습니다.';
        else if (msg === 'QUOTA_EXCEEDED') msg = 'API 일일 한도 초과';
        else if (msg === 'NOT_FOUND') msg = '영상을 찾을 수 없음';
        _toast(`메타 조회 실패: ${msg}`, 'error');
      }
    }
    await render();
    if (newRefs.length > 1) {
      _toast(`${newRefs.length}개 추가됨 (YouTube ${youtubeCount} · 기타 ${otherCount})`);
    }
  }

  function _toast(msg, kind) {
    let el = document.getElementById('whToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'whToast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:8px;font-size:12px;font-weight:500;z-index:200;opacity:0;transition:opacity 0.25s;pointer-events:none;';
      document.body.appendChild(el);
    }
    if (kind === 'error') { el.style.background = 'var(--accent)'; el.style.color = '#fff'; el.style.border = 'none'; }
    else { el.style.background = 'var(--surface2)'; el.style.color = 'var(--text)'; el.style.border = '1px solid var(--border)'; }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 3200);
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
