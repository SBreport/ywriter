// zip.js — ZIP 백업/복원 (JSZip 사용)
// 전역 API: window.ProjectZip

(function() {
  // JSZip은 CDN으로 로드되어야 함 (index.html/project.html에서 script 태그)

  async function exportProject(projectId) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip 라이브러리가 로드되지 않았습니다.');
      return;
    }
    const project = ProjectsDB.load(projectId);
    if (!project) return;

    const zip = new JSZip();
    const meta = {
      version: '3.0',
      exportedAt: ProjectsDB.nowISO(),
      originalId: project.id
    };
    zip.file('meta.json', JSON.stringify(meta, null, 2));
    zip.file('project.json', JSON.stringify(project, null, 2));

    const imgFolder = zip.folder('thumbnails');
    const images = await ProjectsDB.listImagesByProject(projectId);
    for (const img of images) {
      imgFolder.file(img.id + '_' + (img.filename || 'image'), img.blob);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const title = (project.thumbResearch?.myVideoTitle || project.name || 'project')
      .replace(/[^가-힣a-zA-Z0-9]/g, '').substring(0, 30) || 'project';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${date}_${title}_v${project.version || 1}.ywzip.zip`;
    _download(blob, filename);
  }

  async function exportAll() {
    if (typeof JSZip === 'undefined') { alert('JSZip 미로드'); return; }
    const zip = new JSZip();
    const projects = ProjectsDB.list();
    zip.file('meta.json', JSON.stringify({
      version: '3.0', exportedAt: ProjectsDB.nowISO(), projectCount: projects.length, bundle: true
    }, null, 2));

    for (const entry of projects) {
      const p = ProjectsDB.load(entry.id);
      if (!p) continue;
      const folder = zip.folder(p.id);
      folder.file('project.json', JSON.stringify(p, null, 2));
      const imgFolder = folder.folder('thumbnails');
      const images = await ProjectsDB.listImagesByProject(p.id);
      for (const img of images) {
        imgFolder.file(img.id + '_' + (img.filename || 'image'), img.blob);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    _download(blob, `${date}_ywriter_all.zip`);
  }

  async function importZip(file) {
    if (typeof JSZip === 'undefined') { alert('JSZip 미로드'); return null; }
    const zip = await JSZip.loadAsync(file);

    // Detect: single or bundle?
    const meta = JSON.parse(await zip.file('meta.json').async('string'));
    if (meta.bundle) {
      return await _importBundle(zip);
    } else {
      return await _importSingle(zip);
    }
  }

  async function _importSingle(zip) {
    const projectJson = await zip.file('project.json').async('string');
    const project = JSON.parse(projectJson);

    // Generate fresh IDs to avoid collision
    const oldId = project.id;
    project.id = ProjectsDB.uuid();
    project.createdAt = project.createdAt || ProjectsDB.nowISO();
    project.updatedAt = ProjectsDB.nowISO();

    // Restore images, remap IDs
    const idMap = {};
    const imgFolder = zip.folder('thumbnails');
    const filenames = Object.keys(zip.files).filter(n => n.startsWith('thumbnails/') && !zip.files[n].dir);
    for (const name of filenames) {
      const match = name.match(/thumbnails\/([^_]+)_(.+)/);
      if (!match) continue;
      const [, oldImgId, origName] = match;
      const blob = await zip.file(name).async('blob');
      const kind = project.thumbResearch?.myThumbImageId === oldImgId ? 'my-thumb' : 'ref';
      const newId = await ProjectsDB.saveImage(project.id, blob, kind, origName);
      idMap[oldImgId] = newId;
    }

    // Remap image IDs in project
    if (project.thumbResearch?.references) {
      project.thumbResearch.references.forEach(ref => {
        if (ref.imageId && idMap[ref.imageId]) ref.imageId = idMap[ref.imageId];
      });
    }
    if (project.thumbResearch?.myThumbImageId && idMap[project.thumbResearch.myThumbImageId]) {
      project.thumbResearch.myThumbImageId = idMap[project.thumbResearch.myThumbImageId];
    }

    ProjectsDB.save(project);
    return project;
  }

  async function _importBundle(zip) {
    const imported = [];
    const topFolders = new Set();
    Object.keys(zip.files).forEach(n => {
      const parts = n.split('/');
      if (parts.length > 1 && parts[0] !== '' && parts[0] !== 'meta.json') topFolders.add(parts[0]);
    });

    for (const folderId of topFolders) {
      try {
        const projJsonFile = zip.file(`${folderId}/project.json`);
        if (!projJsonFile) continue;
        const project = JSON.parse(await projJsonFile.async('string'));
        project.id = ProjectsDB.uuid();
        project.updatedAt = ProjectsDB.nowISO();

        const idMap = {};
        const prefix = `${folderId}/thumbnails/`;
        const names = Object.keys(zip.files).filter(n => n.startsWith(prefix) && !zip.files[n].dir);
        for (const name of names) {
          const rest = name.substring(prefix.length);
          const m = rest.match(/([^_]+)_(.+)/);
          if (!m) continue;
          const [, oldImgId, origName] = m;
          const blob = await zip.file(name).async('blob');
          const kind = project.thumbResearch?.myThumbImageId === oldImgId ? 'my-thumb' : 'ref';
          idMap[oldImgId] = await ProjectsDB.saveImage(project.id, blob, kind, origName);
        }
        if (project.thumbResearch?.references) {
          project.thumbResearch.references.forEach(r => {
            if (r.imageId && idMap[r.imageId]) r.imageId = idMap[r.imageId];
          });
        }
        if (project.thumbResearch?.myThumbImageId && idMap[project.thumbResearch.myThumbImageId]) {
          project.thumbResearch.myThumbImageId = idMap[project.thumbResearch.myThumbImageId];
        }
        ProjectsDB.save(project);
        imported.push(project);
      } catch (e) {
        console.error('Failed to import project', folderId, e);
      }
    }
    return imported;
  }

  function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.ProjectZip = { exportProject, exportAll, importZip };
})();
