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

`extractPosts()` tries all known shapes in priority order:

| Shape | Endpoint | Path |
|---|---|---|
| **Primary** — xdt_fbsearch serp | `POST /graphql/query` | `data.xdt_fbsearch__top_serp_graphql.edges[].node.items[]` |
| **Fallback A** — V1 sections | `/api/v1/tags/*/sections/` | `sections[].layout_content.medias[].media` |
| **Fallback B** — flat items | various `/api/v1/` | `items[]` |

All shapes feed through a single `normalizeItem()` function.

**Key field mappings from primary shape:**

| Output field | Source |
|---|---|
| `id` | `item.pk` |
| `shortcode` | `item.code` |
| `from_id` / `author_id` | `item.user.pk` |
| `from_user` / `author_username` | `item.user.username` |
| `author_name` | `item.user.full_name` |
| `from_avatar` / `author_avatar` | `item.user.profile_pic_url` |
| `image` | `item.image_versions2.candidates[0].url` |
| `video` | `item.video_versions[0].url` (only when `media_type === 2`) |
| `likes_count` | `item.like_count` |
| `comments_count` | `item.comment_count` |
| `views_count` | `item.view_count` (0 if null) |
| `engage_score` | `likes_count + comments_count` |
| `tags` | hashtags extracted from `caption.text` (e.g. `"#nature #travel"`) |
| `tagged_users` | `item.usertags.in[].user.username` (null if none) |
| `type` | `"photo"` / `"video"` / `"album"` from `media_type` (1/2/8) |
| `tanggal` | `taken_at` formatted as `YYYY-MM-DD` (local timezone) |
| `jam` | `taken_at` formatted as `HH:MM` (local timezone) |

## Storage

All posts stored in `chrome.storage.local` under key `crawledPosts` (flat array).
Deduplication key is `shortcode`. Popup filters by `post.hashtag === activeHashtag`.

## CSV export

- BOM-prefixed UTF-8 so Excel opens it correctly
- Filename: `instagram_{hashtag}.csv`
- Columns (28 total): `id, shortcode, timestamp, tanggal, jam, from_id, from_user, from_avatar, author_id, author_username, author_name, author_avatar, author_bio, author_stats_followers, caption, url, tagged_users, tags, video, image, type, comments_count, likes_count, views_count, engage_score, location, is_geo, hashtag`

The reference for expected field shape is `expected_field_result.json`.

## Key constraint

`injected.js` **must** run at `document_start` in `world: "MAIN"` to wrap `fetch`/XHR before Instagram registers its own handlers. If Instagram loads first, the interception is missed for the initial page load (though scroll-triggered API calls will still be caught).
