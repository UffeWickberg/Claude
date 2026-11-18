// Cloudflare Worker: hämtar familjens iCloud-kalendrar och lämnar dem till köksskärmen.
//
// Varför behövs den? iCloud tillåter inte att en webbsida läser kalenderlänken direkt (CORS),
// och kalenderlänkarna ska inte ligga öppet i koden. Workern håller länkarna hemliga.
//
// Hemligheter (Settings → Variables and Secrets, typ "Secret"):
//   KEY              – ett långt slumpat lösenord, samma som ?key= på iPaden
//   ICS_FAMILJ       – webcal://…-länken till familjekalendern
//   ICS_MEDDELANDEN  – webcal://…-länken till kalendern "Meddelanden"
//   OPENAI_API_KEY   – (valfritt) nyckel från platform.openai.com för "Kökets röst"
// Vanlig variabel (valfri):
//   OPENAI_MODEL     – modellnamn, standard "gpt-4o-mini"
//   OPENAI_REALTIME_MODEL – modell för röstsamtal, standard "gpt-realtime-mini"
//   OPENAI_VOICE     – röst för samtal, standard "marin"
// Fler kalendrar: lägg till ICS_<ID> och motsvarande rad i config.js.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (!env.KEY || url.searchParams.get('key') !== env.KEY) {
      return new Response('Fel nyckel', { status: 403, headers: cors });
    }

    if (url.pathname === '/ai' && request.method === 'POST') return voice(request, env, cors);
    if (url.pathname === '/voice/session' && request.method === 'POST') return voiceSession(request, env, cors);

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

// ——— Kökets röst ———
const PERSONA = `Du är "Köket" – familjens skärm i köket i en villa i Örebro. Du är varm, lugn,
lite kvick och aldrig tjatig, som en klok familjemedlem som har koll.

Du får en JSON-sammanfattning av läget just nu: tid, väder, dagens och ibland morgondagens
kalender, meddelanden från familjen, namnsdag och dina senaste rader.

Skriv EN mening (högst 130 tecken) på naturlig svenska som är användbar just nu:
- Knyt gärna ihop två saker (t.ex. väder + en tid, eller ett meddelande + en händelse).
- Prioritera: något som börjar snart > nya meddelanden > vädret > något roligt (namnsdag, helg, årstid).
- Skriv tider som människor säger dem ("halv fem", "tolv").
- Hitta aldrig på händelser, personer eller fakta som inte finns i underlaget.
- Upprepa inte klockslaget eller datumet i sig, och upprepa inte dina senaste rader.
- Inga hashtags, högst en emoji, och bara om den verkligen passar.
- Är inget särskilt på gång: säg något stämningsfullt och kort om dagen eller vädret.

Svara som JSON: {"text": "...", "mood": "lugn" | "glad" | "uppmanande" | "mysig"}`;

async function voice(request, env, cors) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY saknas' }, 501);

  const context = await request.text();
  if (context.length > 12000) return json({ error: 'för stort underlag' }, 413);

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_completion_tokens: 300,
      messages: [
        { role: 'system', content: PERSONA },
        { role: 'user', content: context },
      ],
    }),
  });
  if (!r.ok) return json({ error: `OpenAI svarade ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502);

  try {
    const data = await r.json();
    const out = JSON.parse(data.choices[0].message.content);
    const text = String(out.text || '').trim().slice(0, 200);
    const mood = ['lugn', 'glad', 'uppmanande', 'mysig'].includes(out.mood) ? out.mood : 'lugn';
    return text ? json({ text, mood }) : json({ error: 'tomt svar' }, 502);
  } catch {
    return json({ error: 'kunde inte tolka svaret' }, 502);
  }
}

// ——— Röstsamtal via kulan ———
// iPaden får en kortlivad nyckel (gäller bara för ett samtal) och pratar sedan direkt
// med OpenAI via WebRTC. Den riktiga API-nyckeln lämnar aldrig Workern.
const VOICE_PERSONA = `Du är "Köket" – familjen Wickbergs röst i köket i Örebro. Familjen är Uffe, Cilla
och döttrarna Milla och Noelle. Du pratar svenska, varmt, lugnt och lite kvickt.

Svara kort: oftast en eller två meningar, som i ett vardagligt samtal i ett kök. Ingen uppräkning
av listor om ingen ber om det. Använd läget nedan (kalender, väder, meddelanden, vem som är hemma)
när det passar. Hitta aldrig på händelser eller fakta som inte finns i underlaget – säg hellre att
du inte vet. Du kan inte ändra kalendern själv; föreslå i så fall att någon lägger in det i
familjekalendern eller skickar det med genvägen "Skicka till köket".`;

async function voiceSession(request, env, cors) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY saknas' }, 501);
  const context = await request.text();
  if (context.length > 12000) return json({ error: 'för stort underlag' }, 413);

  const model = env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
  const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model,
        instructions: `${VOICE_PERSONA}\n\nLäget just nu (JSON):\n${context}`,
        audio: { output: { voice: env.OPENAI_VOICE || 'marin' } },
      },
    }),
  });
  if (!r.ok) return json({ error: `OpenAI svarade ${r.status}`, detail: (await r.text()).slice(0, 400) }, 502);
  const data = await r.json();
  const value = data.value || data.client_secret?.value;
  return value ? json({ value, model }) : json({ error: 'ingen nyckel i svaret' }, 502);
}
