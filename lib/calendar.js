// Kalendarz z prywatnego linku lub pliku .ics (Google Calendar, Outlook, iCloud).
// Daje najbliższe wydarzenia dla widżetu „Dziś”, trybu „Następne wydarzenie” w pigułce
// i zegara spotkania w czasie rozmowy. Wszystko liczone lokalnie; z komputera wychodzi tylko
// zapytanie pod podany link.
//
// Użycie (proces główny):
//   const { Calendar } = require('./lib/calendar');
//   const cal = new Calendar({ fetch: net.fetch });        // fetch opcjonalny (domyślnie globalny)
//   cal.on('events', list => send('calendar', list));      // lista na najbliższe 7 dni, posortowana
//   cal.on('error', msg => send('calendar-error', msg));   // komunikat po polsku
//   cal.setSource(S().calendarIcs);                          // link http(s)/webcal albo ścieżka .ics; '' = wyłącz
//   cal.next() / cal.current() / Calendar.when(ev)          // następne, trwające, opis „za 15 min”
//   cal.stop();
const fs = require('fs');
const { L } = require('./lang');
const { EventEmitter } = require('events');

const DAY = 86400e3;
const REFRESH_MS = 15 * 60e3;
const MAX_BYTES = 5 * 1024 * 1024;

// Outlook i Exchange podają nazwy stref z Windows zamiast IANA.
const WIN_TZ = {
  'Central European Standard Time': 'Europe/Warsaw', 'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin', 'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik', 'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest', 'Russian Standard Time': 'Europe/Moscow', 'Turkey Standard Time': 'Europe/Istanbul',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
  'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo', 'India Standard Time': 'Asia/Kolkata',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'Arabian Standard Time': 'Asia/Dubai', 'Israel Standard Time': 'Asia/Jerusalem',
};

// ---------- strefy czasowe ----------
const dtfCache = new Map();
function tzOffsetMs(tz, utcMs) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dtfCache.set(tz, f);
  }
  const p = {}; for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
}
function validTz(tz) {
  if (!tz) return null;
  const clean = String(tz).replace(/^"|"$/g, '').replace(/^\/[^/]*\/[^/]*\//, ''); // np. /mozilla.org/20050126_1/Europe/Warsaw
  const iana = WIN_TZ[clean] || clean;
  try { new Intl.DateTimeFormat('en-US', { timeZone: iana }); return iana; } catch { return null; }
}
// czas „na zegarze” w danej strefie (jako pola) -> prawdziwy UTC
function wallToUtc(w, tz) {
  const guess = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  if (tz === 'UTC') return guess;
  if (!tz) return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime(); // „pływający” = czas lokalny
  let t = guess - tzOffsetMs(tz, guess);
  t = guess - tzOffsetMs(tz, t); // druga iteracja wyrównuje zmianę czasu
  return t;
}

// ---------- parsowanie ICS ----------
function unfold(text) { return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, ''); }
function unescapeText(v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function parseLine(line) {
  // NAZWA;PARAM=wartość;PARAM2="a:b":WARTOŚĆ — dwukropek w cudzysłowie nie kończy parametrów
  let i = 0, inQ = false;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') inQ = !inQ; else if (c === ':' && !inQ) break; }
  if (i >= line.length) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  for (const p of parts.slice(1)) { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ''); }
  return { name: parts[0].toUpperCase(), params, value };
}
// zwraca { wall, tz, allDay } albo null
function parseDate(value, params) {
  const v = String(value).trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const allDay = params.VALUE === 'DATE' || !m[4];
  const wall = { y: +m[1], m: +m[2] - 1, d: +m[3], h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], s: allDay ? 0 : +(m[6] || 0) };
  const tz = allDay ? null : m[7] ? 'UTC' : validTz(params.TZID);
  return { wall, tz, allDay };
}
function parseDuration(v) {
  const m = String(v).trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 3600e3) + ((+m[5] || 0) * 60e3) + ((+m[6] || 0) * 1e3);
  return m[1] === '-' ? -ms : ms;
}
function parseRrule(v) {
  const r = {};
  for (const part of String(v).split(';')) { const [k, val] = part.split('='); if (k && val != null) r[k.toUpperCase()] = val; }
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL ? parseDate(r.UNTIL, {}) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map(x => { const mm = x.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/); return mm ? { n: mm[1] ? +mm[1] : 0, wd: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(mm[2]) } : null; }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(x => +x - 1) : null,
  };
}
// szuka linku do spotkania (Teams, Meet, Zoom, Webex, Whereby, Jitsi)
const MEET_RE = /https?:\/\/(?:teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|meet\.google\.com|[\w.-]*zoom\.us\/(?:j|my)|[\w.-]*webex\.com\/(?:meet|join)|whereby\.com|meet\.jit\.si)[^\s"<>\\]*/i;

function parseIcs(text) {
  const events = [];
  let cur = null, depth = 0;
  for (const raw of unfold(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }       // VALARM itp. wewnątrz wydarzenia
    if (/^END:VEVENT$/i.test(line)) { events.push(cur); cur = null; continue; }
    if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const p = parseLine(line); if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.title = unescapeText(p.value); break;
      case 'LOCATION': cur.location = unescapeText(p.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(p.value).slice(0, 4000); break;
      case 'URL': cur.url = p.value; break;
      case 'STATUS': cur.status = p.value.toUpperCase(); break;
      case 'TRANSP': cur.transp = p.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseDate(p.value, p.params); break;
      case 'DURATION': cur.duration = parseDuration(p.value); break;
      case 'RRULE': cur.rrule = parseRrule(p.value); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const d = parseDate(v, p.params); if (d) cur.exdates.push(d); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p.value, p.params); break;
      case 'X-MICROSOFT-SKYPETEAMSMEETINGURL': case 'X-GOOGLE-CONFERENCE': cur.meet = p.value; break;
    }
  }
  return events.filter(e => e.start);
}

