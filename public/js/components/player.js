import {
  CapacitorHttp,
  Filesystem,
  showToast,
  currentLang,
} from "../utils/index.js";
import { translations } from "../i18n/index.js";
import {
  isMediaSessionSupported,
  setMediaSessionMetadata,
  setMediaSessionActionHandlers,
  updateMediaSessionPositionState,
  clearMediaSession,
} from "../utils/mediaSession.js";

const isNativePlatform = window.Capacitor?.isNativePlatform?.() === true;

// Helper: Format seconds to mm:ss or hh:mm:ss
export function formatTime(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  const padSec = remSec < 10 ? `0${remSec}` : `${remSec}`;
  if (m < 60) {
    return `${m}:${padSec}`;
  }
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  const padMin = remMin < 10 ? `0${remMin}` : `${remMin}`;
  return `${h}:${padMin}:${padSec}`;
}

// Detect source platform for the badge
function getPlatformInfo(item = {}, url = "") {
  const combined = `${url} ${item.url || ""} ${item.platform || ""} ${item.extractor || ""} ${item.title || ""}`.toLowerCase();
  if (combined.includes("spotify")) {
    return {
      name: "Spotify",
      color: "#1ed760",
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.625.625 0 0 1-.86.208c-2.355-1.44-5.32-1.764-8.814-.966a.625.625 0 1 1-.28-1.22c3.824-.873 7.106-.508 9.746 1.118a.625.625 0 0 1 .208.86zm1.224-2.724a.782.782 0 0 1-1.077.257c-2.696-1.657-6.808-2.136-9.998-1.168a.782.782 0 0 1-.462-1.493c3.64-1.107 8.188-.575 11.28 1.327a.782.782 0 0 1 .257 1.077zm.105-2.835C14.692 8.94 9.387 8.76 6.305 9.696a.938.938 0 1 1-.54-1.796c3.535-1.073 9.395-.863 13.11 1.344a.938.938 0 1 1-.96 1.62z"/></svg>`,
    };
  }
  if (combined.includes("youtube") || combined.includes("youtu.be")) {
    return {
      name: "YouTube Music",
      color: "#ff0000",
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
    };
  }
  if (combined.includes("soundcloud")) {
    return {
      name: "SoundCloud",
      color: "#ff5500",
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 8.87V17h8.92c1.94 0 3.52-1.54 3.52-3.44 0-1.9-1.58-3.44-3.52-3.44-.22 0-.44.02-.65.06C19.4 8.08 17.57 6.5 15.36 6.5c-1.87 0-3.47 1.15-4.14 2.78-.18-.26-.4-.49-.66-.69zM1 12.5c0 1.93 1.57 3.5 3.5 3.5h5.5v-7H4.5C2.57 9 1 10.57 1 12.5z"/></svg>`,
    };
  }
  if (combined.includes("apple") || combined.includes("itunes")) {
    return {
      name: "Apple Music",
      color: "#fc3c44",
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.3 6.6l-3.6 1.05v5.82a2.03 2.03 0 1 1-1.35-1.92v-5.7c0-.47.36-.87.83-.97l4.35-1.27c.4-.12.82.16.82.58v1.74c0 .35-.24.63-.55.67z"/></svg>`,
    };
  }
  if (combined.includes("tiktok")) {
    return {
      name: "TikTok",
      color: "#00f2fe",
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.27 6.27 0 0 0 1.87-4.49V8.65a8.28 8.28 0 0 0 4.9 1.59V6.79a4.85 4.85 0 0 1-1-.1z"/></svg>`,
    };
  }
  return {
    name: "Music",
    color: "#ffffff",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  };
}

/**
 * 🎵 Modern Music Player matching Android Control Center & Lockscreen UI
 * Supports Native Android Foreground Media Service AND Web Media Session API!
 */
