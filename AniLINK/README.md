# <img src="https://upload-os-bbs.hoyolab.com/upload/2024/06/03/136787680/795963af96e199b14106441a955376fa_6229706912856146042.jpg" style="width:48px;height:48px;border-radius:8px"> AniLINK — Episode Link Extractor

AniLINK turns supported anime episode pages into direct stream links, playlists, and downloads. Extract a single episode, queue a whole season, send it to your favourite player, or let the built-in downloader handle it while you do something else. Less jumping between tabs, less copy-pasting, more anime.

[![Install AniLINK](https://img.shields.io/badge/Install-Now-brightgreen)](https://greasyfork.org/en/scripts/492029-anilink-episode-link-extractor)

<details>
<summary><strong>Supported websites</strong> (click to expand)</summary>

The list below follows the extractors currently bundled with the script and I do try to keep this updated as much as I can. Streaming sites change their layouts, domains, and protection fairly often, so a site being listed does not mean every mirror will behave identically forever. If one mirror is having a bad day, try another one or report it through the script.

| Name | Domain(s) | Start button |
| --- | --- | :---: |
| Anitaku (clone) | [anitaku.io](https://anitaku.io) | Menu |
| AnimePahe | [animepahe.pw](https://animepahe.pw) | Yes |
| Otaku-Streamers | [otaku-streamers.com](https://otaku-streamers.com) | Yes |
| AnimeHeaven | [animeheaven.me](https://animeheaven.me) | Yes |
| Miruro | [miruro.to](https://miruro.to), [miruro.tv](https://miruro.tv), [miruro.ru](https://miruro.ru), [4](htpps://miruro.bz) | Yes |
| AniZone | [anizone.to](https://anizone.to) | Yes |
| Animegg | [animegg.org](https://animegg.org) | Yes |
| AnimeOnsen | [animeonsen.xyz](https://animeonsen.xyz) | Menu |
| AnimeKai (clone) | [animekai.ro](https://animekai.ro) | Yes |
| UniqueStream | [anime.uniquestream.net](https://anime.uniquestream.net) | Yes |
| Lucifer Donghua | [luciferdonghua.in](https://luciferdonghua.in) | Yes |
| Anikoto (and clones) | [anikoto.site](https://anikoto.site), [anikototv.to](https://anikototv.to), [anikoto.net](https://anikoto.net), [4](https://animekai.org.in), [5](https://anixtv.me), [6](https://animixplay.cz), [7](https://animewave.to), [8](https://anix.best), [9](https://animesogo.to), [10](https://animesugez.tv), [11](https://aniwave.id), [12](https://animekai.se), [13](https://gogoanime.com.by), [14](https://animekaitv.to), [15](https://anikai.se) | Yes |
| AV1 EnCodes | [av1please.com](https://av1please.com) | Yes |
| AniDB | [anidb.app](https://anidb.app) | Yes |
| Re:Anime | [reanime.cz](https://reanime.cz), [reanime.to](https://reanime.to) | Menu |
| AniNeko | [anineko.to](https://anineko.to) | Yes |

**Menu** means the extractor is available from the userscript manager menu even when AniLINK cannot add a button to that site's page. The Anikoto extractor also matches some additional wildcard clone domains; only concrete, linkable domains are listed above.

</details>

## What AniLINK can do

- **Extract direct links:** Pull episode streams from supported pages and group them by source and format.
- **Choose your source strategy:** Use single-source mode with a fallback order, or multi-source mode when you want every available result.
- **Work in two views:** Source View is compact and practical; Episode View gives you cards, thumbnails, previews, and quick actions.
- **Copy or export playlists:** Copy links directly, or export an `.m3u8` playlist for MPV, VLC, and other compatible players.
- **Download in batches:** Select a range or a custom set of episodes and queue them in the built-in downloader.
- **Keep tracks useful:** HLS audio and caption tracks can be filtered by language and saved alongside the episode when the source provides them.
- **Play your way:** Send episodes or playlists to MPV, VLC, IINA, PotPlayer, Infuse, Kodi, or MX Player through the **Play With** menu.
- **Ask for help without leaving the script:** The About dialog includes the guides, site requests, feature requests, and bug/downloader reports.

## Requirements

1. A desktop browser with a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/get-it/) (or [Tampermonkey](https://www.tampermonkey.net/)).
2. The AniLINK userscript, installed from [GreasyFork](https://greasyfork.org/en/scripts/492029-anilink-episode-link-extractor).
3. A supported anime site. The site may still require its own login, cookies, or anti-bot check; AniLINK does not replace those.

There is no separate setup needed for basic extraction. External players and the built-in downloader have their own notes below because browsers enjoy making simple things interesting.

## Getting started

1. Install Tampermonkey or Violentmonkey in your browser.
2. Open the AniLINK page on GreasyFork and click **Install script**.
3. Visit an anime page on one of the supported sites above.
4. Click the site's **Extract Episode Links** or **Generate Download Links** button. If the site does not have one, open your userscript manager's menu and choose **Extract Episodes**.
5. Let AniLINK finish extracting, then choose an action:
   - use **Source View** to inspect sources and copy individual links;
   - use **Episode View** for card previews and quick actions;
   - select episodes and choose **Download**, **Export**, or **Play With**.

For long series, the episode-range selector is your friend. You do not need to extract an entire 500-episode catalogue just to watch three episodes.

### Downloading episodes
<details>
<summary style="color:grey;margin-top:-10px;margin-bottom:10px">(click to expand)</summary>

The built-in downloader can handle direct files and HLS (`.m3u8`) streams. It supports queued tasks, multiple workers, retries, pause/resume/cancel, speed limits, progress tracking, download history, and optional retention of partial files after a failure.

Typical workflow:

1. Select the episodes you want, or leave everything unselected to use the full extracted list.
2. Click **Download** in the AniLINK header.
3. Choose an output folder when the browser asks for one.
4. Adjust threads, speed limit, resolution, source naming, and track preferences if needed.
5. Watch the queue from the downloader panel. Completed and interrupted tasks remain available in its history.

When audio or caption tracks are available, AniLINK can save tracks matching your language preferences. The defaults favour Japanese audio and English captions, and you can set a separate subtitle directory if you prefer to keep them organised.

The downloader does not currently process DASH `.mpd` files. For those sources, use an external player or copy the link to a tool that supports DASH.
</details>

### Browser support and download fallback
<details>
<summary style="color:grey;margin-top:-10px;margin-bottom:10px">(click to expand)</summary>

The extractor itself works across more browsers than the downloader, but the best v7 experience is on **Chromium-based desktop browsers**:

| Browser family | What to expect |
| --- | --- |
| Chrome, Edge, Opera, Brave, and other Chromium browsers | Full downloader experience, including direct folder selection through the File System Access API. This is the recommended setup. |
| Firefox and similar browsers | Extraction, copying, playlists, and player links generally work, but direct folder access is unavailable. AniLINK falls back to buffering the finished file and handing it to the browser's normal download flow. Large files and large batches may use more memory. |
| Safari and WebKit-based browsers | Some features are limited by WebKit and userscript-manager support. Downloads may need manual handling; Chromium is the safer choice for the downloader. |
| Mobile browsers | Basic extraction may work, but folder access, external-player handlers, and long downloads are limited. A desktop browser is strongly recommended. |

If the downloader says that direct folder access is unavailable, that is the fallback working as intended—not a mysterious new error. For Firefox, Safari, or a browser with a restricted userscript manager:

- use **Copy** and send the link to the browser, IDM, FDM, or another download manager;
- use **Export** and open the playlist in MPV for streaming instead of saving every episode;
- try a different source if one server rejects the request;
- switch to Edge or Chrome for large batches and direct-to-folder downloads;
- enable **Keep partial files** if you want failed downloads to leave their partial file behind for inspection or recovery.
</details>

### Playing with external players
<details>
<summary style="color:grey;margin-top:-10px;margin-bottom:10px">(click to expand)</summary>

The **Play With** popover can launch an episode or a playlist in the player you choose. The available targets are MPV through [mpv-handler](https://github.com/akiirui/mpv-handler), VLC through [VLC-web-protocol](https://github.com/milouz-corp/VLC-web-protocol), VLC on Android, IINA on macOS, PotPlayer, Infuse, Kodi, and MX Player on Android.

MPV is the recommended option, especially for HLS links and exported playlists. Install [mpv-handler](https://github.com/akiirui/mpv-handler), then place [`anilink-m3u8.lua`](https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AniLINK/anilink-m3u8.lua) in MPV's `scripts` folder. The Lua script helps MPV forward the headers that some sources require and makes AniLINK playlists much less troublesome.

If clicking a player does nothing, install or enable the relevant protocol handler and check that the player itself is installed. For MPV on Windows, also make sure MPV is available to `mpv-handler` or configure its path in the handler settings. The last player you use becomes the preferred player in AniLINK.
</details>

### Troubleshooting
<details>
<summary style="color:grey;margin-top:-10px;margin-bottom:10px">(click to expand)</summary>

**No button or no episodes?** Wait for the site's episode list to finish loading, refresh once, and try the userscript manager menu command. Some supported sites only expose the menu command.

**A source returns an error or a link gives 403/404?** Re-extract the episode, try another source, and check whether the site's own player works. Extracted links can expire, and a source can go offline without warning.

**MPV or another player does not open?** Check the protocol handler, confirm the player is installed, and make sure the handler is allowed to open external applications. MPV users should also install `anilink-m3u8.lua` and restart MPV.

**Downloads are slow or stuck?** Reduce the thread count, try another source, remove an aggressive speed limit, or use a Chromium browser. A server may throttle parallel requests even when the link itself is fine.

**Subtitles or audio are missing?** The source may not provide those tracks, or the language may not match the preferences in the downloader settings. AniLINK can only pass along tracks it actually finds.

Still stuck? Open the **Report** tab in AniLINK and include the affected site, browser, userscript manager, and any console error you can share. That makes debugging much faster.
</details>

## A quick tour of the interface

- **Source View:** Sources are grouped into collapsible sections. Use the source preferences button to reorder them or switch between single and multi-source extraction.
- **Episode View:** Episodes appear as cards with thumbnails, previews when available, source information, and quick buttons for copying, playing, and downloading.
- **Selection:** Checkboxes power the batch actions. `Shift`-clicking a source header selects or clears the episodes in that source.
- **Export:** Saves a small `.m3u8` playlist file. It stores links, not video files, so the player still needs internet access when it plays.
- **About → Guides:** The in-app guide has the longer site, player, browser, and troubleshooting notes without making the main interface noisy.

## Screenshots and demos
[Watch Demo clips
![AniLINK Demo](https://i.imgur.com/i3xDj1Z.png)](https://imgur.com/a/79urhGf)
<span>
<video controls loop muted playsinline src="https://i.imgur.com/thrEVan.mp4" width="49.5%"></video>
<video controls loop muted playsinline src="https://i.imgur.com/Lw5LBX8.mp4" width="49.5%"></video>
<video controls loop muted playsinline src="https://i.imgur.com/Cfd1h5S.mp4" width="49.5%"></video>
<video controls loop muted playsinline src="https://i.imgur.com/Ff0WR6K.mp4" width="49.5%"></video>
</span>

## Compatibility and Legal Disclaimer

AniLINK is designed to work seamlessly on all modern browsers with a userscript manager extension installed. It has been tested with Violentmonkey on Opera GX & Edge Browser, ensuring maximum compatibility.

Please note that this script is for personal use only. Downloading copyrighted material may be illegal in your country. Use AniLINK responsibly and at your own risk.

## Credits and Acknowledgments

AniLINK was proudly created by [Jery](https://github.com/jeryjs),
inspired by [Clour Axe's](https://greasyfork.org/en/users/773517) GoGoAnime Download Link Extractor.

Supercharge your anime-watching experience today with AniLINK! Stream, download, and indulge in the world of anime like never before.