// ---------- rozwijanie powtórzeń ----------
const wallOf = t => { const d = new Date(t); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() }; };
const wallMs = w => Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s); // „zegar” liczony jak UTC, bez stref
function toUtc(dt) { return dt.allDay ? new Date(dt.wall.y, dt.wall.m, dt.wall.d).getTime() : wallToUtc(dt.wall, dt.tz); }
function nthWeekdayOfMonth(y, m, wd, n) {
  if (n > 0) { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); const d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7; return d <= new Date(Date.UTC(y, m + 1, 0)).getUTCDate() ? d : null; }
  const last = new Date(Date.UTC(y, m + 1, 0)); const d = last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7) + (n + 1) * 7; return d >= 1 ? d : null;
}
// prawdziwy czas UTC -> „zegar” w strefie wydarzenia (null = czas lokalny)
function utcToWallMs(utcMs, tz) {
  if (tz === 'UTC') return utcMs;
  if (!tz) return utcMs - new Date(utcMs).getTimezoneOffset() * 60e3;
  return utcMs + tzOffsetMs(tz, utcMs);
}
// zwraca listę czasów startu („zegar” jako ms) od DTSTART do granicy (też „zegar”)
function occurrences(ev, toWall) {
  const s = ev.start.wall, r = ev.rrule;
  const startW = wallMs(s);
  if (!r || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) return [startW];
  const tz = ev.start.allDay ? null : ev.start.tz;
  let untilW = Infinity;
  if (r.until) untilW = r.until.tz === 'UTC' ? utcToWallMs(toUtc(r.until), tz) : wallMs(r.until.wall) + (r.until.allDay ? DAY - 1 : 0);
  const limit = Math.min(untilW, toWall);
  const out = [];
  const time = [s.h, s.mi, s.s];
  const push = t => { if (t < startW || t > untilW) return true; if (r.count && out.length >= r.count) return false; out.push(t); return true; };
  let guard = 0;
  if (r.freq === 'DAILY') {
    const only = r.byday && r.byday.length ? new Set(r.byday.map(b => b.wd)) : null; // np. „każdy dzień roboczy”
    for (let t = startW; t <= limit && guard++ < 20000; t += r.interval * DAY) {
      if (only && !only.has(new Date(t).getUTCDay())) continue;
      if (!push(t)) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday && r.byday.length ? r.byday.map(b => b.wd) : [new Date(startW).getUTCDay()]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    // tydzień od poniedziałku (WKST=MO, jak w Google i Outlooku)
    const dow = (new Date(startW).getUTCDay() + 6) % 7;
    let weekStart = Date.UTC(s.y, s.m, s.d - dow);
    outer: for (; weekStart <= limit && guard++ < 5000; weekStart += 7 * DAY * r.interval) {
      for (const wd of days) {
        const t = weekStart + ((wd + 6) % 7) * DAY + time[0] * 3600e3 + time[1] * 60e3 + time[2] * 1e3;
        if (t > limit) break outer;
        if (!push(t)) break outer;
      }
    }
  } else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
    const step = r.freq === 'MONTHLY' ? r.interval : 12 * r.interval;
    for (let k = 0; guard++ < 3000; k += step) {
      const y = s.y + Math.floor((s.m + k) / 12), m = (s.m + k) % 12;
      if (Date.UTC(y, m, 1) > limit) break;
      if (r.bymonth && !r.bymonth.includes(m)) continue;
      let dates = [];
      if (r.byday && r.byday.length) for (const b of r.byday) { if (b.n) { const d = nthWeekdayOfMonth(y, m, b.wd, b.n); if (d) dates.push(d); } }
      else if (r.bymonthday) dates = r.bymonthday.map(d => d < 0 ? new Date(Date.UTC(y, m + 1, 0)).getUTCDate() + 1 + d : d);
      else dates = [s.d];
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      let stop = false;
      for (const d of [...new Set(dates)].filter(d => d >= 1 && d <= dim).sort((a, b) => a - b)) {
        const t = Date.UTC(y, m, d, time[0], time[1], time[2]);
        if (t > limit) { stop = true; break; }
        if (!push(t)) { stop = true; break; }
      }
      if (stop) break;
    }
  }
  return out;
}

