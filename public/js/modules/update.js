// update.js — GitHub release check & about/share modals
import { translations } from "../i18n/index.js";
import { CapacitorHttp, Share, showToast } from "../utils/index.js";
import { showInfoModal } from "./modals.js";
import {
  APP_VERSION,
  UPDATE_CHECK_URL,
  REPO_URL,
  checkUpdateBtn,
  currentLang,
  openExternalUrl,
  howToUseBtn,
  aboutAppBtn,
  shareAppBtn,
} from "./core.js";

export function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const parse = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const numL = l[i] || 0;
    const numC = c[i] || 0;
    if (numL > numC) return true;
    if (numL < numC) return false;
  }
  return false;
}

function extractHighestRelease(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    const valid = data.filter((r) => r && !r.draft && r.tag_name);
    if (!valid.length) return null;
    valid.sort((a, b) => (isNewerVersion((b.tag_name || "").replace(/^v/i, ""), (a.tag_name || "").replace(/^v/i, "")) ? 1 : -1));
    return valid[0] || null;
  }
  return data?.tag_name ? data : null;
}

async function fetchLatestRelease() {
  const tauriInvoke =
    window.__TAURI__?.core?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    window.__TAURI__?.invoke;

  // 1. Web / Backend API proxy (bypasses CORS & rate limits, picks highest semver)
  try {
    const serverRes = await fetch("/api/check-update");
    if (serverRes.ok) {
      const serverJson = await serverRes.json();
      if (serverJson?.release?.tag_name) {
        return serverJson.release;
      }
    }
  } catch {
    // Continue to next fetcher
  }

  // 2. Native Capacitor
  if (CapacitorHttp) {
    try {
      const res = await CapacitorHttp.get({
        url: UPDATE_CHECK_URL,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "AstroStar-App",
        },
      });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      return extractHighestRelease(data);
    } catch {
      // Continue
    }
  }

  // 3. Desktop Tauri
  if (tauriInvoke) {
    try {
      const res = await tauriInvoke("tauri_http_request", {
        url: UPDATE_CHECK_URL,
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "AstroStar-App",
        },
      });
      const rawData = res?.data || res?.body || res;
      const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      return extractHighestRelease(data);
    } catch {
      // Continue
    }
  }

  // 4. Direct client fetch fallback
  try {
    const res = await fetch(UPDATE_CHECK_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.ok) {
      const data = await res.json();
      return extractHighestRelease(data);
    }
    return null;
  } catch {
    return null;
  }
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

const updateSvgIcon = `
<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:linear-gradient(135deg,rgba(var(--primary-rgb),0.2),rgba(var(--primary-rgb),0.06));border:1px solid rgba(var(--primary-rgb),0.28);border-radius:18px;color:var(--primary);margin-bottom:10px;box-shadow:0 4px 14px rgba(var(--primary-rgb),0.18);">
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
</div>
`;

function renderAssetsHtml(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return "";
  const downloadSvg = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;
  return (
    `<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;text-align:left;">` +
    assets
      .map((a) => {
        const url = a.download_url || a.browser_download_url;
        const sizeStr = a.size ? formatFileSize(a.size) : "";
        return `
          <a href="${url}" download="${a.name}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(var(--primary-rgb),0.1);border:1px solid rgba(var(--primary-rgb),0.25);color:var(--text-primary);padding:10px 14px;border-radius:10px;text-decoration:none;font-size:0.85rem;font-weight:600;transition:all 0.2s ease;">
            <span style="display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--primary);">
              ${downloadSvg}
              <span style="overflow:hidden;text-overflow:ellipsis;color:var(--text-primary);">${a.name}</span>
            </span>
            ${sizeStr ? `<span style="display:inline-block;color:var(--primary);font-size:0.75rem;background:rgba(var(--primary-rgb),0.15);padding:2px 8px;border-radius:6px;flex-shrink:0;">${sizeStr}</span>` : ""}
          </a>
        `;
      })
      .join("") +
    `</div>`
  );
}