export function createMusicPlayer(dl, index, resultThumbnail) {
  const container = document.createElement("div");
  container.className = "astrostar-music-card";
  container.id = `musicPlayer_${index}_${Date.now()}`;

  let title = (dl.title || dl.filename || dl.name || "").trim();
  if (!title && (dl.url || dl.rawPath || dl.rawUri)) {
    const raw = dl.rawPath || dl.rawUri || dl.url || "";
    const clean = raw.split("?")[0].split("#")[0];
    const slashIdx = clean.lastIndexOf("/");
    if (slashIdx !== -1) {
      const part = decodeURIComponent(clean.substring(slashIdx + 1));
      if (part) title = part.replace(/\.[^/.]+$/, "");
    }
  }
  if (!title) title = "Music Track";

  // Top is name of song, bottom is name of app
  const appName = "AstroStar Downloader";
  const artist = dl.author || dl.artist || dl.channel || appName;
  const artwork = dl.thumbnail || resultThumbnail || "";
  const rawUrl = dl.rawPath || dl.rawUri || dl.url || "";
  const platform = getPlatformInfo(dl, rawUrl);

  const nativeBridge = window.AstroStarMainBridge || window.MoriMainBridge || null;
  let canUseNativeService = !!(nativeBridge && typeof nativeBridge.loadMedia === "function");

  // Render UI layout (Title on top, App Name on bottom)
  container.innerHTML = `
    <div class="astrostar-music-header">
      <div class="astrostar-music-art-wrap">
        ${
          artwork
            ? `<img src="${artwork}" alt="${title}" class="astrostar-music-art" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
            : ""
        }
        <div class="astrostar-music-art-placeholder" style="${artwork ? "display:none;" : ""}">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <div class="astrostar-music-badge" style="color: ${platform.color};" title="${platform.name}">
          ${platform.icon}
        </div>
      </div>
      <div class="astrostar-music-info">
        <div class="astrostar-music-title" title="${title}">${title}</div>
        <div class="astrostar-music-artist" title="${artist}">${artist}</div>
      </div>
      <button class="astrostar-music-output-badge" title="Media Output: Astro Star Player" aria-label="Media Output">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
      </button>
    </div>

    <!-- Scrubber Progress Bar -->
    <div class="astrostar-music-progress-section">
      <div class="astrostar-music-slider-wrap" role="slider" aria-label="Playback Progress" tabindex="0">
        <div class="astrostar-music-track">
          <div class="astrostar-music-fill"></div>
          <div class="astrostar-music-thumb"></div>
        </div>
      </div>
      <div class="astrostar-music-timestamps">
        <span class="astrostar-time-current">00:00</span>
        <span class="astrostar-time-duration">00:00</span>
      </div>
    </div>

    <!-- Control Buttons -->
    <div class="astrostar-music-controls-row">
      <button class="astrostar-music-ctrl-btn btn-shuffle" title="Shuffle" aria-label="Shuffle">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
        </svg>
      </button>

      <button class="astrostar-music-ctrl-btn btn-prev" title="Previous Track" aria-label="Previous Track">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
        </svg>
      </button>

      <button class="astrostar-music-play-btn btn-play-pause" title="Play / Pause" aria-label="Play or Pause">
        <svg class="icon-play" viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="icon-pause" viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style="display: none;">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button class="astrostar-music-ctrl-btn btn-next" title="Next Track" aria-label="Next Track">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
        </svg>
      </button>

      <button class="astrostar-music-ctrl-btn btn-loop" title="Repeat" aria-label="Repeat">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
        </svg>
      </button>
    </div>

    <div class="astrostar-music-status-footer">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
      </svg>
      <span>Background Playback · Lock Screen & Control Center active</span>
    </div>
  `;

  // UI Element references
  const playBtn = container.querySelector(".btn-play-pause");
  const iconPlay = container.querySelector(".icon-play");
  const iconPause = container.querySelector(".icon-pause");
  const prevBtn = container.querySelector(".btn-prev");
  const nextBtn = container.querySelector(".btn-next");
  const shuffleBtn = container.querySelector(".btn-shuffle");
  const loopBtn = container.querySelector(".btn-loop");
  const outputBadge = container.querySelector(".astrostar-music-output-badge");

  const sliderWrap = container.querySelector(".astrostar-music-slider-wrap");
  const fillEl = container.querySelector(".astrostar-music-fill");
  const thumbEl = container.querySelector(".astrostar-music-thumb");
  const currentEl = container.querySelector(".astrostar-time-current");
  const durationEl = container.querySelector(".astrostar-time-duration");

  let isPlaying = false;
  let durationSec = 0;
  let currentSec = 0;
  let isDragging = false;
  let isShuffled = localStorage.getItem("astrostar_shuffle") === "true";
  let loopMode = localStorage.getItem("astrostar_loop") !== "false"; // default loop on

  if (isShuffled) shuffleBtn.classList.add("active");
  if (loopMode) loopBtn.classList.add("active");

  const updateUIState = (playing, durSec, posSec) => {
    isPlaying = playing;
    if (durSec && durSec > 0) durationSec = durSec;
    if (posSec !== undefined && !isDragging) currentSec = posSec;

    if (isPlaying) {
      iconPlay.style.display = "none";
      iconPause.style.display = "block";
      outputBadge.classList.add("playing");
    } else {
      iconPlay.style.display = "block";
      iconPause.style.display = "none";
      outputBadge.classList.remove("playing");
    }

    if (durationSec > 0) {
      const pct = Math.min(100, Math.max(0, (currentSec / durationSec) * 100));
      if (!isDragging) {
        fillEl.style.width = `${pct}%`;
        thumbEl.style.left = `${pct}%`;
        currentEl.textContent = formatTime(currentSec);
      }
      durationEl.textContent = formatTime(durationSec);
    } else {
      if (!isDragging) {
        currentEl.textContent = formatTime(currentSec);
      }
    }
  };

  // Next / Previous slide actions
  const triggerNext = () => {
    const modalNextBtn = document.getElementById("modalSlideNextBtn");
    const mainNextBtn = document.getElementById("slideNextBtn");
    if (modalNextBtn && !modalNextBtn.disabled && modalNextBtn.offsetParent !== null) {
      modalNextBtn.click();
    } else if (mainNextBtn && !mainNextBtn.disabled && mainNextBtn.offsetParent !== null) {
      mainNextBtn.click();
    } else {
      // If single item or at end, seek to start
      handleSeek(0);
    }
  };

  const triggerPrev = () => {
    if (currentSec > 3) {
      handleSeek(0);
      return;
    }
    const modalPrevBtn = document.getElementById("modalSlidePrevBtn");
    const mainPrevBtn = document.getElementById("slidePrevBtn");
    if (modalPrevBtn && !modalPrevBtn.disabled && modalPrevBtn.offsetParent !== null) {
      modalPrevBtn.click();
    } else if (mainPrevBtn && !mainPrevBtn.disabled && mainPrevBtn.offsetParent !== null) {
      mainPrevBtn.click();
    } else {
      handleSeek(0);
    }
  };

  // Hook global bridge callbacks for Android native service
  window.astroStarMediaNextTrack = triggerNext;
  window.astroStarMediaPrevTrack = triggerPrev;

  // Setup audio URL for both webview/browser and native playback
  let audioUrl = dl.url || dl.rawPath || dl.rawUri || "";
  const rawNativeUrl = dl.rawPath || dl.rawUri || dl.url || "";

  if (
    window.Capacitor?.convertFileSrc &&
    (audioUrl.startsWith("/") || audioUrl.startsWith("file://"))
  ) {
    audioUrl = window.Capacitor.convertFileSrc(audioUrl);
  }
  if (audioUrl.startsWith("http://") && !audioUrl.includes("localhost")) {
    audioUrl = audioUrl.replace("http://", "https://");
  }

  // Web Media Session API setup for mobile lock screen & control center
  const syncMediaSession = () => {
    setMediaSessionMetadata({
      title,
      artist,
      album: platform.name,
      artwork: artwork || (window.location.origin + "/assets/icon.png"),
    });

    setMediaSessionActionHandlers({
      onPlay: () => handlePlay(),
      onPause: () => handlePause(),
      onSeekTo: (sec) => handleSeek(sec),
      onSeekBackward: (offset) => handleSeek(Math.max(0, currentSec - offset)),
      onSeekForward: (offset) => handleSeek(Math.min(durationSec, currentSec + offset)),
      onNext: () => triggerNext(),
      onPrev: () => triggerPrev(),
      onStop: () => handlePause(),
    });
  };

  // Setup HTML5 Audio element embedded in the container
  const htmlAudio = document.createElement("audio");
  htmlAudio.className = "astrostar-music-audio-engine";
  htmlAudio.style.display = "none";
  htmlAudio.preload = "auto";
  htmlAudio.crossOrigin = "anonymous";
  htmlAudio.setAttribute("playsinline", "true");
  htmlAudio.setAttribute("webkit-playsinline", "true");
  htmlAudio.setAttribute("referrerpolicy", "no-referrer");
  htmlAudio.loop = loopMode;
  htmlAudio.src = audioUrl;
  container.appendChild(htmlAudio);

  htmlAudio.addEventListener("loadedmetadata", () => {
    durationSec = htmlAudio.duration || 0;
    updateUIState(isPlaying, durationSec, htmlAudio.currentTime);
    syncMediaSession();
    updateMediaSessionPositionState(durationSec, htmlAudio.currentTime);
  });

  htmlAudio.addEventListener("timeupdate", () => {
    if (!isDragging) {
      currentSec = htmlAudio.currentTime;
      updateUIState(isPlaying, htmlAudio.duration || durationSec, currentSec);
      updateMediaSessionPositionState(durationSec, currentSec);
    }
  });

  htmlAudio.addEventListener("play", () => {
    updateUIState(true, htmlAudio.duration || durationSec, htmlAudio.currentTime);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
  });

  htmlAudio.addEventListener("pause", () => {
    updateUIState(false, htmlAudio.duration || durationSec, htmlAudio.currentTime);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
  });

  htmlAudio.addEventListener("ended", () => {
    if (!loopMode) {
      triggerNext();
    }
  });

  htmlAudio.addEventListener("error", (e) => {
    console.warn("Audio error, attempting proxy streaming...", e);
    if (audioUrl && audioUrl.startsWith("http") && !htmlAudio._proxyTried) {
      htmlAudio._proxyTried = true;
      htmlAudio.src = `/api/proxy?url=${encodeURIComponent(audioUrl)}`;
      htmlAudio.load();
      if (isPlaying) {
        htmlAudio.play().catch(() => {});
      }
    }
  });

  // Play & Pause Handlers
  const handlePlay = () => {
    if (canUseNativeService && nativeBridge) {
      try {
        nativeBridge.playMedia();
        updateUIState(true, durationSec, currentSec);
        syncMediaSession();
      } catch (err) {
        canUseNativeService = false;
        htmlAudio.play().catch((e) => console.warn("HTML5 audio play error:", e));
      }
    } else {
      htmlAudio.play().then(() => {
        updateUIState(true, htmlAudio.duration || durationSec, htmlAudio.currentTime);
        syncMediaSession();
      }).catch((err) => {
        console.warn("HTML5 audio play error:", err);
      });
    }
  };

  const handlePause = () => {
    if (canUseNativeService && nativeBridge) {
      try {
        nativeBridge.pauseMedia();
        updateUIState(false, durationSec, currentSec);
      } catch (err) {
        console.warn("Native pauseMedia failed:", err);
      }
    }
    htmlAudio.pause();
    updateUIState(false, durationSec, htmlAudio.currentTime);
  };

  const handleSeek = (sec) => {
    const targetSec = Math.max(0, Math.min(sec, durationSec || sec));
    currentSec = targetSec;
    if (canUseNativeService && nativeBridge) {
      try {
        nativeBridge.seekMedia(Math.round(targetSec * 1000));
      } catch (_) {}
    }
    htmlAudio.currentTime = targetSec;
    updateUIState(isPlaying, durationSec, targetSec);
    updateMediaSessionPositionState(durationSec, targetSec);
  };

  // Connect native bridge callbacks
  if (canUseNativeService && nativeBridge) {
    try {
      nativeBridge.loadMedia(rawNativeUrl, title, artist, artwork);
      isPlaying = true;
      updateUIState(true, 0, 0);
      syncMediaSession();
    } catch (e) {
      console.warn("Failed to loadMedia via Native Bridge:", e);
      canUseNativeService = false;
    }

    const syncNativeProgress = (posMs, durMs) => {
      durationSec = durMs / 1000;
      currentSec = posMs / 1000;
      updateUIState(isPlaying, durationSec, currentSec);
      updateMediaSessionPositionState(durationSec, currentSec);
    };

    const syncNativeState = (state) => {
      if (!state) return;
      if (state.isError) {
        console.warn("Native media playback error, falling back to HTML5 audio...");
        canUseNativeService = false;
        if (isPlaying) {
          htmlAudio.play().catch((e) => console.warn("HTML5 audio fallback error:", e));
        }
        return;
      }
      isPlaying = !!state.isPlaying;
      if (state.duration) durationSec = state.duration / 1000;
      updateUIState(isPlaying, durationSec, currentSec);
    };

    window.astroStarMediaProgress = syncNativeProgress;
    window.moriMediaProgress = syncNativeProgress;
    window.astroStarMediaState = syncNativeState;
    window.moriMediaState = syncNativeState;
    window.astroStarMediaNextTrack = triggerNext;
    window.moriMediaNextTrack = triggerNext;
    window.astroStarMediaPrevTrack = triggerPrev;
    window.moriMediaPrevTrack = triggerPrev;
  } else {
    // Web / Chrome / PWA mode
    syncMediaSession();
    const autoPlaySetting = localStorage.getItem("astrostar_autoplay") !== "false";
    if (index === 0 && autoPlaySetting) {
      setTimeout(() => handlePlay(), 300);
    }
  }

  // Event Listeners for UI buttons
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerPrev();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerNext();
  });

  shuffleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isShuffled = !isShuffled;
    localStorage.setItem("astrostar_shuffle", isShuffled ? "true" : "false");
    shuffleBtn.classList.toggle("active", isShuffled);
    showToast(isShuffled ? "Shuffle: On" : "Shuffle: Off");
  });

  loopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    loopMode = !loopMode;
    localStorage.setItem("astrostar_loop", loopMode ? "true" : "false");
    loopBtn.classList.toggle("active", loopMode);
    if (htmlAudio) htmlAudio.loop = loopMode;
    showToast(loopMode ? "Loop: On" : "Loop: Off");
  });

  outputBadge.addEventListener("click", (e) => {
    e.stopPropagation();
    showToast(`Playing on ${canUseNativeService ? "Android System Service" : "Device Audio Engine"}`);
  });

  // Smooth Scrubber Dragging & Seeking
  const calcSeekRatio = (clientX) => {
    const rect = sliderWrap.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const applyScrubVisual = (ratio) => {
    const pct = ratio * 100;
    fillEl.style.width = `${pct}%`;
    thumbEl.style.left = `${pct}%`;
    const previewTime = (durationSec || 0) * ratio;
    currentEl.textContent = formatTime(previewTime);
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    sliderWrap.classList.add("dragging");
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const ratio = calcSeekRatio(clientX);
    applyScrubVisual(ratio);

    const onPointerMove = (ev) => {
      if (!isDragging) return;
      const x = ev.clientX || (ev.touches && ev.touches[0].clientX) || 0;
      applyScrubVisual(calcSeekRatio(x));
    };

    const onPointerUp = (ev) => {
      if (!isDragging) return;
      isDragging = false;
      sliderWrap.classList.remove("dragging");
      const x = ev.clientX || (ev.changedTouches && ev.changedTouches[0].clientX) || clientX;
      const ratio = calcSeekRatio(x);
      const targetSec = (durationSec || 0) * ratio;
      handleSeek(targetSec);

      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    };

    window.addEventListener("mousemove", onPointerMove, { passive: false });
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
  };

  sliderWrap.addEventListener("mousedown", onPointerDown);
  sliderWrap.addEventListener("touchstart", onPointerDown, { passive: false });

  // Cleanup on element destruction
  container._cleanup = () => {
    if (canUseNativeService) {
      try {
        window.AstroStarMainBridge.stopMedia();
      } catch (_) {}
      window.astroStarMediaProgress = null;
      window.astroStarMediaState = null;
    }
    if (htmlAudio) {
      try {
        htmlAudio.pause();
        htmlAudio.src = "";
        htmlAudio = null;
      } catch (_) {}
    }
    clearMediaSession();
  };

  return container;
}

/**
 * 🎬 Full Video Player with Web Media Session API integration
 */
export function createVideoPlayer(dl, index, resultThumbnail) {
  let videoUrl = dl.url || "";
  const isLocal =
    videoUrl.includes("_capacitor_file_") ||
    videoUrl.startsWith("file://") ||
    videoUrl.startsWith("content://") ||
    videoUrl.includes("localhost") ||
    videoUrl.includes("127.0.0.1");
  const isDouyin = /douyin|snssdk/i.test(videoUrl);

  if (videoUrl.startsWith("http://") && !isDouyin && !isLocal) {
    videoUrl = videoUrl.replace("http://", "https://");
  }

  const dlTypeLower = (dl.type || "").toLowerCase();
  const fileNameLower = (dl.filename || dl.title || videoUrl || "").toLowerCase();
  const filePath = (dl.rawPath || dl.rawUri || dl.url || dl.filename || "").toLowerCase();

  const isAudioOnly =
    dlTypeLower.includes("mp3") ||
    dlTypeLower.includes("audio") ||
    dlTypeLower.includes("m4a") ||
    fileNameLower.endsWith(".mp3") ||
    fileNameLower.endsWith(".m4a") ||
    fileNameLower.endsWith(".aac") ||
    fileNameLower.endsWith(".opus") ||
    fileNameLower.endsWith(".flac") ||
    fileNameLower.endsWith(".wav") ||
    filePath.includes("/music/") ||
    filePath.includes("/download/astrostar/music") ||
    filePath.includes("/download/mori/music");

  // If this item is music/audio, route directly to modern music player
  if (isAudioOnly) {
    return createMusicPlayer(dl, index, resultThumbnail);
  }

  const playerContainer = document.createElement("div");
  playerContainer.className = "astrostar-player-container";
  playerContainer.style.backgroundColor = "black";
  playerContainer.style.display = "flex";
  playerContainer.style.alignItems = "center";
  playerContainer.style.justifyContent = "center";
  playerContainer.style.maxHeight = "80vh";

  const video = document.createElement("video");
  video.setAttribute("referrerpolicy", "no-referrer");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");

  const removeLoading = () => {
    playerContainer.classList.remove("astrostar-loading");
    const fallbackImg = playerContainer.querySelector(".fallback-img");
    if (fallbackImg) fallbackImg.remove();
  };

  video.onwaiting = () => playerContainer.classList.add("astrostar-loading");
  video.oncanplay = removeLoading;
  video.onplaying = removeLoading;
  video.onseeked = removeLoading;
  video.onstalled = removeLoading;
  video.onpause = removeLoading;

  video.onerror = () => {
    removeLoading();
    const bigPlay = playerContainer.querySelector(".astrostar-player-big-play");
    if (bigPlay) bigPlay.remove();
    const ctrlEl = playerContainer.querySelector(".astrostar-player-controls");
    if (ctrlEl) ctrlEl.remove();
    playerContainer.dispatchEvent(new CustomEvent("astrostar_media_load_error", { bubbles: true }));
  };

  playerContainer.appendChild(video);

  const bigPlay = document.createElement("div");
  bigPlay.className = "astrostar-player-big-play visible";
  bigPlay.style.cursor = "pointer";
  bigPlay.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  playerContainer.appendChild(bigPlay);

  const controls = document.createElement("div");
  controls.className = "astrostar-player-controls";
  controls.innerHTML = `
    <div class="astrostar-player-progress">
      <div class="astrostar-player-progress-inner"></div>
    </div>
    <div class="astrostar-player-bottom">
      <div class="astrostar-player-actions">
        <button class="astrostar-player-btn play-toggle" aria-label="Play / Pause">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="play-icon"><path d="M8 5v14l11-7z"/></svg>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="pause-icon hidden"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        </button>
        <span class="astrostar-player-time">0:00 / 0:00</span>
      </div>
      <div class="astrostar-player-actions">
        <button class="astrostar-player-btn mute-toggle" aria-label="Mute / Unmute">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="unmute-icon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="mute-icon hidden"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.58.45-1.24.8-1.95.99v2.06c1.26-.26 2.4-.83 3.37-1.62l3.06 3.06L21 21.73l-16.73-16.73zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        </button>
        <button class="astrostar-player-btn fullscreen-btn" aria-label="Fullscreen">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        </button>
      </div>
    </div>
  `;
  playerContainer.appendChild(controls);

  const playBtn = controls.querySelector(".play-toggle");
  const playIcon = playBtn.querySelector(".play-icon");
  const pauseIcon = playBtn.querySelector(".pause-icon");
  const timeDisplay = controls.querySelector(".astrostar-player-time");
  const prog = controls.querySelector(".astrostar-player-progress");
  const progInner = controls.querySelector(".astrostar-player-progress-inner");
  const muteBtn = controls.querySelector(".mute-toggle");
  const unmuteIcon = muteBtn.querySelector(".unmute-icon");
  const muteIcon = muteBtn.querySelector(".mute-icon");
  const fsBtn = controls.querySelector(".fullscreen-btn");

  const syncVideoMediaSession = () => {
    setMediaSessionMetadata({
      title: dl.title || "Astro Star Video",
      artist: dl.author || "Astro Star",
      album: "Video Playback",
      artwork: dl.thumbnail || resultThumbnail || "",
    });
    setMediaSessionActionHandlers({
      onPlay: () => video.play().catch(() => {}),
      onPause: () => video.pause(),
      onSeekTo: (sec) => { video.currentTime = sec; },
      onSeekBackward: (offset) => { video.currentTime = Math.max(0, video.currentTime - offset); },
      onSeekForward: (offset) => { video.currentTime = Math.min(video.duration || 0, video.currentTime + offset); },
    });
  };

  const updateProgress = () => {
    const p = (video.currentTime / (video.duration || 1)) * 100;
    progInner.style.width = `${p}%`;
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    updateMediaSessionPositionState(video.duration || 0, video.currentTime);
  };

  video.onplay = () => {
    removeLoading();
    playIcon.classList.add("hidden");
    pauseIcon.classList.remove("hidden");
    bigPlay.classList.remove("visible");
    syncVideoMediaSession();
  };

  video.onpause = () => {
    playIcon.classList.remove("hidden");
    pauseIcon.classList.add("hidden");
    bigPlay.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    bigPlay.classList.add("visible");
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (video.paused) {
      video.loop = localStorage.getItem("astrostar_loop") !== "false";
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  bigPlay.onclick = togglePlay;
  playBtn.onclick = togglePlay;
  video.onclick = togglePlay;

  video.ontimeupdate = updateProgress;
  video.onloadedmetadata = () => {
    updateProgress();
    playerContainer.style.aspectRatio = "auto";
  };

  muteBtn.onclick = (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    unmuteIcon.classList.toggle("hidden", video.muted);
    muteIcon.classList.toggle("hidden", !video.muted);
  };

  fsBtn.onclick = (e) => {
    e.stopPropagation();
    const bridge = window.AstroStarMainBridge || window.MoriMainBridge;
    if (bridge && typeof bridge.toggleOrientation === "function") {
      bridge.toggleOrientation();
    }
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } else {
      if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {
          if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
          else if (playerContainer.requestFullscreen) playerContainer.requestFullscreen().catch(() => {});
        });
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
      } else if (playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen().catch(() => {});
      }
    }
  };

  const seekToPos = (clientX) => {
    const rect = prog.getBoundingClientRect();
    let pos = (clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    video.currentTime = pos * (video.duration || 0);
  };

  let isDragging = false;
  const startDrag = (e) => {
    isDragging = true;
    seekToPos(e.clientX || (e.touches && e.touches[0].clientX) || 0);
  };
  const doDrag = (e) => {
    if (isDragging) {
      seekToPos(e.clientX || (e.touches && e.touches[0].clientX) || 0);
    }
  };
  const stopDrag = () => { isDragging = false; };

  prog.addEventListener("mousedown", startDrag);
  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup", stopDrag);
  prog.addEventListener("touchstart", (e) => { e.stopPropagation(); startDrag(e); }, { passive: false });
  window.addEventListener("touchmove", (e) => { if (isDragging) { e.preventDefault(); doDrag(e); } }, { passive: false });
  window.addEventListener("touchend", stopDrag);

  // Set video source
  video.src = videoUrl;

  playerContainer._cleanup = () => {
    window.removeEventListener("mousemove", doDrag);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", doDrag);
    window.removeEventListener("touchend", stopDrag);
    try {
      video.pause();
      video.src = "";
    } catch (_) {}
    clearMediaSession();
  };

  return playerContainer;
}