// rozwija wydarzenia do listy instancji w oknie [from, to] (prawdziwe ms UTC)
function expand(events, from, to) {
  const overrides = new Map(); // uid|start -> wydarzenie zastępujące
  for (const e of events) if (e.recurrenceId && e.uid) overrides.set(`${e.uid}|${toUtc(e.recurrenceId)}`, e);
  const out = [];
  const add = (e, startMs) => {
    if (e.status === 'CANCELLED') return;
    let endMs;
    if (e.end) endMs = startMs + (toUtc(e.end) - toUtc(e.start));
    else if (e.duration != null) endMs = startMs + e.duration;
    else endMs = startMs + (e.start.allDay ? DAY : 0);
    if (endMs < from || startMs > to) return;
    const text = [e.meet, e.url, e.location, e.description].filter(Boolean).join(' ');
    const link = (text.match(MEET_RE) || [null])[0];
    out.push({
      id: `${e.uid || e.title}|${startMs}`, title: e.title || L('(bez tytułu)', '(untitled)'), location: e.location || '',
      start: startMs, end: Math.max(endMs, startMs), allDay: !!e.start.allDay, link, free: e.transp === 'TRANSPARENT',
    });
  };
  for (const e of events) {
    if (e.recurrenceId) continue; // obsłużone przez overrides
    const tz = e.start.allDay ? null : e.start.tz;
    const exUtc = new Set(e.exdates.map(toUtc));
    const exDays = new Set(e.exdates.filter(x => x.allDay).map(x => `${x.wall.y}-${x.wall.m}-${x.wall.d}`));
    for (const w of occurrences(e, utcToWallMs(to, tz) + DAY)) {
      const ww = wallOf(w);
      const startMs = e.start.allDay ? new Date(ww.y, ww.m, ww.d).getTime() : wallToUtc(ww, tz);
      if (exUtc.has(startMs) || exDays.has(`${ww.y}-${ww.m}-${ww.d}`)) continue;
      const ov = e.uid && overrides.get(`${e.uid}|${startMs}`);
      if (ov) { add(ov, toUtc(ov.start)); continue; }
      add(e, startMs);
    }
  }
  // przesunięte instancje, których pierwotny termin wypadł poza oknem
  const seen = new Set(out.map(o => o.id));
  for (const ov of overrides.values()) { const st = toUtc(ov.start); if (!seen.has(`${ov.uid || ov.title}|${st}`)) add(ov, st); }
  const uniq = new Map(); for (const o of out) uniq.set(o.id, o);
  return [...uniq.values()].sort((a, b) => a.start - b.start || (b.allDay - a.allDay));
}

