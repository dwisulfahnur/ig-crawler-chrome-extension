const btnExportCsv = document.getElementById('btn-export-csv');
const btnClear = document.getElementById('btn-clear');
const statusText = document.getElementById('status-text');
const postCount = document.getElementById('post-count');
const hashtagLabel = document.getElementById('hashtag-label');
const postList = document.getElementById('post-list');

let allPosts = [];
let activeHashtag = null;

async function getActiveHashtag() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('instagram.com')) return null;
  try {
    const url = new URL(tab.url);
    const q = url.searchParams.get('q');
    if (q) return decodeURIComponent(q);
    const match = url.pathname.match(/\/tags\/([^/]+)/);
    if (match) return `#${decodeURIComponent(match[1])}`;
  } catch (_) {}
  return null;
}

async function refresh() {
  const { crawledPosts = [] } = await chrome.storage.local.get('crawledPosts');
  allPosts = crawledPosts;
  activeHashtag = await getActiveHashtag();

  hashtagLabel.textContent = activeHashtag || '—';

  const filtered = activeHashtag
    ? allPosts.filter((p) => p.hashtag === activeHashtag)
    : allPosts;

  postCount.textContent = filtered.length;
  btnExportCsv.disabled = filtered.length === 0;

  if (!activeHashtag) {
    statusText.textContent = 'Open a hashtag search page on Instagram';
  } else if (filtered.length === 0) {
    statusText.textContent = 'Scroll down to collect posts';
  } else {
    statusText.textContent = `Collecting — scroll to load more`;
  }

  renderPosts(filtered.slice(-15).reverse());
}

function renderPosts(data) {
  postList.innerHTML = '';
  data.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'post-item';
    const date = p.timestamp ? new Date(p.timestamp * 1000).toLocaleDateString() : '—';
    item.innerHTML = `
      ${p.image ? `<img src="${p.image}" alt="" />` : '<div class="thumb-placeholder"></div>'}
      <div class="post-info">
        <div class="post-username">@${p.author_username || 'unknown'}</div>
        <div class="post-meta">${p.likes_count ?? '?'} likes · ${date}</div>
      </div>`;
    postList.appendChild(item);
  });
}

btnExportCsv.addEventListener('click', () => {
  const toExport = activeHashtag
    ? allPosts.filter((p) => p.hashtag === activeHashtag)
    : allPosts;

  if (!toExport.length) return;

  const headers = [
    'id', 'shortcode', 'timestamp', 'tanggal', 'jam',
    'from_id', 'from_user', 'from_avatar',
    'author_id', 'author_username', 'author_name', 'author_avatar', 'author_bio', 'author_stats_followers',
    'caption', 'url', 'tagged_users', 'tags',
    'video', 'image', 'type',
    'comments_count', 'likes_count', 'views_count', 'engage_score',
    'location', 'is_geo', 'hashtag',
  ];
  const rows = toExport.map((p) => headers.map((h) => csvCell(p[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });

  const tag = activeHashtag ? activeHashtag.replace(/[^a-zA-Z0-9]/g, '_') : 'posts';
  downloadBlob(blob, `instagram_${tag}.csv`);
});

btnClear.addEventListener('click', async () => {
  await chrome.storage.local.set({ crawledPosts: [] });
  allPosts = [];
  postList.innerHTML = '';
  postCount.textContent = '0';
  btnExportCsv.disabled = true;
  statusText.textContent = 'Data cleared.';
});

function csvCell(val) {
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Live update when content script saves new posts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CRAWL_PROGRESS') refresh();
});

refresh();
