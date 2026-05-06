const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnExportJson = document.getElementById("btn-export-json");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnClear = document.getElementById("btn-clear");
const statusText = document.getElementById("status-text");
const postCount = document.getElementById("post-count");
const postList = document.getElementById("post-list");

let posts = [];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(msg, running = false) {
  statusText.textContent = msg;
  btnStart.disabled = running;
  btnStop.disabled = !running;
}

function updateCountBadge(n) {
  postCount.textContent = `${n} post${n !== 1 ? "s" : ""}`;
}

function renderPosts(data) {
  postList.innerHTML = "";
  data.slice(-20).reverse().forEach((p) => {
    const item = document.createElement("div");
    item.className = "post-item";
    item.innerHTML = `
      ${p.thumbnailUrl ? `<img src="${p.thumbnailUrl}" alt="thumb" />` : ""}
      <div class="post-info">
        <div class="post-username">@${p.username || "unknown"}</div>
        <div class="post-meta">${p.likes ?? "?"} likes · ${p.timestamp ? new Date(p.timestamp * 1000).toLocaleDateString() : ""}</div>
      </div>`;
    postList.appendChild(item);
  });
}

async function loadStored() {
  const { crawledPosts = [] } = await chrome.storage.local.get("crawledPosts");
  posts = crawledPosts;
  updateCountBadge(posts.length);
  renderPosts(posts);
  btnExportJson.disabled = posts.length === 0;
  btnExportCsv.disabled = posts.length === 0;
}

btnStart.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.url?.includes("instagram.com")) {
    statusText.textContent = "Navigate to Instagram first.";
    return;
  }

  const limit = parseInt(document.getElementById("scroll-limit").value, 10) || 50;
  const delay = parseInt(document.getElementById("scroll-delay").value, 10) || 1500;

  setStatus("Crawling…", true);

  chrome.tabs.sendMessage(tab.id, { action: "START_CRAWL", limit, delay });
});

btnStop.addEventListener("click", async () => {
  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: "STOP_CRAWL" });
  setStatus("Stopped");
});

btnClear.addEventListener("click", async () => {
  await chrome.storage.local.set({ crawledPosts: [] });
  posts = [];
  updateCountBadge(0);
  postList.innerHTML = "";
  btnExportJson.disabled = true;
  btnExportCsv.disabled = true;
  statusText.textContent = "Data cleared.";
});

btnExportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(posts, null, 2)], { type: "application/json" });
  downloadBlob(blob, "instagram_posts.json");
});

btnExportCsv.addEventListener("click", () => {
  const headers = ["shortcode", "username", "caption", "likes", "comments", "timestamp", "postUrl", "thumbnailUrl", "type"];
  const rows = posts.map((p) =>
    headers.map((h) => JSON.stringify(p[h] ?? "")).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, "instagram_posts.csv");
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Listen for live updates from background/content
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CRAWL_PROGRESS") {
    posts = msg.posts;
    updateCountBadge(posts.length);
    renderPosts(posts);
    statusText.textContent = `Crawling… (${posts.length} collected)`;
    btnExportJson.disabled = false;
    btnExportCsv.disabled = false;
  }
  if (msg.type === "CRAWL_DONE") {
    posts = msg.posts;
    updateCountBadge(posts.length);
    renderPosts(posts);
    setStatus(`Done — ${posts.length} posts collected`);
    btnExportJson.disabled = posts.length === 0;
    btnExportCsv.disabled = posts.length === 0;
  }
  if (msg.type === "CRAWL_ERROR") {
    setStatus(`Error: ${msg.error}`);
  }
});

loadStored();