// ---------- opis po polsku ----------
const pad = n => String(n).padStart(2, '0');
function clock(ms, hour12) {
  const d = new Date(ms);
  if (!hour12) return `${d.getHours()}:${pad(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12; return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
function plural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; return n === 1 ? one : (b >= 2 && b <= 4 && (a < 12 || a > 14)) ? few : many; }
function dur(ms) {
  const min = Math.max(1, Math.round(ms / 60e3));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} godz. ${m} min` : `${h} ${plural(h, 'godz.', 'godz.', 'godz.')}`;
}
const WD = L(['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
// „teraz · zostało 20 min”, „za 15 min”, „dziś 14:30”, „jutro 9:00”, „pt. 10:00”, „cały dzień”
function when(ev, now = Date.now(), hour12 = false) {
  if (!ev) return '';
  const startDay = new Date(ev.start); startDay.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dd = Math.round((startDay - today) / DAY);
  if (ev.allDay) return dd <= 0 ? L('cały dzień', 'all day') : dd === 1 ? L('jutro, cały dzień', 'tomorrow, all day') : L(`${WD[startDay.getDay()]} cały dzień`, `${WD[startDay.getDay()]} all day`);
  if (ev.start <= now && ev.end > now) return L(`teraz · zostało ${dur(ev.end - now)}`, `now · ${dur(ev.end - now)} left`);
  if (ev.start > now && ev.start - now <= 60 * 60e3) return `za ${dur(ev.start - now)}`;
  if (dd === 0) return L(`dziś ${clock(ev.start, hour12)}`, `today ${clock(ev.start, hour12)}`);
  if (dd === 1) return `jutro ${clock(ev.start, hour12)}`;
  if (dd < 7) return `${WD[new Date(ev.start).getDay()]} ${clock(ev.start, hour12)}`;
  const d = new Date(ev.start); return `${d.getDate()}.${pad(d.getMonth() + 1)} ${clock(ev.start, hour12)}`;
}

// ---------- klasa ----------
class Calendar extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.fetch = opts.fetch || globalThis.fetch;
    this.days = opts.days || 7;
    this.source = '';
    this.raw = [];
    this.list = [];
    this.timer = null;
    this.tick = null;
    this.loadedAt = 0;
  }
  // link http(s)/webcal albo ścieżka do pliku .ics; pusty = wyłącz
  setSource(src) {
    src = String(src || '').trim();
    if (src === this.source && (this.timer || !src)) return;
    this.stop();
    this.source = src;
    this.raw = []; this.list = [];
    if (!src) { this.emit('events', []); return; }
    this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    // co minutę przelicza listę (wydarzenia przechodzą z „za 5 min” w „teraz”), bez pobierania
    this.tick = setInterval(() => this.recompute(), 60e3);
  }
  async load() {
    const src = this.source;
    if (/^(https?|webcal):\/\//i.test(src)) {
      const url = src.replace(/^webcal:/i, 'https:');
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await this.fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/calendar, */*' } });
        if (!r.ok) throw new Error(r.status === 404 ? L('Link nie działa (404). Skopiuj go jeszcze raz z kalendarza.', 'The link doesn’t work (404). Copy it again from your calendar.') : L(`Serwer kalendarza odpowiedział ${r.status}.`, `The calendar server replied ${r.status}.`));
        const text = await r.text();
        if (text.length > MAX_BYTES) throw new Error(L('Kalendarz jest za duży (ponad 5 MB).', 'The calendar is too big (over 5 MB).'));
        return text;
      } catch (e) { throw new Error(e.name === 'AbortError' ? L('Kalendarz nie odpowiada (15 s).', 'The calendar isn’t responding (15 s).') : e.message); }
      finally { clearTimeout(to); }
    }
    const p = src.replace(/^file:\/\/\/?/i, '');
    if (!/\.ics$/i.test(p)) throw new Error(L('To nie jest link ani plik .ics.', 'That’s not a link or an .ics file.'));
    const st = fs.statSync(p);
    if (st.size > MAX_BYTES) throw new Error(L('Plik kalendarza jest za duży (ponad 5 MB).', 'The calendar file is too big (over 5 MB).'));
    return fs.readFileSync(p, 'utf8');
  }
  async refresh() {
    const src = this.source; if (!src) return;
    try {
      const text = await this.load();
      if (src !== this.source) return;
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error(L('Pod tym linkiem nie ma kalendarza .ics.', 'There’s no .ics calendar at this link.'));
      this.raw = parseIcs(text);
      this.loadedAt = Date.now(); this.lastError = '';
      this.recompute();
    } catch (e) {
      if (src !== this.source) return;
      this.lastError = e.message || L('Nie udało się wczytać kalendarza.', 'Couldn’t load the calendar.');
      if (this.listenerCount('error')) this.emit('error', this.lastError); // bez nasłuchu 'error' nie wywraca procesu
    }
  }
  recompute() {
    const now = Date.now();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    this.list = expand(this.raw, from.getTime(), now + this.days * DAY).filter(e => e.end > now || e.allDay && e.end > from.getTime());
    this.emit('events', this.list);
  }
  upcoming(n = 3, now = Date.now()) { return this.list.filter(e => e.end > now).slice(0, n); }
  // najbliższe wydarzenie z godziną (pomija całodniowe i „wolne”)
  next(now = Date.now()) { return this.list.find(e => !e.allDay && !e.free && e.start > now) || null; }
  // trwające wydarzenie z godziną — do zegara spotkania
  current(now = Date.now()) { return this.list.find(e => !e.allDay && !e.free && e.start <= now && e.end > now) || null; }
  stop() { clearInterval(this.timer); clearInterval(this.tick); this.timer = this.tick = null; }
}
Calendar.when = when;

module.exports = { Calendar, parseIcs, expand, when };
