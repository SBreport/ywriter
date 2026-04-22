// youtube-api.js — YouTube Data API v3 래퍼
// 전역 API: window.YouTubeAPI

(function() {
  const API_KEY_STORAGE = 'yw-youtube-api-key';

  function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  }

  function setApiKey(key) {
    if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  }

  function hasApiKey() {
    return !!getApiKey();
  }

  // ── URL 파싱 ──
  // youtube.com/watch?v=ID
  // youtu.be/ID
  // youtube.com/shorts/ID
  // youtube.com/embed/ID
  // youtube.com/live/ID
  function extractVideoId(url) {
    if (!url) return null;
    url = String(url).trim();

    // youtu.be short link
    let m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];

    // youtube.com/shorts/, /embed/, /live/
    m = url.match(/youtube\.com\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];

    // youtube.com/watch?v=ID
    m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];

    // Raw 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

    return null;
  }

  function isYoutubeUrl(url) {
    return !!extractVideoId(url);
  }

  // ── Duration: ISO 8601 → "M:SS" or "H:MM:SS" ──
  function parseDuration(iso) {
    if (!iso) return '';
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const h = parseInt(m[1] || 0);
    const mm = parseInt(m[2] || 0);
    const ss = parseInt(m[3] || 0);
    if (h > 0) return `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  }

  // ── Date format: 2024-01-15T10:30:00Z → "2024.1.15" ──
  function formatUploadDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }

  // ── API 조회 ──
  async function fetchVideoInfo(videoId) {
    const key = getApiKey();
    if (!key) throw new Error('NO_API_KEY');
    if (!videoId) throw new Error('NO_VIDEO_ID');

    const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet,contentDetails,statistics&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || res.statusText;
      const reason = errJson?.error?.errors?.[0]?.reason || '';
      if (reason === 'keyInvalid' || reason === 'badRequest') throw new Error('INVALID_KEY:' + msg);
      if (reason === 'quotaExceeded') throw new Error('QUOTA_EXCEEDED');
      throw new Error(msg || 'API_ERROR');
    }
    const data = await res.json();
    if (!data.items || data.items.length === 0) throw new Error('NOT_FOUND');

    const it = data.items[0];
    const sn = it.snippet || {};
    const cd = it.contentDetails || {};
    const st = it.statistics || {};

    // Best thumbnail: maxres > standard > high > medium > default
    const thumbs = sn.thumbnails || {};
    const thumbUrl = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;

    return {
      videoId,
      title: sn.title || '',
      channelName: sn.channelTitle || '',
      channelId: sn.channelId || '',
      uploadedAt: sn.publishedAt || '',
      uploadedAtLabel: formatUploadDate(sn.publishedAt),
      duration: parseDuration(cd.duration),
      durationISO: cd.duration || '',
      thumbnailUrl: thumbUrl,
      viewCount: st.viewCount ? parseInt(st.viewCount) : null,
      description: sn.description || ''
    };
  }

  // ── 썸네일 다운로드 (Blob) ──
  async function fetchThumbnailBlob(thumbUrl) {
    if (!thumbUrl) throw new Error('NO_URL');
    const res = await fetch(thumbUrl);
    if (!res.ok) throw new Error('FETCH_FAILED');
    return await res.blob();
  }

  // ── Fallback: URL 패턴으로 썸네일 생성 (API 없이) ──
  function thumbnailUrlForVideoId(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }

  window.YouTubeAPI = {
    getApiKey, setApiKey, hasApiKey,
    extractVideoId, isYoutubeUrl,
    fetchVideoInfo, fetchThumbnailBlob,
    thumbnailUrlForVideoId,
    parseDuration, formatUploadDate
  };
})();
