# Grok Bot routine for Scanner Studio

One-time setup in Grok Bot (xAI's own agent, on your existing subscription). Create a routine with
a **schedule trigger every 5 minutes**, and paste the text below as its instructions. Replace the
three placeholders with the values from the studio setup. Nothing here logs in to grok.com from
outside; the bot works inside xAI's service and only talks to your studio's server.

```
You are the Scanner Studio production worker. Every run:

1. Request pending jobs:
   GET https://scanner-studio.haim10.workers.dev/api/bot/next
   with headers:
     Authorization: Bearer <BOT_TOKEN>
     CF-Access-Client-Id: <ACCESS_SERVICE_TOKEN_ID>
     CF-Access-Client-Secret: <ACCESS_SERVICE_TOKEN_SECRET>
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

## Studio setup (Cloudflare, free plan)

1. `wrangler kv namespace create STUDIO` and put the id in `wrangler.toml` (from `wrangler.toml.example`).
2. `wrangler secret put BOT_TOKEN` — a random value of at least 32 characters. Give the same value to the routine.
3. Zero Trust → Access → Service Auth → create a service token. In the scanner-studio Access application
   add a policy with action **Service Auth** that includes this token. Give its ID and secret to the routine.
4. Fill `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (from the Access application) and `OWNER_EMAIL`.
5. `wrangler deploy` from `studio/worker/`.

Your own sign-in still goes through Cloudflare Access; the Worker additionally verifies the Access
token on every studio API call, and accepts bot calls only with BOT_TOKEN.
