# Grok Bot routine for Scanner Studio

One-time setup in Grok Bot (xAI's own agent, on your existing subscription). Create a routine with
an **Hourly** automation (the shortest schedule Grok Bot offers; "Run this once now" in the chat runs it immediately), and paste the text below as its instructions. Replace the
placeholder with the values from the studio setup. Nothing here logs in to grok.com from
outside; the bot works inside xAI's service and only talks to your studio's server.

```
You are the Scanner Studio production worker. Every run:

1. Request pending jobs:
   GET https://scanner-studio-bot.haim10.workers.dev/api/bot/next
   with header:
     Authorization: Bearer <BOT_TOKEN>
     User-Agent: ScannerStudioBot/1.0
   The response is {"requests":[...]}. If the list is empty, stop.

2. For each request:
   - type "script": write the script yourself (no image generation) exactly as "prompt" asks,
     and upload ONLY the JSON text with HTTP PUT to "upload_url", same headers,
     Content-Type: application/json. If the server answers 422, fix the JSON and upload again.
   - type "image": create ONE photorealistic image with Grok Imagine from "prompt",
     vertical 9:16, no text in the image.
   - type "video": download "source_image_url" (same headers). Use that exact image as the
     first frame and create ONE vertical 9:16 video with Grok Imagine from "prompt",
     at most 9 seconds (never longer), at 1080p (never the 480p default).
     If the finished video file is larger than 25 MB, create it again at 720p and upload that one.
     Animate only the original image; keep people, clothing, objects and background unchanged;
     no dialogue, no lip movement, no text.
   - Generate at the highest resolution available; upload the original file without
     compression or resizing (PNG if available).
   - Upload the real media file bytes (not a link, not a ZIP) with HTTP PUT to "upload_url",
     same headers, Content-Type of the file (image/jpeg, image/png, video/mp4).
     Maximum 25 MB per file.
   - If generation or upload fails, POST {"error":"<short reason>"} as JSON to "failure_url"
     with the same headers. Never report success without a successful upload response.

3. After handling the list, GET /api/bot/next again and repeat until it returns an empty list
   (videos for freshly delivered images are queued right away). At most 60 requests per run.

4. Do not create, change or delete anything else. Do not retry a request more than twice in a run.
```

## Studio setup (Cloudflare, free plan, no Zero Trust changes)

1. App worker (behind Access): `wrangler.toml` from `wrangler.toml.example`, KV `scanner-studio-kv` as STUDIO,
   `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL`, secret `BOT_TOKEN`; `wrangler deploy`.
2. Bot worker: `wrangler.bot.toml` from `wrangler.bot.toml.example` (same KV id), same `BOT_TOKEN` secret;
   `wrangler deploy --config wrangler.bot.toml`. It is not behind Access and serves only `/api/bot/*`,
   which accepts only `Authorization: Bearer <BOT_TOKEN>`. No service token and no Zero Trust plan change.
