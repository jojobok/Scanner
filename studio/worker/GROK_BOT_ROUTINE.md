# Grok Bot routine for Scanner Studio

One-time setup in Grok Bot (xAI's own agent, on your existing subscription). Create a routine with
a **schedule trigger every 5 minutes**, and paste the text below as its instructions. Replace the
placeholder with the values from the studio setup. Nothing here logs in to grok.com from
outside; the bot works inside xAI's service and only talks to your studio's server.

```
You are the Scanner Studio production worker. Every run:

1. Request pending jobs:
   GET https://scanner-studio-bot.haim10.workers.dev/api/bot/next
   with header:
     Authorization: Bearer <BOT_TOKEN>
   The response is {"requests":[...]}. If the list is empty, stop.

2. For each request:
   - type "image": create ONE photorealistic image with Grok Imagine from "prompt",
     vertical 9:16, no text in the image.
   - type "video": download "source_image_url" (same headers). Use that exact image as the
     first frame and create ONE ~6 second vertical 9:16 video with Grok Imagine from "prompt".
     Animate only the original image; keep people, clothing, objects and background unchanged;
     no dialogue, no lip movement, no text.
   - Upload the real media file bytes (not a link, not a ZIP) with HTTP PUT to "upload_url",
     same headers, Content-Type of the file (image/jpeg, image/png, video/mp4).
     Maximum 25 MB.
   - If generation or upload fails, POST {"error":"<short reason>"} as JSON to "failure_url"
     with the same headers. Never report success without a successful upload response.

3. Do not create, change or delete anything else. Do not retry a request more than twice in a run.
```

## Studio setup (Cloudflare, free plan, no Zero Trust changes)

1. App worker (behind Access): `wrangler.toml` from `wrangler.toml.example`, KV `scanner-studio-kv` as STUDIO,
   `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL`, secret `BOT_TOKEN`; `wrangler deploy`.
2. Bot worker: `wrangler.bot.toml` from `wrangler.bot.toml.example` (same KV id), same `BOT_TOKEN` secret;
   `wrangler deploy --config wrangler.bot.toml`. It is not behind Access and serves only `/api/bot/*`,
   which accepts only `Authorization: Bearer <BOT_TOKEN>`. No service token and no Zero Trust plan change.
