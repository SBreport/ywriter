// chapter1-brief.js — 썸네일 리서치 + 본질 설정

(function() {
  const MAX_REFS = 12;
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

      let imgHtml = '<div class="ref-placeholder">이미지 없음</div>';
      if (ref.imageId) {
        const url = await ProjectsDB.loadImageUrl(ref.imageId);
        if (url) {
          revokeUrls.push(url);
          imgHtml = `<img src="${url}" alt="ref">`;
        }
      }

      card.innerHTML = `
        <div class="ref-image">${imgHtml}</div>
        <input type="text" class="ref-title" placeholder="영상/채널명" value="${escapeHtml(ref.sourceTitle || '')}">
        <textarea class="ref-memo" placeholder="배울 점 메모">${escapeHtml(ref.memo || '')}</textarea>
        <button class="ref-delete" title="삭제">&#10005;</button>
      `;

      card.querySelector('.ref-title').oninput = (e) => { ref.sourceTitle = e.target.value; save(); };
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

  async function _addFiles(files) {
    const p = project();
    const refs = p.thumbResearch.references;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (refs.length >= MAX_REFS) break;
      const imageId = await ProjectsDB.saveImage(p.id, f, 'ref', f.name);
      refs.push({ id: ProjectsDB.uuid(), imageId, sourceTitle: '', memo: '' });
    }
    save(); renderRefGrid();
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
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) images.push(blob);
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    const p = project();
    for (const blob of images) {
      if (p.thumbResearch.references.length >= MAX_REFS) break;
      const imageId = await ProjectsDB.saveImage(p.id, blob, 'ref', 'pasted.png');
      p.thumbResearch.references.push({ id: ProjectsDB.uuid(), imageId, sourceTitle: '', memo: '' });
    }
    save(); renderRefGrid();
  }
  document.addEventListener('paste', handlePaste);

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
