import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy - PAKLAB REPLY",
  description:
    "How PAKLAB REPLY handles Instagram account data, webhook payloads, billing data, and customer campaign information.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="How PAKLAB REPLY handles Instagram data for the businesses that use it and the people who message them."
      updatedAt="October 9, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-foreground">Who We Are</h2>
        <p className="mt-3">
          PAKLAB REPLY is operated by Daybreak Ltd. (珬曙工作有限公司), Taipei, Taiwan, for the Instagram accounts of its own brands.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Data We Collect</h2>
        <p className="mt-3">
          For people who run the service: sign-in email addresses, workspace settings, connected Instagram account identifiers and encrypted access tokens, campaign and message settings, and operational logs.
        </p>
        <p className="mt-3">
          For people who interact with a connected Instagram account: the Instagram-scoped user ID, the username when Instagram provides it, the text of comments and direct messages sent to that account, the time of the last message or comment, tags the business assigns, delivery logs of the replies sent, link clicks on tracked links (a hashed identifier, not the IP address in clear), and whether the person asked to stop automated messages.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">How We Use Data</h2>
        <p className="mt-3">
          To match keywords and answer comments and direct messages on the business’s behalf through the official Meta APIs, to respect the 24-hour messaging window and opt-out requests, to pause automation while a staff member replies by hand, to prevent duplicate messages, to show the business its conversations and campaign results, and to keep the service secure. We do not sell data or use it for advertising.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Instagram And Meta Data</h2>
        <p className="mt-3">
          PAKLAB REPLY never asks for Instagram passwords, does not scrape Instagram and does not use browser automation. Access tokens are encrypted at rest and used only for actions the connected business account authorized. Automated messages are sent only within 24 hours of the person’s own message; anyone can send STOP to stop them and START to turn them back on.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Service Providers</h2>
        <p className="mt-3">
          Hosting, database and queue providers (Vercel, Railway, PostgreSQL, Redis) process data only to run the service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Retention And Deletion</h2>
        <p className="mt-3">
          Delivery logs and contact records are kept while the Instagram account stays connected. Disconnecting the account deletes its contacts, campaigns and logs. To have your own data deleted, follow the Data Deletion page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Contact</h2>
        <p className="mt-3">
          Send a direct message to the Instagram account you interacted with, or contact Daybreak Ltd. through the business that operates that account.
        </p>
      </section>

    </LegalShell>
  );
}
