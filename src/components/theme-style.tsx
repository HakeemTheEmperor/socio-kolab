import { DEFAULT_THEME, generateTheme, type ThemeColors } from "@/lib/theme";

/**
 * Server-renders a club's design tokens as CSS variables (UI-REFACTOR.md §A4).
 *
 * Because this is a server component the tokens are in the HTML on first paint —
 * no flash of unthemed content, and no client JS involved in theming at all.
 *
 * Layouts nest, so the club layout's block lands after the root layout's default
 * one in document order and wins the cascade. Anything outside `/{clubSlug}/`
 * therefore keeps the platform default: a club theme cannot leak onto /login,
 * /clubs, or /admin.
 */
export function ThemeStyle({ colors }: { colors?: ThemeColors | null }) {
  const { background, primary, accent } = colors ?? DEFAULT_THEME;
  const tokens = generateTheme(background, primary, accent);

  // Every value is a colord-normalized hex string, so there is nothing to escape.
  const css = `:root{${Object.entries(tokens)
    .map(([token, value]) => `${token}:${value}`)
    .join(";")}}`;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
