# Direct Meta with Facebook Login

Meta stopped offering **API setup with Instagram login** on apps created in
October 2026: a new app's "Manage messaging & content on Instagram" use case only
shows **API setup with Facebook login**, and `www.instagram.com/oauth/authorize`
answers "Invalid platform app" for it. This fork can run the direct provider on
the Instagram API with Facebook Login instead.

## How it differs

- The Instagram professional account must be linked to a Facebook Page.
- Connect signs in with Facebook. Every Page the user grants that has a linked
  Instagram account becomes a connected account.
- Each account stores its Page access token. Derived from a long-lived user
  token it does not expire, so `tokenExpiresAt` stays empty and the refresh cron
  skips it. Reconnect if the Page token is revoked (password change, removed
  admin, app removed).
- Calls go to `graph.facebook.com`. Messages and conversations go through the
  Page (`me` with the Page token); media and insights through the Instagram
  account ID. Webhook payloads are unchanged: `entry.id` is still the Instagram
  account ID.

## Environment

| Variable | Value |
| --- | --- |
| `META_LOGIN_MODE` | `facebook` |
| `INSTAGRAM_APP_ID` | The Facebook **App ID** (App settings, Basic) |
| `INSTAGRAM_APP_SECRET` | The Facebook **App secret** |
| `FACEBOOK_APP_SECRET` | The same App secret (webhook signatures) |
| `META_FB_LOGIN_CONFIG_ID` | Optional. A Facebook Login for Business configuration ID; when set it replaces the scope list. |

Set them on both the web app and the worker.

## Meta app

1. Facebook Login for Business, Settings: add
   `https://<your-domain>/api/instagram/callback` to Valid OAuth Redirect URIs.
2. Permissions: `instagram_basic`, `instagram_manage_comments`,
   `instagram_manage_messages`, `instagram_manage_insights`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`,
   `business_management`.
3. Webhooks, Instagram object: callback `https://<your-domain>/api/webhook`,
   verify token `WEBHOOK_VERIFY_TOKEN`, fields `comments`, `messages`,
   `messaging_postbacks`, `messaging_seen`.
4. In the Instagram app: Settings, Messages and story replies, Message controls,
   Connected tools, turn on **Allow access to messages**. Without it no message
   webhooks arrive and nothing reports an error.
5. Publish the app. Accounts whose Facebook user has a role on the app work with
   Standard Access; anyone else needs App Review.
