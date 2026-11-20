/* BLAJ! – interaktion. Utan JavaScript fungerar sidan ändå: allt innehåll finns i HTML. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ——— Bruset: tvärsäkra påståenden som motsäger varandra ———
  // Generiska formuleringar av sådant som cirkulerar – inte citat av någon person.
  const CLAIMS = [
    'Varumärke är allt', 'Sluta bygga varumärke. Sälj.', '60/40. Punkt.', 'Bara 5 % köper. Glöm resten.',
    'Lojalitet är död', 'Lojalitet är allt', 'B2B är rationellt', 'Känslor säljer', 'Allt går att mäta',
    'Det viktigaste går inte att mäta', 'Tratten är död', 'Tratten lever', 'Posta varje dag', 'Mindre är mer',
    'Sänk aldrig priset', 'Sänk priset', 'Kunden är hjälten', 'Ditt varumärke är din personal', 'Sälj är dött',
    'Varumärke är en kostnad', 'Bygg community', 'Innehåll är kung', 'Distribution är kung', 'Ingen läser längre',
    'Långt innehåll vinner', 'Var annorlunda', 'Var konsekvent', 'Ändra aldrig loggan', 'Allt är performance',
  ];
  const TAGS = ['Källa?', 'Åsikt', 'Det beror på', 'Sammanhang?', 'BLAJ!', 'Vem säger det?', 'Forskning?'];

  const noise = $('#noise');
  if (noise) {
    const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const rows = innerWidth < 600 ? 7 : 6;
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'noise-row';
      row.style.setProperty('--dur', `${150 + r * 37}s`);
      const words = shuffle(CLAIMS).slice(0, 9);
      // Dubbel uppsättning så att rörelsen går runt utan skarv.
      for (const w of [...words, ...words]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = w;
        b.setAttribute('aria-label', `Påstående: ${w}. Tryck för att granska.`);
        const tag = document.createElement('span');
        tag.className = 'tag'; tag.setAttribute('aria-hidden', 'true');
        tag.textContent = TAGS[Math.floor(Math.random() * TAGS.length)];
        b.append(tag);
        b.addEventListener('click', () => b.classList.toggle('struck'));
        row.append(b);
      }
      noise.append(row);
    }
    // Granskaren arbetar av sig själv: stryker ett påstående i taget.
    if (!reduced) {
      const strikeOne = () => {
        if (document.hidden) return;
        const hero = noise.getBoundingClientRect();
        const visible = $$('.noise-row button:not(.struck)', noise).filter((b) => {
          const r = b.getBoundingClientRect();
          return r.left > 40 && r.right < innerWidth - 40 && r.top > hero.top + 60 && r.bottom < Math.min(hero.bottom, innerHeight);
        });
        const b = visible[Math.floor(Math.random() * visible.length)];
        if (b) { b.classList.add('struck'); setTimeout(() => b.classList.remove('struck'), 6500); }
      };
      setTimeout(strikeOne, 1200);
      setInterval(strikeOne, 2600);
    }
  }

  // ——— Toppfältet får en linje när man scrollar ———
  const top = $('.top');
  const onScroll = () => top.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ——— Linjerna i diagrammet ritas när de syns ———
  $$('.draw').forEach((p) => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));

  // ——— Innehåll som tonar in ———
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: .15, rootMargin: '0px 0px -40px 0px' }) : null;
  $$('.reveal').forEach((el) => io ? io.observe(el) : el.classList.add('in'));

  // Länkar till källor öppnar inte stängda kort – men en fotnot i ett kort ska fungera.
  $$('.card sup a').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));

  // ——— Fickfiltret ———
  const filter = $('#filter');
  if (filter) {
    const stamp = $('#filter-stamp'), text = $('#filter-text');
    const VERDICT = {
      start:   ['s-neutral', 'Svara på frågorna', 'Tänk på ett råd du läste i veckan.'],
      blaj:    ['s-blaj', 'BLAJ!-varning', 'Ett påstående utan källa, från någon som tjänar på att du tror på det. Läs det som reklam – för det är vad det är.'],
      asikt:   ['s-asikt', 'Åsikt', 'Kan vara klok, men det är en åsikt. Väg den mot er egen erfarenhet och era egna siffror.'],
      erfar:   ['s-erfarenhet', 'Erfarenhet', 'Någon har sett något fungera. Fråga: i vilket sammanhang – och skulle det se likadant ut hos er?'],
      fel:     ['s-asikt', 'Fel sammanhang', 'Det finns forskning, men den gäller verksamheter som inte liknar er. Läs vad den säger om sådana som du – om den säger något alls.'],
      intress: ['s-erfarenhet', 'Läs originalet', 'Det finns relevant forskning, men avsändaren har intressen. Läs källan själv i stället för sammanfattningen.'],
      bra:     ['s-forskning', 'Värt att ta på allvar', 'Relevant forskning utan uppenbart egenintresse. Nästa steg: läs källan och kontrollera att slutsatsen faktiskt står där.'],
    };
    const val = (n) => (filter.elements[n] && [...filter.elements[n]].find((i) => i.checked)?.value) || null;
    const update = () => {
      const q1 = val('q1'), q2 = val('q2'), q3 = val('q3'), q4 = val('q4');
      // Visa bara följdfrågor som är relevanta.
      $$('fieldset[data-needs]', filter).forEach((fs) => {
        const [k, v] = fs.dataset.needs.split('=');
        const on = val(k) === v && (k !== 'q2' || q1 === 'ja');
        fs.classList.toggle('off', !on);
        fs.disabled = !on;
      });
      let key = 'start';
      if (q1 === 'nej' && q4) key = q4 === 'ja' ? 'blaj' : 'asikt';
      else if (q1 === 'ja' && q2 === 'nej' && q4) key = q4 === 'ja' ? 'blaj' : 'erfar';
      else if (q1 === 'ja' && q2 === 'ja' && q3 === 'nej') key = 'fel';
      else if (q1 === 'ja' && q2 === 'ja' && q3 === 'ja' && q4) key = q4 === 'ja' ? 'intress' : 'bra';
      const [cls, label, msg] = VERDICT[key];
      stamp.className = 'stamp ' + cls; stamp.textContent = label; text.textContent = msg;
    };
    filter.addEventListener('change', update);
    update();
  }

  // ——— Intresseanmälan: ett färdigt mejl till hello@h3art.se ———
  const form = $('#signup');
  if (form) {
    const TO = 'hello@h3art.se';
    const err = $('#form-error');
    let lastMailto = '';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form.elements;
      const problems = [];
      f.namn.setAttribute('aria-invalid', String(!f.namn.value.trim()));
      if (!f.namn.value.trim()) problems.push('ditt namn');
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.epost.value.trim());
      f.epost.setAttribute('aria-invalid', String(!emailOk));
      if (!emailOk) problems.push('en giltig e-postadress');
      if (!f.ok.checked) problems.push('att du förstår att det är en intresseanmälan');
      if (problems.length) {
        err.hidden = false;
        err.textContent = 'Vi behöver ' + problems.join(', ').replace(/, ([^,]*)$/, ' och $1') + '.';
        (!f.namn.value.trim() ? f.namn : !emailOk ? f.epost : f.ok).focus();
        return;
      }
      err.hidden = true;

      const line = (k, v) => v && v.trim() ? `${k}: ${v.trim()}\n` : '';
      const body =
        'Hej HƎART!\n\nJag är intresserad av BLAJ! och vill veta när datum och plats för nästa tillfälle är bestämda.\n\n' +
        line('Namn', f.namn.value) + line('E-post', f.epost.value) + line('Företag', f.foretag.value) +
        line('Roll', f.roll.value) + line('Antal platser', f.antal.value) +
        (f.pastaende.value.trim() ? `\nPåstående jag vill att ni granskar:\n${f.pastaende.value.trim()}\n` : '') +
        '\nJag förstår att detta är en intresseanmälan och inte en bokning.\n';
      const subject = `Intresseanmälan BLAJ! – ${f.namn.value.trim()}${f.foretag.value.trim() ? ', ' + f.foretag.value.trim() : ''}`;
      lastMailto = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      $('#sent-text').textContent = `Till: ${TO}\nÄmne: ${subject}\n\n${body}`;
      $('#mailto-again').href = lastMailto;
      form.hidden = true;
      const sent = $('#sent');
      sent.hidden = false;
      sent.focus({ preventScroll: true });
      sent.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      location.href = lastMailto;
    });

    $('#copy').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText($('#sent-text').textContent);
        btn.textContent = 'Kopierat';
      } catch {
        const r = document.createRange(); r.selectNodeContents($('#sent-text'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        btn.textContent = 'Markerat – kopiera med ⌘C / Ctrl+C';
      }
      setTimeout(() => { btn.textContent = 'Kopiera texten'; }, 3000);
    });
  }
})();
