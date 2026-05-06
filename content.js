// Isolated world — receives intercepted API responses from injected.js via postMessage.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data?.__igCrawler) return;

  const posts = extractPosts(event.data.data);
  if (posts.length) savePosts(posts);
});

// ── Parsers ────────────────────────────────────────────────────────────────
// Instagram serves several different JSON shapes depending on the endpoint.

function extractPosts(json) {
  if (!json || typeof json !== 'object') return [];
  const results = [];

  // Shape A: V1 sections layout (fbsearch, /tags/{name}/sections/, explore grids)
  // Structure: { sections: [{ layout_content: { medias: [{ media: {...} }] } }] }
  collectSections(json?.sections, results);
  collectSections(json?.data?.sections, results);
  collectSections(json?.data?.top?.sections, results);
  collectSections(json?.data?.recent?.sections, results);

  // Shape B: GraphQL hashtag response
  // Structure: { data: { hashtag: { edge_hashtag_to_media: { edges: [{ node: {...} }] } } } }
  const gqlEdges =
    json?.data?.hashtag?.edge_hashtag_to_media?.edges ||
    json?.data?.hashtag?.edge_hashtag_to_top_posts?.edges;
  if (Array.isArray(gqlEdges)) {
    gqlEdges.forEach((e) => {
      const p = normalizeGQL(e?.node);
      if (p) results.push(p);
    });
  }

  // Shape C: flat items array (some older v1 endpoints)
  const items = json?.items || json?.data?.items;
  if (Array.isArray(items)) {
    items.forEach((item) => {
      const p = normalizeV1(item);
      if (p) results.push(p);
    });
  }

  return results;
}

function collectSections(sections, results) {
  if (!Array.isArray(sections)) return;
  sections.forEach((section) => {
    const medias = section?.layout_content?.medias || [];
    medias.forEach((m) => {
      const p = normalizeV1(m?.media ?? m);
      if (p) results.push(p);
    });
  });
}

// Instagram Web API v1 media object
function normalizeV1(media) {
  if (!media || typeof media !== 'object') return null;
  const shortcode = media.code || media.shortcode;
  if (!shortcode) return null;

  const thumb =
    media.image_versions2?.candidates?.[0]?.url ||
    media.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    null;

  return {
    shortcode,
    username: media.user?.username || media.owner?.username || null,
    caption: (media.caption?.text || '').replace(/\n/g, ' '),
    likes: media.like_count ?? null,
    comments: media.comment_count ?? null,
    timestamp: media.taken_at ?? null,
    mediaType: v1MediaTypeLabel(media.media_type),
    hashtag: currentHashtag(),
    postUrl: `https://www.instagram.com/p/${shortcode}/`,
    thumbnailUrl: thumb,
  };
}

// Instagram GraphQL node
function normalizeGQL(node) {
  if (!node?.shortcode) return null;
  return {
    shortcode: node.shortcode,
    username: node.owner?.username || null,
    caption: (node.edge_media_to_caption?.edges?.[0]?.node?.text || '').replace(/\n/g, ' '),
    likes: node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? null,
    comments: node.edge_media_to_comment?.count ?? null,
    timestamp: node.taken_at_timestamp ?? null,
    mediaType: node.__typename || 'GraphImage',
    hashtag: currentHashtag(),
    postUrl: `https://www.instagram.com/p/${node.shortcode}/`,
    thumbnailUrl: node.thumbnail_src || node.display_url || null,
  };
}

function v1MediaTypeLabel(type) {
  if (type === 1) return 'Photo';
  if (type === 2) return 'Video';
  if (type === 8) return 'Album';
  return type != null ? String(type) : 'Unknown';
}

function currentHashtag() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q) return decodeURIComponent(q); // e.g. "#nature"
    const match = location.pathname.match(/\/tags\/([^/]+)/);
    if (match) return `#${decodeURIComponent(match[1])}`;
  } catch (_) {}
  return '';
}

// ── Storage ────────────────────────────────────────────────────────────────

async function savePosts(newPosts) {
  const { crawledPosts = [] } = await chrome.storage.local.get('crawledPosts');
  const seen = new Set(crawledPosts.map((p) => p.shortcode));
  const toAdd = newPosts.filter((p) => p?.shortcode && !seen.has(p.shortcode));
  if (!toAdd.length) return;

  const updated = [...crawledPosts, ...toAdd];
  await chrome.storage.local.set({ crawledPosts: updated });
  chrome.runtime.sendMessage({ type: 'CRAWL_PROGRESS', count: updated.length });
}
