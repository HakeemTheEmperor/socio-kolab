import { redirect } from "next/navigation";

// There is no global home page: every club lives under /{clubSlug}. The proxy
// sends unauthenticated visitors to /login; authenticated ones pick a club.
export default function Home() {
  redirect("/clubs");
}
