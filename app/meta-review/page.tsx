import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Meta App Review Support - PAKLAB REPLY",
  description: "How PAKLAB REPLY uses Instagram messaging permissions.",
};

export default function MetaReviewPage() {
  return (
    <LegalShell
      title="Meta App Review Support"
      description="How PAKLAB REPLY uses Instagram messaging permissions, for Meta App Review."
      updatedAt="October 9, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-foreground">What The App Does</h2>
        <p className="mt-3">
          PAKLAB REPLY is an internal tool of Daybreak Ltd. (珬曙工作有限公司) that answers customers of its own Instagram professional account (@ofsyd.co, the OFSYD clothing brand). When someone comments a keyword on a post, it sends a private reply with product information; when someone sends a direct message with a product keyword, taps a button in one of its replies, or mentions the account in a story, it answers in that conversation; and staff read and answer conversations in its inbox.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">How Messaging Rules Are Respected</h2>
        <p className="mt-3">
          Replies are sent only through the official Instagram API with Facebook Login. Automated messages go out only within 24 hours of the person’s own message, comment or tap, and no message tags are used. Each comment gets at most one private reply. Anyone can send STOP to stop automated messages and START to turn them back on. Automation pauses for a conversation while a staff member is replying by hand.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Review Test Notes</h2>
        <p className="mt-3">
          Sign in at /login with the reviewer account provided in the submission. Open DM auto-replies to see the keyword rule TEST. From any Instagram account, send TEST as a direct message to @ofsyd.co; the account replies within seconds and the reply appears in DM Logs and Inbox. Send STOP to see the opt-out confirmation and START to opt back in.
        </p>
      </section>
    </LegalShell>
  );
}
