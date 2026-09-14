// ui.js — history rendering + shared UI state + re-exports
import { truncate, triggerHaptic, showToast } from "./utils/index.js";
import { translations } from "./i18n/index.js";
import {
  currentLang,
  isEditingHistory,
  setIsEditingHistory,
  setCurrentLang,
  setCurrentSlideIndex,
  setSlideData,
} from "./modules/core.js";

// Escape HTML to prevent XSS from scraped titles
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Favorites State & Storage
export function getFavoriteUrls() {
  try {
    const raw = localStorage.getItem("astrostar_favorites");
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

export function isItemFavorite(item) {
  if (!item) return false;
  if (item.favorite === true || item.isFavorite === true) return true;
  const favs = getFavoriteUrls();
  if (item.url && favs.has(item.url)) return true;
  if (item.sourceUrl && favs.has(item.sourceUrl)) return true;
  return false;
}

export function toggleFavorite(targetUrl) {
  if (!targetUrl) return false;
  const history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
  const favSet = getFavoriteUrls();
  const currentlyFav = favSet.has(targetUrl);
  const nextState = !currentlyFav;

  if (nextState) {
    favSet.add(targetUrl);
  } else {
    favSet.delete(targetUrl);
  }

  // Also sync in-memory history objects
  history.forEach((h) => {
    if (h.url === targetUrl || h.sourceUrl === targetUrl) {
      h.favorite = nextState;
    }
  });

  localStorage.setItem("astrostar_favorites", JSON.stringify([...favSet]));
  localStorage.setItem("astrostar_history", JSON.stringify(history));
  return nextState;
}

// History Controls State
let currentHistoryTab = "all"; // "all" | "favorites"
let currentHistorySearchQuery = "";
let isHistoryControlsBound = false;
let savedOnItemClick = null;
let savedOnDeleteClick = null;

function bindHistoryControls() {
  if (isHistoryControlsBound) return;
  const searchInput = document.getElementById("historySearchInput");
  const clearBtn = document.getElementById("historySearchClear");
  const tabAll = document.getElementById("historyTabAll");
  const tabFavorites = document.getElementById("historyTabFavorites");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentHistorySearchQuery = e.target.value.trim().toLowerCase();
      if (clearBtn) {
        clearBtn.classList.toggle("hidden", !currentHistorySearchQuery);
      }
      renderHistory(savedOnItemClick, savedOnDeleteClick);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      currentHistorySearchQuery = "";
      clearBtn.classList.add("hidden");
      renderHistory(savedOnItemClick, savedOnDeleteClick);
    });
  }

  if (tabAll) {
    tabAll.addEventListener("click", () => {
      if (currentHistoryTab === "all") return;
      currentHistoryTab = "all";
      tabAll.classList.add("active");
      tabAll.setAttribute("aria-selected", "true");
      if (tabFavorites) {
        tabFavorites.classList.remove("active");
        tabFavorites.setAttribute("aria-selected", "false");
      }
      triggerHaptic("light");
      renderHistory(savedOnItemClick, savedOnDeleteClick);
    });
  }

  if (tabFavorites) {
    tabFavorites.addEventListener("click", () => {
      if (currentHistoryTab === "favorites") return;
      currentHistoryTab = "favorites";
      tabFavorites.classList.add("active");
      tabFavorites.setAttribute("aria-selected", "true");
      if (tabAll) {
        tabAll.classList.remove("active");
        tabAll.setAttribute("aria-selected", "false");
      }
      triggerHaptic("light");
      renderHistory(savedOnItemClick, savedOnDeleteClick);
    });
  }

  isHistoryControlsBound = true;
}

// State lives in core.js (shared across modules)
export function setUIState(state) {
  if (state.currentLang) setCurrentLang(state.currentLang);
  if (state.isEditingHistory !== undefined)
    setIsEditingHistory(state.isEditingHistory);
  if (state.currentSlideIndex !== undefined)
    setCurrentSlideIndex(state.currentSlideIndex);
  if (state.slideData !== undefined) setSlideData(state.slideData);
}

