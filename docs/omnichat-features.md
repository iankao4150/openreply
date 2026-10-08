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
- **Default reply**: any DM no keyword rule matched (a welcome message, or an
  away message when limited to outside business hours). At most once a day per
  person unless the rule sets its own cooldown.
- **Story mention**: someone tags the account in their story. Answered at most
  once a day per person unless the rule sets its own cooldown. Only public
  accounts, or private accounts that follow you, produce the webhook.
- **Ice breaker**: up to 4 questions Instagram shows when someone opens a new
  chat; published through `POST /me/messenger_profile?platform=instagram`
  (`ice_breakers` with `call_to_actions` + `locale: default`). A tap is a
  postback `rule:<id>`. The Messenger Profile API allows 10 calls per 10
  minutes per Page.
- Options: cooldown (same person), once per person, start/end schedule,
  business hours (any time / only inside / only outside the account's hours,
  set in Settings with a time zone), and tags added to the people it answers.
- One inbound DM gets at most one reply: the oldest matching rule answers.
  Overlapping rules are flagged when saving and in the list.

## Contacts and tags (`/contacts`)

Every commenter on a watched post, and everyone who messages the account, taps
a button or mentions it in a story, is recorded from the webhooks. A message
(not a comment) opens Instagram's 24-hour window, shown per person. Campaigns
and rules can tag the people they answer; tags can also be edited by hand.
Export as CSV (cells that would run as spreadsheet formulas are escaped).

## Broadcasts (`/broadcasts`)

Send a module to the contacts whose 24-hour window is open, optionally only
those with a tag. Automated messages outside the window would need a message
tag, which automation may not use, so nobody else is offered. The window is
checked again before each send with a ten-minute margin; people who sent STOP
or are chatting with the team are skipped. Each recipient is claimed before
the send and never retried, batches of 25 run one after another (5,000 per
broadcast), and a broadcast can be stopped midway.

## Comment giveaway (`/giveaway`)

Reads every comment on a post (up to 10,000), keeps those that match the
rules (a keyword, tagging N friends, one entry per person, excluded accounts,
never the account itself) and picks winners with a crypto-grade random
source. Each draw is stored. Instagram's promotion guidelines (official rules,
a release saying Instagram is not involved, no inaccurate tagging) are shown
on the page.

## DM menu (Settings)

Up to 5 items (title 30) Instagram keeps next to the message box (app v226+).
Each opens a link or sends a module. Published with `persistent_menu` on the
same messenger profile endpoint.

## Campaign options

- Start/end schedule: outside it nothing new is answered; buttons in replies
  already sent keep working.
- Reply to each person once: later comments from them are skipped entirely.

## Human handover

Every automated send remembers the message id Meta returns (two days), and
marks the conversation for 30 seconds beforehand in case the echo arrives
before the id does. An echo (`message.is_echo`) that matches neither was
written by a person in the Instagram app or the inbox (inbox sends are never
remembered), so keyword, default and story-mention replies to that person
pause for the account's `humanPauseMinutes` (Settings; default 30, 0 = off).
Taps on our own buttons are still answered.

## Opt-out (Meta messaging policy 5.2)

A DM that is exactly `STOP`, `UNSUBSCRIBE`, `停止`, `取消訂閱`, `退訂`, … opts the
person out of every automated DM from the account (comments still get the
public reply, never a DM); `START` / `開始` opts back in. Both are confirmed;
START from someone who never opted out is treated as an ordinary message.
Taps on menus and buttons are explicit requests and are still answered. Opt-outs
are keyed by the Instagram account id, so they survive reconnecting.

## Other Meta limits the code respects

- 750 private replies per hour per account (Redis counter, overflow requeued).
- 24-hour window: replies only follow a person's own message, tap or mention;
  follow-ups are capped at 24 h. No message tags are used (HUMAN_AGENT is for
  people, not automation).
- Generic template: 10 elements, title/subtitle 80, 3 buttons, link and
  postback only. Templates and quick replies don't show on Instagram web.
- Text messages: at most 1000 UTF-8 bytes (about 333 Chinese characters);
  longer text is cut on a character boundary.

## Delivery safety

A send that may have reached the person (Meta code 1, a timeout, a 5xx) is
never retried; only explicit refusals are. Taps and story mentions are
claimed in the database before sending, so a re-delivered webhook sends
nothing. A module whose intro already went out is not resent if the cards
fail. Module links follow the card (by a stable id): reordering keeps them,
editing a URL fixes it in DMs already sent, and a removed card's link keeps
redirecting to its old target.

## App access

The app is Live with Standard Access. Comment webhooks from people without a
role on the app were received in production (2026-10-09). Meta's docs say
Advanced Access (App Review + business verification) is required to interact
with people who have no role; if DM webhooks from customers stop arriving, App
Review is the fix.
