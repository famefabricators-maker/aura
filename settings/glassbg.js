/* Tło okna ustawień jako „płynne szkło”: na żywo rozmyty obraz pulpitu pod oknem
   (okno jest wykluczone z przechwytywania, więc nie widzi samego siebie). */
window.GlassBg = (() => {
  const VS = `#version 300 es
  in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision highp float;
  uniform vec2 u_res; uniform float u_dpr; uniform vec2 u_win; uniform vec2 u_screen;
  uniform sampler2D u_tex; uniform vec2 u_ts; uniform float u_blur; uniform float u_has; uniform float u_time; uniform float u_focus;
  out vec4 o;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 blur(vec2 uv, float lod){
    vec2 px = exp2(lod) / u_ts;
    vec3 acc = textureLod(u_tex, uv, lod).rgb * 0.16;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472 + 0.3;
      acc += textureLod(u_tex, uv + vec2(cos(a), sin(a)) * px * 1.0, lod).rgb * 0.08;
      acc += textureLod(u_tex, uv + vec2(cos(a + 0.52), sin(a + 0.52)) * px * 2.2, lod + 0.6).rgb * 0.06;
    }
    return acc;
  }
  void main(){
    vec2 sz = u_res / u_dpr;
    vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
    vec3 base = vec3(0.045, 0.045, 0.058);
    vec3 col = base;
    if (u_has > 0.5) {
      // lekka soczewka przy krawędziach okna
      float e = min(min(p.x, sz.x - p.x), min(p.y, sz.y - p.y));
      vec2 n = normalize(vec2(p.x < sz.x * 0.5 ? -1.0 : 1.0, p.y < sz.y * 0.5 ? -1.0 : 1.0) * vec2(step(min(p.x, sz.x - p.x), e + 0.5), step(min(p.y, sz.y - p.y), e + 0.5)) + 1e-4);
      float q = clamp(1.0 - e / 22.0, 0.0, 1.0);
      vec2 off = -n * q * q * 14.0;
      vec2 uv = (p + u_win + off) / u_screen;
      float lod = 1.2 + u_blur * 5.6;
      vec3 g = blur(uv, lod);
      float lum = dot(g, vec3(0.299, 0.587, 0.114));
      g = mix(vec3(lum), g, 1.4);                         // żywe kolory tapety
      float tint = mix(0.30, 0.52, u_blur);
      tint = mix(tint, 0.84, smoothstep(0.35, 0.92, lum)); // jasne tło mocniej przyciemnione (czytelność)
      col = mix(g, base, tint + (1.0 - u_focus) * 0.06);
      col += vec3(1.0) * q * q * 0.03;
    }
    float edge = min(min(p.x, sz.x - p.x), min(p.y, sz.y - p.y));
    col += vec3(1.0) * smoothstep(1.4, 0.0, edge) * 0.10;    // cienki refleks na brzegu okna
    col += (hash(p + u_time) - 0.5) * 0.012;               // ziarno przeciw pasmom
    o = vec4(col, 1.0);
  }`;
  let gl, loc = {}, tex, canvas, video = null, stream = null, has = false, ts = [1, 1];
  let pos = { x: 0, y: 0, sw: 1920, sh: 1080, ok: true }, blurAmt = 0.5, focus = 1, raf = 0, cursors = [], usedReg = null, movingUntil = 0;
  const moving = () => performance.now() < movingUntil;
  function region() {
    // w trakcie przesuwania okna bierzemy duży zapas wokół okna, żeby tło nadążało między klatkami
    const M = moving() ? 480 : 30, x0 = Math.max(0, pos.x - M), y0 = Math.max(0, pos.y - M);
    const x1 = Math.min(pos.sw, pos.x + innerWidth + M), y1 = Math.min(pos.sh, pos.y + innerHeight + M);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), sw: pos.sw };
  }
  function init(cv) {
    canvas = cv;
    gl = cv.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) return false;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['u_res', 'u_dpr', 'u_win', 'u_screen', 'u_tex', 'u_ts', 'u_blur', 'u_has', 'u_time', 'u_focus']) loc[n] = gl.getUniformLocation(prog, n);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc.u_tex, 0);
    addEventListener('resize', draw);
    return true;
  }
  function draw() {
    if (!gl) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const dpr = devicePixelRatio || 1;
      const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.u_res, w, h); gl.uniform1f(loc.u_dpr, dpr);
      const r = usedReg || region();
      gl.uniform2f(loc.u_win, pos.x - r.x, pos.y - r.y); gl.uniform2f(loc.u_screen, r.w, r.h);
      gl.uniform2f(loc.u_ts, ts[0], ts[1]); gl.uniform1f(loc.u_blur, blurAmt);
      gl.uniform1f(loc.u_has, has && pos.ok ? 1 : 0); gl.uniform1f(loc.u_time, performance.now() / 1000); gl.uniform1f(loc.u_focus, focus);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }
  async function start() {
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: false });
      video = document.createElement('video'); video.muted = true; video.playsInline = true;
      video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.append(video);
      video.srcObject = stream; await video.play();
      let last = 0;
      const crop = document.createElement('canvas'), cctx = crop.getContext('2d', { alpha: false });
      const onFrame = () => {
        if (!video) return;
        const now = performance.now();
        if (moving() || now - last > (focus ? 33 : 120)) {
          last = now;
          // tylko fragment ekranu pod oknem (+ margines na załamanie), z zamalowanym kursorem
          const r = region(), k = video.videoWidth / pos.sw;
          const W2 = Math.max(1, Math.round(r.w * k)), H2 = Math.max(1, Math.round(r.h * k));
          if (crop.width !== W2 || crop.height !== H2) { crop.width = W2; crop.height = H2; }
          cctx.drawImage(video, r.x * k, r.y * k, W2, H2, 0, 0, W2, H2);
          const nowT = performance.now(); cursors = cursors.filter(c => nowT - c.t < 260);
          if (window.paintOverCursors) window.paintOverCursors(cctx, crop, r, k, cursors);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, crop);
          gl.generateMipmap(gl.TEXTURE_2D);
          ts = [W2, H2]; usedReg = r; has = true; draw();
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } catch (e) { console.warn('glassbg', e); stop(); }
  }
  function stop() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; if (video) { video.remove(); video = null; } has = false; draw();
  }
  return {
    init, start, stop, draw,
    // nowa pozycja okna: rysujemy od razu z obecnej tekstury (jej wycinek pamięta usedReg)
    setPos(p) { if (p.x !== pos.x || p.y !== pos.y) movingUntil = performance.now() + 700; pos = p; draw(); },
    cursor(c) { if (!c) cursors = []; else { cursors.push({ x: c.x, y: c.y, t: performance.now() }); if (cursors.length > 12) cursors.shift(); } },
    get running() { return !!stream; },
    setBlur(b) { blurAmt = b; draw(); },
    setFocus(f) { focus = f ? 1 : 0; draw(); },
  };
})();
