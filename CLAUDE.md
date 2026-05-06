# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Manifest V3 Chrome extension that passively collects Instagram posts by intercepting API responses as the user scrolls a hashtag search page. Requires Chrome 111+ (for `world: "MAIN"` content scripts).

**Target URL:** `https://www.instagram.com/explore/search/keyword/?q=%23{hashtag}`
Also works on: `https://www.instagram.com/explore/tags/{hashtag}/`

## No build step

Plain JS/HTML/CSS — no npm, no bundler. Edit files and reload the extension.

## Loading / reloading in Chrome

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this directory
3. After any code change: click the **↺** refresh icon on the extension card (or toggle it off/on)

## Architecture

| File | World | Timing | Role |
|---|---|---|---|
| `injected.js` | `MAIN` | `document_start` | Wraps `window.fetch` and `XMLHttpRequest` before Instagram's code runs; forwards raw JSON to isolated world via `window.postMessage` |
| `content.js` | `ISOLATED` | `document_start` | Receives `postMessage`, parses posts, deduplicates, saves to `chrome.storage.local`, notifies runtime |
| `background.js` | service worker | — | Relays `CRAWL_PROGRESS` from content script to popup (popup may be closed) |
| `popup.html/css/js` | — | — | Reads storage, shows live count + preview, exports CSV |

## Data flow

```
Instagram page (fetch/XHR)
  → injected.js intercepts response
  → window.postMessage({ __igCrawler, url, data })
  → content.js parses + deduplicates + saves to chrome.storage.local
  → chrome.runtime.sendMessage({ type: "CRAWL_PROGRESS" })
  → background.js relays → popup.js refreshes
```

## Instagram API response shapes handled in `content.js`

Instagram serves different JSON shapes depending on the endpoint. `extractPosts()` tries all of them:

| Shape | Endpoint pattern | Structure |
|---|---|---|
| **V1 sections** | `/api/v1/fbsearch/`, `/api/v1/tags/*/sections/` | `sections[].layout_content.medias[].media` |
| **GraphQL** | `/graphql/query` | `data.hashtag.edge_hashtag_to_media.edges[].node` |
| **Flat items** | some `/api/v1/` endpoints | `items[]` |

`normalizeV1()` handles Web API v1 media objects (`media.code` = shortcode, `media.like_count`, `media.user.username`, etc.).
`normalizeGQL()` handles GraphQL nodes (`node.shortcode`, `node.edge_liked_by.count`, `node.owner.username`, etc.).

## Post data shape (stored + exported)

```js
{
  shortcode,    // Instagram post ID (used for deduplication)
  username,
  caption,      // newlines replaced with spaces
  likes,
  comments,
  timestamp,    // Unix epoch seconds (null if unavailable)
  mediaType,    // "Photo" | "Video" | "Album" | GraphQL __typename
  hashtag,      // e.g. "#nature" — taken from URL at collection time
  postUrl,      // https://www.instagram.com/p/{shortcode}/
  thumbnailUrl
}
```

## Storage

All posts are stored in a single `chrome.storage.local` key: `crawledPosts` (array).
The popup filters by `post.hashtag === activeHashtag` to show only the current search's results.

## CSV export

- BOM-prefixed UTF-8 (`﻿`) so Excel opens it correctly
- Filename: `instagram_{hashtag}.csv`
- Columns: `shortcode, username, caption, likes, comments, timestamp, mediaType, hashtag, postUrl`

## Key constraint

`injected.js` **must** run at `document_start` in `world: "MAIN"` to wrap `fetch`/XHR before Instagram registers its own handlers. If Instagram loads first, the interception is missed for the initial page load (though scroll-triggered API calls will still be caught).
