// chapter3-broll.js — B-roll (대본 읽기 전용 + 태그/메모)

(function() {
  const DEFAULT_TAGS = [
    { type: 'screen',    label: '화면녹화' },
    { type: 'separate',  label: '별도녹화' },
    { type: 'stock',     label: '자료화면' }
  ];

  function project() { return ProjectShell.getProject(); }
  function sections() { return project().scriptWriting.sections; }
  function broll() {
    if (!project().brollPlanning.sectionsBroll) project().brollPlanning.sectionsBroll = [];
    // Ensure length matches
    while (project().brollPlanning.sectionsBroll.length < sections().length) {
      project().brollPlanning.sectionsBroll.push({ tags: [], customTags: [], memo: '' });
    }
    while (project().brollPlanning.sectionsBroll.length > sections().length) {
      project().brollPlanning.sectionsBroll.pop();
    }
    return project().brollPlanning.sectionsBroll;
  }

  function show() { render(); }

  function render() {
    const container = document.getElementById('c3Sections');
    container.innerHTML = '';
    container.style.setProperty('--col-ratio', (project().brollPlanning.columnRatio || 60) + '%');

    const secs = sections();
    const brolls = broll();

    if (secs.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>원고 작성 단계에서 섹션을 먼저 작성해주세요.</p></div>';
      return;
    }

    secs.forEach((sec, idx) => {
      const level = sec.level || 2;
      const block = document.createElement('div');
      block.className = `section-block level-${level} broll-block`;
      block.id = `c3-section-${idx}`;

      // Header (read-only title)
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

      // Body: script (read-only) + broll
      const body = document.createElement('div');
      body.className = 'section-body';

      // Left: read-only script
      const scriptDiv = document.createElement('div');
      scriptDiv.className = 'section-script c3-script-readonly';
      const pre = document.createElement('pre');
      pre.className = 'script-readonly';
      pre.textContent = sec.bodyMd.trim() || '(내용 없음)';
      scriptDiv.appendChild(pre);

      // Resize handle
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.onmousedown = (e) => _startResize(e);

      // Right: broll memo + tags
      const brollDiv = document.createElement('div');
      brollDiv.className = 'section-broll';

      const b = brolls[idx];
      const memo = document.createElement('textarea');
      memo.className = 'broll-memo';
      memo.placeholder = 'B-roll 메모를 입력하세요...';
      memo.value = b.memo || '';
      memo.oninput = () => { b.memo = memo.value; save(); };
      brollDiv.appendChild(memo);

      const tagsArea = document.createElement('div');
      tagsArea.className = 'tags-area';
      DEFAULT_TAGS.forEach(tag => {
        const btn = document.createElement('span');
        const active = (b.tags || []).includes(tag.type);
        btn.className = `tag-btn ${active ? 'active' : 'inactive'}`;
        btn.setAttribute('data-tag-type', tag.type);
        btn.textContent = tag.label;
        btn.onclick = () => {
          if (!b.tags) b.tags = [];
          const i = b.tags.indexOf(tag.type);
          if (i >= 0) b.tags.splice(i, 1); else b.tags.push(tag.type);
          save(); render();
        };
        tagsArea.appendChild(btn);
      });
      (b.customTags || []).forEach(ct => {
        const btn = document.createElement('span');
        btn.className = 'tag-btn active';
        btn.setAttribute('data-tag-type', 'custom');
        btn.textContent = ct;
        btn.onclick = () => {
          b.customTags = b.customTags.filter(t => t !== ct);
          save(); render();
        };
        tagsArea.appendChild(btn);
      });
      const addTagBtn = document.createElement('span');
      addTagBtn.className = 'add-tag-btn';
      addTagBtn.textContent = '+';
      addTagBtn.onclick = () => {
        const input = document.createElement('input');
        input.className = 'add-tag-input';
        input.placeholder = '태그명';
        input.onkeydown = (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            if (!b.customTags) b.customTags = [];
            b.customTags.push(input.value.trim());
            save(); render();
          } else if (e.key === 'Escape') input.remove();
        };
        input.onblur = () => { if (!input.value.trim()) input.remove(); };
        tagsArea.insertBefore(input, addTagBtn);
        input.focus();
      };
      tagsArea.appendChild(addTagBtn);
      brollDiv.appendChild(tagsArea);

      body.append(scriptDiv, handle, brollDiv);
      block.append(header, body);
      container.appendChild(block);
    });
    updateTOC();
  }

  function _startResize(e) {
    e.preventDefault();
    const container = document.getElementById('c3Sections');
    const startX = e.clientX;
    const startRatio = project().brollPlanning.columnRatio || 60;
    const totalW = container.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const newRatio = Math.min(80, Math.max(40, startRatio + (dx / totalW) * 100));
      project().brollPlanning.columnRatio = Math.round(newRatio);
      container.style.setProperty('--col-ratio', project().brollPlanning.columnRatio + '%');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      save();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function updateTOC() {
    const list = document.getElementById('c3TocList');
    if (!list) return;
    list.innerHTML = '';
    sections().forEach((sec, idx) => {
      const item = document.createElement('button');
      item.className = `toc-item toc-level-${sec.level || 2}`;
      item.textContent = sec.title || '(제목 없음)';
      item.onclick = () => document.getElementById(`c3-section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      list.appendChild(item);
    });
  }

  function save() {
    project().brollPlanning.completed = sections().length >= 1;
    ProjectShell.save();
    ProjectShell.refreshTabs();
  }

  // ── Checklist modal ──
  document.getElementById('c3ChecklistBtn').onclick = () => {
    const secs = sections();
    const brolls = broll();
    const byTag = {};
    const ungrouped = [];

    secs.forEach((sec, idx) => {
      if ((sec.level || 2) < 2) return;
      const b = brolls[idx];
      if (!b.memo && (!b.tags || b.tags.length === 0) && (!b.customTags || b.customTags.length === 0)) return;
      const allTags = [
        ...(b.tags || []).map(t => DEFAULT_TAGS.find(d => d.type === t)?.label || t),
        ...(b.customTags || [])
      ];
      const item = { section: sec.title, memo: b.memo };
      if (allTags.length === 0) ungrouped.push(item);
      else allTags.forEach(tag => { if (!byTag[tag]) byTag[tag] = []; byTag[tag].push(item); });
    });

    let html = '<div class="checklist-modal">';
    let copyText = '[ 촬영 체크리스트 ]\n';
    Object.keys(byTag).forEach(tag => {
      html += `<div class="checklist-group"><div class="checklist-group-title">${escapeHtml(tag)}</div>`;
      copyText += `\n■ ${tag}\n`;
      byTag[tag].forEach(it => {
        html += `<label class="checklist-item"><input type="checkbox"><div><strong>${escapeHtml(it.section)}</strong>${it.memo ? '<br>' + escapeHtml(it.memo) : ''}</div></label>`;
        copyText += `□ ${it.section}${it.memo ? ' — ' + it.memo : ''}\n`;
      });
      html += '</div>';
    });
    if (ungrouped.length) {
      html += `<div class="checklist-group"><div class="checklist-group-title">기타</div>`;
      copyText += `\n■ 기타\n`;
      ungrouped.forEach(it => {
        html += `<label class="checklist-item"><input type="checkbox"><div><strong>${escapeHtml(it.section)}</strong>${it.memo ? '<br>' + escapeHtml(it.memo) : ''}</div></label>`;
        copyText += `□ ${it.section}${it.memo ? ' — ' + it.memo : ''}\n`;
      });
      html += '</div>';
    }
    html += '</div>';
    if (Object.keys(byTag).length === 0 && ungrouped.length === 0) {
      html = '<p style="padding:16px;color:var(--text-muted);">아직 태그/메모가 추가된 섹션이 없습니다.</p>';
    }

    const modal = document.getElementById('genericModal');
    modal.querySelector('.modal').innerHTML = `
      <h3>촬영 체크리스트</h3>
      ${html}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="cl-copy">클립보드 복사</button>
        <button class="btn btn-secondary" id="cl-close">닫기</button>
      </div>`;
    modal.classList.add('show');
    document.getElementById('cl-copy').onclick = () => {
      navigator.clipboard.writeText(copyText).then(() => {
        document.getElementById('cl-copy').textContent = '복사됨!';
      });
    };
    document.getElementById('cl-close').onclick = () => modal.classList.remove('show');
  };

  // ── Navigation ──
  document.getElementById('c3PrevBtn').onclick = () => ProjectShell.switchChapter(2);
  document.getElementById('c3DoneBtn').onclick = () => {
    save();
    alert('B-roll 계획이 저장되었습니다.\n프로젝트를 ZIP으로 내보내서 백업할 수 있습니다.');
  };
  document.getElementById('c3EditScriptBtn').onclick = () => ProjectShell.switchChapter(2);

  window.Chapter3 = { show };
})();