export async function checkUpdate() {
  const actionLabel = checkUpdateBtn?.querySelector(".action-label");
  if (actionLabel) {
    actionLabel.textContent = translations[currentLang]?.["btn-processing"] || "CHECKING...";
  }

  try {
    const data = await fetchLatestRelease();
    const latest = (data?.tag_name || "").replace(/^v/i, "");

    if (latest && isNewerVersion(latest, APP_VERSION)) {
      if (actionLabel) actionLabel.textContent = translations[currentLang]?.["btn-update"] || "UPDATE";
      const lang = translations[currentLang] || translations.en;
      const title = lang["label-update-available"] || "Update Available";
      const assetsHtml = renderAssetsHtml(data?.assets);

      const msg = `<div style="text-align:center;padding:4px 0;">${updateSvgIcon}<div style="font-size:1.05rem;font-weight:700;margin-bottom:2px;">${title}</div><div style="color:var(--primary);font-weight:700;font-size:0.95rem;">v${latest}</div><div style="color:var(--text-secondary);font-size:0.8rem;margin-top:2px;">Current: v${APP_VERSION}</div>${assetsHtml}</div>`;

      showInfoModal(title, msg);
    } else {
      if (actionLabel) actionLabel.textContent = translations[currentLang]?.["btn-check"] || "CHECK";
      const lang = translations[currentLang] || translations.en;
      showInfoModal(lang["label-update"] || "Update", `${lang["label-up-to-date"] || "You are on the latest version."}`);
    }
  } catch (e) {
    console.warn("Update check handled:", e);
    if (actionLabel) actionLabel.textContent = translations[currentLang]?.["btn-check"] || "CHECK";
    const lang = translations[currentLang] || translations.en;
    showInfoModal(
      lang["label-update"] || "Update",
      lang["label-up-to-date"] || "You are on the latest version.",
    );
  }
}

export async function autoCheckUpdate() {
  if (localStorage.getItem("astrostar_auto_update") === "false") return;
  if (localStorage.getItem("astrostar_skip_auto_update")) return;

  try {
    const data = await fetchLatestRelease();
    const latest = (data?.tag_name || "").replace(/^v/i, "");

    if (latest && isNewerVersion(latest, APP_VERSION)) {
      const lang = translations[currentLang] || translations.en;
      const title = lang["label-update-available"] || "Update Available";
      const assetsHtml = renderAssetsHtml(data?.assets);

      const msg = `<div style="text-align:center;padding:4px 0;">${updateSvgIcon}<div style="font-size:1.05rem;font-weight:700;margin-bottom:2px;">${title}</div><div style="color:var(--primary);font-weight:700;font-size:0.95rem;">v${latest}</div><div style="color:var(--text-secondary);font-size:0.8rem;margin-top:2px;">Current: v${APP_VERSION}</div>${assetsHtml}</div>`;

      showInfoModal(title, msg, {
        showDontShow: true,
        dontShowKey: "astrostar_skip_auto_update",
        dontShowLabel: lang["label-dont-show-again"] || "Don't show again",
      });
    }
  } catch (e) {
    console.warn("Auto update check handled:", e);
  }
}

checkUpdateBtn?.addEventListener("click", checkUpdate);
autoCheckUpdate();

howToUseBtn?.addEventListener("click", () => {
  const lang = translations[currentLang];
  const steps = lang["howtouse-steps"]
    .map((s, i) => `${i + 1}. ${s}`)
    .join("<br><br>");
  showInfoModal(lang["label-howtouse"], steps);
});

aboutAppBtn?.addEventListener("click", () => {
  const lang = translations[currentLang];
  showInfoModal(lang["label-about"], lang["about-text"]);
});

shareAppBtn?.addEventListener("click", async () => {
  const lang = translations[currentLang];
  const shareUrl = window.location.href;
  if (window.Capacitor?.isNativePlatform?.() && Share) {
    await Share.share({
      title: "AstroStar App",
      text: lang["share-msg"],
      url: shareUrl,
      dialogTitle: "Share AstroStar",
    });
  } else {
    // Fallback for web
    if (navigator.share) {
      navigator.share({
        title: "AstroStar App",
        text: lang["share-msg"],
        url: shareUrl,
      });
    } else {
      showToast("Sharing not supported on this browser.");
    }
  }
});