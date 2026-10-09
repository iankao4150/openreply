import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion - PAKLAB REPLY",
  description:
    "How PAKLAB REPLY customers can disconnect Instagram and request account or campaign data deletion.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Data Deletion"
      description="How to have your data deleted from PAKLAB REPLY."
      updatedAt="October 9, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-foreground">If You Messaged Or Commented On An Account</h2>
        <p className="mt-3">
          Send a direct message to that Instagram account asking for your data to be deleted. We delete your contact record, tags and the logs of messages sent to you within 30 days. If you asked not to receive automated messages, we keep only that choice, so it stays respected. To only stop automated messages, send STOP.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">If You Run A Connected Account</h2>
        <p className="mt-3">
          Sign in, open Settings and select Disconnect. This deletes the stored Instagram connection token together with the account’s contacts, campaigns and delivery logs, and stops all automated replies. To delete your whole workspace, ask the workspace owner or contact Daybreak Ltd.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-foreground">Verification</h2>
        <p className="mt-3">
          We may ask you to confirm control of the Instagram account or sign-in email before deleting data. Requests are handled as quickly as practical unless a record must be kept for legal or security reasons.
        </p>
      </section>

    </LegalShell>
  );
}
