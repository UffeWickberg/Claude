/* Köksskärmen – klocka, kalender, meddelanden, väder och nattläge. */
(() => {
  'use strict';
  const CFG = window.KOKET_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);

  // ——— Inställningar som kan ges i adressen och sparas på enheten ———
  const store = {
    get(k) { try { return localStorage.getItem('koket.' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('koket.' + k, v); } catch { /* privat läge */ } },
    json(k) { try { return JSON.parse(this.get(k)); } catch { return null; } },
  };
  for (const k of ['key', 'proxy']) {
    if (params.get(k)) store.set(k, params.get(k));
  }
  const KEY = params.get('key') || store.get('key') || '';
  const PROXY = (params.get('proxy') || store.get('proxy') || CFG.proxy || '').replace(/\/$/, '');
  const DEMO = params.has('demo') || !PROXY;

  // ?t=2026-11-18T07:15 låter dig förhandsgranska en annan tid på dygnet.
  const timeOffset = params.get('t') ? new Date(params.get('t')) - Date.now() : 0;
  const now = () => new Date(Date.now() + timeOffset);

  // ——— Formattering ———
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (d) => `${pad(d.getHours())}.${pad(d.getMinutes())}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  const startOfDay = (d, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  };
  const ago = (d) => {
    const m = Math.round((now() - d) / 6e4);
    if (m < 2) return 'nyss';
    if (m < 60) return `för ${m} min sedan`;
    const h = Math.round(m / 60);
    if (h < 20 && startOfDay(d).getTime() === startOfDay(now()).getTime()) return `för ${h} tim sedan`;
    if (startOfDay(d).getTime() === startOfDay(now(), -1).getTime()) return `igår ${hm(d)}`;
    return `${d.getDate()}/${d.getMonth() + 1} ${hm(d)}`;
  };
  const until = (d) => {
    const m = Math.max(1, Math.round((d - now()) / 6e4));
    if (m < 60) return `om ${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `om ${h} tim ${r} min` : `om ${h} tim`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ——— Dygnets faser ———
  const nightStart = CFG.nattStart ?? 22, nightEnd = CFG.nattSlut ?? 6;
  const isNightHour = (h) => nightStart > nightEnd ? (h >= nightStart || h < nightEnd) : (h >= nightStart && h < nightEnd);
  let wakeUntil = 0;

  function phaseFor(d) {
    const h = d.getHours();
    if (isNightHour(h)) return 'natt';
    if (h < 9) return 'morgon';
    if (h < 16) return 'dag';
    return 'kvall';
  }

  function greetingFor(d) {
    const h = d.getHours(), wd = d.getDay();
    const weekend = wd === 0 || wd === 6;
    if (isNightHour(h)) return 'God natt';
    if (h < 10) return weekend ? 'God helgmorgon' : 'God morgon';
    if (h < 12) return 'God förmiddag';
    if (h < 18) return wd === 5 ? 'Trevlig fredag' : 'God eftermiddag';
    if (wd === 5) return 'Trevlig fredagskväll';
    if (wd === 0) return 'Lugn söndagskväll';
    return 'God kväll';
  }

  // ——— Klockan ———
  let lastMinute = -1, lastDay = '';
  function tick() {
    const d = now();
    const m = d.getHours() * 60 + d.getMinutes();
    if (m !== lastMinute) {
      const first = lastMinute === -1;
      setDigits('hh', pad(d.getHours()), first);
      setDigits('mm', pad(d.getMinutes()), first);
      lastMinute = m;
      onMinute(d);
    }
    setTimeout(tick, 1000 - (Date.now() % 1000) + 20);
  }
  function setDigits(id, val, instant) {
    const el = $(id);
    if (el.textContent === val) return;
    el.textContent = val;
    if (!instant && el.animate) {
      el.animate([
        { opacity: 0, transform: 'translateY(.06em)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
      ], { duration: 1400, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }

  function onMinute(d) {
    document.documentElement.dataset.phase = phaseFor(d);
    if (!document.documentElement.classList.contains('ready')) {
      requestAnimationFrame(() => setTimeout(() => document.documentElement.classList.add('ready'), 200));
    }
    applyNight();
    $('greeting').textContent = greetingFor(d);
    const dayKey = d.toDateString();
    if (dayKey !== lastDay) {
      lastDay = dayKey;
      $('date').textContent = cap(fmtDate.format(d));
      renderMeta();
      loadDayInfo();
      loadCalendars();
    }
    renderAgenda();
    renderMessages();
    if (weatherData) renderWeather();
    maybeAskAi();
    // Ladda om sidan en gång per natt för att få uppdateringar och hålla den pigg.
    if (d.getHours() === 3 && d.getMinutes() === 33 && !timeOffset) location.reload();
  }

  function applyNight() {
    const night = phaseFor(now()) === 'natt' && Date.now() > wakeUntil;
    document.body.classList.toggle('night', night);
  }
  document.addEventListener('pointerdown', () => {
    if (phaseFor(now()) === 'natt') {
      wakeUntil = Date.now() + 90 * 1000;
      applyNight();
      setTimeout(applyNight, 90 * 1000 + 50);
    }
  });

  // ——— Namnsdag, röd dag, flaggdag ———
  let dayInfo = store.json('dayinfo');
  function renderMeta() {
    const d = now();
    const parts = [`Vecka ${isoWeek(d)}`];
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (dayInfo && dayInfo.datum === today) {
      if (dayInfo.namnsdag?.length) parts.unshift(`Namnsdag <b>${esc(dayInfo.namnsdag.join(', '))}</b>`);
      if (dayInfo.helgdag) parts.push(`<span class="flag">${esc(dayInfo.helgdag)}</span>`);
      if (dayInfo.flaggdag) parts.push(`<span class="flag">Flaggdag · ${esc(dayInfo.flaggdag)}</span>`);
    }
    $('meta').innerHTML = parts.join('<span style="opacity:.4"> &nbsp;·&nbsp; </span>');
  }
  async function loadDayInfo() {
    const d = now();
    try {
      const r = await fetch(`https://sholiday.faboul.se/dagar/v2.1/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`);
      const j = await r.json();
      const day = j.dagar && j.dagar[0];
      if (day) { dayInfo = day; store.set('dayinfo', JSON.stringify(day)); }
    } catch { /* ingen namnsdag idag då */ }
    renderMeta();
  }

  // ——— Väder (Open-Meteo, fritt och utan nyckel) ———
  let weatherData = store.json('weather');
  const WMO = {
    0: ['Klart', 'clear'], 1: ['Mestadels klart', 'clear'], 2: ['Halvklart', 'partly'], 3: ['Mulet', 'cloud'],
    45: ['Dimma', 'fog'], 48: ['Rimfrost och dimma', 'fog'],
    51: ['Lätt duggregn', 'rain'], 53: ['Duggregn', 'rain'], 55: ['Tätt duggregn', 'rain'],
    56: ['Underkylt duggregn', 'sleet'], 57: ['Underkylt duggregn', 'sleet'],
    61: ['Lätt regn', 'rain'], 63: ['Regn', 'rain'], 65: ['Kraftigt regn', 'rain'],
    66: ['Underkylt regn', 'sleet'], 67: ['Underkylt regn', 'sleet'],
    71: ['Lätt snöfall', 'snow'], 73: ['Snöfall', 'snow'], 75: ['Kraftigt snöfall', 'snow'], 77: ['Snökorn', 'snow'],
    80: ['Regnskurar', 'rain'], 81: ['Regnskurar', 'rain'], 82: ['Kraftiga skurar', 'rain'],
    85: ['Snöbyar', 'snow'], 86: ['Kraftiga snöbyar', 'snow'],
    95: ['Åska', 'thunder'], 96: ['Åska med hagel', 'thunder'], 99: ['Åska med hagel', 'thunder'],
  };
  const S = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
  const cloudPath = 'M7.5 18.5h9.2a3.8 3.8 0 0 0 .5-7.57A5.5 5.5 0 0 0 6.6 12.2 3.2 3.2 0 0 0 7.5 18.5Z';
  const sun = (cx = 12, cy = 12, r = 4.2) => `<g class="spin" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${r}"/>${
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const t = a * Math.PI / 180, r1 = r + 2.2, r2 = r + 4;
      return `<line x1="${(cx + Math.cos(t) * r1).toFixed(2)}" y1="${(cy + Math.sin(t) * r1).toFixed(2)}" x2="${(cx + Math.cos(t) * r2).toFixed(2)}" y2="${(cy + Math.sin(t) * r2).toFixed(2)}"/>`;
    }).join('')}</g>`;
  const moon = (s = 1, dx = 0, dy = 0) => `<path transform="translate(${dx} ${dy}) scale(${s})" d="M15.5 4.6A7.6 7.6 0 1 0 19.4 15a6.2 6.2 0 0 1-3.9-10.4Z"/>`;
  const drops = (type) => [9, 12.5, 16].map((x, i) => {
    const flake = type === 'snow' || (type === 'sleet' && i === 1);
    return `<line class="fall" x1="${x}" y1="20.2" x2="${flake ? x : x - .8}" y2="${flake ? 20.6 : 22.4}"${flake ? ' stroke-width="2.2"' : ''}/>`;
  }).join('');
  let iconSeq = 0;
  function icon(kind, isDay) {
    const cloud = `<g class="float"><path d="${cloudPath}"/></g>`;
    const up = (inner) => `<g transform="translate(0 -3)">${inner}</g>`;
    let body;
    switch (kind) {
      case 'clear': body = isDay ? sun() : moon(); break;
      case 'partly': {
        const id = 'm' + (++iconSeq);
        body = `<defs><mask id="${id}"><rect x="-4" y="-4" width="32" height="32" fill="#fff"/>` +
          `<path transform="translate(1 1.5)" d="${cloudPath}" fill="#000" stroke="#000" stroke-width="3"/></mask></defs>` +
          `<g mask="url(#${id})">${isDay ? sun(8.6, 8.4, 3.2) : moon(.62, 1.5, 1)}</g>` +
          `<g transform="translate(1 1.5)">${cloud}</g>`;
        break;
      }
      case 'cloud': body = cloud; break;
      case 'fog': body = `<g class="float"><line x1="4" y1="9" x2="20" y2="9"/><line x1="2.5" y1="13" x2="18" y2="13"/><line x1="6" y1="17" x2="21.5" y2="17"/></g>`; break;
      case 'rain': case 'sleet': case 'snow': body = up(cloud) + drops(kind); break;
      case 'thunder': body = up(cloud) + '<path d="M12.8 16.5l-2.3 3.4h3l-2.2 3.4"/>'; break;
      default: body = cloud;
    }
    return `<svg viewBox="0 0 24 24" ${S}>${body}</svg>`;
  }

  async function loadWeather() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CFG.lat}&longitude=${CFG.lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m' +
      '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day' +
      '&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min' +
      '&timezone=Europe%2FStockholm&wind_speed_unit=ms&forecast_days=2';
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      weatherData = await r.json();
      weatherData.fetched = Date.now();
      store.set('weather', JSON.stringify(weatherData));
    } catch {
      if (!weatherData && DEMO) weatherData = demoWeather();
    }
    if (weatherData) renderWeather();
  }

  function renderWeather() {
    const w = weatherData, c = w.current, h = w.hourly;
    if (!c || !h) return;
    const [desc, kind] = WMO[c.weather_code] || ['', 'cloud'];
    $('w-icon').innerHTML = icon(kind, c.is_day);
    $('w-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('w-desc').textContent = `${desc} i ${CFG.plats || ''}`.trim();
    const sr = w.daily?.sunrise?.[0] && new Date(w.daily.sunrise[0]);
    const ss = w.daily?.sunset?.[0] && new Date(w.daily.sunset[0]);
    const bits = [`Känns som ${Math.round(c.apparent_temperature)}°`];
    if (sr && ss) bits.push(now() < sr ? `solen går upp ${hm(sr)}` : now() < ss ? `solen går ner ${hm(ss)}` : `solen gick ner ${hm(ss)}`);
    $('w-feels').textContent = bits.join(' · ');

    // Kommande timmar: var annan timme framåt.
    const t = now();
    const startIdx = h.time.findIndex((s) => new Date(s) > t);
    const items = [];
    for (let i = startIdx; i >= 0 && i < h.time.length && items.length < 5; i += 2) {
      const [, k] = WMO[h.weather_code[i]] || ['', 'cloud'];
      const p = h.precipitation_probability?.[i];
      items.push(`<li><span class="t">${pad(new Date(h.time[i]).getHours())}</span><span class="i">${icon(k, h.is_day[i])}</span><span class="v">${Math.round(h.temperature_2m[i])}°</span><span class="p">${p >= 30 ? p + '%' : ''}</span></li>`);
    }
    $('w-hours').innerHTML = items.join('');
    $('hint').textContent = weatherHint(w, t);
    $('weather').hidden = false;
  }

  // Ett kort, mänskligt tips utifrån prognosen de närmaste timmarna.
  function weatherHint(w, t) {
    const h = w.hourly;
    const idx = h.time.map((s, i) => [new Date(s), i]).filter(([d]) => d > t && d - t < 12 * 36e5);
    if (!idx.length) return '';
    const hr = t.getHours();
    const wet = idx.find(([, i]) => (h.precipitation_probability?.[i] ?? 0) >= 55 && (h.precipitation?.[i] ?? 0) >= 0.2);
    if (wet) {
      const [d, i] = wet;
      const snow = h.temperature_2m[i] <= 0.5 || [71, 73, 75, 77, 85, 86].includes(h.weather_code[i]);
      const when = d - t < 90 * 6e4 ? 'snart' : `runt ${pad(d.getHours())}`;
      return snow ? `Snö väntas ${when} – klä dig varmt.` : `Regn väntas ${when} – ta med paraply.`;
    }
    const gust = Math.max(...idx.slice(0, 8).map(([, i]) => h.wind_gusts_10m?.[i] ?? 0));
    if (gust >= 14) return `Blåsigt i dag, byar upp till ${Math.round(gust)} m/s.`;
    const minT = Math.min(...idx.slice(0, 4).map(([, i]) => h.temperature_2m[i]));
    if (hr >= 5 && hr < 10 && minT <= 0) return 'Minusgrader ute – räkna med att skrapa bilrutan.';
    if (hr >= 18 && minT <= 0) return 'Kall natt på väg – minusgrader innan morgonen.';
    const maxT = w.daily?.temperature_2m_max?.[0];
    if (maxT >= 25 && hr < 16) return `Varm dag – upp till ${Math.round(maxT)}°.`;
    if (hr < 15) return 'Uppehåll resten av dagen.';
    return '';
  }

  // ——— Kalendrar (ICS via er Cloudflare Worker) ———
  let events = [];      // { start, end, allDay, title, location, color }
  let messages = [];    // { start, end, text, from }

  async function fetchIcs(id) {
    const r = await fetch(`${PROXY}/ics/${encodeURIComponent(id)}?key=${encodeURIComponent(KEY)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    return r.text();
  }

  // Tolka en ICS-fil och returnera alla förekomster (även återkommande) inom intervallet.
  function occurrences(text, from, to) {
    const comp = new ICAL.Component(ICAL.parse(text));
    for (const tz of comp.getAllSubcomponents('vtimezone')) {
      try { ICAL.TimezoneService.register(tz); } catch { /* redan känd */ }
    }
    const masters = new Map(), exceptions = [];
    for (const ve of comp.getAllSubcomponents('vevent')) {
      const ev = new ICAL.Event(ve);
      if (ev.isRecurrenceException()) exceptions.push(ev); else masters.set(ev.uid, ev);
    }
    for (const ex of exceptions) {
      const m = masters.get(ex.uid);
      if (m) m.relateException(ex); else masters.set(ex.uid + ex.recurrenceId, ex);
    }
    const out = [];
    const push = (ev, s, e) => {
      const start = s.toJSDate(), end = e ? e.toJSDate() : new Date(start.getTime() + (s.isDate ? 864e5 : 0));
      if (end > from && start < to) {
        out.push({ start, end, allDay: s.isDate, title: ev.summary || '', location: ev.location || '', description: ev.description || '', created: ev.component.getFirstPropertyValue('created') });
      }
    };
    for (const ev of masters.values()) {
      if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
      const it = ev.iterator();
      let next, guard = 0;
      while ((next = it.next()) && guard++ < 20000) {
        if (next.toJSDate() >= to) break;
        const det = ev.getOccurrenceDetails(next);
        push(det.item, det.startDate, det.endDate);
      }
    }
    return out;
  }

  async function loadCalendars() {
    const from = startOfDay(now(), -2), to = startOfDay(now(), 2);
    if (DEMO) {
      ({ events, messages } = demoData());
      $('status').textContent = 'Demoläge';
      renderAgenda(); renderMessages();
      calLoadedOnce = true;
      return;
    }
    const errors = [];
    const cals = CFG.kalendrar || [];
    const results = await Promise.allSettled(cals.map((c) => fetchIcs(c.id)));
    const fresh = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        try {
          occurrences(r.value, from, to).forEach((e) => fresh.push({ ...e, color: cals[i].farg }));
        } catch (e) { errors.push(cals[i].namn); console.error(e); }
      } else { errors.push(cals[i].namn); console.error(r.reason); }
    });
    if (errors.length < cals.length || !cals.length) events = fresh;

    if (CFG.meddelanden) {
      try {
        const txt = await fetchIcs(CFG.meddelanden);
        messages = occurrences(txt, startOfDay(now(), -7), to).map((e) => {
          const lines = e.description.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          const from = (lines[0] || '').replace(/^från:\s*/i, '');
          return { start: e.allDay ? (e.created?.toJSDate?.() || e.start) : e.start, end: e.end, text: e.title, from, allDay: e.allDay, rawStart: e.start };
        });
      } catch (e) { errors.push('meddelanden'); console.error(e); }
    }
    $('status').textContent = errors.length ? `Kunde inte hämta: ${errors.join(', ')}` : '';
    renderAgenda(); renderMessages();
    if (!calLoadedOnce) { calLoadedOnce = true; setTimeout(() => maybeAskAi(), 4000); }
  }

  function eventRow(e, t, isToday) {
    const past = e.end <= t, current = !e.allDay && e.start <= t && e.end > t;
    let tag = '';
    if (current) tag = '<span class="tag">Pågår</span>';
    else if (isToday && !e.allDay && e.start > t && e.start - t < 3 * 36e5) tag = `<span class="tag">${until(e.start)}</span>`;
    const time = e.allDay ? 'Heldag' : hm(e.start);
    const sub = [e.allDay ? '' : `till ${hm(e.end)}`, e.location.split('\n')[0]].filter(Boolean).join(' · ');
    return `<li class="ev${past && isToday ? ' past' : ''}${current ? ' now' : ''}" style="--dot:${e.color || 'var(--accent)'}">
      <span class="time">${time}</span><span class="title">${esc(e.title)}${tag}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</li>`;
  }

  function renderAgenda() {
    const t = now(), d0 = startOfDay(t), d1 = startOfDay(t, 1), d2 = startOfDay(t, 2);
    const sort = (a, b) => (b.allDay - a.allDay) || (a.start - b.start) || a.title.localeCompare(b.title, 'sv');
    let today = events.filter((e) => e.start < d1 && e.end > d0).sort(sort);
    const remaining = today.filter((e) => e.end > t);
    const tomorrow = events.filter((e) => e.start < d2 && e.end > d1).sort(sort);
    const showTomorrow = tomorrow.length > 0 && (t.getHours() >= 17 || remaining.length < 2);
    // Om listan blir lång, eller morgondagen ska få plats: släpp det som redan har hänt.
    if (today.length > 6 || showTomorrow) today = remaining.length ? remaining : (showTomorrow ? [] : today.slice(-2));
    $('agenda-list').innerHTML = today.length
      ? today.map((e) => eventRow(e, t, true)).join('')
      : `<li class="empty">${events.some((e) => e.start < d1 && e.end > d0) ? 'Inget mer i dag.' : 'Inget inplanerat i dag.'}</li>`;

    $('agenda-tomorrow').hidden = !showTomorrow;
    if (showTomorrow) $('tomorrow-list').innerHTML = tomorrow.slice(0, 4).map((e) => eventRow(e, t, false)).join('');

    // Nattläget visar diskret morgondagens första tidpunkt.
    const first = tomorrow.find((e) => !e.allDay);
    const nextDay = t.getHours() < 12 ? remaining.find((e) => !e.allDay) : first;
    $('nightline').textContent = nextDay ? `${t.getHours() < 12 ? 'I dag' : 'I morgon'} ${hm(nextDay.start)} · ${nextDay.title}` : '';
  }

  let shownMsgKey = null, calLoadedOnce = false;
  function renderMessages() {
    const t = now();
    const active = messages.filter((m) => m.rawStart <= t && m.end > t && m.text)
      .sort((a, b) => b.start - a.start).slice(0, 4);
    $('messages').hidden = !active.length;
    const key = active.map((m) => m.text + m.start.getTime()).join('|');
    const html = active.map((m) => `<li class="msg${t - m.start < 30 * 6e4 ? ' fresh' : ''}">
      <p class="text">${esc(m.text)}</p>
      <p class="from">${m.from ? `<b>${esc(m.from)}</b> · ` : ''}${ago(m.start)}</p></li>`).join('');
    if (key !== shownMsgKey) {
      const hadBefore = calLoadedOnce;
      $('msg-list').innerHTML = html; shownMsgKey = key;
      if (hadBefore && active.length) setTimeout(() => maybeAskAi('nytt meddelande'), 1500);
      return;
    }
    // Samma meddelanden: uppdatera bara tidstexterna, så animationerna inte startar om.
    $('msg-list').querySelectorAll('.msg').forEach((li, i) => {
      const m = active[i];
      li.classList.toggle('fresh', t - m.start < 30 * 6e4);
      li.querySelector('.from').innerHTML = `${m.from ? `<b>${esc(m.from)}</b> · ` : ''}${ago(m.start)}`;
    });
  }


  // ——— Kökets röst: en AI-skriven rad som knyter ihop dagen ———
  // Sidan skickar en sammanfattning till Workern, som frågar OpenAI. API-nyckeln finns bara i Workern.
  let ai = store.json('ai') || null;            // { text, mood, at }
  let aiBusy = false, aiDemoIdx = 0;
  const AI_EVERY = (params.has('demo') || !PROXY ? 1.5 : 30) * 6e4, AI_MIN_GAP = 2 * 6e4;

  function aiContext(reason) {
    const t = now(), d0 = startOfDay(t), d1 = startOfDay(t, 1), d2 = startOfDay(t, 2);
    const fmtEv = (e) => ({ tid: e.allDay ? 'heldag' : `${hm(e.start)}–${hm(e.end)}`, vad: e.title, var: e.location.split('\n')[0] || undefined, pagar: !e.allDay && e.start <= t && e.end > t || undefined });
    const ctx = {
      anledning: reason,
      nu: `${cap(fmtDate.format(t))} kl. ${hm(t)}`,
      plats: CFG.plats,
      namnsdag: dayInfo?.namnsdag?.join(', ') || undefined,
      helgdag: dayInfo?.helgdag || dayInfo?.flaggdag || undefined,
      idag: events.filter((e) => e.start < d1 && e.end > d0 && (e.allDay || e.end > t)).sort((a, b) => a.start - b.start).map(fmtEv),
      imorgon: t.getHours() >= 15 ? events.filter((e) => e.start < d2 && e.end > d1).sort((a, b) => a.start - b.start).slice(0, 5).map(fmtEv) : undefined,
      meddelanden: messages.filter((m) => m.rawStart <= t && m.end > t).map((m) => ({ fran: m.from || undefined, text: m.text, minuterSedan: Math.round((t - m.start) / 6e4) })),
      senasteRader: (store.json('ai.history') || []).slice(-4),
    };
    const w = weatherData;
    if (w?.current && w.hourly) {
      const next = w.hourly.time.map((s, i) => [new Date(s), i]).filter(([d]) => d > t).slice(0, 12).filter((_, k) => k % 2 === 0);
      ctx.vader = {
        nu: `${Math.round(w.current.temperature_2m)}°, ${(WMO[w.current.weather_code] || [''])[0]}, känns som ${Math.round(w.current.apparent_temperature)}°`,
        kommande: next.map(([d, i]) => `${pad(d.getHours())}: ${Math.round(w.hourly.temperature_2m[i])}° ${(WMO[w.hourly.weather_code[i]] || [''])[0]}, nederbörd ${w.hourly.precipitation_probability?.[i] ?? 0}%`),
        sol: w.daily ? `upp ${hm(new Date(w.daily.sunrise[0]))}, ner ${hm(new Date(w.daily.sunset[0]))}` : undefined,
      };
    }
    return ctx;
  }

  function maybeAskAi(reason) {
    const t = now(), h = t.getHours();
    if (aiBusy || !calLoadedOnce) return;
    if (phaseFor(t) === 'natt') { $('ai').hidden = true; return; }
    const age = ai ? Date.now() - ai.at : Infinity;
    if (reason ? age < AI_MIN_GAP : age < AI_EVERY) {
      if (ai && !$('ai').dataset.shown) showAi(ai, false);
      return;
    }
    askAi(reason || (h < 10 ? 'morgon' : h >= 17 ? 'kväll' : 'dag'));
  }

  async function askAi(reason) {
    aiBusy = true;
    try {
      let res;
      if (DEMO) {
        const lines = DEMO_LINES.filter((l) => l.kvall === (now().getHours() >= 17));
        res = lines[aiDemoIdx++ % lines.length];
      } else {
        const r = await fetch(`${PROXY}/ai?key=${encodeURIComponent(KEY)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiContext(reason)),
        });
        if (!r.ok) throw new Error('ai ' + r.status);
        res = await r.json();
      }
      if (res?.text) {
        ai = { text: res.text, mood: res.mood || 'lugn', at: Date.now() };
        store.set('ai', JSON.stringify(ai));
        const hist = (store.json('ai.history') || []).concat(res.text).slice(-6);
        store.set('ai.history', JSON.stringify(hist));
        showAi(ai, true);
      }
    } catch (e) {
      console.warn(e);
      if (ai) showAi(ai, false);
    } finally {
      aiBusy = false;
    }
  }

  function showAi(state, animate) {
    const box = $('ai'), el = $('ai-text');
    box.hidden = false; box.dataset.shown = '1';
    box.dataset.mood = state.mood;
    document.body.classList.add('has-ai');
    if (!animate) { el.textContent = state.text; return; }
    box.classList.remove('speaking'); void box.offsetWidth; box.classList.add('speaking');
    el.innerHTML = state.text.split(/(\s+)/).map((w, i) =>
      /\s/.test(w) ? w : `<span class="word" style="animation-delay:${(i / 2) * 90}ms">${esc(w)}</span>`).join('');
    setTimeout(() => box.classList.remove('speaking'), 6000);
  }

  const DEMO_LINES = [
    { kvall: false, text: 'Ella har tandläkare tolv – och regnet kommer runt tre, så paraplyet kan följa med redan nu.', mood: 'uppmanande' },
    { kvall: false, text: 'Mamma tänker på gympapåsen. Lägg den vid dörren innan fotbollen, så är morgondagen redan fixad.', mood: 'glad' },
    { kvall: false, text: 'Mormor fyller sjuttio idag. Ett samtal innan middagen hos grannarna hinns precis med.', mood: 'mysig' },
    { kvall: false, text: 'Tacos ikväll och fotboll halv fem – ett bra tillfälle att handla på vägen hem.', mood: 'lugn' },
    { text: 'Föräldramöte redan klockan åtta i morgon – och minusgrader i natt, så kanske värmaren i bilen?', mood: 'uppmanande', kvall: true },
    { text: 'Gympapåsen, ja. Lägg den vid dörren nu, så slipper morgondagen börja med jakt.', mood: 'glad', kvall: true },
    { text: 'Lugn kväll framför oss. Mormor har haft sin sjuttioårsdag – hann någon ringa?', mood: 'mysig', kvall: true },
  ];

  // ——— Demodata så att sidan går att titta på innan allt är kopplat ———
  function demoData() {
    const d = startOfDay(now()), at = (h, m = 0, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add, h, m);
    const n = now();
    return {
      events: [
        { start: at(0), end: at(0, 0, 1), allDay: true, title: 'Mormor fyller 70', location: '', color: '#e8a0bf' },
        { start: at(7, 30), end: at(8), allDay: false, title: 'Lämning förskolan', location: 'Skogsgläntan', color: '#f6c177' },
        { start: at(12), end: at(13), allDay: false, title: 'Tandläkare – Ella', location: 'Folktandvården Väster', color: '#9ccfd8' },
        { start: at(16, 30), end: at(17, 45), allDay: false, title: 'Fotbollsträning', location: 'Behrn Arena', color: '#f6c177' },
        { start: at(18, 30), end: at(19, 30), allDay: false, title: 'Middag hos grannarna', location: '', color: '#c4a7e7' },
        { start: at(8, 0, 1), end: at(9, 0, 1), allDay: false, title: 'Föräldramöte', location: 'Skolan', color: '#f6c177' },
        { start: at(17, 0, 1), end: at(18, 0, 1), allDay: false, title: 'Simskola', location: 'Gustavsviks badhus', color: '#9ccfd8' },
      ],
      messages: [
        { start: new Date(n - 6 * 6e4), rawStart: new Date(n - 6 * 6e4), end: new Date(+n + 864e5), text: 'Glöm inte gympapåsen i morgon! 👟', from: 'Mamma' },
        { start: new Date(n - 95 * 6e4), rawStart: new Date(n - 95 * 6e4), end: new Date(+n + 864e5), text: 'Tacos till middag 🌮', from: 'Uffe' },
      ],
    };
  }
  function demoWeather() {
    const t = startOfDay(now());
    const time = [], temp = [], code = [], prob = [], prec = [], isday = [], wind = [], gust = [];
    for (let i = 0; i < 48; i++) {
      const d = new Date(t.getTime() + i * 36e5), h = d.getHours();
      time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00`);
      temp.push(2 + 3 * Math.sin((h - 9) / 24 * 2 * Math.PI));
      code.push(h >= 15 && h <= 18 ? 61 : h < 10 ? 2 : 3);
      prob.push(h >= 15 && h <= 18 ? 70 : 10); prec.push(h >= 15 && h <= 18 ? .8 : 0);
      isday.push(h >= 8 && h < 16 ? 1 : 0); wind.push(4); gust.push(8);
    }
    const ch = now().getHours();
    return {
      current: { temperature_2m: temp[ch], apparent_temperature: temp[ch] - 3, weather_code: code[ch], is_day: isday[ch], wind_speed_10m: 4 },
      hourly: { time, temperature_2m: temp, weather_code: code, precipitation_probability: prob, precipitation: prec, is_day: isday, wind_speed_10m: wind, wind_gusts_10m: gust },
      daily: { sunrise: [`${time[7]}`.replace(':00', ':48')], sunset: [`${time[15]}`.replace(':00', ':24')], temperature_2m_max: [5], temperature_2m_min: [-1] },
    };
  }

  // ——— Håll skärmen vaken ———
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* stöds inte – använd Automatisk låsning: Aldrig */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); loadCalendars(); loadWeather(); }
  });
  document.addEventListener('pointerdown', keepAwake);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ——— Start ———
  renderMeta();
  tick();
  keepAwake();
  loadWeather();
  setInterval(loadWeather, 15 * 6e4);
  setInterval(loadCalendars, 2 * 6e4);
})();
