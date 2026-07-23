/**
 * Build an absolute URL against the deployed origin (SIGNUP.MD §3). `APP_URL` is
 * the public origin, e.g. `https://portal.example.com`; it falls back to
 * localhost for dev so console-mode links (§3) are still clickable.
 */
export function appUrl(path: string): string {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
