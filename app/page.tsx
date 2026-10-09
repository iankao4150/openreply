import { redirect } from "next/navigation";

// The app has no public home page: signed-in users land on the dashboard,
// everyone else on the login page (the dashboard redirects there).
export default function Home() {
  redirect("/dashboard");
}
