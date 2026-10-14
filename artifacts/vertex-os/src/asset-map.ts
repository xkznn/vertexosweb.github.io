/** The offline single-file build embeds every local static asset as a data: URI
 *  in `globalThis.__VERTEX_ASSETS__`. assetUrl() prefers that map so icons,
 *  logos, fonts and wallpapers keep working with no network, and otherwise
 *  falls back to the normal base-prefixed path used by the hosted site. */
export function assetUrl(base: string, path: string): string {
  const map = (globalThis as { __VERTEX_ASSETS__?: Record<string, string> }).__VERTEX_ASSETS__;
  return (map && map[path]) || `${base}${path}`;
}
