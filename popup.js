const btnExportCsv = document.getElementById('btn-export-csv');
const btnClear = document.getElementById('btn-clear');
const statusText = document.getElementById('status-text');
const postCount = document.getElementById('post-count');
const hashtagLabel = document.getElementById('hashtag-label');
const postList = document.getElementById('post-list');
const chkAutoScroll = document.getElementById('chk-autoscroll');
const selScrollSpeed = document.getElementById('sel-scroll-speed');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');

let allPosts = [];
let activeHashtag = null;

// Returns posts filtered by the active hashtag then by the date range inputs.
// tanggal is stored as "YYYY-MM-DD" — ISO string comparison is lexicographically correct.
function getFilteredPosts() {
  const byHashtag = activeHashtag
    ? allPosts.filter((p) => p.hashtag === activeHashtag)
    : allPosts;

  const from = dateFrom.value; // "YYYY-MM-DD" or ""
  const to = dateTo.value;
  if (!from && !to) return byHashtag;

  return byHashtag.filter((p) => {
    const d = p.date?.slice(0, 10); // "YYYY-MM-DD" from "YYYY-MM-DD HH:MM"
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

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

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function syncAutoScrollState(tab) {
  const onInstagram = tab?.url?.includes('instagram.com');
  chkAutoScroll.disabled = !onInstagram;
  if (!onInstagram) return;

  try {
    const state = await chrome.tabs.sendMessage(tab.id, { action: 'GET_STATE' });
    chkAutoScroll.checked = state?.autoScrolling ?? false;
    selScrollSpeed.disabled = !chkAutoScroll.checked;
  } catch (_) {
    chkAutoScroll.checked = false;
    selScrollSpeed.disabled = true;
  }
}

async function refresh() {
  const { crawledPosts = [] } = await chrome.storage.local.get('crawledPosts');
  allPosts = crawledPosts;
  activeHashtag = await getActiveHashtag();

  hashtagLabel.textContent = activeHashtag || '—';

  const filtered = getFilteredPosts();
  const totalForHashtag = activeHashtag
    ? allPosts.filter((p) => p.hashtag === activeHashtag).length
    : allPosts.length;
  const isFiltered = (dateFrom.value || dateTo.value) && filtered.length !== totalForHashtag;

  postCount.textContent = isFiltered
    ? `${filtered.length} / ${totalForHashtag}`
    : String(filtered.length);

  btnExportCsv.disabled = filtered.length === 0;

  if (!activeHashtag) {
    statusText.textContent = 'Open a hashtag search page on Instagram';
  } else if (chkAutoScroll.checked) {
    statusText.textContent = 'Auto scrolling...';
  } else if (totalForHashtag === 0) {
    statusText.textContent = 'Scroll down to collect posts';
  } else if (isFiltered) {
    statusText.textContent = `${filtered.length} of ${totalForHashtag} posts in range`;
  } else {
    statusText.textContent = 'Collecting — scroll to load more';
  }

  renderPosts(filtered.slice(-15).reverse());

  const tab = await getActiveTab();
  await syncAutoScrollState(tab);
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
  const toExport = getFilteredPosts();
  if (!toExport.length) return;

  const headers = [
    'id', 'url', 'shortcode', 'timestamp', 'date',
    'author_id', 'author_username', 'author_name', 'author_avatar', 'author_bio', 'author_stats_followers',
    'caption', 'tagged_users', 'tags',
    'video', 'image', 'type',
    'comments_count', 'likes_count', 'views_count',
    'location', 'is_geo', 'hashtag',
  ];
  const rows = toExport.map((p) => headers.map((h) => csvCell(p[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });

  const tag = activeHashtag ? activeHashtag.replace(/[^a-zA-Z0-9]/g, '_') : 'posts';
  const range = (dateFrom.value || dateTo.value)
    ? `_${dateFrom.value || 'start'}_to_${dateTo.value || 'end'}`
    : '';
  downloadBlob(blob, `instagram_${tag}${range}.csv`);
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

chkAutoScroll.addEventListener('change', async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  if (chkAutoScroll.checked) {
    const delay = parseInt(selScrollSpeed.value, 10);
    chrome.tabs.sendMessage(tab.id, { action: 'START_AUTOSCROLL', delay });
    selScrollSpeed.disabled = false;
    statusText.textContent = 'Auto scrolling...';
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'STOP_AUTOSCROLL' });
    selScrollSpeed.disabled = true;
    statusText.textContent = 'Collecting — scroll to load more';
  }
});

selScrollSpeed.addEventListener('change', async () => {
  if (!chkAutoScroll.checked) return;
  const tab = await getActiveTab();
  if (!tab) return;
  const delay = parseInt(selScrollSpeed.value, 10);
  chrome.tabs.sendMessage(tab.id, { action: 'START_AUTOSCROLL', delay });
});

dateFrom.addEventListener('change', refresh);
dateTo.addEventListener('change', refresh);

// Live update when content script saves new posts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CRAWL_PROGRESS') refresh();
});

refresh();
