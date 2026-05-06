# Instagram Posts Crawler

A Chrome extension that collects Instagram posts from hashtag search pages by passively intercepting API responses as you scroll. No automation, no bot detection risk — it only reads data that your browser already fetches.

> **Requires Chrome 111 or newer**

---

## How It Works

When you open a hashtag search page on Instagram, the browser makes API calls to load posts. This extension intercepts those responses in the background and saves the post data to local storage. The more you scroll, the more posts get collected — no extra clicks needed.

---

## Installation

1. [Download this repository](https://github.com/dwisulfahnur/ig-crawler-chrome-extension/archive/refs/heads/main.zip)
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The extension icon will appear in your browser toolbar

To apply any code changes, click the **↺ refresh** icon on the extension card in `chrome://extensions`.

---

## Usage

### 1. Open a Hashtag Page

Make sure you are logged in to Instagram, then navigate to:

```
https://www.instagram.com/explore/search/keyword/?q=%23{hashtag}
```

Replace `{hashtag}` with the hashtag you want to crawl. For example:

```
https://www.instagram.com/explore/search/keyword/?q=%23nature
```

The extension also works on classic hashtag pages:

```
https://www.instagram.com/explore/tags/{hashtag}/
```

### 2. Scroll to Collect

Scroll down the page normally. Instagram will load more posts as you scroll, and the extension captures each batch automatically. The popup badge updates in real time as posts are collected.

### 3. Open the Popup

Click the extension icon in the toolbar to see:

- The active hashtag being crawled
- How many posts have been collected
- A live preview of the most recent posts

### 4. Export to CSV

Click **Export CSV** to download the collected data. The file is named after the hashtag, for example `instagram_%23nature.csv`.

Click **Clear Data** to reset and start a new session.

---

## CSV Fields

Each row in the exported CSV contains the following fields:

| Field | Description |
|---|---|
| `id` | Post ID (`pk`) |
| `shortcode` | Post shortcode, used in the post URL |
| `timestamp` | Unix epoch timestamp |
| `tanggal` | Date in `YYYY-MM-DD` format (local timezone) |
| `jam` | Time in `HH:MM` format (local timezone) |
| `from_id` | Author user ID |
| `from_user` | Author username |
| `from_avatar` | Author profile picture URL |
| `author_id` | Author user ID (same as `from_id`) |
| `author_username` | Author username (same as `from_user`) |
| `author_name` | Author display name |
| `author_avatar` | Author profile picture URL (same as `from_avatar`) |
| `author_bio` | Author bio (not available from this endpoint, always empty) |
| `author_stats_followers` | Follower count (not available from this endpoint, always 0) |
| `caption` | Full post caption text |
| `url` | Direct link to the post |
| `tagged_users` | Usernames of people tagged in the photo (space-separated) |
| `tags` | Hashtags extracted from caption text (space-separated) |
| `video` | Video URL (only for video posts) |
| `image` | Thumbnail/cover image URL |
| `type` | Media type: `photo`, `video`, or `album` |
| `comments_count` | Number of comments |
| `likes_count` | Number of likes |
| `views_count` | Number of video views |
| `engage_score` | `likes_count + comments_count` |
| `location` | Location name tagged on the post |
| `is_geo` | `true` if a location is tagged |
| `hashtag` | The hashtag that was searched when this post was collected |

---

## Notes

- Data is stored locally in your browser (`chrome.storage.local`) and never sent anywhere
- The popup can be closed while collecting — data continues to accumulate in the background as you scroll
- Re-opening the popup on the same hashtag page will show all previously collected posts for that hashtag
- Duplicate posts (same shortcode) are automatically skipped
- The CSV is BOM-prefixed UTF-8 so it opens correctly in Microsoft Excel
