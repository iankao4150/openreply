# OmniChat-style features (this fork)

What this fork adds on top of OpenReply, how each piece behaves, and the Meta
rules it is built around. Everything here runs on the direct Meta provider
(Facebook Login mode, see [facebook-login.md](facebook-login.md)); Zernio
connections fall back to plain text where noted.

## Message modules (`/modules`)

A reusable reply: an optional intro text, 1–10 carousel cards and up to 13
quick replies.

- Card: image (https), title (80), description (80), "tap image opens" link, up
  to 3 buttons. A button opens a link or sends another module (postback
  `mod:<moduleId>:<campaignId>`), which is how multi-step flows are built.
- Every card image link and link button gets a tracked redirect `/m/<slug>`
  with UTM tags (`utm_source/medium/campaign`, `utm_term=c<N>img|btn|btn2|btn3`);
  tags already on a link win. Clicks are counted per slot, per campaign and once
  per person.
- Quick replies go out as a short text message after the cards (Instagram only
  attaches quick replies to text). A tap arrives as a `messages` webhook with
  `quick_reply.payload` and sends the chosen module.
- A module can't be deleted while a campaign, rule, another module or a DM menu
  still points at it.

### Sending rules

| Where | What goes out |
| --- | --- |
| Comment, style **Cards** | The carousel as the single private reply. If Meta refuses it, the first card as a button message, then plain text. |
| Comment, style **Text first** | A plain-text private reply; the cards follow when the person writes back (within 24 h). Use this when many commenters don't follow the account. |
| DM keyword, story mention, ice breaker, button/quick-reply tap, DM menu | Intro text, cards, then quick replies — the conversation is open. |

Meta allows one private reply per comment, within 7 days, and nothing more
until the person replies. Whether templates are accepted as a private reply to
someone who does not follow the account is not documented; third parties report
they are refused and the reply is used up anyway, hence the text-first style.

## DM auto-replies (`/dm-keywords`)

Campaigns with `dmOnly` set, so logs, rate limits and analytics are shared.

- **Keyword**: a DM or story reply containing one of up to 10 words. Case is
  ignored; Chinese/Japanese/Korean/Thai keywords match inside a sentence.
- **Story mention**: someone tags the account in their story. Answered at most
  once a day per person unless the rule sets its own cooldown. Only public
  accounts, or private accounts that follow you, produce the webhook.
- **Ice breaker**: up to 4 questions Instagram shows when someone opens a new
  chat; published through `POST /me/messenger_profile?platform=instagram`
  (`ice_breakers` with `call_to_actions` + `locale: default`). A tap is a
  postback `rule:<id>`. The Messenger Profile API allows 10 calls per 10
  minutes per Page.
- Options: cooldown (same person), once per person, start/end schedule.
- One inbound DM gets at most one reply: the oldest matching rule answers.
  Overlapping rules are flagged when saving and in the list.

## DM menu (Settings)

Up to 5 items (title 30) Instagram keeps next to the message box (app v226+).
Each opens a link or sends a module. Published with `persistent_menu` on the
same messenger profile endpoint.

## Campaign options

- Start/end schedule: outside it nothing new is answered; buttons in replies
  already sent keep working.
- Reply to each person once: later comments from them are skipped entirely.

## Human handover

Every automated DM is marked in Redis for two minutes before it is sent. An
echo (`message.is_echo`) without that mark was written by a person in the
Instagram app or an inbox, so keyword and story-mention replies to that person
pause for the account's `humanPauseMinutes` (Settings; default 30, 0 = off).
Taps on our own buttons are still answered. Instagram echoes carry no app id,
which is why a time mark is used.

## Opt-out (Meta messaging policy 5.2)

A DM that is exactly `STOP`, `UNSUBSCRIBE`, `停止`, `取消訂閱`, `退訂`, … opts the
person out of every automated DM from the account (comments still get the
public reply, never a DM); `START` / `開始` opts back in. Both are confirmed.

## Other Meta limits the code respects

- 750 private replies per hour per account (Redis counter, overflow requeued).
- 24-hour window: replies only follow a person's own message, tap or mention;
  follow-ups are capped at 24 h. No message tags are used (HUMAN_AGENT is for
  people, not automation).
- Generic template: 10 elements, title/subtitle 80, 3 buttons, link and
  postback only. Templates and quick replies don't show on Instagram web.

## App access

The app is Live with Standard Access. Comment webhooks from people without a
role on the app were received in production (2026-10-09). Meta's docs say
Advanced Access (App Review + business verification) is required to interact
with people who have no role; if DM webhooks from customers stop arriving, App
Review is the fix.
