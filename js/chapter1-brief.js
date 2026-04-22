// chapter1-brief.js — 썸네일 리서치 + 본질 설정

(function() {
  const MAX_REFS = Infinity; // 제한 없음 (사용자 요청)
  const revokeUrls = []; // track blob URLs to revoke

  function project() { return ProjectShell.getProject(); }

  function show() {
    render();
  }

  async function render() {
    const p = project();
    const t = p.thumbResearch;

    // Inputs
    document.getElementById('myVideoTitle').value = t.myVideoTitle || '';
    document.getElementById('myThumbTitle').value = t.myThumbTitle || '';
    document.getElementById('audienceInput').value = t.audience || '';
    document.getElementById('purposeInput').value = t.purpose || '';

    await renderRefGrid();
    await renderMyThumb();
    updateNextButton();
  }

  async function renderRefGrid() {
    const grid = document.getElementById('refGrid');
    grid.innerHTML = '';
    const refs = project().thumbResearch.references || [];

    // Cleanup old URLs
    revokeUrls.forEach(u => URL.revokeObjectURL(u));
    revokeUrls.length = 0;

    for (const ref of refs) {
      const card = document.createElement('div');
      card.className = 'ref-card';
      card.dataset.refId = ref.id;

      let imgHtml = '<div class="ref-placeholder">이미지 없음</div>';
      if (ref.imageId) {
        const url = await ProjectsDB.loadImageUrl(ref.imageId);
        if (url) {
          revokeUrls.push(url);
          imgHtml = `<img src="${url}" alt="ref">`;
        }
      } else if (ref.thumbnailUrl) {
        // Fallback: direct img URL (YouTube CDN, CORS-friendly)
        imgHtml = `<img src="${escapeHtml(ref.thumbnailUrl)}" alt="ref" referrerpolicy="no-referrer">`;
      }

      const hasUrl = !!(ref.url && ref.url.trim());
      const safeUrl = _safeUrl(ref.url);

      // Meta row (channel · date · duration)
      // Re-format date from ISO every render to reflect latest format setting
      const dateLabel = ref.uploadedAt ? YouTubeAPI.formatUploadDate(ref.uploadedAt) : (ref.uploadedAtLabel || '');
      const metaParts = [];
      if (ref.channelName) metaParts.push(escapeHtml(ref.channelName));
      if (dateLabel) metaParts.push(escapeHtml(dateLabel));
      if (ref.duration) metaParts.push(escapeHtml(ref.duration));
      const metaHtml = metaParts.length
        ? `<div class="ref-meta">${metaParts.join(' · ')}</div>`
        : '';

      card.innerHTML = `
        <div class="ref-image">
          ${imgHtml}
          ${hasUrl ? `<a class="ref-image-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="영상 보기">↗</a>` : ''}
          <div class="ref-loading" style="display:none;"><div class="ref-loading-spinner"></div></div>
        </div>
        <input type="text" class="ref-title" placeholder="영상 제목" value="${escapeHtml(ref.sourceTitle || '')}">
        <div class="ref-url-row">
          <span class="ref-url-icon">🔗</span>
          <input type="url" class="ref-url" placeholder="https://youtube.com/..." value="${escapeHtml(ref.url || '')}">
          ${hasUrl ? `<a class="ref-url-open" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="열기">↗</a>` : ''}
        </div>
        ${metaHtml}
        <textarea class="ref-memo" placeholder="배울 점 / 메모 (옵션)">${escapeHtml(ref.memo || '')}</textarea>
        <button class="ref-delete" title="삭제">&#10005;</button>
      `;

      card.querySelector('.ref-title').oninput = (e) => { ref.sourceTitle = e.target.value; save(); };
      const urlInput = card.querySelector('.ref-url');
      urlInput.oninput = (e) => { ref.url = e.target.value; save(); };
      urlInput.onblur = async () => {
        await _tryFetchYouTubeMeta(ref, card);
      };
      urlInput.addEventListener('paste', () => {
        // After paste completes, trigger fetch on next tick
        setTimeout(async () => {
          ref.url = urlInput.value;
          save();
          await _tryFetchYouTubeMeta(ref, card);
        }, 50);
      });
      card.querySelector('.ref-memo').oninput = (e) => { ref.memo = e.target.value; save(); };
      card.querySelector('.ref-delete').onclick = async () => {
        if (!confirm('이 썸네일 카드를 삭제할까요?')) return;
        if (ref.imageId) await ProjectsDB.deleteImage(ref.imageId);
        const list = project().thumbResearch.references;
        const idx = list.findIndex(r => r.id === ref.id);
        if (idx >= 0) list.splice(idx, 1);
        save(); renderRefGrid();
      };
      grid.appendChild(card);
    }

    // "Add" card
    if (refs.length < MAX_REFS) {
      const addCard = document.createElement('div');
      addCard.className = 'ref-card ref-add-card';
      addCard.innerHTML = `
        <div class="ref-add-content">
          <div class="ref-add-icon">+</div>
          <div class="ref-add-text">
            <strong>이미지 추가</strong>
            <div>Ctrl+V / 드래그 / 파일</div>
          </div>
          <input type="file" accept="image/*" multiple>
        </div>`;
      addCard.querySelector('input').onchange = (e) => _addFiles(e.target.files);
      addCard.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        addCard.querySelector('input').click();
      };
      // Drag & drop on card
      ['dragover', 'dragenter'].forEach(evt => addCard.addEventListener(evt, (e) => {
        e.preventDefault(); addCard.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(evt => addCard.addEventListener(evt, () => addCard.classList.remove('dragover')));
      addCard.addEventListener('drop', (e) => {
        e.preventDefault();
        _addFiles(e.dataTransfer.files);
      });
      grid.appendChild(addCard);
    } else {
      const full = document.createElement('div');
      full.className = 'ref-limit';
      full.textContent = `최대 ${MAX_REFS}개까지 가능합니다.`;
      grid.appendChild(full);
    }
  }

  async function renderMyThumb() {
    const area = document.getElementById('myThumbArea');
    const t = project().thumbResearch;
    area.innerHTML = '';

    if (t.myThumbImageId) {
      const url = await ProjectsDB.loadImageUrl(t.myThumbImageId);
      if (url) {
        revokeUrls.push(url);
        const wrap = document.createElement('div');
        wrap.className = 'my-thumb-preview';
        wrap.innerHTML = `<img src="${url}" alt="my thumb"><button class="my-thumb-remove">×</button>`;
        wrap.querySelector('.my-thumb-remove').onclick = async () => {
          await ProjectsDB.deleteImage(t.myThumbImageId);
          t.myThumbImageId = null;
          save(); renderMyThumb();
        };
        area.appendChild(wrap);
        return;
      }
    }
    const drop = document.createElement('label');
    drop.className = 'my-thumb-drop';
    drop.innerHTML = `
      <div>내 썸네일 이미지 (옵션)</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">클릭 또는 드롭</div>
      <input type="file" accept="image/*" style="display:none;">`;
    drop.querySelector('input').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      t.myThumbImageId = await ProjectsDB.saveImage(project().id, f, 'my-thumb', f.name);
      save(); renderMyThumb();
    };
    ['dragover'].forEach(evt => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) {
        t.myThumbImageId = await ProjectsDB.saveImage(project().id, f, 'my-thumb', f.name);
        save(); renderMyThumb();
      }
    });
    area.appendChild(drop);
  }

  async function _tryFetchYouTubeMeta(ref, card) {
    const url = ref.url;
    if (!url) { renderRefGrid(); return; }
    const videoId = YouTubeAPI.extractVideoId(url);
    if (!videoId) { renderRefGrid(); return; }

    // If no API key, just re-render (show open link icon)
    if (!YouTubeAPI.hasApiKey()) {
      // Prompt once per session to set API key
      if (!window._ywApiKeyPrompted) {
        window._ywApiKeyPrompted = true;
        const goSetup = confirm('YouTube URL이 감지되었습니다.\n\n영상 정보를 자동으로 가져오려면 YouTube API 키가 필요합니다.\n지금 설정하시겠습니까?\n\n(아니오를 선택하면 URL만 저장됩니다.)');
        if (goSetup) {
          document.getElementById('apiKeyBtn')?.click();
        }
      }
      renderRefGrid();
      return;
    }

    // Skip if already fetched for this videoId
    if (ref._fetchedVideoId === videoId) { renderRefGrid(); return; }

    // Show loading overlay
    const loadingEl = card.querySelector('.ref-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
      const info = await YouTubeAPI.fetchVideoInfo(videoId);
      ref.sourceTitle = info.title || ref.sourceTitle;
      ref.channelName = info.channelName;
      ref.uploadedAt = info.uploadedAt;
      ref.uploadedAtLabel = info.uploadedAtLabel;
      ref.duration = info.duration;
      ref._fetchedVideoId = videoId;

      // Try to download thumbnail as Blob
      if (info.thumbnailUrl) {
        try {
          const blob = await YouTubeAPI.fetchThumbnailBlob(info.thumbnailUrl);
          // Remove old image if exists
          if (ref.imageId) await ProjectsDB.deleteImage(ref.imageId);
          ref.imageId = await ProjectsDB.saveImage(project().id, blob, 'ref', `yt-${videoId}.jpg`);
        } catch (thumbErr) {
          // CORS or fetch failure — store URL as fallback
          ref.thumbnailUrl = info.thumbnailUrl;
        }
      }
      save();
      renderRefGrid();
    } catch (e) {
      if (loadingEl) loadingEl.style.display = 'none';
      let msg = e.message || 'unknown';
      if (msg.startsWith('INVALID_KEY')) msg = 'API 키가 유효하지 않습니다. 설정을 확인하세요.';
      else if (msg === 'QUOTA_EXCEEDED') msg = 'API 일일 한도 초과. 내일 다시 시도하세요.';
      else if (msg === 'NOT_FOUND') msg = '영상을 찾을 수 없습니다.';
      else msg = '가져오기 실패: ' + msg;
      _showToast(msg, 'error');
      renderRefGrid();
    }
  }

  function _showToast(msg, kind) {
    let el = document.getElementById('ywToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ywToast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:8px;font-size:12px;font-weight:500;z-index:200;opacity:0;transition:opacity 0.25s;pointer-events:none;';
      document.body.appendChild(el);
    }
    if (kind === 'error') {
      el.style.background = 'var(--accent)';
      el.style.color = '#fff';
    } else {
      el.style.background = 'var(--surface2)';
      el.style.color = 'var(--text)';
      el.style.border = '1px solid var(--border)';
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
  }

  function _safeUrl(u) {
    if (!u) return '';
    u = String(u).trim();
    if (!u) return '';
    // Only allow http/https
    if (!/^https?:\/\//i.test(u)) {
      // If it looks like a domain, prepend https://
      if (/^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
      else return '';
    }
    return u.replace(/"/g, '%22');
  }

  async function _addFiles(files) {
    const p = project();
    const refs = p.thumbResearch.references;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (refs.length >= MAX_REFS) break;
      const imageId = await ProjectsDB.saveImage(p.id, f, 'ref', f.name);
      refs.push(_makeRef({ imageId }));
    }
    save(); renderRefGrid();
  }

  function _makeRef(partial) {
    return Object.assign({
      id: ProjectsDB.uuid(),
      imageId: null,
      sourceTitle: '',
      url: '',
      memo: '',
      warehouseMemo: '',
      tags: [],
      favorite: false,
      collectedAt: ProjectsDB.nowISO()
    }, partial || {});
  }

  // ── Paste handler (only active when on chapter 1) ──
  async function handlePaste(e) {
    if (!document.getElementById('chapter1') || document.getElementById('chapter1').style.display === 'none') return;
    // Don't capture paste in text inputs
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const images = [];
    let clipboardText = '';
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) images.push(blob);
      } else if (item.type === 'text/plain') {
        clipboardText = e.clipboardData.getData('text/plain');
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    const p = project();
    // Detect if clipboard text is a URL
    const urlMatch = (clipboardText || '').match(/https?:\/\/\S+/);
    const inferredUrl = urlMatch ? urlMatch[0] : '';
    for (const blob of images) {
      if (p.thumbResearch.references.length >= MAX_REFS) break;
      const imageId = await ProjectsDB.saveImage(p.id, blob, 'ref', 'pasted.png');
      p.thumbResearch.references.push(_makeRef({ imageId, url: inferredUrl }));
    }
    save(); renderRefGrid();
  }
  document.addEventListener('paste', handlePaste);

  // ── Quick Add (YouTube URL — 단일 또는 복수) ──
  function _splitUrls(raw) {
    // 줄바꿈/공백/쉼표로 분리 (URL 내부의 & ? = 는 유지)
    return raw.split(/[\s,]+/).map(u => u.trim()).filter(u => u.length > 0);
  }

  async function quickAddUrls(urls) {
    if (!urls || urls.length === 0) return;
    const p = project();
    const newRefs = [];
    let skipped = 0;
    for (const url of urls) {
      if (p.thumbResearch.references.length >= MAX_REFS) { skipped++; continue; }
      const ref = _makeRef({ url });
      p.thumbResearch.references.push(ref);
      newRefs.push(ref);
    }
    save();
    await renderRefGrid();

    if (skipped > 0) {
      _showToast(`${skipped}개는 한도 초과로 추가되지 않았습니다.`, 'error');
    }

    // Fetch metadata for YouTube URLs (sequentially to avoid rate limits)
    let youTubeCount = 0;
    let nonYouTubeCount = 0;
    for (const ref of newRefs) {
      if (YouTubeAPI.extractVideoId(ref.url)) {
        youTubeCount++;
        const card = document.querySelector(`.ref-card[data-ref-id="${ref.id}"]`);
        if (card) {
          await _tryFetchYouTubeMeta(ref, card);
        }
      } else {
        nonYouTubeCount++;
      }
    }
    if (newRefs.length > 1) {
      _showToast(`${newRefs.length}개 추가됨 (YouTube ${youTubeCount} · 기타 ${nonYouTubeCount})`, 'info');
    } else if (newRefs.length === 1 && nonYouTubeCount === 1) {
      _showToast('YouTube URL이 아니므로 이미지는 직접 추가하세요.', 'info');
    }
  }

  async function quickAddUrl() {
    const input = document.getElementById('refQuickUrl');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const urls = _splitUrls(raw);
    input.value = '';
    await quickAddUrls(urls);
  }

  const quickUrlInput = document.getElementById('refQuickUrl');
  const quickAddBtn = document.getElementById('refQuickAddBtn');
  if (quickUrlInput) {
    quickUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); quickAddUrl(); }
    });
    // 복수 URL 붙여넣기 감지: 클립보드에 여러 URL이 있으면 즉시 배치 처리
    quickUrlInput.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      const urls = _splitUrls(text);
      if (urls.length > 1) {
        e.preventDefault();
        quickUrlInput.value = '';
        quickAddUrls(urls);
      }
      // 단일 URL이면 기본 붙여넣기 → 사용자가 Enter로 처리
    });
  }
  if (quickAddBtn) quickAddBtn.onclick = quickAddUrl;

  // ── Input bindings ──
  document.getElementById('myVideoTitle').oninput = (e) => {
    project().thumbResearch.myVideoTitle = e.target.value;
    // Sync project.name if empty
    if (!project().name || project().name === '새 프로젝트') project().name = e.target.value;
    document.getElementById('projectName').value = project().name;
    save();
    updateNextButton();
  };
  document.getElementById('myThumbTitle').oninput = (e) => {
    project().thumbResearch.myThumbTitle = e.target.value;
    save();
  };
  document.getElementById('audienceInput').oninput = (e) => {
    project().thumbResearch.audience = e.target.value;
    save();
    updateNextButton();
  };
  document.getElementById('purposeInput').oninput = (e) => {
    project().thumbResearch.purpose = e.target.value;
    save();
    updateNextButton();
  };

  function updateNextButton() {
    const t = project().thumbResearch;
    const ready = !!(t.myVideoTitle && t.audience && t.purpose);
    const btn = document.getElementById('c1NextBtn');
    btn.disabled = !ready;
    btn.title = ready ? '다음 단계로' : '영상 제목, 독자, 목적을 모두 입력하세요';
    t.completed = ready;
  }

  document.getElementById('c1NextBtn').onclick = () => {
    updateNextButton();
    save();
    ProjectShell.refreshTabs();
    ProjectShell.switchChapter(2);
  };

  function save() {
    ProjectShell.save();
    ProjectShell.refreshTabs();
  }

  window.addEventListener('beforeunload', () => {
    revokeUrls.forEach(u => URL.revokeObjectURL(u));
  });

  window.Chapter1 = { show };
})();
