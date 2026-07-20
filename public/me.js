/* Single-flight /api/me.
 *
 * GET /api/me reports the daily check-in award, and the server only reports it
 * ONCE per day, and whichever caller lands first consumes it. When the dashboard,
 * the nav and the notification bell each fetched it independently, the check-in
 * notice went to whoever won the race and appeared to vanish at random.
 *
 * So there is exactly one request per page load, and everyone shares its
 * result. Loaded WITHOUT defer from <head>, so window.siteMe exists before any
 * page's inline script runs.
 *
 *   window.siteMe().then((d) => …)   // resolves with the /api/me payload
 *   window.siteMe.reload()           // forces a fresh fetch (rare)
 *
 * The promise rejects when signed out; callers that guard a page should
 * redirect in .catch(). */
(function () {
  "use strict";

  var pending = null;

  function siteMe() {
    if (!pending) {
      pending = fetch("/api/me").then(function (r) {
        return r.ok ? r.json() : Promise.reject(new Error("signed out"));
      });
      // A rejection must not be cached as a permanently-failed promise for any
      // later caller that wants to retry.
      pending.catch(function () { pending = null; });
    }
    return pending;
  }

  siteMe.reload = function () {
    pending = null;
    return siteMe();
  };

  window.siteMe = siteMe;
})();
