# PAKLAB REPLY

Instagram comment and direct-message auto-replies for PAKLAB's brands (first:
OFSYD, @ofsyd.co). Runs on the official Instagram API with Facebook Login.

- Web dashboard and webhooks: Next.js on Vercel (`ofsyd-reply.vercel.app`)
- Worker: BullMQ on Railway (`npm run worker`), with Postgres and Redis

## Features

Keyword comment campaigns with public and private replies, message modules
(carousel cards, buttons that send other modules, quick replies) with tracked
links and per-card click stats, DM rules (keyword, default reply, story mention,
ice breakers) with schedules, cooldowns and business hours, the DM menu,
contacts with tags, broadcasts to people inside the 24-hour window, comment
giveaways, hidden-word comment moderation, STOP/START opt-out and automatic
pause while staff reply by hand. Details and the Meta rules each feature
follows: [docs/omnichat-features.md](docs/omnichat-features.md).

## Development

```bash
npm install
npx prisma migrate dev
npm run dev
npm run worker
npm test
```

Production migrations run in the Vercel build (`prisma migrate deploy`); deploy
the worker in the same release when a migration changes existing columns.

## License

MIT — see [LICENSE](LICENSE).
