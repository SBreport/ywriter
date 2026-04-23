// chapter4-edit.js — 편집 계획 (편집 브리프 + 섹션별 편집 노트)

(function() {
  const EDIT_TAGS = [
    { type: 'fastPace',   label: '빠른 페이스', icon: '⚡' },
    { type: 'slowPace',   label: '천천히',      icon: '🐢' },
    { type: 'emphasize',  label: '강조 필수',   icon: '🔒' },
    { type: 'cut',        label: '삭제 권장',   icon: '✂' },
    { type: 'zoom',       label: '줌/인서트',   icon: '🔍' },
    { type: 'transition', label: '트랜지션',    icon: '🎞' },
    { type: 'bgmChange',  label: 'BGM 변경',    icon: '🎵' },
    { type: 'sfx',        label: '효과음',      icon: '✦' },
    { type: 'subtitle',   label: '자막 강조',   icon: '📝' }
  ];

  function project() { return ProjectShell.getProject(); }
  function sections() { return project().scriptWriting.sections; }

  function editPlanning() {
    const p = project();
    if (!p.editPlanning) {
      p.editPlanning = {
        completed: false, briefExpanded: true,
        brief: { targetDuration: '', tone: '', references: [], subtitleStyle: '', bgmMood: '', colorLook: '', transitionStyle: '', deadline: '', misc: '' },
        sectionsEdit: []
      };
    }
    return p.editPlanning;
  }

  function sectionsEdit() {
    const ep = editPlanning();
    if (!ep.sectionsEdit) ep.sectionsEdit = [];
    while (ep.sectionsEdit.length < sections().length) {
      ep.sectionsEdit.push({ tags: [], customTags: [], subtitleText: '', memo: '' });
    }
    while (ep.sectionsEdit.length > sections().length) {
      ep.sectionsEdit.pop();
    }
    return ep.sectionsEdit;
  }

  function save() {
    project().editPlanning.completed = sections().length >= 1;
    ProjectShell.save();
    ProjectShell.refreshTabs();
  }

  function show() { renderAll(); }

  function renderAll() {
    renderBrief();
    renderSectionsUi();
    updateTOC();
  }

  // ── Brief ──
  function renderBrief() {
    const ep = editPlanning();
    const b = ep.brief;

    document.getElementById('ebDuration').value = b.targetDuration || '';
    document.getElementById('ebDeadline').value = b.deadline || '';
    document.getElementById('ebTone').value = b.tone || '';
    document.getElementById('ebSubtitle').value = b.subtitleStyle || '';
    document.getElementById('ebBgm').value = b.bgmMood || '';
    document.getElementById('ebColor').value = b.colorLook || '';
    document.getElementById('ebTransition').value = b.transitionStyle || '';
    document.getElementById('ebMisc').value = b.misc || '';

    renderReferences();
    renderBriefToggle();
  }

  function renderBriefToggle() {
    const ep = editPlanning();
    const body = document.getElementById('c4BriefBody');
    const toggle = document.getElementById('c4BriefToggle');
    if (ep.briefExpanded === false) {
      body.style.display = 'none';
      toggle.textContent = '▸';
    } else {
      body.style.display = '';
      toggle.textContent = '▾';
    }
  }

  function renderReferences() {
    const container = document.getElementById('ebReferences');
    const refs = editPlanning().brief.references;
    container.innerHTML = '';
    if (refs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'eb-refs-empty';
      empty.textContent = '레퍼런스 영상이 없습니다. "+ 레퍼런스 추가"로 등록하세요.';
      container.appendChild(empty);
      return;
    }
    refs.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'eb-ref-row';
      row.innerHTML = `
        <input type="url" class="eb-ref-url" placeholder="https://youtube.com/..." value="${escapeHtml(r.url || '')}">
        <input type="text" class="eb-ref-note" placeholder="예: 1:20~2:00 자막 스타일 참고" value="${escapeHtml(r.note || '')}">
        <button class="btn-icon danger eb-ref-del" title="삭제">✕</button>
      `;
      row.querySelector('.eb-ref-url').oninput = (e) => { r.url = e.target.value; save(); };
      row.querySelector('.eb-ref-note').oninput = (e) => { r.note = e.target.value; save(); };
      row.querySelector('.eb-ref-del').onclick = () => {
        refs.splice(i, 1); save(); renderReferences();
      };
      container.appendChild(row);
    });
  }

  // Bind brief field changes
  function bindBriefFields() {
    const fields = {
      ebDuration: 'targetDuration', ebDeadline: 'deadline',
      ebTone: 'tone', ebSubtitle: 'subtitleStyle', ebBgm: 'bgmMood',
      ebColor: 'colorLook', ebTransition: 'transitionStyle', ebMisc: 'misc'
    };
    Object.entries(fields).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.oninput = (e) => { editPlanning().brief[key] = e.target.value; save(); };
    });
    document.getElementById('ebAddRef').onclick = () => {
      editPlanning().brief.references.push({ url: '', note: '' });
      save(); renderReferences();
    };
    document.getElementById('c4BriefHeader').onclick = (e) => {
      if (e.target.closest('input, textarea, button, a')) return;
      const ep = editPlanning();
      ep.briefExpanded = ep.briefExpanded === false ? true : false;
      save(); renderBriefToggle();
    };
  }

  // ── Sections (readonly script + edit note per section) ──
  function renderSectionsUi() {
    const container = document.getElementById('c4Sections');
    container.innerHTML = '';

    const secs = sections();
    const eds = sectionsEdit();

    if (secs.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>원고 작성 단계에서 섹션을 먼저 작성해주세요.</p></div>';
      return;
    }

    secs.forEach((sec, idx) => {
      const level = sec.level || 2;
      const block = document.createElement('div');
      block.className = `section-block level-${level} edit-block`;
      block.id = `c4-section-${idx}`;

      const header = document.createElement('div');
      header.className = 'section-control c3-section-header';
      header.innerHTML = `
        <span class="level-badge l${level}">H${level}</span>
        <span class="c3-section-title">${escapeHtml(sec.title || '(제목 없음)')}</span>
      `;

      if (level < 2) {
        block.append(header);
        container.appendChild(block);
        return;
      }

      // Body: read-only script + edit note
      const body = document.createElement('div');
      body.className = 'section-body edit-section-body';

      // Left: read-only script
      const scriptDiv = document.createElement('div');
      scriptDiv.className = 'section-script c3-script-readonly';
      const pre = document.createElement('pre');
      pre.className = 'script-readonly';
      pre.textContent = sec.bodyMd.trim() || '(내용 없음)';
      scriptDiv.appendChild(pre);

      // Right: edit note
      const noteDiv = document.createElement('div');
      noteDiv.className = 'edit-note-panel';

      const ed = eds[idx];

      // Tags area
      const tagsLabel = document.createElement('div');
      tagsLabel.className = 'edit-note-label';
      tagsLabel.textContent = '편집 태그';
      noteDiv.appendChild(tagsLabel);

      const tagsArea = document.createElement('div');
      tagsArea.className = 'tags-area edit-tags-area';

      EDIT_TAGS.forEach(t => {
        const btn = document.createElement('span');
        const active = (ed.tags || []).includes(t.type);
        btn.className = `tag-btn edit-tag-btn ${active ? 'active' : 'inactive'}`;
        btn.setAttribute('data-edit-tag', t.type);
        btn.innerHTML = `<span class="edit-tag-icon">${t.icon}</span>${escapeHtml(t.label)}`;
        btn.onclick = () => {
          if (!ed.tags) ed.tags = [];
          const i = ed.tags.indexOf(t.type);
          if (i >= 0) ed.tags.splice(i, 1); else ed.tags.push(t.type);
          save(); renderSectionsUi();
        };
        tagsArea.appendChild(btn);
      });
      (ed.customTags || []).forEach(ct => {
        const btn = document.createElement('span');
        btn.className = 'tag-btn active';
        btn.setAttribute('data-tag-type', 'custom');
        btn.textContent = ct;
        btn.title = '클릭해서 삭제';
        btn.onclick = () => {
          ed.customTags = ed.customTags.filter(t => t !== ct);
          save(); renderSectionsUi();
        };
        tagsArea.appendChild(btn);
      });
      const addTagBtn = document.createElement('span');
      addTagBtn.className = 'add-tag-btn';
      addTagBtn.textContent = '+';
      addTagBtn.onclick = () => {
        const input = document.createElement('input');
        input.className = 'add-tag-input';
        input.placeholder = '커스텀 태그';
        input.onkeydown = (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            if (!ed.customTags) ed.customTags = [];
            ed.customTags.push(input.value.trim());
            save(); renderSectionsUi();
          } else if (e.key === 'Escape') input.remove();
        };
        input.onblur = () => { if (!input.value.trim()) input.remove(); };
        tagsArea.insertBefore(input, addTagBtn);
        input.focus();
      };
      tagsArea.appendChild(addTagBtn);
      noteDiv.appendChild(tagsArea);

      // Subtitle text
      const subtitleLabel = document.createElement('div');
      subtitleLabel.className = 'edit-note-label';
      subtitleLabel.textContent = '📝 화면 자막 (선택)';
      noteDiv.appendChild(subtitleLabel);

      const subtitleInput = document.createElement('input');
      subtitleInput.type = 'text';
      subtitleInput.className = 'edit-subtitle-input';
      subtitleInput.placeholder = '화면에 띄울 텍스트';
      subtitleInput.value = ed.subtitleText || '';
      subtitleInput.oninput = () => { ed.subtitleText = subtitleInput.value; save(); };
      noteDiv.appendChild(subtitleInput);

      // Memo
      const memoLabel = document.createElement('div');
      memoLabel.className = 'edit-note-label';
      memoLabel.textContent = '메모';
      noteDiv.appendChild(memoLabel);

      const memo = document.createElement('textarea');
      memo.className = 'broll-memo edit-memo';
      memo.placeholder = '이 섹션 편집 시 주의할 점 / 구체 지시사항...';
      memo.value = ed.memo || '';
      memo.oninput = () => { ed.memo = memo.value; save(); };
      noteDiv.appendChild(memo);

      body.append(scriptDiv, noteDiv);
      block.append(header, body);
      container.appendChild(block);
    });
  }

  function updateTOC() {
    const list = document.getElementById('c4TocList');
    if (!list) return;
    list.innerHTML = '';
    sections().forEach((sec, idx) => {
      const item = document.createElement('button');
      item.className = `toc-item toc-level-${sec.level || 2}`;
      item.textContent = sec.title || '(제목 없음)';
      item.onclick = () => document.getElementById(`c4-section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      list.appendChild(item);
    });
  }

  // ── Navigation + bindings ──
  document.getElementById('c4PrevBtn').onclick = () => ProjectShell.switchChapter(3);
  document.getElementById('c4DoneBtn').onclick = () => {
    save();
    alert('편집 계획이 저장되었습니다.\n필요하면 ZIP 내보내기로 전체 데이터를 백업할 수 있습니다.');
  };
  document.getElementById('c4EditScriptBtn').onclick = () => ProjectShell.switchChapter(2);

  // One-time bindings
  bindBriefFields();

  window.Chapter4 = { show };
})();
