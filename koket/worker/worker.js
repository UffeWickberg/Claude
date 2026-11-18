// Cloudflare Worker: hämtar familjens iCloud-kalendrar och lämnar dem till köksskärmen.
//
// Varför behövs den? iCloud tillåter inte att en webbsida läser kalenderlänken direkt (CORS),
// och kalenderlänkarna ska inte ligga öppet i koden. Workern håller länkarna hemliga.
//
// Hemligheter (Settings → Variables and Secrets, typ "Secret"):
//   KEY              – ett långt slumpat lösenord, samma som ?key= på iPaden
//   ICS_FAMILJ       – webcal://…-länken till familjekalendern
//   ICS_MEDDELANDEN  – webcal://…-länken till kalendern "Meddelanden"
// Fler kalendrar: lägg till ICS_<ID> och motsvarande rad i config.js.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (!env.KEY || url.searchParams.get('key') !== env.KEY) {
      return new Response('Fel nyckel', { status: 403, headers: cors });
    }

    const match = url.pathname.match(/^\/ics\/([a-z0-9_-]+)$/i);
    const source = match && env['ICS_' + match[1].toUpperCase()];
    if (!source) return new Response('Okänd kalender', { status: 404, headers: cors });

    const upstream = await fetch(source.trim().replace(/^webcal:/i, 'https:'), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Kitchen display)' },
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    if (!upstream.ok) {
      return new Response(`iCloud svarade ${upstream.status}`, { status: 502, headers: cors });
    }
    return new Response(await upstream.text(), {
      headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};
