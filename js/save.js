window.PeelIt = window.PeelIt || {};

/*
 * save.js - Persistent player-progress shape, built only on top of
 * PeelIt.SDK. Never touches localStorage directly (see sdk.js).
 */
PeelIt.Save = (function () {
  'use strict';

  var DEFAULT_STATE = {
    unlockedIndex: 0,   // highest level index (0-based) the player may play
    stars: {},          // { levelId: 1-3 }
    foil: {},           // { levelId: true } cosmetic unlock via rewarded ad
    muted: false,
    seenHint: false      // whether the onboarding hand hint has been consumed
  };

  var state = null;

  function applyLoaded(loaded) {
    state = Object.assign({}, DEFAULT_STATE, loaded || {});
    // Merge nested dicts explicitly so a partial/old save can't wipe fields.
    state.stars = Object.assign({}, DEFAULT_STATE.stars, (loaded && loaded.stars) || {});
    state.foil = Object.assign({}, DEFAULT_STATE.foil, (loaded && loaded.foil) || {});
  }

  // Callback-based because some platform SDKs (e.g. Playgama) load saved
  // data asynchronously. Call this once, before anything else touches
  // PeelIt.Save, then use the synchronous get()/set* methods afterward.
  function load(done) {
    PeelIt.SDK.loadData(function (loaded, timedOut) {
      applyLoaded(loaded);

      // Write straight back once on every CONFIRMED load (even a brand-new
      // player with nothing to save yet) so a shallow playthrough still
      // produces at least one storage.set call - without this, persist()
      // only ever runs after a level completion / mute toggle / foil
      // unlock, which some moderation checks read as "save not integrated"
      // even though it is.
      //
      // Critically, this is skipped when timedOut is true. A timeout means
      // we do NOT actually know whether real saved data exists - the real
      // bridge.storage.get() call may still be in flight and could return
      // actual progress seconds later (see sdk.js's loadData). Persisting
      // defaults here would silently overwrite that real data the moment
      // it arrives late - this was a real, shipped bug: the two events
      // were only ~2ms apart in one observed case, confirming the eager
      // write was clobbering the real answer before it ever came back.
      if (!timedOut) persist();

      done && done(state);
    });
  }

  // Called by the SDK layer if a loadData() call that had already timed
  // out (see load() above) later resolves with a real answer. Recovers
  // progress that would otherwise have been silently lost, unless the
  // player has already made real progress THIS session in the meantime
  // (rare, but a level completed in the gap between timeout and late
  // arrival shouldn't be clobbered backwards by older late-arriving data).
  function applyLateData(loaded) {
    if (!loaded) return; // confirmed no saved data; nothing to recover
    var madeSessionProgress = state && (state.unlockedIndex > 0 || Object.keys(state.stars || {}).length > 0);
    if (madeSessionProgress) return;
    applyLoaded(loaded);
    persist(); // now safe - this is a confirmed real answer, not a guess
  }

  function persist() {
    // Defensive: a platform adapter's saveData() can throw synchronously
    // (e.g. a bridge sub-object not populated yet) rather than just
    // rejecting a promise. persist() is called from load()'s own SDK
    // callback (see below), so an uncaught throw here would silently kill
    // the whole init chain before the game ever renders anything.
    try {
      PeelIt.SDK.saveData(state);
    } catch (err) {
      console.warn('[Save] persist failed', err);
    }
  }

  function get() {
    // Defensive fallback only: by the time any UI code calls get(), Game.init()
    // must already have awaited load()'s callback. This only self-heals on
    // synchronous adapters (web/youtube/poki); it will not populate state in
    // time on a true async platform, so don't rely on it there.
    if (!state) load();
    return state;
  }

  function setStars(levelId, stars) {
    get();
    if (!state.stars[levelId] || stars > state.stars[levelId]) {
      state.stars[levelId] = stars;
      persist();
    }
  }

  function unlockNext(index) {
    get();
    if (index > state.unlockedIndex) {
      state.unlockedIndex = index;
      persist();
    }
  }

  function setFoil(levelId) {
    get();
    state.foil[levelId] = true;
    persist();
  }

  function hasFoil(levelId) {
    get();
    return !!state.foil[levelId];
  }

  function toggleMute() {
    get();
    state.muted = !state.muted;
    persist();
    return state.muted;
  }

  function markHintSeen() {
    get();
    state.seenHint = true;
    persist();
  }

  return {
    load: load,
    get: get,
    setStars: setStars,
    unlockNext: unlockNext,
    setFoil: setFoil,
    hasFoil: hasFoil,
    toggleMute: toggleMute,
    markHintSeen: markHintSeen,
    applyLateData: applyLateData
  };
})();
