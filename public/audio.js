/* Site-wide audio bus.
 *
 * One AudioContext and one gain node per channel, shared by every sound on the
 * page. Channels are:
 *   music     long-form music (Elysium's track)
 *   ambience  room tone, rain, drones
 *   typing    interface sounds: key clicks, hovers, button blips
 *
 * Settings live in localStorage under one key, so every page and every tab
 * agrees, and a `storage` event keeps open tabs in sync. Each channel has a
 * volume 0..1 and a mute flag. Volume changes are applied to gain.value
 * directly, with no ramp: toggling is meant to be instant.
 *
 * Levels default to 0.5, which is deliberately half of what the individual
 * sounds were originally mixed at; the per-sound gains were left alone and
 * this channel gain scales them.
 *
 * Duplicate audio across tabs: browsers that show two tabs at once (Zen's
 * split view) would otherwise run two copies of the room tone. Continuous
 * sound therefore takes a lock over BroadcastChannel; only the holder plays
 * it. One-shot interface sounds are unaffected, since they only fire in the
 * tab you are actually touching.
 *
 *   AudioBus.ctx()                  the shared AudioContext (may be null)
 *   AudioBus.channel("ambience")    a GainNode to connect a source to
 *   AudioBus.get("music")           -> {volume, muted}
 *   AudioBus.set("music", {...})    persists + applies instantly + notifies
 *   AudioBus.subliminals            -> bool ; AudioBus.setSubliminals(bool)
 *   AudioBus.onChange(fn)           fires on any local or cross-tab change
 *   AudioBus.claimContinuous(fn)    fn(hasLock) whenever ownership changes
 *   AudioBus.unlock()               start the context on the next gesture
 */
window.AudioBus = (function () {
  "use strict";

  var KEY = "angeldom-audio";
  var CHANNELS = ["music", "ambience", "typing"];
  var DEFAULTS = {
    // master scales the other three; it is not a channel of its own
    master: { volume: 1, muted: false },
    music: { volume: 0.5, muted: false },
    ambience: { volume: 0.5, muted: false },
    typing: { volume: 0.5, muted: false },
    subliminals: true,
  };

  var state = load();
  var actx = null, gains = {}, listeners = [], unlocked = false;

  function load() {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      CHANNELS.forEach(function (c) {
        if (raw[c] && typeof raw[c] === "object") {
          if (typeof raw[c].volume === "number") out[c].volume = Math.max(0, Math.min(1, raw[c].volume));
          if (typeof raw[c].muted === "boolean") out[c].muted = raw[c].muted;
        }
      });
      if (typeof raw.subliminals === "boolean") out.subliminals = raw.subliminals;
    } catch (e) {}
    return out;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }

  function channel(name) {
    var a = ctx();
    if (!a) return null;
    if (!gains[name]) {
      var g = a.createGain();
      g.gain.value = level(name);
      g.connect(a.destination);
      gains[name] = g;
    }
    return gains[name];
  }
  function level(name) {
    var c = state[name] || DEFAULTS.typing;
    var m = state.master || DEFAULTS.master;
    if (c.muted || m.muted) return 0;
    return c.volume * m.volume;
  }
  function apply() {
    CHANNELS.forEach(function (name) {
      if (gains[name]) gains[name].gain.value = level(name);   // no ramp, on purpose
    });
  }
  function notify() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  function get(name) {
    var c = state[name] || DEFAULTS.typing;
    return { volume: c.volume, muted: c.muted };
  }
  function set(name, patch) {
    if (name !== "master" && CHANNELS.indexOf(name) < 0) return;
    if (!state[name]) state[name] = { volume: DEFAULTS[name].volume, muted: DEFAULTS[name].muted };
    if (patch && typeof patch.volume === "number") state[name].volume = Math.max(0, Math.min(1, patch.volume));
    if (patch && typeof patch.muted === "boolean") state[name].muted = patch.muted;
    persist(); apply(); notify();
  }
  function setSubliminals(on) {
    state.subliminals = Boolean(on);
    persist(); notify();
  }

  // another tab changed the settings
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    state = load(); apply(); notify();
  });

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  /* ---- continuous-audio lock, so split views do not double up ---- */
  var chan = null, myId = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
  var peers = {}, holder = null, lockCbs = [];
  try { chan = new BroadcastChannel("angeldom-audio-lock"); } catch (e) {}

  function eligible() { return document.visibilityState === "visible"; }
  function announce() {
    if (!chan) return;
    chan.postMessage({ id: myId, visible: eligible(), t: Date.now() });
  }
  function elect() {
    var now = Date.now();
    Object.keys(peers).forEach(function (id) { if (now - peers[id].t > 4000) delete peers[id]; });
    var pool = Object.keys(peers).filter(function (id) { return peers[id].visible; });
    if (eligible()) pool.push(myId);
    pool.sort();
    var next = pool.length ? pool[0] : null;
    if (next !== holder) {
      holder = next;
      var mine = holder === myId;
      lockCbs.forEach(function (fn) { try { fn(mine); } catch (e) {} });
    }
  }
  if (chan) {
    chan.onmessage = function (e) {
      var d = e.data;
      if (!d || !d.id || d.id === myId) return;
      peers[d.id] = { visible: d.visible, t: Date.now() };
      elect();
    };
    setInterval(function () { announce(); elect(); }, 1500);
    document.addEventListener("visibilitychange", function () { announce(); elect(); });
    window.addEventListener("pagehide", function () {
      try { chan.postMessage({ id: myId, visible: false, t: Date.now(), gone: true }); } catch (e) {}
    });
  }
  // With no BroadcastChannel there is nothing to co-ordinate with, so this tab
  // simply owns continuous audio.
  function claimContinuous(fn) {
    if (typeof fn !== "function") return;
    lockCbs.push(fn);
    if (!chan) { holder = myId; fn(true); return; }
    announce(); elect();
    fn(holder === myId);
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var go = function () { ctx(); };
    document.addEventListener("pointerdown", go, { once: true });
    document.addEventListener("keydown", go, { once: true });
  }
  unlock();

  return {
    ctx: ctx, channel: channel, get: get, set: set,
    get subliminals() { return state.subliminals; },
    setSubliminals: setSubliminals,
    onChange: onChange, claimContinuous: claimContinuous, unlock: unlock,
    channels: CHANNELS.slice(),
  };
})();
