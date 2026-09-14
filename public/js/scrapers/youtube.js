import { CHROME_UA } from "../utils/index.js";
import { scraperFetch, createScraperResult } from "./httpHelper.js";
import { t } from "../modules/core.js";

export let _ytSource = null;
export function setYouTubeSource(src) {
  _ytSource = src;
}

export async function scrapeYouTube(url) {
  let currentStatus = null;
  try {
    const videoMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    );
    const playlistMatch = url.match(/[?&]list=([^"&?\/\s]+)/i);

    const videoId = videoMatch?.[1];
    const playlistId = playlistMatch?.[1];
    const isPlaylist = !!playlistId && !videoId;

    if (!videoId && !playlistId) throw new Error("Invalid YouTube URL");
    
    if (isPlaylist && _ytSource && _ytSource !== "gg") {
      throw new Error(t("err-yt-playlist-source"));
    }

    if (!_ytSource) return { requireSource: true };

    const oembed = async () => {
      let title = isPlaylist ? "YouTube Playlist" : "YouTube Video";
      let thumbnail = isPlaylist ? "https://www.youtube.com/img/desktop/yt_1200.png" : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      if (isPlaylist) return { title, thumbnail };
      
      try {
        const oData = await scraperFetch(
          {
            url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          },
          "YouTube Oembed",
        );
        if (oData) {
          title = oData.title || title;
          thumbnail = oData.thumbnail_url || thumbnail;
        }
      } catch (e) {}
      return { title, thumbnail };
    };

    const meta = await oembed();

    if (_ytSource === "gg") {
      const headers = {
        Origin: "https://media.ytmp3.gg",
        Referer: "https://media.ytmp3.gg/",
        "User-Agent": CHROME_UA,
        Accept: "application/json, text/plain, */*",
      };

      if (isPlaylist) {
        const plRes = await scraperFetch(
          {
            url: `https://yt-meta.convert1s.com/playlist?id=${playlistId}`,
            headers: {
              Origin: "https://media.ytmp3.gg",
              Referer: "https://media.ytmp3.gg/",
              "User-Agent": CHROME_UA,
            },
          },
          "ytmp3.gg Playlist",
        );
        if (plRes && plRes.items && plRes.items.length > 0) {
          const downloads = [];
          plRes.items.forEach((item, index) => {
            const prefix = `${(index + 1).toString().padStart(String(plRes.items.length).length, "0")}. `;
            const trackLabel = item.channel ? `${item.channel} - ${item.title}` : item.title;
            downloads.push({
              type: `${prefix}${trackLabel}`,
              url: `ytmp3gg_resolve:${item.id}|||mp3|||128`,
              ext: "mp3",
            });
          });
          _ytSource = null;
          return createScraperResult(true, {
            title: plRes.items[0].channel ? `${plRes.items[0].channel} - YouTube Playlist` : "YouTube Playlist",
            thumbnail: plRes.items[0].thumbnail || meta.thumbnail,
            downloads,
            sourceUrl: url,
          });
        }
        throw new Error("Failed to extract YouTube playlist. The playlist might be private or empty.");
      }

      const runConvert = async (format, quality) => {
        try {
          const convRes = await scraperFetch(
            {
              url: "https://hub.convert1s.com/api/download",
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              data: JSON.stringify({
                url,
                os: "macos",
                output: {
                  type: format === "mp4" ? "video" : "audio",
                  format,
                  quality,
                },
                audio: { bitrate: "128k" },
              }),
              rawResponse: true,
            },
            "ytmp3.gg Convert",
          );
          currentStatus = convRes.status;
          let conv = convRes.data;
          if (typeof conv === "string") {
            if (conv.trim().startsWith("<")) return null;
            conv = JSON.parse(conv);
          }
          if (!conv || conv.error || !conv.statusUrl) return null;
          let downloadUrl = null,
            attempts = 0;
          while (!downloadUrl && attempts < 30) {
            await new Promise((r) => setTimeout(r, 1500));
            const pollData = await scraperFetch(
              {
                url: conv.statusUrl,
                headers,
              },
              "ytmp3.gg Status",
            );
            attempts++;
            if (
              pollData &&
              pollData.status === "completed" &&
              pollData.downloadUrl
            ) {
              downloadUrl = pollData.downloadUrl;
              break;
            }
            if (
              pollData &&
              (pollData.status === "error" || pollData.status === "failed")
            )
              break;
          }
          return downloadUrl
            ? { url: downloadUrl, quality: conv.selectedQuality || quality }
            : null;
        } catch (e) {
          return null;
        }
      };

      const downloads = [];
      const tiers = ["720p", "360p"];

      // Run sequential requests to avoid convert1s concurrency limits
      for (const q of tiers) {
        const r = await runConvert("mp4", q);
        if (r && r.url) {
          downloads.push({ type: `MP4 ${r.quality || q}`, url: r.url });
        }
        await new Promise((res) => setTimeout(res, 300));
      }

      const mp3 = await runConvert("mp3", "");
      if (mp3 && mp3.url) {
        downloads.push({ type: "MP3", url: mp3.url });
      }

      if (downloads.length > 0) {
        _ytSource = null;
        return createScraperResult(true, {
          ...meta,
          downloads,
          sourceUrl: url,
        });
      }

      console.warn("[ytmp3.gg] Failed, falling back to ytmp3.mobi...");
      _ytSource = "mobi";
      return await scrapeYouTube(url);
    }

    if (_ytSource === "mobi") {
      const headers = {
        Origin: "https://media.ytmp3.gg",
        Referer: "https://media.ytmp3.gg/",
        "User-Agent": CHROME_UA,
        Accept: "application/json, text/plain, */*",
      };

      const runServer2Convert = async (format, quality) => {
        try {
          const convRes = await scraperFetch(
            {
              url: "https://hub.convert1s.com/api/download",
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              data: JSON.stringify({
                url,
                os: "windows",
                output: {
                  type: format === "mp4" ? "video" : "audio",
                  format,
                  quality: quality || (format === "mp4" ? "720p" : "128k"),
                },
                audio: { bitrate: "128k" },
              }),
              rawResponse: true,
            },
            "Server 2 Convert",
          );
          currentStatus = convRes.status;
          let conv = convRes.data;
          if (typeof conv === "string") {
            if (conv.trim().startsWith("<")) return null;
            conv = JSON.parse(conv);
          }
          if (!conv || conv.error || !conv.statusUrl) return null;
          let downloadUrl = null,
            attempts = 0;
          while (!downloadUrl && attempts < 25) {
            await new Promise((r) => setTimeout(r, 1200));
            const pollData = await scraperFetch(
              {
                url: conv.statusUrl,
                headers,
              },
              "Server 2 Status",
            );
            attempts++;
            if (
              pollData &&
              pollData.status === "completed" &&
              pollData.downloadUrl
            ) {
              downloadUrl = pollData.downloadUrl;
              break;
            }
            if (
              pollData &&
              (pollData.status === "error" || pollData.status === "failed")
            )
              break;
          }
          return downloadUrl
            ? { url: downloadUrl, quality: conv.selectedQuality || quality }
            : null;
        } catch (e) {
          return null;
        }
      };

      const [videoRes, audioRes] = await Promise.all([
        runServer2Convert("mp4", "720p"),
        runServer2Convert("mp3", "128k"),
      ]);

      const downloads = [];
      if (videoRes && videoRes.url) {
        downloads.push({ type: `MP4 ${videoRes.quality || "720p"}`, url: videoRes.url });
      }
      if (audioRes && audioRes.url) {
        downloads.push({ type: "MP3", url: audioRes.url });
      }

      if (!downloads.length) {
        throw new Error("Server 2 is currently busy. Please try Server 1.");
      }

      _ytSource = null;
      return createScraperResult(true, { ...meta, downloads, sourceUrl: url });
    }

    throw new Error("Invalid source selected");
  } catch (err) {
    _ytSource = null;
    return createScraperResult(false, err.message, currentStatus);
  }
}
