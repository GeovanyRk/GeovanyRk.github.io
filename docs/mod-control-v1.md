# Geo Army Control Room V1

Controlled pilot. Backend already installed in Supabase project geoarmy. No other services modified.

## VPS integration (required before live use)
- Use existing secure Twitch broadcaster OAuth flow. Verify token belongs to broadcaster ID 265793827 and includes moderation:read. Do not alter Plus credentials or scopes. Obtain separate consent if missing.
- Fetch complete paginated GET https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=265793827 (first=100); fetch live status using GET /helix/streams?user_id=265793827.
- Every 30 seconds, after BOTH calls succeed completely, use existing server-side Supabase service client: rpc('ga_mc_sync_v1',{p_ids: moderator IDs as strings,p_live: true/false}). Empty roster only when Twitch confirms zero mods. Never publish a partial/error snapshot. Permissions fail closed after 2 minutes. Never log tokens. No public route required.
- On EventSub moderator add/remove, trigger a fresh complete snapshot; no change to existing event processing.
- Do not enable production until owner has configured OBS and tested the panel.

## OBS
Owner logs in to mod-control.html, generates private URL, adds Browser Source at stream canvas dimensions, enables audio handling in OBS. URL includes a secret fragment; never share it. Browser overlay polls once/second while active, clears on error and at effect expiration. Owner enables manually; live Twitch heartbeat required. Stop cancels effects and disables system.

## Current scope
22 original starter effects (16 animated emoji reactions and 6 synthesized sound effects), private library, search/filter, favorites, position/size/volume/duration/animation, serialized queue and history, suspend/restore, kill switch, URL rotation. No GIPHY, external meme media, upload approvals, or transparent video files yet. External media requires provider key, license review and safe storage/approval flow. Do not insert arbitrary URLs.

## Multimedia extension
Private bucket geoarmy-control-media; 4 MiB max, 10 proposals per user/day (application-level). Mod uploads require source and rights confirmation; owner reviews, approves, rejects or disables approved media. Uploaded SVG/HTML disallowed; built-in original SVG assets are repository-controlled. File signatures checked, not full malware scanning or codec validation. Signed links are short-lived. OBS keeps the same private URL; refresh the browser source after deployment. GIPHY API not connected yet.

## GIPHY beta
Search/trending GIFs and stickers directly from the authenticated moderator browser, separate grid, PG rating, source attribution and view/click/send analytics. GIPHY_API_KEY is stored in Edge Functions secrets, provided only after server-side permission checks, but necessarily visible to authorized browsers (GIPHY disallows proxying). No public repo key or media cache. Owner-only offline OBS test stores a single short-lived content ID, never GIPHY media or search results; OBS fetches by ID from GIPHY directly. No live GIPHY launches until provider production approval and relevant media rights confirmed. Official attribution mark still needs installation if unavailable from the provider download. No clips/audio in this beta. Refresh the OBS browser source; do not rotate its URL.

## Soundboard and GIF + sound beta
Soundboard lists approved audio, previews locally, and uses existing owner offline tests and live queue controls. Owner can import five fixed, license-reviewed recordings from Wikimedia Commons into private Storage; the import is idempotent and reports per-file failures. Source and license links appear on sound cards. GIF combo test pairs a GIPHY ID with an active audio asset, starts independent audio when the GIF renders, and stops both on expiration or emergency stop. GIPHY combos remain owner-only and offline pending provider approval. Clips API access is still pending. Refresh OBS source without rotating its URL.

## Real sound catalog expansion
The six synthetic audio assets are inactive (historical references preserved). The owner can import 56 curated Commons candidates in batches of five. Server retrieves file metadata and accepts only CC0, public domain or CC BY with an author; it verifies source host, size and signature, stores private audio, records credits and sound group, skips unsupported licenses and retired assets. Import is retryable and reports results, not all candidates are guaranteed to pass. Soundboard filters by group and displays real files only. No live launch changes.
