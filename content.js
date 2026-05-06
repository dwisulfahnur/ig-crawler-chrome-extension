// Isolated world — receives intercepted API responses from injected.js via postMessage.
let contextInvalidated = false;

window.addEventListener('message', (event) => {
  if (contextInvalidated) return;
  if (event.source !== window) return;
  if (!event.data?.__igCrawler) return;

  const posts = extractPosts(event.data.data);
  if (posts.length) savePosts(posts);
});

// ── Parsers ────────────────────────────────────────────────────────────────

function extractPosts(json) {
  if (!json || typeof json !== 'object') return [];
  const results = [];

  // Primary shape: xdt_fbsearch__top_serp_graphql
  // data.xdt_fbsearch__top_serp_graphql.edges[].node.items[]
  const serpEdges = json?.data?.xdt_fbsearch__top_serp_graphql?.edges;
  if (Array.isArray(serpEdges)) {
    serpEdges.forEach((edge) => {
      const items = edge?.node?.items;
      if (Array.isArray(items)) {
        items.forEach((item) => {
          const p = normalizeItem(item);
          if (p) results.push(p);
        });
      }
    });
  }

  // Fallback: V1 sections layout (tags/{name}/sections/, explore grids)
  collectSections(json?.sections, results);
  collectSections(json?.data?.sections, results);
  collectSections(json?.data?.top?.sections, results);
  collectSections(json?.data?.recent?.sections, results);

  // Fallback: flat items array
  const flatItems = json?.items || json?.data?.items;
  if (Array.isArray(flatItems)) {
    flatItems.forEach((item) => {
      const p = normalizeItem(item);
      if (p) results.push(p);
    });
  }

  return results;
}

function collectSections(sections, results) {
  if (!Array.isArray(sections)) return;
  sections.forEach((section) => {
    (section?.layout_content?.medias || []).forEach((m) => {
      const p = normalizeItem(m?.media ?? m);
      if (p) results.push(p);
    });
  });
}

// Normalizes any Instagram media item into the expected output shape.
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const shortcode = item.code || item.shortcode;
  if (!shortcode) return null;

  const user = item.user || item.owner || {};
  const captionText = item.caption?.text || '';
  const takenAt = item.taken_at ?? item.taken_at_timestamp ?? null;
  const mediaType = item.media_type;

  // Largest available image candidate
  const image =
    item.image_versions2?.candidates?.[0]?.url ||
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    item.thumbnail_src ||
    item.display_url ||
    null;

  // Video URL only for video posts (media_type 2)
  const isVideo = mediaType === 2 || item.__typename === 'GraphVideo';
  const video = isVideo ? (item.video_versions?.[0]?.url ?? null) : null;

  const likeCount =
    item.like_count ??
    item.edge_liked_by?.count ??
    item.edge_media_preview_like?.count ??
    null;
  const commentCount =
    item.comment_count ?? item.edge_media_to_comment?.count ?? null;
  const viewCount = item.view_count ?? 0;

  // Format date+time in local timezone from Unix timestamp → "YYYY-MM-DD HH:MM"
  let date = null;
  if (takenAt) {
    const d = new Date(takenAt * 1000);
    const ymd = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:MM
    date = `${ymd} ${hm}`;
  }

  // Hashtags extracted from caption text
  const tagMatches = captionText.match(/#[\w\u0080-\uFFFF]+/g);
  const tags = tagMatches ? tagMatches.join(' ') : null;

  // Tagged users on the media (from usertags, not caption)
  const taggedUsers = item.usertags?.in
    ? item.usertags.in.map((t) => t.user?.username).filter(Boolean).join(' ') || null
    : null;

  return {
    id: String(item.pk || item.id || ''),
    url: `https://www.instagram.com/p/${shortcode}/`,
    shortcode,
    timestamp: takenAt,
    date,
    author_id: String(user.pk || user.id || ''),
    author_username: user.username || null,
    author_name: user.full_name || null,
    author_avatar: user.profile_pic_url || null,
    author_bio: null,
    caption: captionText,
    tagged_users: taggedUsers,
    tags,
    video,
    image,
    type: mediaTypeLabel(mediaType, item.__typename),
    comments_count: commentCount,
    likes_count: likeCount,
    views_count: viewCount,
    location: item.location?.name || null,
    is_geo: !!item.location,
    hashtag: currentHashtag(),
  };
}

function mediaTypeLabel(type, typename) {
  if (type === 1) return 'photo';
  if (type === 2) return 'video';
  if (type === 8) return 'album';
  if (typename === 'GraphImage') return 'photo';
  if (typename === 'GraphVideo') return 'video';
  if (typename === 'GraphSidecar') return 'album';
  return 'unknown';
}

function currentHashtag() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q) return decodeURIComponent(q);
    const match = location.pathname.match(/\/tags\/([^/]+)/);
    if (match) return `#${decodeURIComponent(match[1])}`;
  } catch (_) {}
  return '';
}

// ── Auto-scroll ────────────────────────────────────────────────────────────

let autoScrolling = false;
let autoScrollTimer = null;

function startAutoScroll(delay) {
  stopAutoScroll();
  autoScrolling = true;
  function step() {
    if (!autoScrolling) return;
    window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    autoScrollTimer = setTimeout(step, delay);
  }
  autoScrollTimer = setTimeout(step, delay);
}

function stopAutoScroll() {
  autoScrolling = false;
  clearTimeout(autoScrollTimer);
  autoScrollTimer = null;
}

window.addEventListener('beforeunload', stopAutoScroll);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'START_AUTOSCROLL') {
    startAutoScroll(msg.delay || 2000);
    sendResponse({ ok: true });
  }
  if (msg.action === 'STOP_AUTOSCROLL') {
    stopAutoScroll();
    sendResponse({ ok: true });
  }
  if (msg.action === 'GET_STATE') {
    sendResponse({ autoScrolling });
  }
  return true;
});

// ── Storage ────────────────────────────────────────────────────────────────

async function savePosts(newPosts) {
  if (contextInvalidated) return;

  try {
    const { crawledPosts = [] } = await chrome.storage.local.get('crawledPosts');
    const seen = new Set(crawledPosts.map((p) => p.shortcode));
    const toAdd = newPosts.filter((p) => p?.shortcode && !seen.has(p.shortcode));
    if (!toAdd.length) return;

    const updated = [...crawledPosts, ...toAdd];
    await chrome.storage.local.set({ crawledPosts: updated });
    chrome.runtime.sendMessage({ type: 'CRAWL_PROGRESS', count: updated.length }).catch(() => {});
  } catch (err) {
    if (err?.message?.includes('Extension context')) {
      contextInvalidated = true;
      stopAutoScroll();
    }
  }
}
