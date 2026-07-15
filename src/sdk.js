window.PeelIt = window.PeelIt || {};

/*
 * sdk.js - Platform abstraction layer.
 *
 * The rest of the game NEVER touches localStorage or an ad network
 * directly. Everything goes through PeelIt.SDK so the game can be dropped
 * into Playgama (which itself is a UNIFIED bridge to Poki, CrazyGames,
 * YouTube Playables, Y8, Facebook and more - one integration routes to
 * whichever platform the game actually runs on), or run standalone on the
 * open web with zero code changes elsewhere.
 *
 * The separate youtubeAdapter/pokiAdapter stubs below are kept only for
 * the (less likely) case of embedding this game directly on one of those
 * platforms outside of Playgama's distribution network. When publishing
 * through Playgama, the playgamaAdapter is the only one that matters -
 * see detectPlatform().
 *
 * To port to a new platform: implement the same 8 methods as a new
 * adapter object below, then add a detection rule in detectPlatform().
 *
 * loadData(callback) is deliberately callback-based rather than a plain
 * return value: some platform SDKs (e.g. Playgama's bridge.storage.get)
 * are Promise-based, so the abstraction has to support async loading
 * everywhere, not just on platforms that happen to be synchronous.
 */
PeelIt.SDK = (function () {
  'use strict';

  // ---- Web adapter (default, used for local testing & plain web) ------
  var webAdapter = {
    id: 'web',
    init: function (done) { done && done(); },
    getLanguage: function () { return (navigator.language || 'en').slice(0, 2); },
    saveData: function (obj) {
      try {
        localStorage.setItem('peelit-save', JSON.stringify(obj));
        return true;
      } catch (e) {
        console.warn('[SDK:web] saveData failed', e);
        return false;
      }
    },
    loadData: function (callback) {
      var data = null;
      try {
        var raw = localStorage.getItem('peelit-save');
        data = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('[SDK:web] loadData failed', e);
      }
      callback(data);
    },
    gameReady: function () { /* no-op: nothing to report to on plain web */ },
    gameplayStarted: function () { /* no-op */ },
    gameplayStopped: function () { /* no-op */ },
    levelStarted: function () { /* no-op */ },
    levelComplete: function () { /* no-op */ },
    showRewardedAd: function (placement, onReward) {
      // No ad network here. Simulate a short "ad" delay (with the same
      // pause/resume the real thing does) so the reward flows can be built and
      // demoed end-to-end locally.
      adBreakBegin();
      window.setTimeout(function () {
        adBreakEnd();
        onReward && onReward();
      }, 400);
    },
    showInterstitialAd: function (onClosed) {
      // No ad network here. Just call back quickly so the level-to-level flow
      // (see game.js) isn't blocked during local testing.
      adBreakBegin();
      window.setTimeout(function () {
        adBreakEnd();
        onClosed && onClosed();
      }, 100);
    }
  };

  // ---- YouTube Playables adapter (STUB - fill in when integrating) ----
  // Docs: https://developers.google.com/youtube/gaming/playables
  // Typical calls: ytgame.gameReady(), ytgame.saveGame()/loadGame(),
  // ytgame.getAdInstance().requestRewardedAd(...)
  var youtubeAdapter = {
    id: 'youtube',
    getLanguage: function () { return webAdapter.getLanguage(); }, // TODO: read the real platform language if this SDK exposes one
    init: function (done) {
      // TODO: await the Playables SDK bootstrap here if it is async.
      done && done();
    },
    saveData: function (obj) {
      // TODO: window.ytgame.saveGame(JSON.stringify(obj));
      return webAdapter.saveData(obj); // fallback until wired up
    },
    loadData: function (callback) {
      // TODO: var raw = window.ytgame.loadGame(); callback(raw ? JSON.parse(raw) : null);
      webAdapter.loadData(callback);
    },
    gameReady: function () {
      // TODO: window.ytgame.gameReady();
    },
    levelStarted: function (levelId) {
      // TODO: wire to the real lifecycle call for this platform.
    },
    levelComplete: function (levelId) {
      // TODO: window.ytgame.stats && window.ytgame.stats.reportMilestone(levelId);
    },
    gameplayStarted: function () { /* TODO: wire to this platform if it has one */ },
    gameplayStopped: function () { /* TODO: wire to this platform if it has one */ },
    showRewardedAd: function (placement, onReward, onFail) {
      // TODO:
      // window.ytgame.getAdInstance().requestRewardedAd({
      //   onSuccess: onReward, onFail: onFail
      // });
      webAdapter.showRewardedAd(placement, onReward, onFail);
    },
    showInterstitialAd: function (onClosed) {
      // TODO: wire to the real interstitial call for this platform.
      webAdapter.showInterstitialAd(onClosed);
    }
  };

  // ---- Poki SDK adapter (STUB - fill in when integrating) -------------
  // Docs: https://sdk.poki.com/
  // Typical calls: PokiSDK.init(), PokiSDK.gameLoadingFinished(),
  // PokiSDK.gameplayStart()/gameplayStop(), PokiSDK.rewardedBreak()
  var pokiAdapter = {
    id: 'poki',
    getLanguage: function () { return webAdapter.getLanguage(); }, // TODO: read the real platform language if this SDK exposes one
    init: function (done) {
      // TODO: window.PokiSDK.init().then(function () { done && done(); });
      done && done();
    },
    saveData: function (obj) {
      // Poki has no cloud save API; localStorage is the correct backing
      // store here too, so we reuse the web adapter's implementation.
      return webAdapter.saveData(obj);
    },
    loadData: function (callback) {
      webAdapter.loadData(callback);
    },
    gameReady: function () {
      // TODO: window.PokiSDK.gameLoadingFinished();
    },
    levelStarted: function () {
      // TODO: call PokiSDK.gameplayStart() here.
    },
    levelComplete: function () {
      // TODO: call PokiSDK.gameplayStop() here.
    },
    gameplayStarted: function () { /* TODO: PokiSDK.gameplayStart() */ },
    gameplayStopped: function () { /* TODO: PokiSDK.gameplayStop() */ },
    showRewardedAd: function (placement, onReward, onFail) {
      // TODO:
      // window.PokiSDK.rewardedBreak().then(function (success) {
      //   success ? (onReward && onReward()) : (onFail && onFail());
      // });
      webAdapter.showRewardedAd(placement, onReward, onFail);
    },
    showInterstitialAd: function (onClosed) {
      // TODO: wire to the real interstitial call for this platform.
      webAdapter.showInterstitialAd(onClosed);
    }
  };

  // ---- Playgama Bridge adapter -----------------------------------------
  // Docs: https://wiki.playgama.com/playgama/bridge-sdk/getting-started
  //       https://wiki.playgama.com/playgama/bridge-sdk/api/platform
  //       https://wiki.playgama.com/playgama/bridge-sdk/api/advertisement/rewarded
  //       https://wiki.playgama.com/playgama/bridge-sdk/api/advertisement/interstitial
  //       https://wiki.playgama.com/playgama/sdk/playgama-bridge-config
  //
  // Requires TWO things at the project root, alongside index.html:
  //   1. This script tag, added to index.html BEFORE game.js:
  //      <script src="https://bridge.playgama.com/v1/stable/playgama-bridge.js"></script>
  //      which exposes a global `bridge` object.
  //   2. playgama-bridge-config.json, which declares the ad placement IDs
  //      referenced below (REWARDED_PLACEMENT / INTERSTITIAL_PLACEMENT).
  //      The draft at the project root was hand-written from doc search
  //      excerpts (the schema editor UI itself isn't fetchable from this
  //      environment) - re-validate it through the real config editor
  //      (https://playgama.github.io/bridge-config-editor/) before
  //      shipping, and keep the two placement id strings in sync between
  //      that file and the constants just below.
  //
  // CONFIRMED from Playgama's docs:
  //   - Bridge is a UNIFIED integration: when the game runs on a supported
  //     platform (Poki, CrazyGames, YouTube Playables, Facebook, Y8, ...),
  //     Bridge auto-loads that platform's native scripts and routes calls
  //     to it. In unsupported environments (including local dev), Bridge
  //     falls back to a mock platform that returns safe defaults instead
  //     of throwing - so bridge.initialize() should never truly hang, but
  //     the timeout below is kept as a hard safety net regardless.
  //   - bridge.initialize() returns a Promise; wait for it before any other call.
  //   - bridge.platform.sendMessage('game_ready') must fire on the first
  //     playable frame; sendMessage takes the literal string (confirmed
  //     against the Plain JS tab of the Platform API page - other engines
  //     use a wrapped constant, Plain JS does not), is itself Promise-based,
  //     and is always safe to call even on platforms that ignore a given
  //     message. Other useful messages (also literal strings): level_started,
  //     level_completed, level_failed, level_paused, level_resumed - each
  //     takes an optional { world, level } payload.
  //   - bridge.storage.get/set/delete are Promise-based (NOT synchronous),
  //     which is why PeelIt.SDK.loadData() takes a callback rather than
  //     returning a value directly (see save.js / game.js).
  //   - bridge.advertisement.showRewarded(placement) plays a rewarded ad
  //     (placement is an optional string, confirmed on the Rewarded doc's
  //     sibling Interstitial page - same signature shape); reward the
  //     player ONLY on a 'rewarded' state, never on 'closed' (closing early
  //     must not grant the reward).
  //   - bridge.advertisement.showInterstitial(placement) plays an
  //     interstitial; gated behind bridge.advertisement.isInterstitialSupported.
  //     Per Playgama's explicit guidance: never call this at game start
  //     (platforms that want one there show it automatically, so an
  //     explicit call would double it up) - only at natural breakpoints
  //     like a level transition or returning to the menu (see
  //     triggerLevelComplete() and the next/menu button handlers in game.js).
  //   - Ad state values are 'loading' / 'opened' / 'closed' / 'failed' for
  //     both ad types (confirmed on the Interstitial page; assumed
  //     identical for Rewarded plus its own 'rewarded' state).
  //   - bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED is the CONFIRMED exact
  //     constant for subscribing to interstitial state changes (Interstitial
  //     API doc, Plain JS tab: `bridge.advertisement.on(bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, state => ...)`).
  //   - Playgama's docs EXPLICITLY warn against pausing/muting audio
  //     per-ad-type ("prefer the universal platform events... instead of
  //     duplicating the logic per ad type"). So showRewardedAd/
  //     showInterstitialAd below do NOT call pauseForAd/resumeAfterAd
  //     themselves (an earlier version of this file did - removed once this
  //     guidance was confirmed) - muting/pausing is handled exclusively by
  //     the bridge.EVENT_NAME.AUDIO_STATE_CHANGED / PAUSE_STATE_CHANGED
  //     subscription in subscribeToPlatformAudioPause() below, which fires
  //     for every ad type and any other platform-triggered pause uniformly.
  //     Both callbacks receive a plain boolean (isEnabled / isPaused),
  //     also confirmed (Platform API doc).
  //
  // NOT YET VERIFIED (the Rewarded API page specifically wasn't fetchable
  // from this environment - confirm before shipping):
  //   - REWARDED_STATE_EVENT below is a high-confidence INFERENCE of
  //     bridge.EVENT_NAME.REWARDED_STATE_CHANGED, following the exact same
  //     "bridge.EVENT_NAME.{TYPE}_STATE_CHANGED" pattern confirmed for
  //     INTERSTITIAL/AUDIO/PAUSE - but not yet seen directly on the
  //     Rewarded doc page itself.
  //   - Whether bridge.advertisement has a symmetric .off() to unsubscribe
  //     (assumed below; guarded with a feature check either way).
  //
  // Must match the placement ids declared in playgama-bridge-config.json.
  var PLACEMENTS = {
    hint: 'rewarded_hint'
  };
  var INTERSTITIAL_PLACEMENT = 'interstitial_level_transition';

  // Read the event-name constants lazily: bridge.EVENT_NAME may not be
  // populated at module-eval time on every host.
  function rewardedStateEvent() {
    return (window.bridge && window.bridge.EVENT_NAME && window.bridge.EVENT_NAME.REWARDED_STATE_CHANGED)
      || 'rewarded_state_changed';
  }
  function interstitialStateEvent() {
    return (window.bridge && window.bridge.EVENT_NAME && window.bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED)
      || 'interstitial_state_changed';
  }
  // PLATFORM_MESSAGE constants, with the literal string as a fallback.
  function msg(name, literal) {
    return (window.bridge && window.bridge.PLATFORM_MESSAGE && window.bridge.PLATFORM_MESSAGE[name]) || literal;
  }

  // Playgama's advertising requirements are explicit: "When showing full-screen
  // ads (interstitial or rewarded video), the game sound and gameplay must be
  // paused." We subscribe to the platform's own PAUSE/AUDIO events too (see
  // subscribeToPlatformAudioPause), but those are not relayed by every platform
  // behind the bridge - so we ALSO pause explicitly around every ad call. Both
  // paths are idempotent, so a double pause/resume is harmless.
  function adBreakBegin() {
    try { PeelIt.Audio.pauseForAd(); } catch (e) { /* audio not ready */ }
    try { if (PeelIt.Game && PeelIt.Game.setPaused) PeelIt.Game.setPaused(true); } catch (e) { /* not booted */ }
  }
  function adBreakEnd() {
    try { PeelIt.Audio.resumeAfterAd(); } catch (e) { /* audio not ready */ }
    try { if (PeelIt.Game && PeelIt.Game.setPaused) PeelIt.Game.setPaused(false); } catch (e) { /* not booted */ }
  }

  var playgamaAdapter = (function () {
    // Defensive wrapper for every direct window.bridge.* access below. A
    // bridge sub-object (storage/platform/advertisement) not being
    // populated yet throws a plain synchronous TypeError, NOT a rejected
    // promise - a .catch() further down the chain never sees that, so an
    // unguarded call can silently kill an init/save/gameReady chain before
    // it ever completes (this is exactly what produced a stuck "waiting
    // for Game Ready" state with a blank canvas during Playgama's own
    // moderation check - see the fix history in save.js's persist()).
    // Returns true if fn ran without throwing.
    function safeCall(fn) {
      try {
        fn();
        return true;
      } catch (err) {
        console.warn('[SDK:playgama] bridge call failed', err);
        return false;
      }
    }

    // Redundant local backup, fully within our own control - NOT a guess
    // at Playgama's internal storage key scheme (that would be guesswork
    // we can't verify and could get wrong again). This is our own plain
    // window.localStorage key, written alongside every real bridge.storage
    // save. Confirmed via the on-screen debug overlay: bridge.initialize()
    // resolves fine and bridge.storage.set() reports "ok", but
    // bridge.storage.get()'s promise never settles at all on the real
    // platform (not just slow - permanently stuck, observed unchanged
    // minutes later). That is Playgama's bug to fix, not ours, but since
    // storage.defaultType is 'local_storage' (real browser localStorage
    // under the hood), keeping our own parallel copy lets the game recover
    // real progress even while their get() stays broken. Wrapped in
    // try/catch because a sandboxed iframe without allow-same-origin can
    // throw a SecurityError on any localStorage access - if that happens,
    // this silently no-ops and behavior is unchanged from before.
    var LOCAL_BACKUP_KEY = 'peelit-local-backup';
    function writeLocalBackup(obj) {
      try {
        window.localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(obj));
      } catch (err) {
        console.warn('[SDK:playgama] local backup write failed', err);
      }
    }
    function readLocalBackup() {
      try {
        var raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('[SDK:playgama] local backup read failed', err);
        return null;
      }
    }

    var readyPromise = null;
    var language = 'en';
    function ready(done) {
      if (!readyPromise) {
        // Guard against bridge.initialize() never resolving when the
        // script loaded but we're not actually embedded in a real
        // Playgama frame (e.g. testing this build directly) - the game
        // must never hang waiting on that forever.
        var initPromise;
        var ok = safeCall(function () { initPromise = window.bridge.initialize(); });
        if (!ok || !initPromise) initPromise = Promise.resolve();
        readyPromise = Promise.race([
          initPromise,
          new Promise(function (resolve) { window.setTimeout(resolve, 3000); })
        ]).catch(function (err) {
          console.warn('[SDK:playgama] bridge.initialize failed', err);
        });
      }
      readyPromise.then(function () {
        safeCall(subscribeToPlatformAudioPause);
        safeCall(readPlatformLanguage);
        done && done();
      });
    }

    // Required integration step per Playgama's docs: read platform.language
    // once after init. The game currently has no localized strings (all UI
    // text is short, sentence-case English by design - see DESIGN.md), so
    // there is nothing to switch based on this value yet; it's stored here
    // so a future localization pass has a ready-made hook rather than
    // needing to re-derive where to read it from.
    function readPlatformLanguage() {
      if (window.bridge.platform) language = window.bridge.platform.language || 'en';
    }

    var platformSubscribed = false;
    function subscribeToPlatformAudioPause() {
      if (platformSubscribed || !window.bridge.platform || !window.bridge.platform.on || !window.bridge.EVENT_NAME) return;
      platformSubscribed = true;
      window.bridge.platform.on(window.bridge.EVENT_NAME.AUDIO_STATE_CHANGED, function (isEnabled) {
        PeelIt.Audio.setMuted(!isEnabled);
      });
      window.bridge.platform.on(window.bridge.EVENT_NAME.PAUSE_STATE_CHANGED, function (isPaused) {
        if (isPaused) PeelIt.Audio.pauseForAd(); else PeelIt.Audio.resumeAfterAd();
      });
    }

    // REVERTED: previously passed an explicit 'local_storage' storageType
    // argument here. That was never confirmed against the Plain JS docs
    // (only other engine wrappers show a storageType parameter) and didn't
    // fix the actual reported save issue, so it was pure unconfirmed risk
    // with no proven benefit - removed. Back to the exact call shape shown
    // in the Storage doc's Plain JS tab: get(key) / set(key, value), no
    // extra arguments, letting bridge.storage.defaultType decide.
    return {
      id: 'playgama',
      init: function (done) { ready(done); },
      getLanguage: function () { return language; },
      saveData: function (obj) {
        writeLocalBackup(obj);
        safeCall(function () {
          window.bridge.storage.set('peelit-save', obj).catch(function (err) {
            console.warn('[SDK:playgama] storage.set failed', err);
          });
        });
        return true; // optimistic; storage.set is fire-and-forget here
      },
      loadData: function (callback) {
        // `timedOut` matters and is passed through to callback(data, timedOut):
        // a genuine confirmed answer (real data, confirmed null, or an
        // explicit error) means we actually know the truth. A timeout means
        // we DON'T know - the real call may still be in flight and could
        // still return actual saved data seconds later. Treating those two
        // cases the same was a real bug: Save.load() used to eagerly write
        // defaults back to storage on ANY load, including a bare timeout,
        // which meant a slow-but-working storage.get() got its real answer
        // overwritten with empty defaults before it ever arrived - silently
        // destroying real progress. See save.js's load()/applyLateData().
        var settled = false;

        var timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          // Fall back to our own local backup copy (see writeLocalBackup)
          // instead of raw defaults - recovers real progress on this
          // device even while the platform's own storage.get() stays
          // stuck. Still passed through as timedOut=true: the real remote
          // call is left running in the background and, if it ever does
          // resolve, applyLateData() gets first say (see .then() below).
          callback(readLocalBackup(), true);
        }, 4000);

        var ok = safeCall(function () {
          window.bridge.storage.get('peelit-save')
            .then(function (data) {
              if (!settled) {
                settled = true;
                window.clearTimeout(timeoutId);
                callback(data || null, false);
              } else {
                // Real answer arrived after we'd already given up and let
                // the game proceed with defaults - apply it retroactively
                // instead of silently discarding real progress just
                // because it was slow. See PeelIt.Save.applyLateData().
                if (window.PeelIt.Save.applyLateData) PeelIt.Save.applyLateData(data || null);
              }
            })
            .catch(function (err) {
              console.warn('[SDK:playgama] storage.get failed', err);
              if (!settled) {
                settled = true;
                window.clearTimeout(timeoutId);
                // A genuine rejection, not an ambiguous timeout - the
                // remote call is definitively done, so fall back to our
                // own backup as a confirmed answer rather than defaults.
                callback(readLocalBackup(), false);
              }
            });
        });
        if (!ok && !settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          callback(readLocalBackup(), false);
        }
      },
      gameReady: function () {
        safeCall(function () {
          window.bridge.platform.sendMessage(msg('GAME_READY', 'game_ready')).catch(function (err) {
            console.warn('[SDK:playgama] game_ready message failed', err);
          });
        });
      },
      // gameplay_started / gameplay_stopped bracket every period of ACTIVE play.
      // Bridge is a unified layer over Poki / CrazyGames / etc., whose native
      // SDKs require an explicit gameplayStart/gameplayStop signal - without
      // these, those platforms never learn the player is actually playing.
      gameplayStarted: function () {
        safeCall(function () {
          window.bridge.platform.sendMessage(msg('GAMEPLAY_STARTED', 'gameplay_started')).catch(function () {});
        });
      },
      gameplayStopped: function () {
        safeCall(function () {
          window.bridge.platform.sendMessage(msg('GAMEPLAY_STOPPED', 'gameplay_stopped')).catch(function () {});
        });
      },
      levelStarted: function (levelId) {
        safeCall(function () {
          window.bridge.platform.sendMessage(msg('LEVEL_STARTED', 'level_started'), { level: String(levelId) }).catch(function () {});
        });
      },
      levelComplete: function (levelId) {
        safeCall(function () {
          window.bridge.platform.sendMessage(msg('LEVEL_COMPLETED', 'level_completed'), { level: String(levelId) }).catch(function () {});
        });
      },
      showRewardedAd: function (placement, onReward, onFail) {
        var ad = window.bridge.advertisement;
        if (!ad || ad.isRewardedSupported === false) {
          webAdapter.showRewardedAd(placement, onReward, onFail);
          return;
        }
        var rewarded = false;
        var settled = false;
        var EV = rewardedStateEvent();

        // Requirement: sound + gameplay must be paused for a full-screen ad.
        adBreakBegin();

        var finish = function () {
          settled = true;
          if (ad.off) safeCall(function () { ad.off(EV, handleStateChange); });
          adBreakEnd();
        };
        // Reward ONLY on 'rewarded', never on 'closed' - closing early must not
        // grant the reward.
        var handleStateChange = function (state) {
          if (state === 'rewarded') {
            rewarded = true;
            onReward && onReward();
          } else if (state === 'closed' || state === 'failed') {
            finish();
            if (!rewarded && state === 'failed') onFail && onFail();
          }
        };
        var ok = safeCall(function () {
          ad.on(EV, handleStateChange);
          ad.showRewarded(placement);
        });
        // A synchronous throw means the player tapped the button and nothing
        // happens - unpause and fall back rather than strand the UI forever.
        if (!ok && !settled) {
          adBreakEnd();
          webAdapter.showRewardedAd(placement, onReward, onFail);
        }
      },
      showInterstitialAd: function (onClosed) {
        var ad = window.bridge.advertisement;
        if (!ad || !ad.isInterstitialSupported) {
          webAdapter.showInterstitialAd(onClosed);
          return;
        }
        var settled = false;
        var EV = interstitialStateEvent();

        adBreakBegin(); // sound + gameplay paused for the full-screen ad

        var handleStateChange = function (state) {
          if (state === 'closed' || state === 'failed') {
            settled = true;
            if (ad.off) safeCall(function () { ad.off(EV, handleStateChange); });
            adBreakEnd();
            onClosed && onClosed();
          }
        };
        var ok = safeCall(function () {
          ad.on(EV, handleStateChange);
          ad.showInterstitial(INTERSTITIAL_PLACEMENT);
        });
        // A synchronous throw would otherwise strand the player on the complete
        // screen forever (maybeShowInterstitialThen awaits this callback).
        if (!ok && !settled) {
          adBreakEnd();
          webAdapter.showInterstitialAd(onClosed);
        }
      }
    };
  })();

  function detectPlatform() {
    // Playgama's bridge script (see playgamaAdapter above) exposes a
    // global `bridge` object once loaded. Extend this as more real
    // adapters are wired in.
    if (window.bridge) return playgamaAdapter;
    if (window.ytgame) return youtubeAdapter;
    if (window.PokiSDK) return pokiAdapter;
    return webAdapter;
  }

  var active = detectPlatform();

  return {
    init: function (done) { active.init(done); },
    saveData: function (obj) { return active.saveData(obj); },
    loadData: function (callback) { active.loadData(callback); },
    gameReady: function () { active.gameReady(); },
    gameplayStarted: function () { active.gameplayStarted(); },
    gameplayStopped: function () { active.gameplayStopped(); },
    levelStarted: function (levelId) { active.levelStarted(levelId); },
    levelComplete: function (levelId) { active.levelComplete(levelId); },
    // placement is one of PeelIt.SDK.PLACEMENTS (currently just `hint`).
    showRewardedAd: function (placement, onReward, onFail) { active.showRewardedAd(placement, onReward, onFail); },
    showInterstitialAd: function (onClosed) { active.showInterstitialAd(onClosed); },
    getLanguage: function () { return active.getLanguage(); },
    PLACEMENTS: PLACEMENTS,
    platform: active.id
  };
})();
