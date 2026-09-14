// mediaSession.js — Web Media Session API integration for Lock Screen & Control Center
export function isMediaSessionSupported() {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/**
 * Updates the system notification, lock screen, and control center metadata
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.artist
 * @param {string} [opts.album]
 * @param {string} [opts.artwork]
 */
export function setMediaSessionMetadata({ title, artist, album, artwork }) {
  if (!isMediaSessionSupported()) return;

  try {
    const artworkList = [];
    if (artwork) {
      // Provide multiple dimensions for Android Notification & Quick Settings
      [96, 128, 192, 256, 384, 512].forEach((size) => {
        artworkList.push({
          src: artwork,
          sizes: `${size}x${size}`,
          type: "image/png",
        });
      });
    }

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: title || "Astro Star",
      artist: artist || "Unknown Artist",
      album: album || "Astro Star Downloader",
      artwork: artworkList,
    });
  } catch (err) {
    console.warn("MediaSession metadata update failed:", err);
  }
}

/**
 * Connects action handlers (play, pause, seek, next, prev, stop)
 */
export function setMediaSessionActionHandlers({
  onPlay,
  onPause,
  onSeekTo,
  onNext,
  onPrev,
  onStop,
  onSeekBackward,
  onSeekForward,
}) {
  if (!isMediaSessionSupported()) return;

  const actions = [
    ["play", onPlay],
    ["pause", onPause],
    ["seekto", (details) => {
      if (details.seekTime !== undefined && typeof onSeekTo === "function") {
        onSeekTo(details.seekTime);
      }
    }],
    ["seekbackward", (details) => {
      const skipTime = details?.seekOffset || 10;
      if (typeof onSeekBackward === "function") {
        onSeekBackward(skipTime);
      }
    }],
    ["seekforward", (details) => {
      const skipTime = details?.seekOffset || 10;
      if (typeof onSeekForward === "function") {
        onSeekForward(skipTime);
      }
    }],
    ["previoustrack", onPrev],
    ["nexttrack", onNext],
    ["stop", onStop],
  ];

  actions.forEach(([action, handler]) => {
    try {
      if (typeof handler === "function") {
        navigator.mediaSession.setActionHandler(action, handler);
      } else {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch (e) {
      // Some browsers might not support all action names
    }
  });
}

/**
 * Updates the scrub position for lock screen / control center progress bar
 */
export function updateMediaSessionPositionState(durationSec, positionSec, playbackRate = 1.0) {
  if (!isMediaSessionSupported() || !("setPositionState" in navigator.mediaSession)) {
    return;
  }

  try {
    const dur = Number(durationSec);
    const pos = Number(positionSec);
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(pos) || pos < 0) {
      return;
    }

    navigator.mediaSession.setPositionState({
      duration: Math.max(0, dur),
      playbackRate: playbackRate,
      position: Math.min(Math.max(0, pos), dur),
    });
  } catch (err) {
    // Ignore transient out-of-range errors
  }
}

/**
 * Clears media session on cleanup
 */
export function clearMediaSession() {
  if (!isMediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = "none";
    if (navigator.mediaSession.metadata) {
      navigator.mediaSession.metadata = null;
    }
  } catch (err) {}
}
