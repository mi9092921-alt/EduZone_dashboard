# video-info

Supabase Edge Function that resolves YouTube metadata and downloadable stream URLs via the Replit-backed video API.

## Input

```json
{ "url": "https://youtu.be/VIDEO_ID" }
```

## Output

Returns top-level JSON matching the Flutter download/playback contract. Example:

```json
{
  "title": "Lesson Title",
  "thumbnail": "https://i.ytimg.com/...",
  "duration": 796,
  "channel": "Channel Name",
  "view_count": 44402,
  "audio": { ... },
  "formats": [ ... ],
  "default_download_quality": "360p",
  "cache_expires_at": "2026-06-30T12:00:00Z",
  "source": "fresh",
  "platform": "YouTube",
  "time_ms": 1358
}
```

## Notes

- `source == "stale"` should be surfaced as a subtle warning in Flutter.
- `requires_merge: false` means the video URL already includes audio and can be downloaded directly.
- `requires_merge: true` means Flutter must download both `video_url` and `audio.url` and merge them.
- YouTube URLs expire rapidly. Flutter must not persist these URLs long-term.
