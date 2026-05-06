(() => {
  let crawling = false;
  let collectedPosts = [];
  let seenShortcodes = new Set();
  let crawlLimit = 50;
  let scrollDelay = 1500;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function extractPostData(node) {
    try {
      // React fiber key — works across most IG builds
      const fiberKey = Object.keys(node).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
      if (!fiberKey) return null;

      let fiber = node[fiberKey];
      // Walk up the fiber tree looking for post props
      for (let i = 0; i < 40; i++) {
        const props = fiber?.memoizedProps;
        if (props?.node && props.node.shortcode) return normalizeNode(props.node);
        if (props?.media && props.media.shortcode) return normalizeNode(props.media);
        fiber = fiber?.return;
        if (!fiber) break;
      }
    } catch (_) {}
    return null;
  }

  function normalizeNode(n) {
    return {
      shortcode: n.shortcode,
      username: n.owner?.username || n.user?.username || null,
      caption: n.edge_media_to_caption?.edges?.[0]?.node?.text || n.caption?.text || "",
      likes: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? n.like_count ?? null,
      comments: n.edge_media_to_comment?.count ?? n.comment_count ?? null,
      timestamp: n.taken_at_timestamp ?? n.taken_at ?? null,
      type: n.__typename || n.media_type_name || "GraphImage",
      thumbnailUrl: n.thumbnail_src || n.display_url || null,
      postUrl: `https://www.instagram.com/p/${n.shortcode}/`,
    };
  }

  function scrapeVisiblePosts() {
    const results = [];
    // Article tags wrap each post in feed / explore / profile grids
    const articles = document.querySelectorAll("article, div[role='button'] a[href*='/p/'], a[href*='/p/']");
    articles.forEach((el) => {
      const data = extractPostData(el);
      if (data && !seenShortcodes.has(data.shortcode)) {
        seenShortcodes.add(data.shortcode);
        results.push(data);
      }
    });

    // Fallback: parse shortcodes from <a href="/p/…/"> links
    if (results.length === 0) {
      document.querySelectorAll("a[href*='/p/']").forEach((a) => {
        const match = a.href.match(/\/p\/([A-Za-z0-9_-]+)/);
        if (match && !seenShortcodes.has(match[1])) {
          seenShortcodes.add(match[1]);
          const img = a.querySelector("img");
          results.push({
            shortcode: match[1],
            username: null,
            caption: img?.alt || "",
            likes: null,
            comments: null,
            timestamp: null,
            type: "GraphImage",
            thumbnailUrl: img?.src || null,
            postUrl: `https://www.instagram.com/p/${match[1]}/`,
          });
        }
      });
    }

    return results;
  }

  async function runCrawl() {
    collectedPosts = [];
    seenShortcodes = new Set();

    // Load any previously stored posts for the session
    const stored = await chrome.storage.local.get("crawledPosts");
    if (stored.crawledPosts?.length) {
      collectedPosts = stored.crawledPosts;
      stored.crawledPosts.forEach((p) => seenShortcodes.add(p.shortcode));
    }

    let noNewCount = 0;

    while (crawling && collectedPosts.length < crawlLimit) {
      const before = collectedPosts.length;
      const batch = scrapeVisiblePosts();
      collectedPosts.push(...batch);

      await chrome.storage.local.set({ crawledPosts: collectedPosts });
      chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS", posts: collectedPosts });

      if (collectedPosts.length === before) {
        noNewCount++;
        if (noNewCount >= 5) break; // no new posts after 5 scrolls — assume end of feed
      } else {
        noNewCount = 0;
      }

      window.scrollBy({ top: window.innerHeight * 1.2, behavior: "smooth" });
      await sleep(scrollDelay);
    }

    crawling = false;
    chrome.runtime.sendMessage({ type: "CRAWL_DONE", posts: collectedPosts });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "START_CRAWL") {
      if (crawling) return;
      crawlLimit = msg.limit || 50;
      scrollDelay = msg.delay || 1500;
      crawling = true;
      runCrawl().catch((err) => {
        crawling = false;
        chrome.runtime.sendMessage({ type: "CRAWL_ERROR", error: err.message });
      });
      sendResponse({ started: true });
    }

    if (msg.action === "STOP_CRAWL") {
      crawling = false;
      sendResponse({ stopped: true });
    }
  });
})();
