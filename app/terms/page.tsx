import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service - PAKLAB REPLY",
  description:
    "Terms for using PAKLAB REPLY’s Instagram comment-to-DM campaign software.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      description="Terms for using PAKLAB REPLY, the Instagram comment and direct message auto-reply service."
      updatedAt="October 9, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-foreground">Who We Are</h2>
        <p className="mt-3">
          PAKLAB REPLY is operated by Daybreak Ltd. (珬曙工作有限公司), Taipei, Taiwan, for the Instagram accounts of its own brands.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Authorized Use</h2>
        <p className="mt-3">
          PAKLAB REPLY may be used only with Instagram professional accounts you own or are authorized to manage. You are responsible for the campaigns, keywords, links and messages you configure.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Platform Compliance</h2>
        <p className="mt-3">
          You agree to follow the Meta Platform Terms, Instagram policies and messaging rules, privacy laws, advertising rules and anti-spam laws. Campaigns that create compliance, abuse, security or deliverability risk may be paused or disabled.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Availability</h2>
        <p className="mt-3">
          The service depends on Meta and on hosting, database and queue providers. We work to run it reliably, but uninterrupted availability is not guaranteed.
        </p>
      </section>

    </LegalShell>
  );
}
