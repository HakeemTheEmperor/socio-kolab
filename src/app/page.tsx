import { redirect } from "next/navigation";

// Middleware sends unauthenticated visitors to /login; authenticated ones
// continue to /dashboard (where the pending-approval gate applies).
export default function Home() {
  redirect("/dashboard");
}