export function renderHistory(onItemClick, onDeleteClick) {
  if (typeof onItemClick === "function") savedOnItemClick = onItemClick;
  if (typeof onDeleteClick === "function") savedOnDeleteClick = onDeleteClick;

  if (typeof window.checkAndMergePendingHistorySync === "function") {
    window.checkAndMergePendingHistorySync();
  }
  const history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
  const historyPage = document.getElementById("historyPage");
  const editHistoryBtn = document.getElementById("editHistoryBtn");
  const historyActions = document.getElementById("historyActions");
  const historyControls = document.getElementById("historyControls");
  if (!historyPage) return;
  const activeUrl = window._astrostarActiveDownloadUrl || null;

  // Ensure controls listeners are hooked up
  bindHistoryControls();

  const dlStatsEl = document.getElementById("historyDlStatsVal");
  if (dlStatsEl) {
    const storedCount = parseInt(localStorage.getItem("astrostar_dl_count") || "0", 10);
    const count = Math.max(storedCount, history.length);
    dlStatsEl.textContent = count.toLocaleString();
  }

  // Update i18n placeholders and tab text
  const searchInput = document.getElementById("historySearchInput");
  if (searchInput && translations[currentLang]?.["placeholder-search-history"]) {
    searchInput.placeholder = translations[currentLang]["placeholder-search-history"];
  }
  const tabAllSpan = document.querySelector("#historyTabAll [data-i18n]");
  if (tabAllSpan && translations[currentLang]?.["filter-all"]) {
    tabAllSpan.textContent = translations[currentLang]["filter-all"];
  }
  const tabFavSpan = document.querySelector("#historyTabFavorites [data-i18n]");
  if (tabFavSpan && translations[currentLang]?.["filter-favorites"]) {
    tabFavSpan.textContent = translations[currentLang]["filter-favorites"];
  }

  // Calculate counts for tabs
  const favCount = history.filter(isItemFavorite).length;
  const allCountBadge = document.getElementById("historyAllCount");
  const favCountBadge = document.getElementById("historyFavCount");
  if (allCountBadge) allCountBadge.textContent = String(history.length);
  if (favCountBadge) favCountBadge.textContent = String(favCount);

  const emptyState = historyPage.querySelector(".empty-state");
  let list = historyPage.querySelector(".history-list");
  if (list) list.remove();

  if (history.length === 0) {
    setIsEditingHistory(false);
    if (emptyState) {
      emptyState.classList.remove("hidden");
      const emptyP = emptyState.querySelector("p");
      if (emptyP) emptyP.textContent = translations[currentLang]?.["empty-history"] || "No history yet.";
      const sub = emptyState.querySelector(".empty-sub");
      if (sub) sub.remove();
    }
    editHistoryBtn?.classList.add("hidden");
    historyActions?.classList.add("hidden");
    historyControls?.classList.add("hidden");
    return;
  }

  // Show controls and handle edit button state
  historyControls?.classList.remove("hidden");
  if (isEditingHistory) {
    editHistoryBtn?.classList.add("hidden");
    historyActions?.classList.remove("hidden");
  } else {
    editHistoryBtn?.classList.remove("hidden");
    historyActions?.classList.add("hidden");
  }

  // 1. Filter by Tab (All vs Favorites)
  let filtered = history;
  if (currentHistoryTab === "favorites") {
    filtered = filtered.filter(isItemFavorite);
  }

  // 2. Filter by Search Query
  if (currentHistorySearchQuery) {
    filtered = filtered.filter((item) => {
      const t = (item.title || "").toLowerCase();
      const u = (item.url || "").toLowerCase();
      const s = (item.sourceUrl || "").toLowerCase();
      const a = (item.author || "").toLowerCase();
      return (
        t.includes(currentHistorySearchQuery) ||
        u.includes(currentHistorySearchQuery) ||
        s.includes(currentHistorySearchQuery) ||
        a.includes(currentHistorySearchQuery)
      );
    });
  }

  // 3. Sort: FAVORITES AUTOMATICALLY ON TOP, then newest timestamp first
  const sorted = [...filtered].sort((a, b) => {
    const favA = isItemFavorite(a) ? 1 : 0;
    const favB = isItemFavorite(b) ? 1 : 0;
    if (favA !== favB) return favB - favA; // Favorites automatically on top!
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  // Empty state handling for active filters
  if (sorted.length === 0) {
    if (emptyState) {
      emptyState.classList.remove("hidden");
      const emptyP = emptyState.querySelector("p");
      let emptySub = emptyState.querySelector(".empty-sub");
      if (!emptySub) {
        emptySub = document.createElement("span");
        emptySub.className = "empty-sub";
        emptyState.appendChild(emptySub);
      }

      if (currentHistoryTab === "favorites") {
        if (emptyP) emptyP.textContent = translations[currentLang]?.["empty-favorites"] || "No favorites yet";
        if (emptySub) emptySub.textContent = translations[currentLang]?.["empty-favorites-desc"] || "Tap the star on any download to save it here";
      } else if (currentHistorySearchQuery) {
        if (emptyP) emptyP.textContent = translations[currentLang]?.["empty-search-history"] || "No matching history found";
        if (emptySub) emptySub.textContent = translations[currentLang]?.["empty-search-desc"] || "Try searching with a different term";
      }
    }
    return;
  }

  emptyState?.classList.add("hidden");

  list = document.createElement("div");
  list.className = "history-list";

  sorted.forEach((item) => {
    const card = document.createElement("div");
    const isFav = isItemFavorite(item);
    card.className = `history-item${isFav ? " is-favorited" : ""}`;

    // Check if this item is currently being downloaded
    const isDownloading = activeUrl &&
      (item.url === activeUrl ||
        (item.sourceUrl && item.sourceUrl === activeUrl) ||
        (activeUrl.includes(item.url)) ||
        (item.url && activeUrl && item.url.includes(activeUrl)));

    const isDataSaver = localStorage.getItem("astrostar_data_saver") === "true";
    let thumbSrc = isDataSaver
      ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E"
      : item.thumbnail;

    if (!isDataSaver) {
      if (item.thumbnail) {
        thumbSrc = item.thumbnail;
      } else if (item.localThumbnail) {
        thumbSrc = item.localThumbnail;
      } else if (item.localFiles && item.localFiles.length > 0) {
        const first = item.localFiles[0];
        if (first.thumbnail) {
          thumbSrc = first.thumbnail;
        } else if (first.type === "IMAGE") {
          thumbSrc = window.Capacitor?.convertFileSrc(first.uri || first.path);
        }
      } else if (item.localUri && window.Capacitor) {
        const isImage = /\.(jpg|jpeg|png|webp)/i.test(item.localUri);
        if (isImage) {
          thumbSrc = window.Capacitor.convertFileSrc(item.localUri);
        }
      }
    }

    card.innerHTML = `
      <div class="history-thumb-container">
          <img src="${escapeHtml(thumbSrc)}" alt="thumb" class="hist-img" referrerpolicy="no-referrer">
          ${item.localFiles && item.localFiles.length > 1 ? `<div class="multi-indicator">${item.localFiles.length}</div>` : ""}
          ${isDownloading ? `<div class="hist-downloading-overlay"><div class="hist-dl-spinner"></div></div>` : ""}
      </div>
      <div class="history-info">
          <div class="history-title-row">
            <h3>${truncate(escapeHtml(item.title), 55)}</h3>
            ${isFav ? `<span class="history-fav-badge"><svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> ${translations[currentLang]?.["filter-favorites"] || "Favorites"}</span>` : ""}
          </div>
          <p>${new Date(item.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</p>
      </div>
      <div class="history-card-actions">
        ${!isEditingHistory ? `
          <button class="history-fav-btn ${isFav ? "is-fav" : ""}" data-url="${escapeHtml(item.url)}" title="${isFav ? (translations[currentLang]?.["toast-fav-removed"] || "Remove from favorites") : (translations[currentLang]?.["toast-fav-added"] || "Add to favorites")}" aria-label="Favorite">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          </button>
        ` : `
          <button class="delete-item-btn" data-url="${escapeHtml(item.url)}" aria-label="Delete">×</button>
        `}
      </div>
    `;

    const img = card.querySelector(".hist-img");
    img.onerror = () => {
      if (item.thumbnail && img.src !== item.thumbnail) {
        img.src = item.thumbnail;
      } else {
        img.style.display = "none";
      }
    };

    if (!isEditingHistory) {
      let pressTimer = null;
      let isLongPress = false;
      let startX = 0;
      let startY = 0;

      const startPress = (e) => {
        isLongPress = false;
        if (e.touches && e.touches[0]) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }
        pressTimer = setTimeout(() => {
          isLongPress = true;
          triggerHaptic();
          onDeleteClick(item.url);
        }, 500);
      };

      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      const movePress = (e) => {
        if (e.touches && e.touches[0]) {
          const dx = Math.abs(e.touches[0].clientX - startX);
          const dy = Math.abs(e.touches[0].clientY - startY);
          if (dx > 10 || dy > 10) {
            cancelPress();
          }
        }
      };

      card.addEventListener("touchstart", startPress, { passive: true });
      card.addEventListener("touchend", cancelPress);
      card.addEventListener("touchmove", movePress, { passive: true });
      card.addEventListener("touchcancel", cancelPress);

      card.addEventListener("mousedown", (e) => {
        if (e.button === 0) startPress(e);
      });
      card.addEventListener("mouseup", cancelPress);
      card.addEventListener("mouseleave", cancelPress);

      // Wire up favorite button
      const favBtn = card.querySelector(".history-fav-btn");
      if (favBtn) {
        favBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          const targetUrl = item.url || item.sourceUrl;
          const nowFav = toggleFavorite(targetUrl);
          triggerHaptic("light");
          const toastMsg = nowFav
            ? (translations[currentLang]?.["toast-fav-added"] || "Added to favorites")
            : (translations[currentLang]?.["toast-fav-removed"] || "Removed from favorites");
          showToast(toastMsg);
          renderHistory(savedOnItemClick, savedOnDeleteClick);
        });
      }

      card.addEventListener("click", (e) => {
        if (e.target.closest(".history-fav-btn") || e.target.closest(".delete-item-btn")) {
          return;
        }
        if (isLongPress) {
          e.preventDefault();
          e.stopPropagation();
          isLongPress = false;
          return;
        }
        if (savedOnItemClick) {
          savedOnItemClick(item);
        } else if (typeof onItemClick === "function") {
          onItemClick(item);
        }
      });
    } else {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (savedOnDeleteClick) savedOnDeleteClick(item.url);
        else if (typeof onDeleteClick === "function") onDeleteClick(item.url);
      });
      const delBtn = card.querySelector(".delete-item-btn");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (savedOnDeleteClick) savedOnDeleteClick(item.url);
          else if (typeof onDeleteClick === "function") onDeleteClick(item.url);
        });
      }
    }
    list.appendChild(card);
  });
  historyPage.appendChild(list);
}

// Re-exports for backward compatibility with importers
export {
  setCurrentLang,
  setCurrentSlideIndex,
  setSlideData,
} from "./modules/core.js";
export {
  updateSliderUI,
  renderResult,
  renderMediaSlides,
} from "./ui/result.js";
export { showModal } from "./ui/resultModal.js";
export { startNativeDownload, cancelCurrentDownload } from "./ui/nativeDownload.js";