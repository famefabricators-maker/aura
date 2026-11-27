/* Wyspa — rysowanie kształtu i powierzchni w WebGL2.
   Szkło: obraz pulpitu (przechwytywanie ekranu, okno wyspy jest z niego wykluczone)
   rozmyty, załamany przy krawędziach, z podświetloną krawędzią. */
// Zamalowuje kursor (i jego krótki ślad) łatą skopiowaną z sąsiedniego miejsca obrazu.
window.paintOverCursors = (ctx, cnv, reg, k, cursors) => {
  if (!cursors || !cursors.length) return;
  const pw = 46 * k, ph = 54 * k;
  const pts = [];
  for (let i = 0; i < cursors.length; i++) {
    const a = cursors[i]; pts.push(a);
    const b = cursors[i + 1];
    if (b) { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.min(8, Math.floor(d / 30)); for (let j = 1; j <= n; j++) pts.push({ x: a.x + (b.x - a.x) * j / (n + 1), y: a.y + (b.y - a.y) * j / (n + 1) }); }
  }
  // miękka łata: wycinek obok kursora z okrągłą, rozmytą krawędzią (bez kanciastych plam pod szkłem)
  const P = Math.ceil(Math.max(pw, ph) * 1.5);
  const tmp = paintOverCursors.tmp || (paintOverCursors.tmp = document.createElement('canvas'));
  if (tmp.width !== P) { tmp.width = P; tmp.height = P; }
  const t = tmp.getContext('2d');
  for (const c of pts) {
    const ccx = (c.x - reg.x) * k + 7 * k, ccy = (c.y - reg.y) * k + 10 * k; // środek kursora (strzałka idzie w prawo-dół)
    const x = ccx - P / 2, y = ccy - P / 2;
    if (x + P < 0 || y + P < 0 || x > cnv.width || y > cnv.height) continue;
    const off = P * 0.9;
    const sx = x - off >= 0 ? x - off : Math.min(cnv.width - P, x + off);
    const sy = Math.max(0, Math.min(cnv.height - P, y - P * 0.35));
    t.globalCompositeOperation = 'copy';
    t.drawImage(cnv, sx, sy, P, P, 0, 0, P, P);
    t.globalCompositeOperation = 'destination-in';
    const g = t.createRadialGradient(P / 2, P / 2, P * 0.22, P / 2, P / 2, P / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = g; t.fillRect(0, 0, P, P);
    ctx.drawImage(tmp, x, y);
  }
};
window.WyspaGL = (() => {
  const VS = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision highp float;
  uniform vec2 u_res; uniform float u_dpr;
  uniform vec2 u_pos; uniform vec2 u_size; uniform float u_r; uniform float u_ear; uniform float u_island;
  uniform vec3 u_base; uniform float u_glass; uniform float u_blur; uniform float u_tint;
  uniform vec2 u_screen; uniform vec2 u_win; uniform sampler2D u_tex; uniform float u_hasTex; uniform vec2 u_texSize;
  uniform vec3 u_accent; uniform float u_time; uniform float u_open; uniform int u_fx; uniform float u_light; uniform float u_flip; uniform float u_soft; uniform float u_band; uniform float u_bandk;
  uniform vec4 u_b2; // druga kapsułka obok wyspy (bateria urządzeń): x, y, szer., wys.; szer. 0 = brak
  out vec4 o;

  float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float shapeMain(vec2 p){
    vec2 c = u_pos + u_size * 0.5;
    float r = min(u_r, min(u_size.x, u_size.y) * 0.5);
    if (u_island > 0.5) return sdBox(p - c, u_size * 0.5, r);
    float ext = r + 4.0; // górne narożniki wychodzą poza ekran
    float d = sdBox(p - vec2(c.x, c.y - ext * 0.5), vec2(u_size.x * 0.5, u_size.y * 0.5 + ext * 0.5), r);
    float e = min(u_ear, u_size.y * 0.5);
    if (e > 0.5) {
      float L = u_pos.x, R = u_pos.x + u_size.x;
      float dl = max(sdBox(p - vec2(L - e * 0.5, e * 0.5), vec2(e * 0.5), 0.0), e - length(p - vec2(L - e, e)));
      float dr = max(sdBox(p - vec2(R + e * 0.5, e * 0.5), vec2(e * 0.5), 0.0), e - length(p - vec2(R + e, e)));
      d = min(d, min(dl, dr));
    }
    return d;
  }
  // wyspa + kapsułka baterii: ten sam materiał (szkło, obręcz, poświata, cień), bo to jedno pole odległości
  float shape(vec2 p){
    float d = shapeMain(p);
    if (u_b2.z > 0.5) d = min(d, sdBox(p - (u_b2.xy + u_b2.zw * 0.5), u_b2.zw * 0.5, u_b2.w * 0.5));
    return d;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 sampleBlur(vec2 uv, float lod){
    // 13 próbek w dwóch pierścieniach na wybranym poziomie mipmapy = gładkie rozmycie bez schodków
    vec2 px = exp2(lod) / u_texSize * smoothstep(0.0, 1.5, lod); // przy lod≈0 próbki się schodzą = ostry obraz
    vec3 acc = textureLod(u_tex, uv, lod).rgb * 0.16;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + 0.3;
      acc += textureLod(u_tex, uv + vec2(cos(a), sin(a)) * px * 0.9, lod).rgb * 0.08;
      acc += textureLod(u_tex, uv + vec2(cos(a + 0.52), sin(a + 0.52)) * px * 2.0, lod + 0.5).rgb * 0.06;
    }
    return acc;
  }
  vec3 particles(vec2 p){
    vec3 col = vec3(0.0); float t = u_time;
    if (u_fx == 1) { // śnieg
      for (int l = 0; l < 3; l++) {
        float s = 26.0 + float(l) * 14.0;
        vec2 q = p / s + vec2(sin(t * 0.3 + float(l)) * 0.3, -t * (0.35 + float(l) * 0.12));
        vec2 id = floor(q), f = fract(q) - 0.5;
        float h = hash(id + float(l) * 7.0);
        if (h > 0.55) {
          vec2 off = vec2(hash(id + 1.3) - 0.5, hash(id + 2.1) - 0.5) * 0.6;
          float rad = (0.6 + h * 0.9) / s;
          col += vec3(0.85, 0.93, 1.0) * smoothstep(rad * 1.6, rad * 0.2, length(f - off)) * (0.25 + 0.25 * float(l));
        }
      }
    } else if (u_fx == 2) { // gwiazdy
      vec2 q = p / 22.0; vec2 id = floor(q), f = fract(q) - 0.5;
      float h = hash(id);
      if (h > 0.72) {
        vec2 off = vec2(hash(id + 3.1) - 0.5, hash(id + 5.7) - 0.5) * 0.5;
        vec2 d = abs(f - off) * 22.0;
        float tw = 0.5 + 0.5 * sin(t * (1.0 + h * 2.0) + h * 40.0);
        float star = max(smoothstep(2.6, 0.0, d.x) * smoothstep(0.6, 0.0, d.y), smoothstep(2.6, 0.0, d.y) * smoothstep(0.6, 0.0, d.x));
        col += vec3(0.85, 0.82, 1.0) * star * tw * 0.7 + vec3(0.8) * smoothstep(1.2, 0.0, length(d)) * tw * 0.4;
      }
    } else if (u_fx == 3) { // iskry
      for (int l = 0; l < 2; l++) {
        float s = 30.0 + float(l) * 20.0;
        vec2 q = p / s + vec2(sin(t * 0.5 + p.y * 0.02) * 0.15, t * (0.18 + float(l) * 0.1));
        vec2 id = floor(q), f = fract(q) - 0.5;
        float h = hash(id + float(l) * 11.0);
        if (h > 0.6) {
          vec2 off = vec2(hash(id + 4.4) - 0.5, hash(id + 6.6) - 0.5) * 0.5;
          float glow = smoothstep(0.22, 0.0, length(f - off)) * (0.5 + 0.5 * sin(t * 3.0 + h * 30.0));
          col += vec3(1.0, 0.62, 0.25) * glow * 0.55;
        }
      }
    }
    return col * u_open;
  }
  void main(){
    vec2 pw = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr; // DIP, od góry okna
    // wyspa na dole ekranu: kształt liczymy w odbiciu lustrzanym ("góra" kształtu = dolna krawędź okna)
    vec2 p = u_flip > 0.5 ? vec2(pw.x, u_res.y / u_dpr - pw.y) : pw;
    float d = shape(p);
    float aa = clamp(0.5 - d * u_dpr, 0.0, 1.0);
    // miękki cień pod wyspą (daje głębię, jak u szkła Apple)
    float sh = 0.0;
    if (u_light < 0.5 && u_size.y > 1.0) {
      vec2 c0 = u_pos + u_size * 0.5;
      float rr = min(u_r, min(u_size.x, u_size.y) * 0.5);
      float ds = sdBox(p - vec2(c0.x, c0.y + 5.0), u_size * 0.5, rr); // cień tylko od korpusu, bez „uszu”
      if (u_b2.z > 0.5) ds = min(ds, sdBox(p - (u_b2.xy + u_b2.zw * 0.5 + vec2(0.0, 5.0)), u_b2.zw * 0.5, u_b2.w * 0.5));
      sh = (u_glass > 0.5 ? (u_hasTex > 0.5 ? 0.30 : 0.10) : 0.22) * exp(-max(ds, 0.0) / 9.0) * smoothstep(-2.0, 2.0, d) * smoothstep(u_pos.y + 4.0, u_pos.y + 16.0, p.y);
    }
    if (aa <= 0.0) { o = vec4(0.0, 0.0, 0.0, sh); return; }
    vec3 col = u_base;
    if (u_glass > 0.5) {
      float e = 0.75;
      vec2 n = normalize(vec2(shape(p + vec2(e, 0.0)) - shape(p - vec2(e, 0.0)), shape(p + vec2(0.0, e)) - shape(p - vec2(0.0, e))) + 1e-5);
      float inside = max(-d, 0.0);
      // soczewka: krawędź jak ścięta, okrągła fazka. Nachylenie fazki = siła zagięcia światła.
      float bezel = mix(12.0, 20.0, u_open);
      float x = clamp(inside / bezel, 0.0, 1.0);
      float q = 1.0 - x;
      float slope = q / sqrt(max(1.0 - q * q, 0.015));
      float bend = min(slope, 7.0) * 2.4;                 // px przesunięcia próbki
      vec2 c = u_pos + u_size * 0.5;
      // odbicie w fazce: próbka z lustra względem wewnętrznej linii fazki = obraz przy brzegu do góry nogami
      float mirror = 2.0 * max(bezel - inside, 0.0) * 0.95;
      vec2 off = -n * (mirror + bend * 0.35) + (p - c) * -0.035; // + lekkie powiększenie całości
      // Pole załamania przy brzegu (krawędź, obręcz, fala, wzmocnienie w rogach) według liquid-glass-js
      // (MIT, © 2025 Armagan Amcalar), opisane w LiquidGlassSkill (MIT, © 2026 Aref Azizian).
      float W0 = min(u_size.x, 420.0);
      float edgeFall = exp(-inside * 0.5), rimFall = exp(-inside * 1.7);
      float field = 0.015 * edgeFall + 0.028 * rimFall;
      float corner = 0.06 * rimFall * clamp(abs(n.x * n.y) * 4.0, 0.0, 1.0);
      float ripple = sin(inside / max(min(u_size.x, u_size.y), 1.0) * 25.0) * 0.26 * rimFall;
      off -= vec2(n.x * (field + corner) - n.y * ripple, n.y * (field + corner) + n.x * ripple) * W0;
      if (u_flip > 0.5) { off.y = -off.y; n.y = -n.y; } // z powrotem do prawdziwych współrzędnych ekranu
      float edge = smoothstep(0.0, 1.0, 1.0 - x);
      if (u_hasTex > 0.5) {
        vec2 sp = pw + u_win;
        // 0% = czyste szkło (tylko załamanie), 50% = wygląd domyślny, 100% = mocno zmatowione
        // rozmycie rośnie szybko już przy małych wartościach (pierwiastek), a nie dopiero pod koniec suwaka
        float lod = (sqrt(u_blur) * 5.4 + u_open * 0.6 * u_blur) * (1.0 - edge * 0.6); // fazka mniej rozmyta: widać odbicie
        vec3 g;
        float disp = 0.10 * edge;                          // rozszczepienie barw tylko przy krawędzi
        g.r = sampleBlur((sp + off * (1.0 + disp)) / u_screen, lod).r;
        g.g = sampleBlur((sp + off) / u_screen, lod).g;
        g.b = sampleBlur((sp + off * (1.0 - disp)) / u_screen, lod).b;
        float lum = dot(g, vec3(0.299, 0.587, 0.114));
        g = mix(vec3(lum), g, 1.35);                       // żywsze kolory, jak „vibrancy”
        // przyciemnienie: przejrzysta pigułka, mocniejsze na otwartej karcie i na jasnym tle (czytelność)
        // przyciemnienie prawie stałe — mocne rozmycie ma dawać matowe szkło, nie szarą plamę
        float tint = mix(0.16, 0.24, u_blur) + u_open * 0.10;
        tint = mix(tint, 0.80, smoothstep(0.32, 0.92, lum) * (0.5 + 0.5 * u_open) * (0.55 + 0.45 * u_blur));
        tint *= 1.0 - edge * 0.5;                          // jaśniejsza fazka, żeby odbicie było widać
        col = mix(g, u_base, tint);
        col += g * exp(-inside / 5.0) * mix(0.40, 0.14, u_soft);             // kolorowa poświata z tła wzdłuż boków
      } else {
        // bez obrazu pulpitu (macOS): przydymiona tafla — lekki pionowy gradient, jaśniej przy górze
        float gy = clamp((p.y - u_pos.y) / max(u_size.y, 1.0), 0.0, 1.0);
        col = mix(u_base + vec3(0.07, 0.07, 0.085), u_base * 0.85, gy);
      }
      vec2 L = normalize(vec2(-0.55, -0.83));
      float ndl = dot(n, L);
      float rimLine = smoothstep(1.5, 0.0, inside) * (0.22 + 0.78 * pow(abs(ndl), 1.6));
      float rimGlow = exp(-inside / 4.5) * pow(max(ndl, 0.0), 2.0);
      float innerShade = exp(-inside / 6.0) * max(-ndl, 0.0);
      col += vec3(1.0) * rimLine * 0.55;                  // cienki refleks na brzegu (z obu stron)
      col += vec3(1.0) * rimGlow * (u_hasTex > 0.5 ? mix(0.10, 0.05, u_soft) : 0.04); // poświata od strony światła (bez obrazu pulpitu słabsza)
      col *= 1.0 - innerShade * 0.16;                     // cień wewnętrzny po drugiej stronie
      col += vec3(1.0) * edge * edge * 0.035;             // jaśniejsza fazka
      col += (hash(p * 1.7 + u_time) - 0.5) * 0.012;      // ziarno przeciw pasmom
    } else if (u_light < 0.5) {
      float inside = max(-d, 0.0);
      col += vec3(1.0) * smoothstep(1.2, 0.0, inside) * 0.035 * u_open; // ledwie widoczna krawędź
    }
    col += particles(pw);
    // szkło bez obrazu pulpitu: lekko przezroczyste i z mniejszym cieniem (przy notchu cień wyglądał jak poświata dookoła)
    float al = (u_glass > 0.5 && u_hasTex < 0.5) ? 0.88 : 1.0;
    // Mac z notchem, wyspa zwinięta: pas na wysokości wycięcia czysta, nieprzezroczysta czerń (bez szkła, obwódki i koloru
    // albumu), żeby skrzydełka zlewały się z notchem. Przy otwieraniu czerń znika (u_bandk → 0) — otwarta karta, baner
    // i szkło mają swój kolor aż do górnej krawędzi
    if (u_band > 0.5 && u_bandk > 0.0) { float bk = (1.0 - smoothstep(u_band - 1.5, u_band + 0.5, pw.y)) * u_bandk; col = mix(col, vec3(0.0), bk); al = mix(al, 1.0, bk); }
    o = vec4(col * aa * al, aa * al) + vec4(0.0, 0.0, 0.0, sh) * (1.0 - aa);
  }`;

  let gl, prog, loc = {}, tex, canvas, video = null, hasTex = false, texSize = [1, 1];
  function init(cv) {
    canvas = cv;
    gl = cv.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['u_res', 'u_dpr', 'u_pos', 'u_size', 'u_r', 'u_ear', 'u_island', 'u_base', 'u_glass', 'u_blur', 'u_tint', 'u_screen', 'u_win', 'u_tex', 'u_hasTex', 'u_texSize', 'u_accent', 'u_time', 'u_open', 'u_fx', 'u_light', 'u_flip', 'u_soft', 'u_band', 'u_bandk', 'u_b2'])
      loc[n] = gl.getUniformLocation(prog, n);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc.u_tex, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  }
  function setVideo(v) { video = v; hasTex = false; }
  // Wycina z obrazu ekranu tylko fragment pod oknem i zamalowuje kursor (przechwytywanie ekranu go zawiera,
  // a pod szkłem wyglądał jak „drugi kursor”). reg: obszar w DIP względem ekranu, sw: szerokość ekranu w DIP.
  const crop = document.createElement('canvas'), cctx = crop.getContext('2d', { alpha: false });
  function uploadFrame(reg, cursors) {
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const k = video.videoWidth / reg.sw;
    const W2 = Math.max(1, Math.round(reg.w * k)), H2 = Math.max(1, Math.round(reg.h * k));
    if (crop.width !== W2 || crop.height !== H2) { crop.width = W2; crop.height = H2; }
    cctx.drawImage(video, reg.x * k, reg.y * k, W2, H2, 0, 0, W2, H2);
    paintOverCursors(cctx, crop, reg, k, cursors);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, crop);
    gl.generateMipmap(gl.TEXTURE_2D);
    texSize = [W2, H2];
    hasTex = true;
  }
  // st: { x, y, w, h, r, ear, island, base[3], glass, blur, tint, screen{w,h}, win{x,y}, accent[3], time, open, fx, light }
  function draw(st) {
    if (!gl) return;
    const dpr = resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.u_res, canvas.width, canvas.height);
    gl.uniform1f(loc.u_dpr, dpr);
    gl.uniform2f(loc.u_pos, st.x, st.y);
    gl.uniform2f(loc.u_size, Math.max(1, st.w), Math.max(1, st.h));
    gl.uniform1f(loc.u_r, st.r);
    gl.uniform1f(loc.u_ear, st.ear);
    gl.uniform1f(loc.u_island, st.island ? 1 : 0);
    gl.uniform3fv(loc.u_base, st.base);
    gl.uniform1f(loc.u_glass, st.glass ? 1 : 0);
    gl.uniform1f(loc.u_blur, st.blur);
    gl.uniform1f(loc.u_tint, st.tint);
    gl.uniform2f(loc.u_screen, st.screen.w, st.screen.h);
    gl.uniform2f(loc.u_win, st.win.x, st.win.y);
    gl.uniform1f(loc.u_hasTex, st.glass && hasTex ? 1 : 0);
    gl.uniform2f(loc.u_texSize, texSize[0], texSize[1]);
    gl.uniform3fv(loc.u_accent, st.accent);
    gl.uniform1f(loc.u_time, st.time);
    gl.uniform1f(loc.u_open, st.open);
    gl.uniform1i(loc.u_fx, st.fx || 0);
    gl.uniform1f(loc.u_light, st.light ? 1 : 0);
    const b2 = st.b2 || [0, 0, 0, 0]; gl.uniform4f(loc.u_b2, b2[0], b2[1], b2[2], b2[3]);
    gl.uniform1f(loc.u_flip, st.flip ? 1 : 0); gl.uniform1f(loc.u_soft, st.soft ? 1 : 0); gl.uniform1f(loc.u_band, st.band || 0); gl.uniform1f(loc.u_bandk, st.bandk == null ? 1 : st.bandk); // Mac: słabsza poświata (przy pasku menu wyglądała jak obwódka)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { init, draw, setVideo, uploadFrame, get ok() { return !!gl; } };
})();
