/* Avatar Maker.
 *
 * Everything happens in this file, on this device. No network, no session, no
 * server, no storage — the chosen picture is decoded into an ImageBitmap and
 * never leaves the page.
 *
 * The one idea worth knowing before reading: every positional value in `state`
 * is NORMALISED 0..1 against the canvas rather than stored in pixels, and
 * `renderTo(ctx, W, H)` is the only drawing path. The preview and the exported
 * PNG call it at different sizes and are therefore the same picture by
 * construction, not by keeping two code paths in agreement.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  /* ------------------------------------------------------------------ state */

  var DEFAULTS = {
    pic:    { x: 0.5, y: 0.5, zoom: 1, rotate: 0, mirror: false, mode: "fill" },
    shape:  { kind: "circle", x: 0.5, y: 0.5, w: 1, h: 1 },
    border: { on: true, width: 3, position: "inside", colour: "#ffffff", opacity: 1 },
    bg:     { mode: "none", colour: "#111318", from: "#2b1d33", to: "#c8a2c8", angle: 90 },
    adjust: { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
              saturation: 0, warmth: 0, tint: 0, hue: 0, vignette: 0 },
  };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  var state = {
    image: null,
    canvas: { w: 512, h: 512, locked: true },
    pic: clone(DEFAULTS.pic),
    shape: clone(DEFAULTS.shape),
    border: clone(DEFAULTS.border),
    bg: clone(DEFAULTS.bg),
    adjust: clone(DEFAULTS.adjust),
  };

  /* ----------------------------------------------------------------- shapes */
  /* Each builds a path into ctx for a box at (x,y,w,h). No fill, no stroke —
     the caller decides whether it is a clip, a fill or a stroke. */

  function poly(ctx, x, y, w, h, n, rot) {
    var cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, i, a;
    for (i = 0; i < n; i++) {
      a = rot + i * 2 * Math.PI / n;
      var px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function star(ctx, x, y, w, h, points, inner) {
    var cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, i;
    for (i = 0; i < points * 2; i++) {
      var k = i % 2 ? inner : 1;
      var a = -Math.PI / 2 + i * Math.PI / points;
      var px = cx + rx * k * Math.cos(a), py = cy + ry * k * Math.sin(a);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  var SHAPES = {
    circle:  function (c, x, y, w, h) { c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); },
    square:  function (c, x, y, w, h) { c.rect(x, y, w, h); },
    rounded: function (c, x, y, w, h) {
      var r = Math.min(w, h) * 0.18;
      if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    },
    squircle: function (c, x, y, w, h) {
      var cx = x + w / 2, cy = y + h / 2, a = w / 2, b = h / 2, S = 72, i;
      for (i = 0; i <= S; i++) {
        var t = i / S * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        var px = cx + a * Math.sign(ct) * Math.pow(Math.abs(ct), 0.5);
        var py = cy + b * Math.sign(st) * Math.pow(Math.abs(st), 0.5);
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath();
    },
    hexagon:  function (c, x, y, w, h) { poly(c, x, y, w, h, 6, 0); },
    octagon:  function (c, x, y, w, h) { poly(c, x, y, w, h, 8, Math.PI / 8); },
    triangle: function (c, x, y, w, h) { poly(c, x, y, w, h, 3, -Math.PI / 2); },
    diamond:  function (c, x, y, w, h) { poly(c, x, y, w, h, 4, -Math.PI / 2); },
    pentagon: function (c, x, y, w, h) { poly(c, x, y, w, h, 5, -Math.PI / 2); },
    star:     function (c, x, y, w, h) { star(c, x, y, w, h, 5, 0.44); },
    heart: function (c, x, y, w, h) {
      var cx = x + w / 2;
      c.moveTo(cx, y + h * 0.97);
      c.bezierCurveTo(x - w * 0.18, y + h * 0.52, x + w * 0.14, y - h * 0.08, cx, y + h * 0.27);
      c.bezierCurveTo(x + w * 0.86, y - h * 0.08, x + w * 1.18, y + h * 0.52, cx, y + h * 0.97);
      c.closePath();
    },
    shield: function (c, x, y, w, h) {
      var r = Math.min(w, h) * 0.12;
      c.moveTo(x + r, y); c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h * 0.5);
      c.quadraticCurveTo(x + w, y + h * 0.88, x + w / 2, y + h);
      c.quadraticCurveTo(x, y + h * 0.88, x, y + h * 0.5);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    },
    arch: function (c, x, y, w, h) {
      c.moveTo(x, y + h); c.lineTo(x, y + h * 0.5);
      c.ellipse(x + w / 2, y + h * 0.5, w / 2, h * 0.5, 0, Math.PI, 0);
      c.lineTo(x + w, y + h); c.closePath();
    },
  };
  var SHAPE_ORDER = ["circle", "square", "rounded", "squircle", "hexagon", "octagon",
                     "triangle", "diamond", "pentagon", "star", "heart", "shield", "arch"];

  /* ---------------------------------------------------------------- presets */

  var PRESETS = {
    Natural:  {},
    Portrait: { exposure: 4, contrast: 8, highlights: -12, shadows: 14, saturation: -6, warmth: 10 },
    Golden:   { exposure: 8, contrast: 6, highlights: -8, shadows: 10, saturation: 12, warmth: 34, tint: -6 },
    Cool:     { contrast: 10, shadows: 6, saturation: -4, warmth: -28, tint: 8 },
    Faded:    { exposure: 6, contrast: -22, highlights: -10, shadows: 26, saturation: -20, vignette: -8 },
    Noir:     { contrast: 26, highlights: -10, shadows: -12, saturation: -100, vignette: 18 },
    Punch:    { contrast: 22, highlights: -6, shadows: 8, saturation: 30, vignette: 6 },
    Dusk:     { exposure: -6, contrast: 12, shadows: -8, saturation: 6, warmth: -14, tint: 12, vignette: 14 },
  };

  /* ------------------------------------------------------------ the drawing */

  function shapeRect(W, H) {
    var s = state.shape;
    return { x: (s.x - s.w / 2) * W, y: (s.y - s.h / 2) * H, w: s.w * W, h: s.h * H };
  }
  function shapePath(ctx, W, H) {
    var r = shapeRect(W, H);
    ctx.beginPath();
    (SHAPES[state.shape.kind] || SHAPES.circle)(ctx, r.x, r.y, r.w, r.h);
  }

  function drawBackground(ctx, W, H) {
    var b = state.bg;
    if (b.mode === "none") return;
    if (b.mode === "solid") { ctx.fillStyle = b.colour; }
    else {
      var a = b.angle * Math.PI / 180;
      var dx = Math.cos(a) * W / 2, dy = Math.sin(a) * H / 2;
      var g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
      g.addColorStop(0, b.from); g.addColorStop(1, b.to);
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, W, H);
  }

  function drawPicture(ctx, W, H) {
    var img = state.image; if (!img) return;
    var p = state.pic, rad = p.rotate * Math.PI / 180;
    var scale = baseScale(W, H) * p.zoom;
    ctx.save();
    ctx.translate(p.x * W, p.y * H);
    ctx.rotate(rad);
    ctx.scale(p.mirror ? -scale : scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  /* cover/contain measured on the ROTATED bounding box, so "Fill" still fills
     when the picture is turned */
  function baseScale(W, H) {
    var img = state.image; if (!img) return 1;
    var rad = state.pic.rotate * Math.PI / 180;
    var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    var rw = img.width * c + img.height * s, rh = img.width * s + img.height * c;
    return state.pic.mode === "fit" ? Math.min(W / rw, H / rh) : Math.max(W / rw, H / rh);
  }

  /* One 256-entry curve for every tone control, built once per render. */
  function buildLUT(a) {
    var lut = new Uint8ClampedArray(256);
    var gain = Math.pow(2, a.exposure / 100 * 2);      // +/- 2 EV
    var br = a.brightness / 100 * 0.35;
    var k = 1 + a.contrast / 100 * 0.9;
    var hi = a.highlights / 100, sh = a.shadows / 100, i, v, w;
    for (i = 0; i < 256; i++) {
      v = i / 255;
      v *= gain;
      v += br;
      v = (v - 0.5) * k + 0.5;
      if (hi) { w = clamp01((v - 0.35) / 0.65); v += hi * w * (hi > 0 ? (1 - v) : v); }
      if (sh) { w = clamp01((0.65 - v) / 0.65); v += sh * w * (sh > 0 ? (1 - v) : v); }
      lut[i] = clamp01(v) * 255;
    }
    return lut;
  }

  /* Everything the canvas filter cannot express (exposure, highlights,
     shadows, warmth, tint, vignette) has to be per-pixel, so ALL of it is,
     in one pass — mixing the two would make the order of operations
     incoherent. */
  function applyAdjust(ctx, W, H) {
    var a = state.adjust;
    var tone = a.exposure || a.brightness || a.contrast || a.highlights || a.shadows;
    var col = a.saturation || a.warmth || a.tint || a.hue;
    var vig = a.vignette;
    if (!tone && !col && !vig) return;

    var img = ctx.getImageData(0, 0, W, H), d = img.data;
    var lut = tone ? buildLUT(a) : null;
    var sat = 1 + a.saturation / 100;
    var warm = a.warmth / 100 * 42;
    var tnt = a.tint / 100 * 42;
    var m = null;
    if (a.hue) {
      var r1 = a.hue * Math.PI / 180, cs = Math.cos(r1), sn = Math.sin(r1);
      m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
           0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
           0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    }
    var vg = vig / 100;
    var cx = (W - 1) / 2, cy = (H - 1) / 2, maxD = Math.sqrt(cx * cx + cy * cy) || 1;
    var x, y, i, r, g, b, l, dx, dy, f;

    for (y = 0; y < H; y++) {
      dy = (y - cy) / maxD;
      for (x = 0; x < W; x++) {
        i = (y * W + x) << 2;
        if (d[i + 3] === 0) continue;          // nothing to do outside the shape
        r = d[i]; g = d[i + 1]; b = d[i + 2];
        if (lut) { r = lut[r]; g = lut[g]; b = lut[b]; }
        if (a.saturation) {
          l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
        }
        if (warm) { r += warm; b -= warm; }
        if (tnt) { g += tnt; r -= tnt * 0.5; b -= tnt * 0.5; }
        if (m) {
          var nr = m[0] * r + m[1] * g + m[2] * b;
          var ng = m[3] * r + m[4] * g + m[5] * b;
          var nb = m[6] * r + m[7] * g + m[8] * b;
          r = nr; g = ng; b = nb;
        }
        if (vg) {
          dx = (x - cx) / maxD;
          f = 1 - vg * (dx * dx + dy * dy);
          r *= f; g *= f; b *= f;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;   // Uint8ClampedArray clamps for us
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawBorder(ctx, W, H, k) {
    var b = state.border;
    if (!b.on || b.width <= 0) return;
    var lw = b.width * k;
    ctx.save();
    ctx.globalAlpha = b.opacity;
    ctx.strokeStyle = b.colour;
    ctx.lineJoin = "round";
    if (b.position === "centre") {
      shapePath(ctx, W, H); ctx.lineWidth = lw; ctx.stroke();
    } else if (b.position === "inside") {
      shapePath(ctx, W, H); ctx.clip();
      shapePath(ctx, W, H); ctx.lineWidth = lw * 2; ctx.stroke();
    } else {
      /* outside: stroke double width on a scratch layer, then subtract the
         interior, so only the outer half survives */
      var t = document.createElement("canvas");
      t.width = W; t.height = H;
      var tc = t.getContext("2d");
      tc.strokeStyle = b.colour; tc.lineJoin = "round"; tc.lineWidth = lw * 2;
      shapePath(tc, W, H); tc.stroke();
      tc.globalCompositeOperation = "destination-out";
      shapePath(tc, W, H); tc.fill();
      ctx.drawImage(t, 0, 0);
    }
    ctx.restore();
  }

  /* The only drawing path. Preview and export both come through here. */
  function renderTo(ctx, W, H) {
    var k = W / state.canvas.w;          // scales pixel-denominated values
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    shapePath(ctx, W, H);
    ctx.clip();
    drawBackground(ctx, W, H);
    drawPicture(ctx, W, H);
    ctx.restore();
    applyAdjust(ctx, W, H);
    drawBorder(ctx, W, H, k);
  }

  /* ---------------------------------------------------------------- preview */

  var preview = $("preview"), pctx = preview.getContext("2d", { willReadFrequently: true });
  var stage = $("stage"), hold = $("canvas-hold"), shapeUI = $("shape-ui");
  var outline = document.createElement("div");
  outline.style.cssText = "position:absolute;border:1px dashed rgba(106,166,255,.85);pointer-events:none;border-radius:2px";
  shapeUI.insertBefore(outline, shapeUI.firstChild);

  var renderCount = 0;                   // read by the verification harness
  window.__renderCount = function () { return renderCount; };

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; render(); });
  }

  function render() {
    renderCount++;
    var box = stage.getBoundingClientRect();
    var ar = state.canvas.w / state.canvas.h;
    var cssW = box.width, cssH = cssW / ar;
    if (cssH > box.height) { cssH = box.height; cssW = cssH * ar; }
    cssW = Math.max(40, cssW); cssH = Math.max(40, cssH);

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    /* never render the preview larger than the real output: a 100px avatar
       should look like a 100px avatar */
    var bw = Math.min(Math.round(cssW * dpr), state.canvas.w);
    var bh = Math.max(1, Math.round(bw / ar));

    if (preview.width !== bw || preview.height !== bh) { preview.width = bw; preview.height = bh; }
    preview.style.width = Math.round(cssW) + "px";
    preview.style.height = Math.round(cssH) + "px";
    hold.style.width = Math.round(cssW) + "px";
    hold.style.height = Math.round(cssH) + "px";

    renderTo(pctx, bw, bh);
    placeShapeUI();
    $("out-size").textContent = state.canvas.w + " × " + state.canvas.h;
  }

  function placeShapeUI() {
    var s = state.shape;
    var L = (s.x - s.w / 2) * 100, T = (s.y - s.h / 2) * 100;
    var Wp = s.w * 100, Hp = s.h * 100;
    outline.style.left = L + "%"; outline.style.top = T + "%";
    outline.style.width = Wp + "%"; outline.style.height = Hp + "%";
    var pos = { nw: [L, T], ne: [L + Wp, T], sw: [L, T + Hp], se: [L + Wp, T + Hp] };
    Object.keys(pos).forEach(function (c) {
      var el = shapeUI.querySelector(".handle." + c);
      el.style.left = pos[c][0] + "%"; el.style.top = pos[c][1] + "%";
    });
  }

  /* -------------------------------------------------------------- behaviour */

  /* Pointer handling follows the working pattern already proven in this repo
     (views/slots.html): setPointerCapture + rect-relative coordinates. */
  var drag = null;
  function localPt(e) {
    var r = preview.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  /* near the shape outline => move the shape; anywhere else => move the picture */
  function onOutline(p) {
    var s = state.shape, tol = 0.025;
    var dx = Math.abs(p.x - s.x) - s.w / 2, dy = Math.abs(p.y - s.y) - s.h / 2;
    var inside = dx < 0 && dy < 0;
    return inside && (Math.abs(dx) < tol || Math.abs(dy) < tol);
  }

  preview.addEventListener("pointerdown", function (e) {
    if (!state.image) return;
    e.preventDefault();
    var p = localPt(e);
    drag = { mode: onOutline(p) ? "shape" : "pic", x: p.x, y: p.y,
             sx: state.shape.x, sy: state.shape.y, px: state.pic.x, py: state.pic.y };
    preview.setPointerCapture(e.pointerId);
    preview.classList.add("dragging");
  });
  preview.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = localPt(e), dx = p.x - drag.x, dy = p.y - drag.y;
    if (drag.mode === "pic") {
      state.pic.x = drag.px + dx; state.pic.y = drag.py + dy;
    } else {
      state.shape.x = clamp(drag.sx + dx, 0, 1); state.shape.y = clamp(drag.sy + dy, 0, 1);
    }
    schedule();
  });
  ["pointerup", "pointercancel"].forEach(function (ev) {
    preview.addEventListener(ev, function () { drag = null; preview.classList.remove("dragging"); });
  });
  preview.addEventListener("wheel", function (e) {
    if (!state.image) return;
    e.preventDefault();
    var z = clamp(state.pic.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.1, 4);
    state.pic.zoom = z;
    $("zoom").value = Math.round(z * 100); $("zoom-out").textContent = Math.round(z * 100) + "%";
    schedule();
  }, { passive: false });

  shapeUI.addEventListener("pointerdown", function (e) {
    var h = e.target.closest(".handle"); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    var corner = h.dataset.corner, s = state.shape;
    var fixed = { x: corner.indexOf("w") >= 0 ? s.x + s.w / 2 : s.x - s.w / 2,
                  y: corner.indexOf("n") >= 0 ? s.y + s.h / 2 : s.y - s.h / 2 };
    h.setPointerCapture(e.pointerId);
    var move = function (ev) {
      var p = localPt(ev);
      var w = Math.abs(p.x - fixed.x), hh = Math.abs(p.y - fixed.y);
      state.shape.w = clamp(w, 0.05, 1); state.shape.h = clamp(hh, 0.05, 1);
      state.shape.x = clamp((p.x + fixed.x) / 2, 0, 1);
      state.shape.y = clamp((p.y + fixed.y) / 2, 0, 1);
      schedule();
    };
    var up = function () {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      h.removeEventListener("pointercancel", up);
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  });

  /* ------------------------------------------------------------ loading */

  var fileInput = $("file"), drop = $("drop"), errEl = $("err");
  function fail(msg) { errEl.textContent = msg; errEl.hidden = false; }

  async function loadFile(file) {
    if (!file) return;
    errEl.hidden = true;
    if (!/^image\//.test(file.type)) { fail("That is not a picture file."); return; }
    try {
      var bmp;
      if (window.createImageBitmap) {
        /* imageOrientation honours EXIF, so a phone photo is not sideways —
           the uploader elsewhere in this project gets this wrong */
        try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
        catch (e) { bmp = await createImageBitmap(file); }
      } else {
        bmp = await new Promise(function (res, rej) {
          var im = new Image(), url = URL.createObjectURL(file);
          im.onload = function () { URL.revokeObjectURL(url); res(im); };
          im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("decode")); };
          im.src = url;
        });
      }
      state.image = bmp;
      state.pic = clone(DEFAULTS.pic);
      syncPicControls();
      drop.hidden = true; hold.hidden = false; shapeUI.hidden = false;
      $("stage-hint").hidden = false;
      render();
    } catch (e) {
      fail("That picture could not be opened. Try a PNG, JPEG, WebP or GIF.");
    }
  }

  drop.addEventListener("click", function () { fileInput.click(); });
  $("pic-replace").addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { loadFile(fileInput.files && fileInput.files[0]); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  /* ------------------------------------------------------------- controls */

  function pickOne(container, el) {
    container.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("on"); });
    if (el) el.classList.add("on");
  }

  function syncPicControls() {
    $("zoom").value = Math.round(state.pic.zoom * 100);
    $("zoom-out").textContent = Math.round(state.pic.zoom * 100) + "%";
    $("rotate").value = state.pic.rotate;
    $("rotate-out").textContent = state.pic.rotate + "°";
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.mode === state.pic.mode);
    });
    $("mirror").classList.toggle("on", state.pic.mirror);
  }

  $("zoom").addEventListener("input", function () {
    state.pic.zoom = this.value / 100; $("zoom-out").textContent = this.value + "%"; schedule();
  });
  $("rotate").addEventListener("input", function () {
    state.pic.rotate = +this.value; $("rotate-out").textContent = this.value + "°"; schedule();
  });
  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.pic.mode = b.dataset.mode; state.pic.zoom = 1; syncPicControls(); schedule();
    });
  });
  $("mirror").addEventListener("click", function () {
    state.pic.mirror = !state.pic.mirror; syncPicControls(); schedule();
  });
  function rotateBy(d) {
    var v = state.pic.rotate + d;
    while (v > 180) v -= 360; while (v < -180) v += 360;
    state.pic.rotate = v; syncPicControls(); schedule();
  }
  $("rot-ccw").addEventListener("click", function () { rotateBy(-90); });
  $("rot-cw").addEventListener("click", function () { rotateBy(90); });
  $("pic-reset").addEventListener("click", function () {
    state.pic = clone(DEFAULTS.pic); syncPicControls(); schedule();
  });

  /* canvas size */
  function setSize(w, h) {
    state.canvas.w = clamp(Math.round(w) || 16, 16, 4096);
    state.canvas.h = clamp(Math.round(h) || 16, 16, 4096);
    $("cw").value = state.canvas.w; $("ch").value = state.canvas.h;
    document.querySelectorAll("[data-size]").forEach(function (b) {
      b.classList.toggle("on", +b.dataset.size === state.canvas.w && state.canvas.w === state.canvas.h);
    });
    schedule();
  }
  document.querySelectorAll("[data-size]").forEach(function (b) {
    b.addEventListener("click", function () { setSize(+b.dataset.size, +b.dataset.size); });
  });
  function digitsOnly(el) {
    el.addEventListener("input", function () { el.value = el.value.replace(/\D/g, ""); });
  }
  digitsOnly($("cw")); digitsOnly($("ch"));
  $("cw").addEventListener("change", function () {
    var w = +this.value, ar = state.canvas.w / state.canvas.h;
    setSize(w, state.canvas.locked ? Math.round(w / ar) : state.canvas.h);
  });
  $("ch").addEventListener("change", function () {
    var h = +this.value, ar = state.canvas.w / state.canvas.h;
    setSize(state.canvas.locked ? Math.round(h * ar) : state.canvas.w, h);
  });
  $("lock-on").addEventListener("click", function () {
    state.canvas.locked = true; $("lock-on").classList.add("on"); $("lock-off").classList.remove("on");
  });
  $("lock-off").addEventListener("click", function () {
    state.canvas.locked = false; $("lock-off").classList.add("on"); $("lock-on").classList.remove("on");
  });

  /* shapes */
  var shapesBox = $("shapes");
  SHAPE_ORDER.forEach(function (kind) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "shape-btn" + (kind === state.shape.kind ? " on" : "");
    b.title = kind; b.dataset.shape = kind;
    var c = document.createElement("canvas"); c.width = c.height = 44;
    var cc = c.getContext("2d");
    cc.beginPath(); SHAPES[kind](cc, 4, 4, 36, 36); cc.fillStyle = "#9fb0c6"; cc.fill();
    b.appendChild(c);
    b.addEventListener("click", function () {
      state.shape.kind = kind;
      shapesBox.querySelectorAll(".shape-btn").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      schedule();
    });
    shapesBox.appendChild(b);
  });
  $("shape-reset").addEventListener("click", function () {
    state.shape.x = 0.5; state.shape.y = 0.5; state.shape.w = 1; state.shape.h = 1; schedule();
  });

  /* border */
  $("border-on").addEventListener("click", function () {
    state.border.on = true; this.classList.add("on"); $("border-off").classList.remove("on"); schedule();
  });
  $("border-off").addEventListener("click", function () {
    state.border.on = false; this.classList.add("on"); $("border-on").classList.remove("on"); schedule();
  });
  $("bw").addEventListener("input", function () {
    state.border.width = +this.value; $("bw-out").textContent = this.value + "px"; schedule();
  });
  $("bw-reset").addEventListener("click", function () {
    state.border.width = 3; $("bw").value = 3; $("bw-out").textContent = "3px"; schedule();
  });
  document.querySelectorAll("[data-bpos]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.border.position = b.dataset.bpos;
      document.querySelectorAll("[data-bpos]").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on"); schedule();
    });
  });
  $("bcolour").addEventListener("input", function () { state.border.colour = this.value; schedule(); });
  $("bop").addEventListener("input", function () {
    state.border.opacity = this.value / 100; $("bop-out").textContent = this.value + "%"; schedule();
  });

  /* background */
  document.querySelectorAll("[data-bg]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.bg.mode = b.dataset.bg;
      pickOne($("bg-modes"), b);
      $("bg-solid-row").hidden = state.bg.mode !== "solid";
      $("bg-grad-row").hidden = state.bg.mode !== "gradient";
      schedule();
    });
  });
  $("bgcolour").addEventListener("input", function () { state.bg.colour = this.value; schedule(); });
  $("bgfrom").addEventListener("input", function () { state.bg.from = this.value; schedule(); });
  $("bgto").addEventListener("input", function () { state.bg.to = this.value; schedule(); });
  $("bgangle").addEventListener("input", function () {
    state.bg.angle = +this.value; $("bgangle-out").textContent = this.value + "°"; schedule();
  });

  /* adjustments */
  var ADJ = ["exposure", "brightness", "contrast", "highlights", "shadows",
             "saturation", "warmth", "tint", "hue", "vignette"];
  ADJ.forEach(function (key) {
    var el = $(key);
    el.addEventListener("input", function () {
      state.adjust[key] = +this.value;
      this.parentNode.querySelector("output").textContent = this.value + (key === "hue" ? "°" : "");
      schedule();
    });
  });
  function syncAdj() {
    ADJ.forEach(function (key) {
      var el = $(key);
      el.value = state.adjust[key];
      el.parentNode.querySelector("output").textContent = state.adjust[key] + (key === "hue" ? "°" : "");
    });
  }
  var presetBox = $("presets");
  Object.keys(PRESETS).forEach(function (name) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (name === "Natural" ? " on" : "");
    b.textContent = name;
    b.addEventListener("click", function () {
      state.adjust = Object.assign(clone(DEFAULTS.adjust), PRESETS[name]);
      pickOne(presetBox, b); syncAdj(); schedule();
    });
    presetBox.appendChild(b);
  });
  $("adj-reset").addEventListener("click", function () {
    state.adjust = clone(DEFAULTS.adjust);
    pickOne(presetBox, presetBox.firstChild); syncAdj(); schedule();
  });

  /* ---------------------------------------------------------------- export */

  function exportCanvas() {
    var c = document.createElement("canvas");
    c.width = state.canvas.w; c.height = state.canvas.h;
    renderTo(c.getContext("2d", { willReadFrequently: true }), c.width, c.height);
    return c;
  }
  function toBlob(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, "image/png"); });
  }
  window.__exportCanvas = exportCanvas;   // used by the verification harness

  async function download() {
    if (!state.image) { fail("Choose a picture first."); return; }
    var blob = await toBlob(exportCanvas());
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "avatar-" + state.canvas.w + "x" + state.canvas.h + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $("download").addEventListener("click", download);
  $("download2").addEventListener("click", download);

  /* Clipboard images need a secure context and a browser that implements
     ClipboardItem; it is the one control that cannot be made to work
     everywhere, so it is hidden rather than offered and broken. */
  var canCopy = !!(navigator.clipboard && window.ClipboardItem && window.isSecureContext);
  if (canCopy) { $("copy").hidden = false; $("copy2").hidden = false; }
  else { $("copy-note").hidden = false; }
  async function copy(btn) {
    if (!state.image) { fail("Choose a picture first."); return; }
    try {
      var blob = await toBlob(exportCanvas());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      var old = btn.textContent; btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1400);
    } catch (e) { fail("The browser would not let us write to the clipboard."); }
  }
  $("copy").addEventListener("click", function () { copy(this); });
  $("copy2").addEventListener("click", function () { copy(this); });

  /* start over */
  $("reset-all").addEventListener("click", function () {
    state.image = null;
    state.canvas = { w: 512, h: 512, locked: true };
    state.pic = clone(DEFAULTS.pic); state.shape = clone(DEFAULTS.shape);
    state.border = clone(DEFAULTS.border); state.bg = clone(DEFAULTS.bg);
    state.adjust = clone(DEFAULTS.adjust);
    drop.hidden = false; hold.hidden = true; shapeUI.hidden = true;
    $("stage-hint").hidden = true; errEl.hidden = true;
    setSize(512, 512); syncPicControls(); syncAdj();
    shapesBox.querySelectorAll(".shape-btn").forEach(function (x, i) { x.classList.toggle("on", i === 0); });
    pickOne(presetBox, presetBox.firstChild);
    pickOne($("bg-modes"), $("bg-modes").firstElementChild);
    $("bg-solid-row").hidden = true; $("bg-grad-row").hidden = true;
  });

  window.addEventListener("resize", schedule);
  setSize(512, 512);
})();
