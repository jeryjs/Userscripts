// ==UserScript==
// @name        AniLINK - Episode Link Extractor
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     6.33.5
// @description Stream or download your favorite anime series effortlessly with AniLINK! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://upload-os-bbs.hoyolab.com/upload/2024/06/03/136787680/795963af96e199b14106441a955376fa_6229706912856146042.jpg
// @author      Jery
// @license     MIT
// @match       https://anitaku.io/*
// @match       https://animepahe.pw/*/*
// @match       https://otaku-streamers.com/*
// @match       https://animeheaven.me/anime.php?*
// @match       https://www.miruro.to/*
// @match       https://www.miruro.tv/*
// @match       https://www.miruro.ru/*
// @match       https://www.miruro.bz/*
// @match       https://anizone.to/*
// @match       https://www.animegg.org/*
// @match       https://www.animeonsen.xyz/watch/*
// @match       https://animekai.ro/*
// @match       https://anime.uniquestream.net/*
// @match       https://luciferdonghua.in/*/*
// @match       https://anikoto.tld/*
// @match       https://anikototv.tld/*
// @match       https://anikoto.net/*
// @match       https://anikototv.to/*
// @match       https://anikototv.se/*
// @match       https://anixtv.tld/*
// @match       https://anixtv.me/*
// @match       https://animixplay.cz/*
// @match       https://animewave.to/*
// @match       https://anix.best/*
// @match       https://animesogo.to/*
// @match       https://anikoto.site/*
// @match       https://animesugez.tv/*
// @match       https://aniwave.id/*
// @match       https://animekai.se/*
// @match       https://gogoanime.com.by/*
// @match       https://animekaitv.to/*
// @match       https://anikai.se/*
// @match       https://anikoto.bz/*
// @match       https://animesugetv.bz/*
// @match       https://anikaitv.to/*
// @match       https://hianimez.org/*
// @match       https://anisuge.tv/*
// @match       https://anisuge.se/*
// @match       https://zorotv.cz/*
// @match       https://hianimes.re/*
// @match       https://animesalt.cz/*
// @match       https://animesalt.to/*
// @match       https://aniwave.cz/*
// @match       https://animesuge.re/*
// @match       https://hianimetv.si/*
// @match       https://aniwatch.ch/*
// @match       https://anichi.to/*
// @match       https://av1please.com/anime/*
// @match       https://av1please.com/anime/*
// @match       https://av1please.com/episodes/*/*
// @match       https://anidb.app/anime/*
// @match       https://reanime.to/*
// @match       https://reanime.cz/*
// @match       https://anineko.to/watch/*
// @require     https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.3.0
// @grant       GM.xmlHttpRequest
// @grant       GM.download
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_listValues
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_notification
// @grant       unsafeWindow
// @downloadURL https://update.greasyfork.org/scripts/492029/AniLINK%20-%20Episode%20Link%20Extractor.user.js
// @updateURL https://update.greasyfork.org/scripts/492029/AniLINK%20-%20Episode%20Link%20Extractor.meta.js
// ==/UserScript==

// track last version for managing backwards compatability for script updates
if (GM_info.script.version > GM_getValue('script_version', '0')) {
    // migrate anilink_sources_* keys to new sources_config map format
    if (GM_getValue('script_version', '0') < '6.29.0') {
        const newConfig = Object.fromEntries(GM_listValues()
            .filter(k => k.startsWith('anlink_sources_'))
            .map(k => [k.replace('anlink_sources_', ''), JSON.parse(GM_getValue(k, ''))])
        );
        Object.keys(newConfig).forEach(k => GM_deleteValue('anlink_sources_' + k));
        GM_setValue('sources_config', newConfig);
    }

    GM_setValue('script_version', GM_info.script.version);
}

// CONSTANTS / CONFIGURATION
const EP_RANGE_THRESHOLD = GM_getValue('ep_range_threshold', 12); // Number of episodes above which the ep range selector will be shown
const MPV_PROTOCOL = GM_getValue('MPV_PROTOCOL', 'mpv-handler'); // you can set this to mpv-handler-debug if u want it to show the console~
const SRC_IN_FN = GM_getValue('include_source_in_filename', true); // Whether the exported playlist filename should include the source name that you chose as well
const PREFER_JAP_TITLE = GM_getValue('prefer_jap_title', false); // Prefer taking the japenese/romaji titles from sites where relevant like animepahe
const UNSUPPORTED_DOWNLOAD_URL_PATTERNS = [
    /^https:\/\/megap\.*$/i
];

/**
 * Represents an anime episode with metadata and streaming links.
 */
class Episode {
    /**
     * @param {string} number - The episode number.
     * @param {string} animeTitle - The title of the anime.
     * @param {Object.<string, {stream: string, type: '.m3u8'|'.mp4'|'.mpd'|'embed', tracks: Array<{file: string, kind: 'caption'|'audio', label: string}>}>, referer: string} links - An object containing streaming links and tracks for each source along with the referer (for use in CORS requests).
     * @param {string} thumbnail - The URL of the episode's thumbnail image.
     * @param {string} [epTitle] - The title of the episode (optional).
     */
    constructor(number, animeTitle, links, thumbnail, epTitle) {
        this.number = String(number);   // The episode number
        this.animeTitle = animeTitle;     // The title of the anime.
        this.epTitle = (epTitle==animeTitle || /^Episode \d+$/.test(epTitle)) ? undefined : epTitle; // The title of the episode (this can be the specific ep title or blank).
        this.links = this._processLinks(links);     // An object containing streaming links and tracks for each source: {"source1":{stream:"url", type:"m3u8|mp4", tracks:[{file:"url", kind:"caption|audio", label:"name"}]}}}
        this.thumbnail = thumbnail; // The URL of the episode's thumbnail image (if unavailable, then just any image is fine. Thumbnail property isnt really used in the script yet).
        this.filename = `${this.animeTitle} - ${this.number.padStart(3, '0')}${this.epTitle ? ` - ${this.epTitle}` : ''}${Object.values(this.links)[0]?.type || ''}`;   // The formatted name of the episode, combining anime name, number and title and extension.
        this.title = this.epTitle ?? this.animeTitle;
    }

    // Processes the links to ensure they are in right format and are absolute URLs.
    _processLinks(links) {
        for (const linkObj of Object.values(links)) {
            linkObj.stream &&= new URL(linkObj.stream, location.origin).href;   // Ensure stream URLs are absolute
            if (linkObj.file) linkObj.stream = linkObj.file; delete linkObj.file; // Move file to stream for consistency, then delete file property
            linkObj.referer ??= location.origin + '/' ; // Set referer to current domain if not present
            linkObj.type = (linkObj.type?.startsWith('.') || (linkObj.type === 'embed')) ? linkObj.type : `.${linkObj.type || 'm3u8'}`; // Ensure type starts with a dot, but not for 'embed'. Default to '.m3u8' if type is not provided.
            linkObj.tracks?.forEach?.(track => track.kind = /^(caption|subtitle)s?/.test(track.kind) ? 'caption' : track.kind); // normalize all 'kind' values's subtitle(s) or caption(s) to 'caption'
            linkObj.tracks?.forEach?.(track => track.file &&= new URL(track.file, location.origin).href);   // Ensure track file URLs are absolute
        }
        return links;
    }
}

/**
 * @typedef {Object} Websites[]
 * @property {string} name - The name of the website (required).
 * @property {string[]} url - An array of URL patterns that identify the website (required).
 * @property {string} thumbnail - A CSS selector to identify the episode thumbnail on the website (required).
 * @property {Function} addStartButton - A function to add the "Generate Download Links" button to the website (required).
 * @property {AsyncGeneratorFunction} extractEpisodes - An async generator function to extract episode information from the website (required).
 * @property {string} epLinks - A CSS selector to identify the episode links on the website (optional).
 * @property {string} epTitle - A CSS selector to identify the episode title on the website (optional).
 * @property {string} linkElems - A CSS selector to identify the download link elements on the website (optional).
 * @property {string} [animeTitle] - A CSS selector to identify the anime title on the website (optional).
 * @property {string} [epNum] - A CSS selector to identify the episode number on the website (optional).
 * @property {Function} [_getVideoLinks] - A function to extract video links from the website (optional).
 * @property {string} [styles] - Custom CSS styles to be applied to the website (optional).
 *
 * @description An array of website configurations for extracting episode links.
 *
 * @note To add a new website, follow these steps:
 * 1. Create a new object with the following properties:
 *    - `name`: The name of the website.
 *    - `url`: An array of URL patterns that identify the website.
 *    - `thumbnail`: A CSS selector to identify the episode thumbnail on the website.
 *    - `addStartButton`: A function to add the "Generate Download Links" button to the website.
 *    - `extractEpisodes`: An async generator function to extract episode information from the website.
 *    - `styles`: Custom CSS styles to be applied to the website.
 * 2. Optionally, add the following properties if needed (they arent used by the script, but they will come in handy when the animesite changes its layout):
 *    - `animeTitle`: A CSS selector to identify the anime title on the website.
 *    - `epLinks`: A CSS selector to identify the episode links on the website.
 *    - `epTitle`: A CSS selector to identify the episode title on the website.
 *    - `linkElems`: A CSS selector to identify the download link elements on the website.
 *    - `epNum`: A CSS selector to identify the episode number on the website.
 *    - `_getVideoLinks`: A function to extract video links from the website.
 * 3. Implement the `addStartButton` function to add the "Generate Download Links" button to the website.
 *    - This function should create a element and append it to the appropriate location on the website.
 *    - The button should have an ID of "AniLINK_startBtn".
 * 4. Implement the `extractEpisodes` function to extract episode information from the website.
 *    - This function should be an async generator function that yields Episode objects (To ensure fast processing, using chunks is recommended).
 *    - Use the `fetchPage` function to fetch the HTML content of each episode page.
 *    - Parse the HTML content to extract the episode title, number, links, and thumbnail.
 *    - Create an `Episode` object for each episode and yield it using the `yieldEpisodesFromPromises` function.
 * 5. Optionally, implement the `_getVideoLinks` function to extract video links from the website.
 *    - This function should return a promise that resolves to an object containing video links.
 *    - Use this function if the video links require additional processing or API calls.
 *    - Tip: use GM_xmlhttpRequest to make cross-origin requests if needed (I've used proxy.sh so far which I plan to change in the future since GM_XHR seems more reliable).
 */
const Websites = [
    {
        name: "Anitaku (clone)",
        url: ['anitaku.io'],
        extractEpisodes: async function* (status) {
            const epLinks = Array.from(document.querySelectorAll('.episodelist li > a'));
            for (let i = 0, l = [...await applyEpisodeRangeFilter(epLinks)]; i < l.length; i += 12)
                yield* yieldEpisodesFromPromises(l.slice(i, i + 12).map(async a => {
                    const pg = await fetchPage(a.href);
                    const epNum = a.href.match(/-episode-(\d+)-/)[1];
                    status.text = `Extracting Episodes ${(epNum - Math.min(1, epNum) + 1)} - ${epNum}...`;
                    const links = {};
                    for (const [sel, name, attr, ref] of [['.fa-cloud-download-alt', u => 'GoFile', 'href', 0], ['iframe', u => u.includes('megaplay') ? 'MegaPlay' : 'VKSpeed', 'src', 1]]) {
                        try {
                            const el = pg.querySelector(sel);
                            if (!el) continue;
                            const url = attr === 'href' ? el.closest('a')[attr] : el[attr];
                            const src = await Extractors.use(url, ref ? location.href : undefined);
                            links[typeof name === 'function' ? name(url) : name] = { stream: src.file, tracks: src.tracks || [], type: src.type || 'm3u8', ...(ref && { referer: location.href }) };
                        } catch (e) { showToast(`${typeof name === 'function' ? 'iframe' : name} error ep ${epNum}: ${e}`); }
                    }
                    return new Episode(epNum, pg.querySelector('.det > h2 > a').textContent.trim(), links, pg.querySelector('img').src);
                }));
        }
    },
    {
        name: 'AnimePahe',
        url: ['animepahe.pw', 'animepahe.'],
        epLinks: (location.pathname.startsWith('/anime/')) ? 'a.play' : '.dropup.episode-menu a.dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
        _chunkSize: 1, // pahe's lately been rate limiting heavily... set this to 1 for now/
        addStartButton: function () {
            GM_addStyle(`.theatre-settings .col-sm-3 { max-width: 20%; }`);
            (document.location.pathname.startsWith('/anime/'))
                ? document.querySelector(".col-6.bar").innerHTML += `<div class="btn-group btn-group-toggle"><label id="AniLINK_startBtn" class="btn btn-dark btn-sm">Generate Download Links</label></div>`
                : document.querySelector("div.theatre-settings > div.row").innerHTML += `<div class="col-12 col-sm-3"><div class="dropup"><a class="btn btn-secondary btn-block" id="AniLINK_startBtn">Generate Download Links</a></div></div>`;
            return document.getElementById("AniLINK_startBtn");
        },
        extractEpisodes: async function* (status) {
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);

            // Resolve the ep numbering offset (sometimes, a 2nd cour can have ep.num=13 while its s2e1)
            const firstEp = () => document.querySelector(this.epLinks).textContent.match(/.*\s(\d+)/)[1];
            let firstEpNum = firstEp();
            if (document.querySelector('.btn.active')?.innerText == 'desc') {
                document.querySelector('.episode-bar .btn').click();
                await new Promise(r => { const c = () => firstEp() !== firstEpNum ? r() : setTimeout(c, 500); c(); });
                firstEpNum = firstEp();
            }
            const srcCfg = await showSourceSelector(await fetchPage(epLinks[0].href).then(p => [..._$$('#resolutionMenu > button[data-resolution]', p)].map(b => b.textContent.trim()).filter(Boolean)), 'animepahe', { mode: 'single' });
            for (let i = 0; i < epLinks.length; i += this._chunkSize) {
                yield* yieldEpisodesFromPromises(epLinks.slice(i, i + this._chunkSize).map(async epLink => {
                    const page = await fetchPage(epLink.href);
                    const [, animeTitle, epNum] = page.querySelector(this.epTitle).outerText.split(/Watch (.+) - (\d+(?:\.\d+)?) Online$/);
                    const epNumber = (epNum - firstEpNum + 1).toString();
                    const thumbnail = page.querySelector(this.thumbnail).src;
                    status.text = `Extracting episodes ${epNumber - Math.min(epNumber, this._chunkSize) + 1} - ${epNumber}...`;
                    const links = Object.fromEntries(await Promise.all([...page.querySelectorAll('#resolutionMenu > button[data-resolution]')].filter(b => (srcCfg.mode === 'single' ? [srcCfg.sources[0]] : srcCfg.sources).includes(b.textContent.trim())).map(async elm => [elm.textContent, await Extractors.use(elm.getAttribute('data-src'))]))); // kwik.cx
                    return new Episode(epNumber, PREFER_JAP_TITLE ? ($('h2.japanese').text() || animeTitle) : animeTitle, links, thumbnail, epLink.parentNode?.parentNode?.querySelector('.episode-title')?.textContent);
                }));
				if (i < epLinks.length - this._chunkSize) await sleep(2500);  // for prevent rate limit
			}
        },
        styles: `div#AniLINK_LinksContainer { font-size: 10px; } #Quality > b > div > ul {font-size: 16px;}`
    },
    {
        name: 'Otaku-Streamers',
        url: ['otaku-streamers.com'],
        animeTitle: '.wp-breadcrumb > a',
        epLinks: '.wp-ep-item, .tp-ep-row',
        epTitle: '.wp-ep-info-title',
        epNum: '.current.watch_curep',
        thumbnail: 'video',
        addStartButton: function () {
            setInterval(() => {
                const container = _$('.tp-ep-sort, .wp-ep-panel-header');
                if(!container || container?.querySelector("#AniLINK_startBtn")) return;
                container.appendChild(Object.assign(document.createElement('button'), { id: "AniLINK_startBtn", className: "btn-outline os-genre-tag", innerHTML: "Generate Download Links", onclick: extractEpisodes }));
            }, 500);
        },
        extractEpisodes: async function* (status) {
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            const throttleLimit = 12;

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);
                        const animeTitle = page.querySelector(this.animeTitle).textContent;
                        const epTitle = page.querySelector(this.epTitle)?.textContent;
                        const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '');
                        const thumbnail = page.querySelector(this.thumbnail).poster;

                        status.text = `Extracting episodes ${epNumber - Math.min(epNumber, this._chunkSize) + 1} - ${epNumber}...`;
                        const links = { 'Video Links': { stream: page.querySelector('video > source').src, type: 'mp4' } };

                        return new Episode(epNumber, animeTitle, links, thumbnail, epTitle);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: 'AnimeHeaven',
        url: ['animeheaven.me'],
        epLinks: '.linetitle2 > a',
        epTitle: 'a.c2.ac2',
        epNumber: '.boxitem.bc2.c1.mar0[onclick="dwn()"]',
        thumbnail: 'img.posterimg',
        addStartButton: function () {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; border: 2px solid red; padding: 4px;`;
            button.innerHTML = 'Generate Download Links';
            document.querySelector("div.linetitle2.c2").parentNode.insertBefore(button, document.querySelector("div.linetitle2.c2"));
            return button;
        },
        extractEpisodes: async function* (status) {
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks)).reverse();
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            const throttleLimit = 12; // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        document.cookie = "key=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";   // Delete the current cookie to prevent it from being used in the below fetch
                        const page = await fetchPage(epLink.href, { headers: { 'Cookie': 'key=' + epLink.id } }, GM_fetch);
                        const epTitle = page.querySelector(this.epTitle).textContent;
                        const epNumber = page.querySelector(this.epNumber).textContent.replace("Download Episode ", '');
                        const thumbnail = document.querySelector(this.thumbnail).src;

                        status.text = `Extracting ${epTitle} - ${epNumber}...`;
                        const links = [...page.querySelectorAll('#vid > source')].reduce((acc, source, index) => ({ ...acc, ['server '+ ++index]: { stream: source.src.replace(/&error\d?$/,''), type: 'mp4' } }), {});

                        return new Episode(epNumber, epTitle, links, thumbnail); // Return Episode object
                    } catch (e) { showToast(e); return null; }
                }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
            }
        }
    },
    {
        name: 'Miruro',
        url: ['miruro.to', 'miruro.tv', 'miruro.ru', 'miruro.bz'],
        animeTitle: '.anime-title > a',
        thumbnail: 'a[href^="/info?id="] > img',
        baseApiUrl: `${location.origin}/api`,
        addStartButton: function (id) {
            let last_known = { location: location.href, source: null };
            const intervalId = setInterval(() => {
                const currSource = [...document.querySelectorAll('select')].slice(1).map(e => e.value).toString();
                if (last_known.location !== location.href || last_known.source !== currSource) {
                    last_known = { location: location.href, source: currSource };
                    AniLINKUI.removeExtractor();
                }
                // Append the extract button
                const target = document.querySelector('div[class^="_tagRow"] > div+div');
                if (target && !document.getElementById(id)) {
                    // clearInterval(intervalId);
                    const btn = document.createElement('button');
                    btn.id = id;
                    btn.style.cssText = `${target.lastChild.style.cssText} display: flex; justify-content: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: auto;`;
                    btn.className = target.lastChild.className;
                    btn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="3 3 18 18"><path fill="currentColor" d="M5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.588 1.413T19 21H5Zm0-2h14V5H5v14Zm3-4.5h2.5v-6H8v6Zm5.25 0h2.5v-6h-2.5v6Zm5.25 0h2.5v-6h-2.5v6Z"/></svg>
                        <div style="display: flex; justify-content: center; align-items: center;">Extract Episode Links</div>
                    `;
                    btn.addEventListener('click', extractEpisodes);
                    target.appendChild(btn);
                }
            }, 500);
        },
        extractEpisodes: async function* (status) {
            status.text = 'Fetching episode list...';
            const animeTitle = (document.querySelector('p.title-romaji') || document.querySelector(this.animeTitle)).textContent;
            const anilistId = document.querySelector(`a[href*="/anilist.co/anime/"]`)?.href.split('/').pop();
            if (!anilistId) return showToast('anilistId not found.');

            const res = await this._secureFetch(`${this.baseApiUrl}/episodes`, { query: { anilistId } });
            const eps = Object.entries(res.providers).reduce((a, [provider, { episodes }]) => (
                Object.entries(episodes).forEach(([type, list]) => list.forEach(ep => (a[ep.number] ??= []).push({ ...ep, provider, type }))), a
            ), {});

            const allSources = [...new Set(Object.values(eps).flat().map(e => this._getLocalSourceName(e.provider, e.type)))];
            const srcCfg = await showSourceSelector(allSources, 'miruro', { sources: allSources.filter(s => s.startsWith('kiwi')), mode: 'single' });

            for (const epNum of await applyEpisodeRangeFilter(Object.keys(eps).sort((a, b) => a - b))) {
                const baseEp = eps[epNum][0]; status.text = `Fetching Ep ${epNum}...`;
                const links = {}, fetchSource = async ({ id, provider, type }) => {
                    const source = this._getLocalSourceName(provider, type);
                    try {
                        const sresJson = await this._secureFetch(`${this.baseApiUrl}/sources`, { query: { episodeId: id, provider, category: type } });
                        const referer = `https://${{kaa:'kaa.to', zoro:'megacloud.blog', bonk:'vivibebe.site', kiwi:'kwik.cx', hop:'krussdomi.com', moo:'www.animegg.org', bee:'megaplay.buzz'}[provider] || location.host}/`;
                        links[source] = { stream: sresJson.streams[0].url, type: "m3u8", tracks: sresJson.tracks || sresJson.subtitles || [], referer };
                    } catch (e) { showToast(`Failed to fetch ep-${epNum} from ${source}: ${e}`); }
                };
                if (srcCfg?.mode === 'single') { for (const src of srcCfg.sources) { const e = eps[epNum].find(ep => this._getLocalSourceName(ep.provider, ep.type) === src); if (e) { await fetchSource(e); if (Object.keys(links).length) break; } } }
                else for (const src of srcCfg.sources) { const e = eps[epNum].find(ep => this._getLocalSourceName(ep.provider, ep.type) === src); if (e) await fetchSource(e); } // Sequential to avoid rate limit
                yield new Episode(epNum, animeTitle, links, baseEp.image, baseEp.title);
            }
        },
        _secureFetch: async (url, options = {}) => {
            const payload = { path: url.split('/api/').pop(), method: 'GET', query: options.query || {}, body: null, version: '0.1.0' };
            const encode = o => btoa(encodeURIComponent(JSON.stringify(o)).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const decode = async s => JSON.parse(new TextDecoder().decode(await new Response(new Blob([Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()));
            let res = await fetch(`${location.origin}/api/secure/pipe?e=${encode(payload)}`, { headers: { 'x-protocol-version': payload.version } });
            if (res.status == 500) { await new Promise(r => { showToast(`Error ${res.status}: Rate Limited! Waiting 60s before continuing...`, 60000); setTimeout(r, 60000) }); res = await fetch(`${location.origin}/api/secure/pipe?e=${encode(payload)}`, { headers: { 'x-protocol-version': payload.version } }); }
            if (res.headers.get('x-obfuscated') === '1') return await decode(await res.text());
            return await res.json();
        },
        _getLocalSourceName: function (source, type) {
            source = source.toLowerCase();
            const sourceNames = { 'allmanga': 'ally', 'anineko': 'bonk', 'anidbapp': 'pewe', 'animepahe': 'kiwi', 'kickassanime': 'hop', 'animegg': 'moo', 'anikoto': 'bee', 'animekai': 'arc', 'animez': 'jet', 'zoro': 'zoro', 'megaplay': 'bee', 'bunnies': 'bun'};
            return (sourceNames[source] || source) + (type !== undefined ? `-${type.toLowerCase()}` : '');
        },
    },
    {
        name: 'AniZone',
        url: ['anizone.to/'],
        animeTitle: 'h1, nav > span',
        epTitle: '[x-text*="displayEpisodeTitle"], div.space-y-2 > div.text-center',
        epNumber: 'a[x-ref="activeEps"] > div > div',
        thumbnail: 'media-poster',
        epLinks: () => [...new Set(Array.from(document.querySelectorAll('a[wire\\:key][href^="https://anizone.to/anime/"], li[wire\\:key]>a')))],
        addStartButton: function () {setInterval(() => {
            const target = document.querySelector('button > span.truncate, div.lg\\:ml-0>button')?.parentElement;
            if (!target || document.getElementById("AniLINK_startBtn")) return;
            target.parentElement.appendChild(Object.assign(document.createElement('button'), {
                    id: "AniLINK_startBtn",
                    className: target.className,
                    style: "display: flex; justify-content: center; align-items: center; height: stretch;",
                    innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" style="margin-right: 4px;" height="1em" viewBox="3 3 18 18"><path fill="currentColor" d="M5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.588 1.413T19 21H5Zm0-2h14V5H5v14Zm3-4.5h2.5v-6H8v6Zm5.25 0h2.5v-6h-2.5v6Zm5.25 0h2.5v-6h-2.5v6Z"/></svg><span class="truncate">Extract Episode Links</span>`,
                    onclick: extractEpisodes
                }));
        }, 500)},
        extractEpisodes: async function* (status) {
            const epLinks = await applyEpisodeRangeFilter(this.epLinks());
            const throttleLimit = 12; // Limit concurrent requests
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epElm => {
                    try {
                        const page = await fetchPage(epElm.href);
                        const animeTitle = _$(this.animeTitle)?.textContent.trim();
                        const epNum = epElm.href.split('/').pop();
                        const epTitle = epElm.querySelector(this.epTitle)?.textContent?.replace(/^\s:\s/, '');

                        status.text = `Extracting episodes ${epNum - Math.min(epNum, throttleLimit) + 1} - ${epNum}...`;
                        const mediaObject = eval(page.body.querySelector('[x-data*="vidstackPlayer"]').outerHTML.match(/(JSON.parse.*'\)).*/)[1]); 
                        const links = { [page.querySelector('button > span.truncate').textContent]: { stream: mediaObject.src, type: "m3u8", tracks: mediaObject.subtitles.map(t => ({ file: t.file, kind: 'captions', label: `${t.language} | ${t.title}` })).concat(mediaObject.chapter ? [{ file: mediaObject.chapter, kind: 'chapters', label: 'Chapters' }] : []) } };

                        return new Episode(epNum, animeTitle, links, mediaObject.snapshot, epTitle);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: "Animegg",
        url: ['animegg.org/'],
        addStartButton: () => $('#recentTabs, .nap').css({ display: 'flex', justifyContent: 'space-between', ...($('#recentTabs').get(0) ? { width: '102%' } : {})}).append(Object.assign(document.createElement('button'), { id: "AniLINK_startBtn", className: "btn-primary", innerHTML: "Generate Download Links", onclick: extractEpisodes })),
        extractEpisodes: async function* (status) {
            const epLinks = $((!!$('.anm_det_pop').length) ? document : $(await fetchPage($('.nap > a[href^="/series/"]').get(0).href))).find('.newmanga > li > div').get().reverse();
            const l = await applyEpisodeRangeFilter(epLinks); if (!l?.length) return;
            const srcCfg = await showSourceSelector([...(await fetchPage($(l[0]).find('.anm_det_pop').get(0).href)).querySelectorAll('#videos a')].map(a => a.dataset.version), 'animegg', { mode: 'single' });
            for (let i = 0; i < l.length; i += 1)
                yield* yieldEpisodesFromPromises(l.slice(i, i + 1).map(async div => {
                    const pg = $(await fetchPage($(div).find('.anm_det_pop').get(0).href)), epNum = pg.find('.info > a').text().split(' ').pop();
                    status.text = `Extracting Episodes ${(epNum - Math.min(1, epNum) + 1)} - ${epNum}...`;
                    const links = {}, videoLinks = pg.find('#videos a').get(), fetchSource = async a => { if (srcCfg && !srcCfg.sources.includes(a.dataset.version)) return; try { const stream = (await fetch((await fetchPage('/embed/' + a.dataset.id)).querySelector('[property="og:video"]')?.content, { method: 'HEAD' }))?.url; if (stream) links[a.dataset.version] = { stream, type: 'mp4', referer: location.origin }; } catch (e) { showToast(`Error fetching ep ${epNum} - ${a.dataset.version}: ${e}`); } };
                    if (srcCfg?.mode === 'single') { for (const a of videoLinks) { await fetchSource(a); if (Object.keys(links).length) break; } } else await Promise.all(videoLinks.map(fetchSource));
                    return new Episode(epNum, pg.find('.titleep a').text().trim(), links, $('a > img').get(0).src, $(div).find('.anititle').text());
                }));
        },
    },
    {
        name: "AnimeOnsen",
        url: ['animeonsen.xyz/'],
        extractEpisodes: async function* (status) {
            for (let i = 0, epLinks = await applyEpisodeRangeFilter([..._$('.ao-player-metadata-episode').options].map(o => o.value.split('-')[1])); i < epLinks.length; i += 12) {
                yield* yieldEpisodesFromPromises(epLinks.slice(i, i + 12).map(async epNum => {
                    status.text = `Extracting Episodes ${(epNum - Math.min(12, epNum) + 1)} - ${epNum}...`;
                    const token = atob(decodeURIComponent(document.cookie.match(new RegExp('(^|;\\s*)' + 'ao.session' + '=([^;]*)'))[2])).split("").map(c => String.fromCharCode(c.charCodeAt(0) + 1)).join("");
                    const data = await fetch(`https://api.animeonsen.xyz/v4/content/${document.querySelector('[name="ao-content-id"]').content}/video/${epNum}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
                    const links = { "AnimeOnsen": { stream: data.uri.stream, type: ".mpd", tracks: Object.entries(data.uri.subtitles).map(([label, file]) => ({ file, label, kind: 'caption' })), referer: location.origin } };
                    return new Episode(epNum.toString().padStart(3, '0'), data.metadata.content_title, links, _$('[property="og:image"]').content, data.metadata.episode[1].contentTitle_episode_en);
                }));
            }
        }
    },
    {
        name: 'AnimeKai (clone)',
        url: ['animekai.ro/'],
        _chunkSize: 12,
        addStartButton: function (id) {
            setInterval(() => {
                if (_$('#' + id)) return; try {
                    const button = Object.assign(document.createElement('button'), { id, className: "btn btn-primary", textContent: "Extract Episode Links" });
                    const target = document.querySelector('.episode-section .head-bot');
                    if (target) target.after(button);
                    else document.querySelector('.eplist-nav')?.appendChild(button);
                    button.addEventListener('click', extractEpisodes);
                } catch (e) { /* ignore errors */ }
            }, 500);
        },
        extractEpisodes: async function* (status) {
            status.text = 'Fetching episode list...';
            const epElms = await applyEpisodeRangeFilter([..._$$('a[data-episode]')]); if (!epElms?.length) return;
            const srcCfg = await showSourceSelector((await fetchPage(epElms[0].href).then(page => [..._$$('.server', page)].map(e => `${this._typeSuffix(e.closest('div').dataset.id)} - ${e.textContent}`))), 'animekai', { mode: 'single' });
            for (let i = 0; i < epElms.length; i += this._chunkSize)
                yield* yieldEpisodesFromPromises(epElms.slice(i, i + this._chunkSize).map(async ep => {
                    const epNum = ep.getAttribute('data-episode'); status.text = `Extracting Episodes ${(epNum - Math.min(this._chunkSize, epNum) + 1)} - ${epNum}...`;
                    const servers = await fetchPage(ep.href).then(doc => [..._$$('.server', doc)].map(e => ({ url: e.dataset.url, name: `${this._typeSuffix(e.closest('div').dataset.id)} - ${e.textContent}` }))).catch(e => showToast(`Failed to fetch servers for Ep ${epNum}`));
                    const links = {}, fetchSource = async s => { try { links[s.name] = await Extractors.use(s.url); } catch (e) { showToast(`Failed to fetch Ep ${epNum} from ${s.name}: ${e.message || e}`); } };  // megavid.buzz, megaplay.buzz
                    if (srcCfg?.mode === 'single') { for (const key of srcCfg.sources) { const s = servers.find(srv => srv.name === key); if (s) { await fetchSource(s); if (Object.keys(links).length) break; } } }
                    else for (const key of srcCfg.sources) { const s = servers.find(srv => srv.name === key); if (s) await fetchSource(s); }
                    return new Episode(epNum, _$('h1').textContent, links, _$('.poster-wrap-bg').getAttribute('style').match(/https?.*\.[a-z]+/g)[0], ep.querySelector('span').textContent);
                }))
        },
        _typeSuffix: type => ({ sub: "Soft Sub", dub: "Dub & S-Sub" }[type] || type)
    },
    {
        name: 'UniqueStream',
        url: ['anime.uniquestream.net/'],
        addStartButton: function (id) {
            setInterval(() => {
                if (_$('#' + id) || !_$$('.mp-ep-title').length) return;
                _$('.mp-sr-season,.mp-wel-title').after(Object.assign(document.createElement('button'), { id, textContent: "Extract Episode Links", style: "border: 2px solid var(--mp-ink); cursor: pointer; font-family: Bebas Neue, sans-serif; letter-spacing: .04em; padding: 9px 14px; margin-right: auto;", onclick: extractEpisodes }));
            }, 500);
        },
        extractEpisodes: async function* (status) {
            if (location.href.includes('/watch/')) { _$('.mp-wel-grid>div').href = location.href }; // change the current ep item into a link for easy extraction
            const epElms = [..._$$('.mp-sr-epgrid>a, .mp-wel-grid>a, .mp-wel-grid>div')]; if (!epElms?.length) return showToast('No episodes found. Please wait for the episode list to load or refresh the page.');
            for (const epElm of await applyEpisodeRangeFilter(epElms))
                yield* yieldEpisodesFromPromises([epElm].map(async epElm => { try {
                    const epTitle = epElm.querySelector('.mp-ep-title').textContent; 
                    let epNum = epElm.querySelector('.mp-ep-stamp').textContent.slice(1); if (epNum.includes('Now Playing')) epNum = _$('.mp-watch-title').textContent.match(/^E(\d+)\s/)?.[1];
                    status.text = `Extracting Episode ${epNum}...`;
                    const d = await fetch(`${location.origin}/api/v1/episode/${epElm.href.split('/')[4]}/media/dash/ja-JP`).then(r => r.json());
                    const links = Object.fromEntries([d.dash, d.hls, ...(d.versions?.dash || []), ...(d.versions?.hls || [])].filter(Boolean).map(s => [`${s.playlist.includes('.mpd') ? 'dash' : 'hls'}-${s.locale}`, { stream: s.playlist, type: s.playlist.includes('.mpd') ? 'mpd' : 'm3u8', tracks: (s.hard_subs || []).map(h => ({ file: h.playlist, label: h.locale, kind: 'caption' })) }]));
                    return !Object.keys(links).length ? null : new Episode(epNum, _$('#series-title, .mp-watch-series').textContent, links, epElm.querySelector('img')?.src || '', epTitle);
                } catch (e) { showToast(`error ${e.status}: ${e.message}`); return null; } }));
        }
    },
    {
        name: 'Lucifer Donghua',
        url: ['luciferdonghua.in/'],
        _cs: 12,
        addStartButton: (id) => $('<button>', { id, class: "btn btn-primary", html: "Generate Download Links", click: extractEpisodes }).insertAfter('.mirror'),
        extractEpisodes: async function* (status) {
            const e = await applyEpisodeRangeFilter([..._$$('.episodelist li > a')]); if (!e?.length) return;
            const s = await showSourceSelector(['Download-MP4','Rumble','Vid Hide'],'luciferdonghua');
            for (let i = 0; i < e.length; i += this._cs) {
                yield* yieldEpisodesFromPromises(e.slice(i, i + this._cs).map(async el => {
                    const n = el.querySelector('span').textContent.match(/Eps (\d+)/)[1]; status.text = `Extracting Ep ${n-Math.min(this._cs, n) + 1} - ${n}...`;
                    const p = await fetchPage(el.href);
                    const o = [..._$('.mirror', p)?.options || []].map(x => ({ name: x.textContent.trim(), url: x.value })).slice(1), L = {};
                    const dl = _$('a[aria-label="Download"]', p)?.href;
                    for (const key of s.sources) {
                        if (key == 'Download-MP4' && dl) try { L[key] = await Extractors.use(dl); } catch (e) { showToast(e); } // luluvdo.com
                        else {
                            const k = o.find(x => new RegExp(key, 'i').test(x.name));
                            if (k) try { const q = await fetchPage(k.url); L[key] = await Extractors.use(_$('.player-embed > iframe', q)?.src); } catch (err) { showToast(err); } // misterdonghua.in, rumble.com, vidhide.com
                        }
                        if (s.mode === 'single' && Object.keys(L).length) break;
                    }
                    return new Episode(n, _$('.det a').textContent, L, _$('img', el)?.src);
                }));
            }
        }
    },
    {
        name: "Anikoto (and clones)",
        url: ["anikototv.", 'anikoto.', 'animekai.org.in/', 'anixtv.me/', 'animixplay.cz/', 'animewave.to/', 'anix.best/', 'animesogo.to/', 'animesugez.tv/', 'aniwave.id/', 'animekai.se/', 'gogoanime.com.by/', 'animekaitv.to/', 'anikai.se/', 'anikoto.bz/', 'animesugetv.bz/', 'anikaitv.to/', 'hianimez.org/', 'anisuge.tv/', 'anisuge.se/', 'zorotv.cz/', 'hianimes.re/', 'animesalt.cz/', 'animesalt.to/', 'aniwave.cz/', 'animesuge.re/', 'hianimetv.si/', 'aniwatch.ch/', 'anichi.to/'],
        _chunkSize: 12,
        addStartButton: (id) => setInterval(() => {
            const target = _$('.d-flex.flex-row, .d-flex.head-left, .filter.name, .ep-view-tools, #w-episodes:not(.ep-mode-name)>.head, .ss-choice, .episode-list-search-box');
            if (!target || document.getElementById(id)) return;
            target.after(Object.assign(document.createElement('button'), { id, className: "btn btn-sm", textContent: "Extract Episode Links", style: "margin-inline: 10px;", onclick: extractEpisodes }))
        }, 500),
        extractEpisodes: async function* (status) {
            status.text = 'Fetching episode list...';
            const epElms = await applyEpisodeRangeFilter([..._$$('a[data-num]')]); if (!epElms?.length) throw new Error('No episodes found. Please wait for the episode list to load or refresh the page.');
            const srcCfg = await (async () => {
                const servers = await fetch(`/ajax/server/list?servers=${epElms[0].dataset.ids}`, { "headers": { "x-requested-with": "XMLHttpRequest" } }).then(r => r.json().then(d => d.result)).then(t => (new DOMParser()).parseFromString(t, 'text/html')).then(doc => [..._$$('li, .server, .btn[data-type]', doc)].map(e => `${e.closest('.type, .ps_-block').querySelector('label, .name, span[title]').textContent.trim()} - ${e.textContent.trim()}`));
                return await showSourceSelector(servers, location.host, { mode: 'single' });
            })();
            for (let i = 0; i < epElms.length; i += this._chunkSize)
                yield* yieldEpisodesFromPromises(epElms.slice(i, i + this._chunkSize).map(async ep => {
                    const epNum = ep.dataset.num; status.text = `Extracting Episodes ${(epNum - Math.min(this._chunkSize, epNum) + 1)} - ${epNum}...`;
                    const servers = await fetch(`/ajax/server/list?servers=${ep.dataset.ids}`, { "headers": { "x-requested-with": "XMLHttpRequest" } }).then(r => r.json().then(d => d.result)).then(t => (new DOMParser()).parseFromString(t, 'text/html')).then(doc => [..._$$('li, .server, .btn', doc)].map(e => ({ lid: e.dataset.linkId, name: `${e.closest('.type, .ps_-block').querySelector('label, .name, span[title]').textContent.trim()} - ${e.textContent.trim()}` }))).catch(e => showToast(`Failed to fetch servers for Ep ${epNum}`));
                    const links = {}, fetchSource = async s => { try { links[s.name] = await fetch(`/ajax/server?get=${s.lid}`, { "headers": { "x-requested-with": "XMLHttpRequest" } }).then(r => r.json().then(d => d.result)).then(async d => await Extractors.use(d.url)) } catch (e) { showToast(`Failed to fetch Ep ${epNum} from ${s.name}: ${e.message || e}`); } }; // megaplay.buzz, vidtube.site
                    if (srcCfg?.mode === 'single') { for (const key of srcCfg.sources) { const s = servers.find(srv => srv.name === key); if (s) { await fetchSource(s); if (Object.keys(links).length) break; } } }
                    else for (const key of srcCfg.sources) { const s = servers.find(srv => srv.name === key); if (s) await fetchSource(s); }
                    return new Episode(epNum, _$('h1, .film-name')?.textContent, links, _$('.binfo img, .poster img, .film-poster img')?.getAttribute('src'), ep.querySelector('span')?.textContent);
                }))
        },
        styles: '.ep-range.ss-list.ss-list-min {top: 100px;}'   // prevent ep list from hiding the start button on sites like aniwatch
    },
    {
        name: "AV1 EnCodes",
        url: ["av1please.com/"],
        addStartButton: id => (document.querySelector('.season-dropdown') || document.querySelector('h1')).after(Object.assign(document.createElement('button'), { id, className: 'btn episode-card', style: 'color: grey; display: flex; width: stretch; align-items: center; justify-content: space-between; background-color: #101010; justify-self: right; margin-bottom: 10px;', innerHTML: 'AniLINK: Extract Download Links <svg style="margin-left: 8px;" fill="#ff6b6b" height="24px" width="24px" style="margin-left: 8px;"><path d="M5 6H19V7.5H5V6ZM5 9.5H19V11H5V9.5ZM13 12.5H5V14H13V12.5ZM15.3533 18.9393L17.1287 17.164H5V15.664H17.1287L15.3533 13.8886L16.414 12.8279L20 16.414L16.414 20L15.3533 18.9393Z"></path></svg>' })),
        extractEpisodes: async function* (status) {
            let epLinks = {}, srcCfg = {}, sources = [..._$$('.episode-container:not([style*="display:none"]) .quality-grid a')].reverse().map(a => a.textContent.trim());
            if (sources.length) { srcCfg = await showSourceSelector(sources, 'av1encodes', { mode: 'single', forceSingle: true }) } else { srcCfg = { sources: [decodeURI(location.href.split('/').pop())] } };
            for (const quality of srcCfg.sources) {
                const epElms = [];
                if (sources.length) await fetchPage(_$(`.episode-container:not([style*="display:none"]) a[href*="${encodeURI(quality)}"]`).href).then(page => epElms.push(..._$$('.episode-item a', page))).catch(() => showToast(`Failed to fetch episode list for ${quality}`));
                else if (_$('.episode-item a')) epElms.push(..._$$('.episode-item a'));
                let arr = epElms.map(a => ({ link: a.href, num: parseInt(a.querySelector('.episode-label')?.textContent.trim().match(/\d+/)[0]), quality }));
                for (const { link, num, quality } of arr) { if (!epLinks[num]) epLinks[num] = {}; epLinks[num][quality] = link; }
            }
            for (epNum of await applyEpisodeRangeFilter(Object.keys(epLinks)))
                yield* yieldEpisodesFromPromises([(async () => {
                    status.text = `Extracting Episode ${epNum}...`;
                    const links = {};
                    for (const q of srcCfg.sources) {
                        const link = epLinks[epNum][q]; if (!link) continue;
                        try {
                            const token = await this._safeFetch(link).then(r => r.text()).then(t => t.match(/'X-DDL-Token'\s*:\s*"([^"]+)"/)[1]);
                            const data = await this._safeFetch(`/get_ddl/${link.split('/').pop().split('?')[0]}`, { headers: { 'X-DDL-Token': token } }).then(r => r.json());
                            if (!data || !data.success) throw new Error(`Failed to fetch DDL info. ${data?.error || ''}`);
                            links[q] = { stream: (await GM_fetch((location.origin + data.download_link), { method: 'HEAD' })).url, type: 'mkv' };
                            break; // Stop after first successful link
                        // Continue to next quality if failed
                        } catch (e) { showToast(`Ep ${epNum} [${q}]: ${e.message || e}`); }
                    }
                    return new Episode(epNum, _$('h1').textContent, links, _$('meta[property="og:image"]').content);
                })()]);
        },
        // helper function to handle rate limits by retrying after a delay based on status code
        _safeFetch: async function (url, opts = {}) {
            for (; ;) {
                const res = await fetch(url, opts);
                if (res.ok) return res;
                if (res.status === 429 || res.status === 500) {
                    const wait = res.status === 429 ? 60000 : 10000;
                    showToast(`Rate limited ${res.status}, retrying in ${wait / 1000}s... (${new Date(Date.now() + wait).toLocaleTimeString()})`, wait);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(`${res.status} ${res.statusText}`);
            }
        }
    },
    {
        name: "AniDB",
        url: ["anidb.app/"],
        _chunkSize: 12,
        addStartButton: id => document.querySelector('h2')?.insertAdjacentHTML('afterend', `<button id="${id}" class="px-3 py-1 rounded-md transition-colors text-xs text-muted hover:text-faint">Extract Episode Links</button>`),
        extractEpisodes: async function* (status) {
            const eps = await applyEpisodeRangeFilter(await fetch(`https://anidb.app/api/frontend/anime/${location.pathname.split('-').pop()}/episodes`).then(r => r.json()).then(d => d.episodes));
            const srcCfg = await showSourceSelector([..._$$('button[x-text="lang.name"]')].map(b => b.textContent), 'anidb', { mode: 'single' });
            const o = eps[0].number == 1 ? 0 : +(eps.find(e => +e.number > 1)?.number || eps[0].number) - 1; eps.forEach(ep => ep.number = (+ep.number - o).toString()); // Resolve the ep numbering offset (sometimes, a 2nd cour can have ep.num=13 while its s2e1)
            for (let i = 0; i < eps.length; i += this._chunkSize)
                yield* yieldEpisodesFromPromises(eps.slice(i, i + this._chunkSize).map(async ep => {
                    status.text = `Extracting Episodes ${Math.max(1, ep.number - Math.min(this._chunkSize, ep.number) + 1)} - ${ep.number}...`;
                    const sources = await fetchJSON(`https://anidb.app/api/frontend/episode/${ep.id}/languages`, {}, d => d.languages);
                    const fetchSource = async lang => await fetch(sources.find(s => s.name === lang)?.embed_url).then(r => r.text()).then(t => t.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*'([^']+)'/i) || t.match(/file\s*:\s*'(https?:\/\/[^']+\.m3u8[^']*)'/i) || t.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/)).then(l => ({ stream: l[1], type: 'm3u8' }));
                    const links = srcCfg?.mode === 'multi' ? Object.fromEntries((await Promise.all(srcCfg.sources.map(async lang => [lang, await fetchSource(lang)]))).filter(([, v]) => v)) : await (async () => { for (const lang of srcCfg.sources) { const v = await fetchSource(lang); if (v) return { [lang]: v }; } return {}; })();
                    return new Episode(ep.number, _$(`${PREFER_JAP_TITLE ? 'p.mb-3, ' : ''}h1`).textContent, links, _$('img[src*="poster"]')?.src);
                }));
        }
    },
    {
        name: "Re:Anime",
        url: ["reanime.cz/", "reanime.to/"],
        extractEpisodes: async function* (status) {
            const id = location.pathname.split('/').pop(); status.text = `Fetching Episodes for ${id}...`;
            const anilist_id = [..._$$('script')].map(sc => sc.text.match(new RegExp(`anilist_id:(\\d+),anime_id:"${id}"`))).filter(Boolean)[0][1]
            const eps = await fetchJSON(`${location.origin}/api/v1/anime/${id}/episodes?limit=2000`).then(d => d?.data).then(applyEpisodeRangeFilter);
            const srcCfg = await this._fetchSources(anilist_id, eps[0].episode_number).then(s => showSourceSelector(s.map(e => e.name), 'reanime', { mode: 'single' }));
            for (const ep of eps) {
                status.text = `Extracting Episode ${ep.episode_number}...`
                const sources = await this._fetchSources(anilist_id, ep.episode_number);
                const links = await srcCfg.sources.reduce(async (a, src) => (a = await a, (s = sources.find(x => x.name === src)) && !(srcCfg.mode === 'single' && Object.keys(a).length) && await await Promise.resolve().then(() => Extractors.use(s.link)).then(r => a[src] = r).catch(e => showToast(`Failed Ep ${ep.episode_number} from ${src}: ${e.message || e}`)), a), Promise.resolve({}));   // flixcloud.cc
                yield new Episode(ep.episode_number, _$('h2'+(PREFER_JAP_TITLE?'+h3':"")).textContent, links, _$('.watch-info-enter img')?.src, ep.title);
            }
        },
        _fetchSources: async (anilist_id, ep_num) => await fetchJSON(`${location.origin}/api/flix/${anilist_id}/${ep_num}`).then(d => d?.servers.map(s => ({ name: `${s.dataType.toUpperCase()} - ${s.serverName}`, link: s.dataLink }))).catch(e => showToast('Failed to fetch sources: ' + e.message || e)),
    },
    {
        name: "AniNeko",
        url: ['anineko.to/'],
        addStartButton: (id) => $('.nv-info-main-column .nv-pill.green, .nv-side-stack .nv-pill').html('Extract Episode Links').click(extractEpisodes).attr('id', id).css({ cursor: 'pointer' }),
        extractEpisodes: async function* (status) {
            const epElms = await applyEpisodeRangeFilter($('.nv-episode-list > a, .nv-info-episode-item > a'));
            const srcCfg = await showSourceSelector(await this._fetchSources(epElms[0].href).then(s => s.map(e => e.name)), 'reanime', { mode: 'single' });
            for (const epElm of epElms) {
                const epNum = $(epElm).find('strong').text().replace(/EP|Episode /,''); status.text = `Extracting Episode ${epNum}...`;
                const sources = await this._fetchSources(epElm.href);
                const links = await srcCfg.sources.reduce(async (a, src) => (a = await a, (s = sources.find(x => x.name === src)) && !(srcCfg.mode === 'single' && Object.keys(a).length) && await Promise.resolve().then(() => Extractors.use(s.url).then(r => this._handleCaptions(r, s.url))).then(d => a[src] = d).catch(e => showToast(`Failed Ep ${epNum} from ${src}: ${e.message || e}`)), a), Promise.resolve({}));   // bibiemb.xyz, vivibebe.site
                yield new Episode(epNum, $('h1').text(), links, (_$('.nv-info-poster>img')?.src || $('.play-video').css('background-image')?.split('"')?.[1]), $(epElm).find('span').text());
            }
        },
        _fetchSources: async (url) => await fetchPage(url).then(p => $(p).find('.server-items > button').map(function() { return { name: $(this).find('span').text().trim() + ' - ' + this.childNodes[0].textContent.trim(), url: $(this).data('video') }; }).get()),
        _handleCaptions: async (data, url) => (data.tracks?.length) ? data : { ...data, tracks: url.includes('?caption') ? [{ file: url.match(/caption_\d=(.*?)&/)?.[1], label: url.match(/sub_\d=(.*)/)?.[1], kind: 'caption' }] : [] },
    }
];

const USER_AGENT_HEADER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const Extractors = {
    use: function (url, ...args) {
        const host = (new URL(url)).host;
        for (const key in this) {
            if (typeof this[key] !== 'function') continue;
            // Match exact host or test regex pattern
            if (key === host) return Promise.resolve(this[key](url, ...args));
            const regexMatch = key.match(/^\/(.+)\/([gimuy]*)$/);
            if (regexMatch) if (new RegExp(regexMatch[1], regexMatch[2]).test(host)) return Promise.resolve(this[key](url, ...args));
        }
        throw new Error(`No extractor found for ${url}`);
    },
    'kwik.cx': async function (kwikUrl, referer = location.href) {
        const response = await fetch(kwikUrl, { headers: { referer } });
        const data = await response.text();
        return {stream: eval(/(eval)(\(f.*?)(\n<\/script>)/s.exec(data)[2].replace("eval", "")).match(/https.*?m3u8/)[0], type: 'm3u8', referer:'https://kwik.cx/'};
    },
    '/megaplay.buzz|vidwish.live/': async function (embed, referer) {
        const host = (new URL(embed)).host;
        referer = referer || 'https://' + host + '/';
        const id = await GM_fetch(embed, { headers: { Referer: referer } }).then(r => r.text()).then(t => t.match(/<title>File ([0-9]+)/)[1]);
        const src = await GM_fetch(`https://${host}/stream/getSources?id=${id}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(e => e.json());
        return { file: src.sources?.file, type: 'm3u8', tracks: src.tracks || [], referer };
    },
    'megacloud.blog': async function (embed, referer) {
        // adapted from https://github.com/yuzono/aniyomi-extensions/blob/master/lib/megacloud-extractor/src/main/java/eu/kanade/tachiyomi/lib/megacloudextractor/MegaCloudExtractor.kt
        const res = await GM_fetch(embed, { headers: { referer, 'User-Agent': USER_AGENT_HEADER } });
        const retryAfter = res.headers.get('Retry-After');  // Rate limit Policy: 10 requests per minute
        if (retryAfter) {
            const hhmmss = new Date(new Date().getTime() + parseInt(retryAfter) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            showToast(`Rate limited by megacloud.blog, retrying in ${retryAfter} secs (at ${hhmmss})...`, parseInt(retryAfter) * 1000);
            return await new Promise(res => setTimeout(res, 500 + parseInt(retryAfter) * 1000)).then(() => Extractors['megacloud.blog'](embed, referer)); // recursive retry
        }
        const html = await res.text();
        const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/), match2 = html.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
        const nonce = match1?.[0] || (match2 ? match2[1] + match2[2] + match2[3] : null);
        if (!nonce) throw new Error('Failed to extract nonce from response');
        const sId = embed.split('/e-1/')[1]?.split('?')[0];
        const origin = (new URL(embed)).origin;
        const url = `${origin}/embed-2/v3/e-1/getSources?id=${sId}&_k=${nonce}`;
        const data = await GM_fetch(url, { headers: { 'Accept': '*/*', 'X-Requested-With': 'XMLHttpRequest', 'Referer': origin + '/' } }).then(r => r.json());
        if (!data.encrypted || data.sources[0].file.includes('.m3u8')) return { file: data.sources[0].file, type: data.sources[0].type, tracks: data.tracks || [], referer: origin + '/' };
        const secret = await fetch('https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json').then(r => r.json()).then(j => j['mega']);
        const decryptUrl = `https://megacloud-api-nine.vercel.app/?encrypted_data=${encodeURIComponent(data.sources[0].file)}&nonce=${encodeURIComponent(nonce)}&secret=${encodeURIComponent(secret)}`;
        const decrypted = await GM_fetch(decryptUrl).then(r => r.text());
        const m3u8 = decrypted.match(/"file":"(.*?)"/)?.[1];
        if (!m3u8) throw new Error('Video URL not found in decrypted response');
        return { file: m3u8, type: 'hls', tracks: data.tracks || [] };
    },
    'gofile.io': async function (url) {
        const id = url.split('/').pop();
        const stored = JSON.parse(localStorage.gofile_token || '{}');
        let token = stored.token;
        if (!token || Date.now() - stored.timestamp > 604800000) {
            if (token !== 'fetching') {
                localStorage.gofile_token = JSON.stringify({ token: 'fetching', timestamp: Date.now() });
                token = (await GM_fetch('https://api.gofile.io/accounts', { method: 'POST', body: '{}' }).then(r => r.json())).data.token;
                localStorage.gofile_token = JSON.stringify({ token, timestamp: Date.now() });
            } else {
                while ((token = JSON.parse(localStorage.gofile_token || '{}').token) === 'fetching') await new Promise(r => setTimeout(r, 500));
            }
        }
        const data = await GM_fetch(`https://api.gofile.io/contents/${id}?wt=4fd6sg89d7s6`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        if (data.status !== 'ok') throw new Error(data.status);
        const file = Object.values(data.data.children || {}).find(f => f.name?.endsWith('.m3u8') || f.mimetype?.startsWith('video/'));
        if (!file) throw new Error('No video file found');
        return { file: file.link, type: file.name?.endsWith('.m3u8') ? 'm3u8' : 'mp4', tracks: [] };
    },
    'vkspeed.com': async function (url) {
        const html = await GM_fetch(url).then(r => r.text());
        const [, e, r, c, d] = html.match(/eval\(function\(p,a,c,k,e,d\)\{while\(c--\)if\(k\[c\]\)p=p\.replace\(new RegExp\('\\\\b'\+c\.toString\(a\)\+'\\\\b','g'\),k\[c\]\);return p\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)\)\)/) || [];
        if (!e) throw new Error('No packed script found');
        let decoded = e; const dict = d.split('|');
        for (let i = +c - 1; i >= 0; i--) if (dict[i]) decoded = decoded.replace(new RegExp('\\b' + i.toString(+r) + '\\b', 'g'), dict[i]);
        const sources = eval(decoded.match(/sources:\[.*?\]/)[0]);
        const source = sources.reduce((best, curr) => (s => parseInt(s.label) || 0)(curr) > (s => parseInt(s.label) || 0)(best) ? curr : best, sources[0]);
        return { file: source.file, type: source.file.includes('.m3u8') ? 'm3u8' : 'mp4', tracks: [] };
    },
    '/^(4spromax|megaup|rapidairmax|rapidshare|rapidshareee)(\\d+)?\\.?(live|online|cc|site|nl|work)$/': async function (url, referer = 'https://megaup.cc/') {
        // workaround: use GM_xmlhttpRequest to avoid passing cookies (coudnt do that with GM_fetch)
        const u = new URL(url), subListUrl = u.searchParams.get('sub.list');
        const encToken = await new Promise((r, j) => GM_xmlhttpRequest({ method: 'GET', url: url.replace('/e/', '/media/'), headers: { 'User-Agent': USER_AGENT_HEADER }, anonymous: true, onload: res => { try { r(JSON.parse(res.responseText).result); } catch (e) { j(e); } }, onerror: j }));
        const src = (await GM_fetch(`https://enc-dec.app/api/dec-${url.includes('://rapid') ? 'rapid' : 'mega'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: encToken, agent: USER_AGENT_HEADER }) }).then(r => r.json())).result;
        const tracks = subListUrl ? await fetch(subListUrl, { headers: { 'Accept': '*/*', 'Referer': `${u.origin}/` } }).then(r => r.json()).then(list => list.filter(t => t.kind === 'captions' && t.file && t.label).map(t => ({ file: t.file, label: t.label, kind: t.kind }))).catch(() => []) : (src.tracks || []).filter(t => t.kind === 'captions' && t.file && t.label).map(t => ({ file: t.file, label: t.label, kind: t.kind, default: !!t.default }));
        return { stream: src.sources[0].file, type: 'm3u8', tracks, referer };
    },
    'yurn.online': async function (url) {
        const [_, id, path] = (await GM_fetch(url).then(r => r.text())).match(/file_id', '(\d+)',.*\|([\d]{10}\|[a-z]{13}\|[\w]{22})\|/s);
        return { file: `https://yurn.online/stream/${path.split('|').reverse().join('/')}/${id}/master.m3u8`, type: 'm3u8', tracks: [] };
    },
    'misterdonghua.in': async function (url) {
        const decrypt = async (hexData, key='kiemtienmua911ca', iv='1234567890oiuytr') => {
            const enc = new TextEncoder();
            return (new TextDecoder()).decode((await crypto.subtle.decrypt({ name: 'AES-CBC', iv: enc.encode(iv) }, (await crypto.subtle.importKey('raw', enc.encode(key), 'AES-CBC', false, ['decrypt'])), new Uint8Array(hexData.match(/.{1,2}/g).map(b => parseInt(b, 16))))));
        };
        const data = await GM_fetch(`https://misterdonghua.in/api/v1/download?id=${url.match(/#(\w+)&/)[1]}`).then(r => r.text()).then(t=>decrypt(t)).then(JSON.parse);
        return { file: data.mp4, type: 'mp4', tracks: Object.entries(data.subtitle).map(e=> ({file: e[1], label: e[0], kind: 'captions' })) || [] };
    },
    'rumble.com': async function (url) {
        return { file: `https://rumble.com/hls-vod/${url.match(/.*\/embed\/(.*)\//)[1]}/playlist.m3u8?u=0&b=0`, type: 'm3u8', tracks: [], referer: 'https://rumble.com/' };
    },
    'api.videasy.net': async function (url, referer = location.origin+'/') {
        const id = url.match(/\??&?tmdbId=(\d+)/)?.[1]; if (!id) throw new Error('TMDB ID not found in URL');
        const encData = await fetch(url).then(r => r.text()).catch(e => { throw new Error(`Failed to fetch video data: ${e.message || e}`); });
        const data = await GM_fetch(`https://enc-dec.app/api/dec-videasy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: encData, id }) }).then(r => r.json()).then(d => d.result).catch(e => { throw new Error(`Failed to decrypt video data: ${e.message || e}`); });
        return [...data.sources.map(s => ({ file: s.url, quality: s.quality, type: 'm3u8', tracks: data.subtitles?.map(s => ({ file: s.url, label: s.language, kind: 'captions' })) || [], referer }))];
    },
    'vidtube.site': async function (url) {
        const page = await GM_fetch(url).then(r => r.text());
        const id = page.match(/<title>File (\d+) - VidTube<\/title>/)?.[1] || url.split('/').pop();
        const type = page.match(/<title>File \d+ - VidTube<\/title>/)?.[0].includes('hsub') ? 'hsub' : 'hls';
        const data = await GM_fetch(`https://vidtube.site/stream/getSourcesNew?id=${id}&type=${type}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.json());
        return { file: data.sources.file, type: data.sources.file.includes('.m3u8') ? 'm3u8' : 'mp4', tracks: data.tracks || [], referer: 'https://vidtube.site/' };
    },
    'animekai.ro': async function (url) {
        const html = await fetch(url).then(r => r.text());
        const videoUrl = html.match(/fileUrl = "(.*?)";/)?.[1];
        if (!videoUrl) throw new Error('Video URL not found');
        return { file: videoUrl, type: 'mp4', tracks: [], referer: location.origin+'/' };
    },
    'megavid.buzz': async function (url) {
        const data = await GM_fetchJSON(url+'/source', { headers: { referer: url } });
        if (!data || !data.source) throw new Error('No sources found');
        return { file: data.source, type: 'm3u8', tracks: data.tracks || [], referer: 'https://megavid.buzz/' };
    },
    'megaplay.su': async function (url) {
        const data = await GM_fetch(url).then(r => r.text()).then(t => Function("return " + t.match(/setup\(({.*?})\)/s)[1])()).catch(() => { throw new Error('Failed to extract video URL from page'); });
        return { file: data.file, type: 'm3u8', tracks: data.tracks || [], referer: 'https://megaplay.su/' };
    },
    'vidnest.fun': async function (url, r = 'https://vidnest.fun/') {
        // adapted from https://github.com/Nyumat/NyumatFlix/blob/8766c2b403b5d97be0a8d4541c2a0d96ca44da2a/lib/scrape/vidnest-shared.ts
        const a = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
        let t, s, e, m;
        const u = new URL(url), p = u.pathname, x = p.match(/^\/([^\/]+)\/(movie|tv)\/(\d+)(?:\/(\d+)\/(\d+))?/);
        if (x) { m = x[2]; t = x[3]; s = x[4] || '1'; e = x[5] || '1'; } else {
            const i = url.match(/tmdb[=\/](\d+)/)?.[1] || url.match(/(\d{6,})/)?.[1];
            if (!i) throw new Error('Invalid VidNest URL');
            t = i; m = p.includes('tv') ? 'tv' : 'movie'; s = '1'; e = '1';
        }
        const d = data => {
            const l = {}; for (let i = 0; i < a.length; i++) l[a[i]] = i;
            let o = [];
            for (let i = 0; i < data.length; i += 4) {
                let c = data.slice(i, i + 4); while (c.length < 4) c += '=';
                const v = [0, 0, 0, 0];
                for (let j = 0; j < 4; j++) v[j] = l[c[j]] ?? 64;
                o.push((v[0] << 2) | (v[1] >> 4));
                if (v[2] !== 64) o.push(((v[1] & 15) << 4) | (v[2] >> 2));
                if (v[3] !== 64) o.push(((v[2] & 3) << 6) | v[3]);
            }
            return new TextDecoder().decode(new Uint8Array(o));
        };
        for (const b of ['moviesapi', 'hollymoviehd', 'allmovies', 'vidlink', 'klikxxi', 'movies4f']) {
            try {
                const api = m === 'tv' ? `https://new.vidnest.fun/${b}/tv/${t}/${s}/${e}` : `https://new.vidnest.fun/${b}/movie/${t}`;
                const res = await GM_fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0', Accept: 'application/json, */*', Origin: 'https://vidnest.fun', Referer: r } });
                if (!res.ok) continue;
                const w = await res.json(), data = w.encrypted ? d(w.data) : w.data;
                const j = JSON.parse(data);
                if (j.sources?.[0]?.url) return { file: j.sources[0].url, type: j.sources[0].type === 'hls' ? 'm3u8' : 'mp4', tracks: [], referer: 'https://vidnest.fun/' };
                if (j.streams?.[0]?.url) return { file: j.streams[0].url, type: 'mp4', tracks: [], referer: 'https://vidnest.fun/' };
                if (j.data?.downloads?.[0]?.url) {
                    let best = j.data.downloads[0];
                    for (const x of j.data.downloads.slice(1)) if (x.resolution > best.resolution) best = x;
                    return { file: best.url, type: 'mp4', tracks: [], referer: 'https://vidnest.fun/' };
                }
            } catch (err) { continue; }
        }
        throw new Error('All VidNest backends failed');
    },
    'tryembed.us.cc': async function (url) {
        throw new Error('tryembed.us.cc extractor is not implemented yet. Please use a different source.'); // TODO: Implement the extractor *one day*
        const nonce = await GM_fetch(url).then(r => r.text()).then(t => t.match(/EMBED_NONCE="(.*?)";/)[1]).catch(() => { throw new Error('Failed to extract nonce from page'); });
        const [id, ep, aud] = location.href.split('/').slice(-3);
        const data = await GM_fetchJSON(`https://tryembed.us.cc/api/stream_data?id=${id}&episode=${ep}&audio=${aud}&nonce=${nonce}`).catch(() => { throw new Error('Failed to fetch stream data'); });
        // retturn 
    },
    'flixcloud.cc': async function (url, referer = 'https://flixcloud.cc/') {
        const page = await GM_fetch(url, { headers: { referer } }).then(r => r.text());
        const data = eval("(" + page.match(/type:\s*"data",\s*data:\s*(\{.*?\})\s*,\s*uses:/s)[1] + ")");
        const decToken = await GM_fetch('https://enc-dec.app/api/dec-flixcloud?type=token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) }).then(r => r.json()).then(d => d.result);
        const streamResponse = await GM_fetch(`https://flixcloud.cc/api/m3u8/${decToken.token}`, { headers: { referer } }).then(r => r.json());
        const decStream = await GM_fetch('https://enc-dec.app/api/dec-flixcloud?type=stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { context: decToken.context, stream_response: streamResponse } }) }).then(r => r.json()).then(d => d.result);
        return { file: decStream.stream, type: 'm3u8', tracks: data.subtitles?.map(s => ({ file: s.url, label: s.language, kind: 'captions' })) || [], referer };
    },
    'bibiemb.xyz': async (url) => ({ stream: (await GM_fetch(url).then(r => r.text())).match(/src = "(.*?)";/)[1], referer: 'https://bibiemb.xyz/' }),
    'vivibebe.site': async (url, referer = location.origin+'/') => ({ stream: `https://vivibebe.site/public/stream/${(new URL(url)).pathname.split('/').pop()}/master.m3u8`, referer: 'https://vivibebe.site/' }),
    '/otakuhg.site|otakuvid.online/': async (url) => {
        const m = await GM_fetch(url).then(r => r.text()).then(html => html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\(\s*'([\s\S]+?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]+?)'\.split\('\|'\)/));
        if (!m) throw new Error('Packed player script not found');
        let [, p, a, c, k] = m; a = +a; c = +c; k = k.split('|');
        while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
        const sources = Object.fromEntries([...p.matchAll(/"(hls\d)":"([^"]+)"/g)].map(x => [x[1], x[2]]));
        const stream = sources.hls2 || (sources.hls4 ? new URL(sources.hls4, url).href : sources.hls3);;   // hls4 seems to be broken or something while hls2 is reliable.
        if (!stream) throw new Error('No stream URL found in packed script');
        return { stream, type: 'm3u8', referer: new URL(url).origin+'/' };
    },
    'playmogo.com': async (url) => {
        const subs = url.includes('?c1_file=') ? [{ file: url.match(/c1_file=(.*?)&/)?.[1], label: url.match(/c1_label=(.*)^/)?.[1], kind: 'captions' }] : [];
        const html = await GM_fetch(url.split('?')[0]).then(r => r.text());
        const link = await GM_fetch('https://playmogo.com/'+html.match(/(pass_md5.*?)',/)[1]).then(r=>r.text());
        return { stream: link, type: 'mp4', tracks: subs, referer: 'https://playmogo.com/' };
    },
}
/**
 * Fetches the HTML content of a given URL and parses it into a DOM object.
 *
 * @param {string} url - The URL of the page to fetch.
 * @returns {Promise<Document>} A promise that resolves to a DOM Document object.
 * @throws {Error} If the fetch operation fails.
 */
async function fetchPage(url, options = {}, fetchFn = fetch) {
    const response = await fetchFn(url, options);
    if (response.ok) {
        const page = (new DOMParser()).parseFromString(await response.text(), 'text/html');
        return page;
    } else {
        showToast(`Failed to fetch HTML for ${url} : ${response.status}`);
        throw new Error(`Failed to fetch HTML for ${url} : ${response.status}`);
    }
}
GM_fetchPage = (url, options = {}) => fetchPage(url, options, GM_fetch);

/**
 * Fetches JSON data from a given URL with optional callback and fetch function.
 *
 * @param {string} url - The URL to fetch JSON data from.
 * @param {Object} options - The options for the fetch request.
 * @param {Function} callbackFn - An optional function to process the fetched data.
 * @param {Function} fetchFn - The fetch function to use (default is global fetch).
 * @returns {Promise<Object>} A promise that resolves to the fetched JSON data.
 */
async function fetchJSON(url, options = {}, callbackFn = null, fetchFn = fetch) {
    const response = await fetchFn(url, options);
    if (response.ok) {
        const data = await response.json();
        if (callbackFn) return callbackFn(data);
        return data;
    } else {
        showToast(`Failed to fetch JSON for ${url} : ${response.status}`);
        throw new Error(`Failed to fetch JSON for ${url} : ${response.status}`);
    }
}
GM_fetchJSON = (url, options = {}, callbackFn = null) => fetchJSON(url, options, callbackFn, GM_fetch);

/**
 * Fetches a URL with retry logic for handling rate limits or temporary errors.
 *
 * @returns {Promise<Response>} A promise that resolves to the response object.
 */
async function fetchWithRetry(url, options = {}, retries = 3, sleep = 1000) {
    const response = await fetch(url, options);
    if (!response.ok) {
        if (response.status === 503 && retries > 0) {   // 503 is a common status when rate limited
            console.log(`Retrying ${url}, ${retries} retries remaining`);
            await new Promise(resolve => setTimeout(resolve, sleep)); // Wait 1 second before retrying
            return fetchWithRetry(url, options, retries - 1, sleep); // Pass options and sleep to the next call
        }
        throw new Error(`${response.status} - ${response.statusText}`);
    }
    return response;
}

/**
 * Asynchronously processes an array of episode promises and yields each resolved episode.
 *
 * @param {Array<Promise>} episodePromises - An array of promises, each resolving to an episode.
 * @returns {AsyncGenerator} An async generator yielding each resolved episode.
 */
async function* yieldEpisodesFromPromises(episodePromises) {
    for (const episodePromise of episodePromises) {
        try {
            const episode = await episodePromise;
            if (episode) yield episode;
        } catch (e) {
            showToast(e);
            yield null; // Yield null for failed episodes to maintain order, or choose to skip by not yielding anything
        }
    }
}

/**
 * A utility function that returns a promise that resolves after a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise} A promise that resolves after the specified time.
 * @example await sleep(1000); // sleeps for 1 second
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * encodes a string to base64url format thats safe for URLs
 */
const safeBtoa = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Analyzes the given media url to return duration, size, and resolution of the media.
 * @param {string} mediaUrl - The URL of the media to analyze.
 * @return {Promise<{duration: string, size: string, resolution: string}>} A promise that resolves to an object
 * containing duration (in hh:mm:ss), size of the media (in MB), and resolution (e.g., 1920x1080).
 * @TODO: Not Yet Implemented
 */
async function analyzeMedia(mediaUrl) {
    if (_analyzedMediaCache.has(mediaUrl)) return _analyzedMediaCache.get(mediaUrl);

    let metadata = { duration: 'N/A', resolution: 'N/A', size: 'N/A' };
    try {
        if (mediaUrl.endsWith('.mp4')) {
            const r = await GM_fetch(mediaUrl, { method: 'HEAD' });
            if (r.ok) {
                const sz = parseFloat(r.headers.get('Content-Length')) || 0;
                metadata.size = `${(sz / 1048576).toFixed(2)} MB`;
            }
        } else if (mediaUrl.endsWith('.m3u8')) {
            const r = await GM_fetch(mediaUrl);
            if (r.ok) {
                const t = await r.text();
                const res = t.match(/RESOLUTION=(\d+x\d+)/i);
                if (res) metadata.resolution = res[1];
                let d = 0;
                for (const m of t.matchAll(/#EXTINF:([\d.]+)/g)) d += parseFloat(m[1]);
                if (d > 0) {
                    const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = Math.floor(d % 60);
                    metadata.duration = [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
                }
            }
        }
        if (metadata.duration === 'N/A' || metadata.resolution === 'N/A') {
            await new Promise(res => {
                const v = document.createElement('video');
                v.src = mediaUrl; v.preload = 'metadata'; v.muted = true;
                v.onloadedmetadata = () => {
                    if (v.duration && metadata.duration === 'N/A') {
                        const h = Math.floor(v.duration / 3600), m = Math.floor((v.duration % 3600) / 60), s = Math.floor(v.duration % 60);
                        metadata.duration = [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
                    }
                    if (v.videoWidth && v.videoHeight && metadata.resolution === 'N/A')
                        metadata.resolution = `${v.videoWidth}x${v.videoHeight}`;
                    res();
                };
                v.onerror = () => res();
                setTimeout(res, 2000);
            });
        }
    } catch (e) { }
    _analyzedMediaCache.set(mediaUrl, metadata);
    return metadata;
}
const _analyzedMediaCache = new Map();  // Cache to store analyzed media results for the above function


// initialize
if (window.top !== window.self) throw new Error('[AniLINK] Skipping embedded frame.');
console.log('[AniLINK] Initializing...');
const site = Websites.find(site => site.url.some(url => window.location.href.includes(url)));
if (!site) throw new Error(`[AniLINK] No extractor found for ${window.location.href}`);

// register menu command to start script
GM_registerMenuCommand('Extract Episodes', extractEpisodes);

// attach start button to page
try {
    const startBtnId = "AniLINK_startBtn";
    (site.addStartButton(startBtnId) || document.getElementById(startBtnId))?.addEventListener('click', extractEpisodes);
} catch (e) {
    console.warn('[AniLINK] Could not add start button to site. This might be due to the function not being implemented for this site.');
}

// append site specific css styles
GM_addStyle(site.styles || '');
// Conditionally accomodate to MAL-Sync's floating button if it exists on the page
GM_addStyle(`html:has(> button.open-info-popup.floatbutton) #AniLINK_UIHost {
    --anlink-fab-right: 40px;
    --anlink-fab-bottom: 108px;
    --anlink-fab-size: 56px;
}`);

/***************************************************************
 * This function creates an overlay on the page and displays a list of episodes extracted from a website
 * The function is triggered by a user command registered with `GM_registerMenuCommand`.
 * The episode list is generated by calling the `extractEpisodes` method of a website object that matches the current URL.
 ***************************************************************/
async function extractEpisodes() {
    // Restore last overlay if it exists
    if (AniLINKUI.query('#AniLINK_Overlay')) {
        AniLINKUI.switchView('extractor');
        return;
    }
    // Flag to control extraction process
    let status = { isExtracting: true, text: 'Initializing...', stopped: false, error: null };

    // --- Materialize CSS Initialization ---
    AniLINKUI.addStyle(`
        #AniLINK_Overlay { position: fixed; inset: 0; background: rgba(0,0,0,.78); backdrop-filter: blur(12px); z-index: 1000; display: flex; align-items: center; justify-content: center; transition: opacity .28s ease, transform .28s ease, visibility .28s; pointer-events: auto; }
        #AniLINK_RerunBtn { position: fixed; top: 22px; right: 26px; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; background: rgba(255,255,255,.05); color: #d9eeeb; font-size: 24px; cursor: pointer; transition: border-color .2s, background .2s, transform .2s; } #AniLINK_RerunBtn:hover { border-color: #26a69a; background: rgba(38,166,154,.18); transform: translateY(-2px); }
        #AniLINK_LinksContainer { width: min(1100px, 92vw); max-height: 86vh; background: linear-gradient(145deg, rgba(25,35,34,.98), rgba(28,28,31,.98)); color: #edf5f4; padding: 22px; border: 1px solid rgba(100,220,207,.18); border-radius: 18px; overflow-y: auto; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset; }
        .anlink-status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: linear-gradient(145deg, rgba(25,35,34,.98), rgba(28,28,31,.98)); border-bottom: 1px solid rgba(255,255,255,.08); } /* Header for status bar and stop button */
        .anlink-status-bar { color: #9eb4b1; flex-grow: 1; margin-right: 10px; display: block; font: 12px/1.3 system-ui, sans-serif; } /* Status bar takes space */
        .anlink-status-icon { background: transparent; border: none; color: #d9eeeb; cursor: pointer; padding-right: 10px; } /* status icon style */
        .anlink-status-icon i { display: inline-block; font: 700 24px/1 system-ui, sans-serif; transition: transform 0.3s ease-in-out; } /* Icon size and transition */
        .anlink-status-icon i.extracting { animation: spinning 2s linear infinite; } /* Spinner animation class */
        .anlink-header-buttons { display: flex; gap: 10px; }
        .anlink-header-buttons button { border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 8px 12px; background: rgba(255,255,255,.05); color: #d4e7e4; cursor: pointer; font: 11px system-ui, sans-serif; transition: border-color .2s, background .2s, color .2s; }
        .anlink-header-buttons button:hover { border-color: #26a69a; background: rgba(38,166,154,.18); color: #7ce4d8; }
        .anlink-quick-download { margin-left: 8px; width: 22px; height: 22px; padding: 0; border: 1px solid #26a69a; border-radius: 50%; background: rgba(38,166,154,.12); color: #7ce4d8; cursor: pointer; font-weight: 700; line-height: 18px; transition: transform .18s, background .18s; }
        .anlink-quick-download:hover { transform: translateY(-2px) scale(1.08); background: #26a69a; color: #fff; }
        .anlink-quality-section { margin-top: 18px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px; background: rgba(255,255,255,.035); }
        .anlink-quality-header { display: flex; justify-content: space-between; align-items: center; }
        .anlink-quality-header > span { color: #65d6c8; font-size: 1.25em; display: flex; align-items: center; flex-grow: 1; } /* Flex and align items for icon and text */
        .anlink-quality-count { cursor: pointer; margin-right: 8px; opacity: 0.7; transition: opacity 0.2s; }
        .anlink-quality-count:hover { opacity: 1; }
        .anlink-quality-name { cursor: pointer; flex-grow: 1; }
        .anlink-quality-header i { margin-right: 8px; font: 700 22px/1 system-ui, sans-serif; transition: transform 0.3s ease-in-out; }
        .anlink-quality-header i.rotate { transform: rotate(90deg); } /* Rotate class */
        .anlink-episode-list { list-style: none; padding-left: 0; margin-top: 0; overflow: hidden; transition: max-height 0.5s ease-in-out; } /* Transition for max-height */
        .anlink-episode-item { margin-bottom: 5px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.07); display: flex; flex-direction: column; }
        .anlink-episode-item:last-child { border-bottom: none; }
        .anlink-episode-missing-count { margin-left:32px; margin-top: -22px; margin-bottom: 6px; color: #888; font-size:0.85em; user-select: none; }
        .anlink-episode-main { display: flex; align-items: baseline; }
        .anlink-episode-main > label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: stretch; } /* Single line & Ellipsis for long links */
        .anlink-episode-main > label > span { user-select: none; cursor: pointer; color: #26a69a; } /* Disable selecting the 'Ep: 1' prefix */
        .anlink-episode-main > label > span > img { vertical-align: middle; display: inline; }  /* Ensure the mpv icon is in the same line */
        .anlink-episode-checkbox { appearance: none; width: 20px; height: 20px; margin-right: 10px; margin-bottom: -5px; border: 1px solid #26a69a; border-radius: 4px; outline: none; cursor: pointer; transition: background-color 0.3s, border-color 0.3s; }
        .anlink-episode-checkbox:checked { background-color: #26a69a; border-color: #26a69a; }
        .anlink-episode-checkbox:checked::after { content: '✔'; display: block; color: white; font-size: 14px; text-align: center; line-height: 20px; animation: checkTilt 0.3s; }
        .anlink-episode-link { color: #f4d36b; text-decoration: none; display: inline; }
        .anlink-episode-link:hover { color: #fff; }
        .anlink-subs-toggle, .anlink-referrer { font-size: 0.85em; color: #888; cursor: pointer; margin-left: 10px; user-select: none; transition: color 0.2s; white-space: nowrap; }
        .anlink-subs-toggle:hover, .anlink-referrer:hover { color: #26a69a; }
        .anlink-subs-list { margin-left: 30px; margin-top: 5px; font-size: 0.9em; color: #bbb; max-height: 0; overflow: hidden; transition: max-height 0.3s ease-in-out; }
        .anlink-subs-list.expanded { max-height: 300px; }
        .anlink-sub-item { padding: 2px 0; width: max-content; user-select: none; }
        .anlink-sub-item a { color: #64b5f6; text-overflow: ellipsis; overflow: hidden; display: inline; user-select: text; }
        .anlink-sub-item a:hover { color: #90caf9; text-decoration: underline; }
        button[data-action] * { pointer-events: none; }
        @media (max-width: 680px) {
            #AniLINK_Overlay { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
            #AniLINK_LinksContainer { width: 100%; max-height: 100%; padding: 14px; padding-top: 0; border-radius: 14px; }
            #AniLINK_RerunBtn { top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); z-index: 10; }
            .anlink-status-header { flex-wrap: wrap; gap: 8px; position: sticky; padding-block: 14px; top: 0; border-radius: 8px; z-index: 2; }
            .anlink-status-bar { order: 0; flex-basis: calc(100% - 36px); margin-right: 0; }
            .anlink-header-buttons { width: 100%; flex-wrap: wrap; gap: 6px; }
            .anlink-header-buttons button { flex: 1 1 calc(50% - 6px); min-height: 38px; }
            .anlink-episode-main { align-items: flex-start; }
            .anlink-quality-section { padding: 10px; }
        }
        @keyframes spinning { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } /* Spinning animation */
        @keyframes checkTilt { from { transform: rotate(-20deg); } to { transform: rotate(0deg); } } /* Checkmark tilt animation */
    `);

    // Create an overlay to cover the page
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "AniLINK_Overlay";
    overlayDiv.onclick = e => !linksContainer.contains(e.target) && !rerunBtn.contains(e.target) &&
        (status.text.startsWith("Cancelled") ? AniLINKUI.removeExtractor() : AniLINKUI.close());

    // Rerun button
    const rerunBtn = document.createElement('button');
    rerunBtn.id = 'AniLINK_RerunBtn';
    rerunBtn.title = 'Reset and Rerun Extraction';
    rerunBtn.textContent = '↻';
    rerunBtn.addEventListener('click', () => {
        overlayDiv.remove();
        extractEpisodes();
    });
    overlayDiv.appendChild(rerunBtn);

    // Create a container for links
    const linksContainer = document.createElement('div');
    linksContainer.id = "AniLINK_LinksContainer";
    overlayDiv.appendChild(linksContainer);
    AniLINKUI.mountExtractor(overlayDiv);

    // Status bar header - container for status bar and status icon
    const statusBarHeader = document.createElement('div');
    statusBarHeader.className = 'anlink-status-header';
    linksContainer.appendChild(statusBarHeader);

    // Create dynamic status icon
    const statusIconElement = document.createElement('a');
    statusIconElement.className = 'anlink-status-icon';
    statusIconElement.innerHTML = '<i class="extracting">⟳</i>';
    statusIconElement.title = 'Stop Extracting';
    statusBarHeader.appendChild(statusIconElement);

    statusIconElement.addEventListener('click', () => {
        if (status.stopped || status.error) {
            status = { isExtracting: true, text: 'Restarting Extraction...', stopped: false, error: null };
            AniLINKUI.removeExtractor();
            extractEpisodes();
        }
        status = { isExtracting: false, text: "Extraction Stopped by User.", stopped: true };
    });

    // Create a status bar
    const statusBar = document.createElement('span');
    statusBar.className = "anlink-status-bar";
    statusBar.textContent = status.text;
    statusBarHeader.appendChild(statusBar);

    // Create header buttons (Export & Play)
    const headerButtons = document.createElement('div');
    headerButtons.className = 'anlink-header-buttons';
    headerButtons.innerHTML = `
        <button type="button" class="anlink-copy-all">Copy</button>
        <button type="button" class="anlink-export-all">Export</button>
        <button type="button" class="anlink-download-selected">Download</button>
        <button type="button" class="anlink-play-all">Play with MPV</button>
    `;
    statusBarHeader.appendChild(headerButtons);
    attachHeaderButtons();

    // start interval to update status text
    const statusInterval = setInterval(() => {
        if (JSON.stringify(status) !== JSON.stringify(_lastStatus)) {
            _lastStatus = { ...status };
            statusBar.textContent = status.text;
            if (status.isExtracting) {
                statusIconElement.querySelector('i').classList.add('extracting'); // Start spinner animation
                statusIconElement.title = 'Stop Extracting';
                statusIconElement.querySelector('i').textContent = statusIconElement.matches(':hover') ? '⏹' : '⟳'; // Show spinner icon
            } else {
                statusIconElement.title = 'Restart Extraction.';
                statusIconElement.querySelector('i').classList.remove('extracting'); // Stop spinner animation
                statusIconElement.querySelector('i').textContent = (statusIconElement.matches(':hover') || status.stopped) ? '↻' : status.error ? '!' : '✓';
                if (status.error) {
                    statusIconElement.querySelector('i').classList.add('error'); // Show error icon
                    statusBar.textContent += ` : ${status.error}`; // Update status bar with error
                    statusBar.style.color = 'red'; // Change status bar color to red
                } else statusBar.style.color = ''; // Reset status bar color
                clearInterval(statusInterval); // Stop updating statusBar
            }
        }
    }, 100);
    _lastStatus = { ...status }; // Store a shallow copy of the last status for reference

    // Create a container for qualities and episodes
    const qualitiesContainer = document.createElement('div');
    qualitiesContainer.id = "AniLINK_QualitiesContainer";
    linksContainer.appendChild(qualitiesContainer);

    // Update counts on checkbox change (event delegation)
    qualitiesContainer.addEventListener('change', e => {
        if (e.target.classList.contains('anlink-episode-checkbox')) {
            const section = e.target.closest('.anlink-quality-section');
            const total = section.querySelectorAll('.anlink-episode-checkbox').length;
            const checked = section.querySelectorAll('.anlink-episode-checkbox:checked').length;
            section.querySelector('.anlink-quality-count').textContent = checked ? `(${checked}/${total})` : `(${total})`;
        }
    });


    // --- Process Episodes using Generator ---
    window._anilink_episodes = [];
    let startTime = Date.now();
    try {
        const episodeGenerator = site.extractEpisodes(status);
        const qualityLinkLists = {};
        startTime = Date.now(); // Reset start time after initialization

        for await (const episode of episodeGenerator) {
            if (!status.isExtracting) { // Check if extraction is stopped
                statusIconElement.querySelector('i').classList.remove('extracting'); // Stop spinner animation
                return; // Exit if extraction is stopped
            }
            if (!episode) continue;
            window._anilink_episodes.push(episode);

            // Get all links into format - {[qual1]:[ep1,2,3,4], [qual2]:[ep1,2,3,4], ...}
            for (const quality in episode.links) {
                qualityLinkLists[quality] = qualityLinkLists[quality] || [];
                qualityLinkLists[quality].push(episode);
            }

            // Update UI in real-time - RENDER UI HERE BASED ON qualityLinkLists
            renderQualityLinkLists(qualityLinkLists, qualitiesContainer);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        statusIconElement.querySelector('i').classList.remove('extracting');
        if (qualityLinkLists && Object.keys(qualityLinkLists).length > 0) {
            status = { isExtracting: false, text: `Extraction Complete in ${duration} seconds` };
        } else {
            status = { isExtracting: false, text: "No episodes found." };
        }
    } catch (error) {
        console.error('Error during episode extraction:', error);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        status = { isExtracting: false, text: `Extraction Failed after ${duration} seconds.`, error: error.message || error.toString() };
        showToast(`Extraction failed: ${dlUtils?.anlinkEscapeHtml?.(status.error) || status.error}`);
    }

    // Renders quality link lists inside a given container element
    function renderQualityLinkLists(sortedLinks, container) {
        // Track expanded state for each quality section
        const expandedState = {};
        container.querySelectorAll('.anlink-quality-section').forEach(section => {
            const quality = section.dataset.quality;
            const episodeList = section.querySelector('.anlink-episode-list');
            expandedState[quality] = episodeList && episodeList.style.maxHeight !== '0px';
        });

        for (const quality in sortedLinks) {
            let qualitySection = container.querySelector(`.anlink-quality-section[data-quality="${quality}"]`);
            let episodeListElem;

            const episodes = sortedLinks[quality].sort((a, b) => +a.number - +b.number);

            if (!qualitySection) {
                // Create new section if it doesn't exist
                qualitySection = document.createElement('div');
                qualitySection.className = 'anlink-quality-section';
                qualitySection.dataset.quality = quality;

                const headerDiv = document.createElement('div');
                headerDiv.className = 'anlink-quality-header';
                headerDiv.title = 'Shift+Click to select/deselect all episodes in this quality';

                const qualitySpan = document.createElement('span');
                const count = document.createElement('i');
                count.className = 'anlink-quality-count';
                count.textContent = `(${sortedLinks[quality].length})`;
                count.title = 'Click to select/deselect all';
                count.dataset.total = sortedLinks[quality].length;
                count.addEventListener('click', e => {
                    e.stopPropagation();
                    toggleSelectAll(qualitySection);
                });

                const icon = document.createElement('i');
                icon.className = 'anlink-quality-chevron';
                icon.textContent = '›';

                const name = document.createElement('span');
                name.className = 'anlink-quality-name';
                name.textContent = quality;
                name.addEventListener('click', toggleQualitySection);

                qualitySpan.appendChild(count);
                qualitySpan.appendChild(icon);
                qualitySpan.appendChild(name);
                headerDiv.appendChild(qualitySpan);
                qualitySection.appendChild(headerDiv);

                // --- Add Empty episodes list elm to the quality section ---
                episodeListElem = document.createElement('ul');
                episodeListElem.className = 'anlink-episode-list';
                episodeListElem.style.maxHeight = '0px';
                qualitySection.appendChild(episodeListElem);

                container.appendChild(qualitySection);

                // Shift+Click to select all episodes in this quality
                headerDiv.addEventListener('mousedown', e => e.shiftKey && toggleSelectAll(qualitySection));
            } else {
                // Update header count
                const countElem = qualitySection.querySelector('.anlink-quality-count');
                if (countElem) {
                    const checked = qualitySection.querySelectorAll('.anlink-episode-checkbox:checked').length;
                    countElem.textContent = checked ? `(${checked}/${sortedLinks[quality].length})` : `(${sortedLinks[quality].length})`;
                    countElem.dataset.total = sortedLinks[quality].length;
                }
                episodeListElem = qualitySection.querySelector('.anlink-episode-list');
            }

            // Update episode list items
            episodeListElem.innerHTML = '';
            episodes.forEach((ep, i) => {
                const listItem = document.createElement('li');
                listItem.className = 'anlink-episode-item';
                const missingBeforeCount = i ? Math.max(0, (+ep.number || 0) - (+episodes[i - 1].number || 0) - 1) : 0;
                const hasSubs = ep.links[quality].tracks?.some(t => /^(caption|subtitle)s?/.test(t.kind));
                listItem.innerHTML = `
                    ${missingBeforeCount ? `<span class="anlink-episode-missing-count">——— Missing ${missingBeforeCount} episode${missingBeforeCount != 1 ? 's' : ''} ———</span>` : ''}
                    <div class="anlink-episode-main">
                        <label>
                            <input type="checkbox" class="anlink-episode-checkbox" />
                            <span class="mpv-epnum" title="Play in MPV">Ep ${ep.number.replace(/^0+/, '')}: </span>
                            <a href="${ep.links[quality].stream}" class="anlink-episode-link" download="${encodeURI(ep.filename)}" data-epnum="${ep.number}" data-ep=${encodeURI(JSON.stringify({ ...ep, links: undefined }))} >${ep.links[quality].stream}</a>
                        </label>
                        ${hasSubs ? '<span class="anlink-subs-toggle" title="Shift+Click to toggle all episodes\' subtitles">🄰 Subs ▼</span>' : ''}
                    </div>
                    ${hasSubs ? '<div class="anlink-subs-list"></div>' : ''}
                `;
                const episodeLinkElement = listItem.querySelector('.anlink-episode-link');
                const epnumSpan = listItem.querySelector('.mpv-epnum');
                const link = episodeLinkElement.href;
                const name = decodeURIComponent(episodeLinkElement.download);

                // On hover, show MPV icon & file name & referer
                listItem.addEventListener('mouseenter', () => {
                    window.getSelection().isCollapsed && (episodeLinkElement.textContent = name);
                    epnumSpan.innerHTML = `<img width="20" height="20" fill="#26a69a" src="https://a.fsdn.com/allura/p/mpv-player-windows/icon?1517058933"> ${ep.number.replace(/^0+/, '')}: `;
                    const label = _$('label', listItem);
                    label.after(Object.assign(document.createElement('button'), { className: 'anlink-quick-download', type: 'button', title: `Add episode ${ep.number} to downloads`, textContent: '⇩' }));
                    label.after(Object.assign(document.createElement('span'), { className: 'anlink-referrer', title: `Referer: ${ep.links[quality].referer}`, textContent: `⌬ ${ep.links[quality].referer.split('://')[1]}` }));
                    listItem.querySelector('.anlink-quick-download').addEventListener('click', event => onDownloadEpisodes([ep], quality, event.currentTarget));
                });
                listItem.addEventListener('mouseleave', () => {
                    episodeLinkElement.textContent = decodeURIComponent(link);
                    epnumSpan.textContent = `Ep ${ep.number.replace(/^0+/, '')}: `;
                    listItem.querySelector('.anlink-referrer')?.remove();
                    listItem.querySelector('.anlink-quick-download')?.remove();
                });
                epnumSpan.addEventListener('click', e => {
                    e.preventDefault();
                    location.replace(`${MPV_PROTOCOL}://play/` + safeBtoa(link) + `/?v_title=${safeBtoa(name)}&cookies=${location.hostname}.txt&referrer=${safeBtoa(ep.links[quality].referer || location.href)}` + (ep.links[quality].tracks?.some(t => t.kind === 'caption') ? `&subfile=${safeBtoa(ep.links[quality].tracks.filter(t => /^caption/.test(t.kind)).map(t => t.file).join(';'))}` : ''));
                    showToast('Sent to MPV. If nothing happened, install v0.4.0+ of <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a>.');
                });
                episodeLinkElement.addEventListener('click', () => {
                    // fetch(episodeLinkElement.href, { method: 'HEAD', headers })
                    //     .then(r => r.blob())
                    //     .then(b => Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: decodeURIComponent(episodeLinkElement.download) }).click())    // workaround to force download with correct filename (some browsers ignore download attr for cross-origin links)
                    //     .catch(err => window.open(episodeLinkElement.href, '_blank') && showToast(`Could not download file directly, opened in new tab instead. Error: ${err}`));
                    window.open(episodeLinkElement.href, '_blank');
                });

                // Subtitle toggle functionality
                const subsToggle = listItem.querySelector('.anlink-subs-toggle');
                const subsList = listItem.querySelector('.anlink-subs-list');
                if (subsToggle && subsList) {
                    subsToggle.addEventListener('mousedown', e => {
                        // shift+click to toggle all episode subtitles
                        if (e.shiftKey) {
                            return AniLINKUI.queryAll('.anlink-subs-list').forEach(sl => sl.previousElementSibling.querySelector('.anlink-subs-toggle').dispatchEvent(new MouseEvent('mousedown', { bubbles: false })));
                        }
                        const isExpanded = subsList.classList.toggle('expanded');
                        subsToggle.textContent = isExpanded ? '🄰 Subs ▲' : '🄰 Subs ▼';
                        if (isExpanded && !subsList.hasChildNodes()) {
                            ep.links[quality].tracks.filter(t => /^caption/.test(t.kind)).forEach(track => {
                                const subItem = document.createElement('div');
                                subItem.className = 'anlink-sub-item';
                                subItem.innerHTML = `└─ ${track.label || 'Subtitle'}: <a href="${track.file}" target="_blank">${track.file}</a>`;
                                subsList.appendChild(subItem);
                            });
                        }
                        const epList = subsList.closest('.anlink-episode-list');
                        epList.style.maxHeight = +epList.style.maxHeight.replace('px', '') + subsList.scrollHeight + 'px'; // Adjust max-height to fit new content
                    });
                }

                episodeListElem.appendChild(listItem);

                // Fix checkbox state double toggling due to label click
                (listItem.querySelector('.anlink-episode-checkbox')).onclick = e => e.stopPropagation();
            });

            // Restore expand state only if section was previously expanded
            if (expandedState[quality]) {
                const icon = qualitySection.querySelector('.anlink-quality-chevron');
                episodeListElem.style.maxHeight = `${episodeListElem.scrollHeight}px`;
                icon.classList.add('rotate');
            }
        }
    }

    function toggleQualitySection(event) {
        const qualityName = event.currentTarget;
        const qualitySection = qualityName.closest('.anlink-quality-section');
        const episodeList = qualitySection.querySelector('.anlink-episode-list');
        const icon = qualitySection.querySelector('.anlink-quality-chevron');
        const isCollapsed = episodeList.style.maxHeight === '0px';

        if (isCollapsed) {
            episodeList.style.maxHeight = `${episodeList.scrollHeight}px`; // Expand to content height with animation
            icon.classList.add('rotate'); // Rotate icon on expand
        } else {
            episodeList.style.maxHeight = '0px'; // Collapse
            icon.classList.remove('rotate'); // Reset icon rotation
        }
    }

    function toggleSelectAll(qualitySection) {
        const checkboxes = Array.from(qualitySection.querySelectorAll('.anlink-episode-checkbox'));
        const allChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));   // trigger change event to update counts
        // also select all the text
        if (!allChecked) {
            const range = document.createRange();
            range.selectNodeContents(qualitySection.querySelector('ul'));
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    // Attach header button handlers
    function attachHeaderButtons() {
        const copyBtn = linksContainer.querySelector('.anlink-copy-all');
        const exportBtn = linksContainer.querySelector('.anlink-export-all');
        const downloadBtn = linksContainer.querySelector('.anlink-download-selected');
        const playBtn = linksContainer.querySelector('.anlink-play-all');

        copyBtn?.addEventListener('click', () => onCopyAll(copyBtn));
        exportBtn.addEventListener('click', () => onExportAll(exportBtn));
        downloadBtn?.addEventListener('click', event => onDownloadSelected(event.currentTarget));
        playBtn.addEventListener('click', () => onPlayAll(playBtn));
    };

    // Helper to get all selected episodes across all qualities
    function getAllSelectedEpisodes(selectAllWhenEmpty = true) {
        const selected = {};
        AniLINKUI.queryAll('.anlink-quality-section').forEach(section => {
            const quality = section.dataset.quality;
            const items = Array.from(section.querySelectorAll('.anlink-episode-item input:checked'))
                .map(cb => cb.closest('.anlink-episode-item'));
            if (items.length) selected[quality] = items;
        });
        // If none selected, select all by default
        if (selectAllWhenEmpty && !Object.keys(selected).length) {
            AniLINKUI.queryAll('.anlink-quality-section').forEach(section => {
                const quality = section.dataset.quality;
                const items = Array.from(section.querySelectorAll('.anlink-episode-item'));
                selected[quality] = items;
            });
        }
        return selected;
    }

    // Helper to build m3u8 content from selected episodes
    function buildPlaylist(selected) {
        let out = '#EXTM3U\n';
        for (const [quality, items] of Object.entries(selected)) {
            const epNums = items.map(i => i.querySelector('[data-epnum]').dataset.epnum);
            const episodes = (window._anilink_episodes || []).filter(ep => ep.links[quality] && epNums.includes(ep.number));
            const referer = episodes[0]?.links[quality]?.referer;
            if (referer && !out.includes(referer)) out += `#EXTVLCOPT:http-referrer=${referer}\n`;
            episodes.forEach(ep => {
                const link = ep.links[quality];
                if (link?.tracks?.length) link.tracks.forEach(t => {
                    const type = t.kind?.startsWith('audio') ? 'AUDIO' : /^(caption|subtitle)s?/.test(t.kind) ? 'SUBTITLES' : null;
                    if (type) out += `#EXT-X-MEDIA:TYPE=${type},GROUP-ID="${type.toLowerCase()}${ep.number}",NAME="${t.label || type}",DEFAULT=${t.default ? 'YES' : 'NO'},URI="${t.file}"\n`;
                });
                out += `#EXTINF:-1,${ep.filename.replaceAll('/', '|')}${SRC_IN_FN ? ` [${quality}]` : ''}\n${link.stream}\n`;
            });
        }
        return out;
    }

    async function onCopyAll(btn) {
        const selected = getAllSelectedEpisodes();
        if (!Object.keys(selected).length) return showToast('No episodes selected');
        const links = Object.values(selected).flat().map(i => i.querySelector('.anlink-episode-link').href).join('\n') + '\n';
        GM_setClipboard(links, "text", () => showToast(`Copied ${links.split('\n').filter(l => l).length} links to clipboard`));
        btn.textContent = `Copied ${links.split('\n').filter(l => l).length} links!`;
        setTimeout(() => btn.textContent = 'Copy Links', 1000);
    }

    async function onDownloadEpisodes(episodes, quality, source) {
        try {
            const directorySelected = await anilinkDownloader.setDirectory();
            if (!directorySelected) return;
            anilinkDownloaderUI.addEpisodes(episodes, quality, { show: false });
            AniLINKUI.animateDrop(source);
            setTimeout(() => anilinkDownloaderUI.show(), 520);
            showToast(`${episodes.length} episode${episodes.length === 1 ? '' : 's'} added to downloads.`);
        } catch (error) { showToast(`Could not start downloads: ${dlUtils?.anlinkEscapeHtml?.(error.message || error) || error}`); }
    }

    async function onDownloadSelected(btn) {
        try {
            const directorySelected = await anilinkDownloader.setDirectory();
            if (!directorySelected) return;
            let selected = getAllSelectedEpisodes(false);
            if (!Object.keys(selected).length) {
                const allEpisodes = window._anilink_episodes || [];
                if (!allEpisodes.length) return showToast('No episodes available to download');
                const range = await showEpisodeRangeSelector(allEpisodes.length);
                const episodes = allEpisodes.slice(range.start - 1, range.end);
                const quality = Object.keys(episodes[0]?.links || {})[0];
                if (!quality) return showToast('No downloadable source found');
                return onDownloadEpisodes(episodes, quality, btn);
            }
            const tasks = [];
            for (const [quality, items] of Object.entries(selected)) {
                const epNums = items.map(item => item.querySelector('[data-epnum]').dataset.epnum);
                const episodes = (window._anilink_episodes || []).filter(ep => epNums.includes(ep.number) && ep.links[quality]);
                if (episodes.length) tasks.push(...anilinkDownloaderUI.addEpisodes(episodes, quality, { show: false }));
            }
            AniLINKUI.animateDrop(btn);
            setTimeout(() => anilinkDownloaderUI.show(), 520);
            showToast(`${tasks.length} episode${tasks.length === 1 ? '' : 's'} added to downloads.`);
        } catch (error) { showToast(`Could not start downloads: ${dlUtils?.anlinkEscapeHtml?.(error.message || error) || error}`); }
    }

    async function onExportAll(btn) {
        const selected = getAllSelectedEpisodes();
        if (!Object.keys(selected).length) return showToast('No episodes selected');
        const playlistData = buildPlaylist(selected);
        const qualities = Object.keys(selected).join(', ');
        const fileName = (window._anilink_episodes?.[0]?.animeTitle || 'Anime') + `${SRC_IN_FN ? ` [${qualities}]` : ''}` + '.m3u8';
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([playlistData], { type: 'application/vnd.apple.mpegurl' })), download: fileName }).click();
        btn.textContent = 'Exported';
        setTimeout(() => btn.textContent = 'Export', 1000);
    }

    async function onPlayAll(btn) {
        const selected = getAllSelectedEpisodes();
        if (!Object.keys(selected).length) return showToast('No episodes selected');
        btn.textContent = 'Processing...';
        const url = await GM_fetch('https://xi.pe/', { method: 'POST', body: buildPlaylist(selected) }).then(r => r.text()).then(t => t.trim() + "?raw");
        GM_setClipboard(url, "text", () => console.log(`Playlist URL: `, url));
        location.replace(`${MPV_PROTOCOL}://play/` + safeBtoa(url) + '/?v_title=' + safeBtoa((window._anilink_episodes?.[0]?.animeTitle || 'Anime')) + `&cookies=${location.hostname}.txt&referrer=${safeBtoa((Object.values(window._anilink_episodes?.[0].links)[0]?.referer || location.origin))}`);
        btn.textContent = 'Sent to MPV';
        setTimeout(() => { btn.textContent = 'Play with MPV'; showToast('If nothing happened, install v0.4.0+ of <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a>.'); }, 1000);
    }
}

/***************************************************************
 * Shared Modal Builder - DRY base for all selection modals
 ***************************************************************/
function createModal({ title, icon, subtitle, bodyHTML, width = '420px', onConfirm, onCancel }) {
    const modal = Object.assign(document.createElement('div'), {
        innerHTML: `
            <div class="anlink-modal-backdrop">
                <div class="anlink-modal" style="width:${width};">
                    <div class="anlink-modal-header">
                        <div class="anlink-modal-icon">${icon}</div>
                        <h2>${title}</h2>
                        ${subtitle ? `<div class="anlink-episode-count">${subtitle}</div>` : ''}
                    </div>
                    <div class="anlink-modal-body">${bodyHTML}</div>
                    <div class="anlink-modal-footer">
                        <button class="anlink-btn anlink-btn-cancel"><kbd>Esc</kbd> Cancel</button>
                        <button class="anlink-btn anlink-btn-primary"><kbd>Enter</kbd> Confirm</button>
                    </div>
                </div>
            </div>
        `,
        style: 'position:fixed;inset:0;z-index:1001;pointer-events:auto;'
    });

    // Inject shared modal styles (only once)
    if (!createModal.stylesReady) {
        AniLINKUI.addStyle(`
            .anlink-modal-backdrop { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; padding: 24px; background: rgba(4,12,13,.52); backdrop-filter: blur(18px) saturate(135%); }
            .anlink-modal { background: linear-gradient(145deg, rgba(31,52,50,.78), rgba(24,31,34,.72)); border: 1px solid rgba(180,255,245,.2); border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.5), 0 0 30px rgba(38,166,154,.08) inset; backdrop-filter: blur(24px) saturate(130%); max-width: 90vw; color: #edf7f5; overflow: hidden; }
            .anlink-modal-header { text-align: center; padding: 24px 24px 16px; background: linear-gradient(135deg, rgba(38,166,154,.48), rgba(20,92,87,.34)); border-bottom: 1px solid rgba(180,255,245,.12); }
            .anlink-modal-icon { font-size: 48px; margin-bottom: 8px; }
            .anlink-modal h2 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
            .anlink-episode-count { opacity: 0.9; font-size: 14px; }
            .anlink-modal-body { padding: 24px; }
            .anlink-modal-footer { display: flex; gap: 12px; padding: 0 24px 24px; }
            .anlink-btn { flex: 1; padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
            .anlink-btn:focus { outline: 2px solid #26a69a; outline-offset: 2px; }
            .anlink-btn-cancel { background: rgba(255,255,255,.08); color: #c2d2d0; border: 1px solid rgba(255,255,255,.12); }
            .anlink-btn-cancel:hover, .anlink-btn-cancel:focus { background: rgba(255,255,255,.14); }
            .anlink-btn-primary { background: linear-gradient(135deg, rgba(38,166,154,.9), rgba(32,132,122,.82)); color: #fff; border: 1px solid rgba(180,255,245,.18); }
            .anlink-btn-primary:hover, .anlink-btn-primary:focus { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(38,166,154,0.3); }
            .anlink-quick-select { display: flex; gap: 8px; margin-bottom: 16px; }
            .anlink-quick-btn { flex: 1; padding: 8px 12px; border: 1px solid #444; border-radius: 6px; background: transparent; color: #ccc; cursor: pointer; font-size: 12px; transition: all 0.2s; }
            .anlink-quick-btn:hover, .anlink-quick-btn:focus { border-color: #26a69a; color: #26a69a; background: rgba(38,166,154,0.1); outline: none; }
            .anlink-help-text { font-size: 11px; color: #888; text-align: center; margin-top: 12px; }
            kbd { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; padding: 1px 4px; font-size: 10px; margin-right: 4px; }
            @media (max-width: 680px) {
                .anlink-modal-backdrop { padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
                .anlink-modal { width: min(100%, calc(100vw - 20px)) !important; max-height: calc(100svh - 20px); overflow-y: auto; }
                .anlink-modal-header { padding: 18px 16px 12px; }
                .anlink-modal-body { padding: 16px; }
                .anlink-modal-footer { padding: 0 16px 16px; }
                .anlink-quick-select { flex-wrap: wrap; }
                .anlink-quick-btn { min-height: 38px; }
            }
        `);
        createModal.stylesReady = true;
    }

    AniLINKUI.root.appendChild(modal);
    const primaryBtn = modal.querySelector('.anlink-btn-primary');
    const cancelBtn = modal.querySelector('.anlink-btn-cancel');

    const cleanup = () => modal.remove();
    const handleConfirm = () => { const result = onConfirm?.(modal); if (result !== false) cleanup(); };
    const handleCancel = () => { onCancel?.(modal); cleanup(); };

    modal.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
        else if (e.key === 'Enter' && !e.target.matches('input[type="radio"], input[type="checkbox"]')) { e.preventDefault(); handleConfirm(); }
    });
    cancelBtn.addEventListener('click', handleCancel);
    primaryBtn.addEventListener('click', handleConfirm);

    primaryBtn.focus(); // Focus primary button by default for accessibility

    return { modal, primaryBtn, cancelBtn, cleanup };
}

/***************************************************************
 * Modern Episode Range Selector with Keyboard Navigation
 ***************************************************************/
async function showEpisodeRangeSelector(total) {
    return new Promise((resolve, reject) => {
        const bodyHTML = `
            <small style="display:block;color:#ccc;font-size:11px;margin-bottom:16px;text-align:center;">
                Note: Range is by episode count, not episode number<br>(e.g., 1-6 means the first 6 episodes listed).
            </small>
            <div class="anlink-range-inputs">
                <div class="anlink-input-group">
                    <label>From</label>
                    <input type="number" id="start" min="1" max="${total}" value="1" tabindex="1">
                </div>
                <div class="anlink-range-divider">—</div>
                <div class="anlink-input-group">
                    <label>To</label>
                    <input type="number" id="end" min="1" max="${total}" value="${Math.min(24, total)}" tabindex="2">
                </div>
            </div>
            <div class="anlink-quick-select">
                <button class="anlink-quick-btn" data-range="1,24" tabindex="3">First 24</button>
                <button class="anlink-quick-btn" data-range="${Math.max(1, total - 23)},${total}" tabindex="4">Last 24</button>
                <button class="anlink-quick-btn" data-range="1,${total}" tabindex="5">All ${total}</button>
            </div>
            <div class="anlink-help-text">
                Use <kbd>Tab</kbd> to navigate • <kbd>↑↓</kbd> to adjust values • <kbd>Enter</kbd> to extract • <kbd>Esc</kbd> to cancel
            </div>
        `;

        const { modal, primaryBtn } = createModal({
            title: 'Episode Range',
            icon: '📺',
            subtitle: `${total} episodes found`,
            bodyHTML,
            onConfirm: () => {
                validate();
                resolve({ start: +startInput.value, end: +endInput.value });
            },
            onCancel: () => reject(new Error('Episode range selection cancelled.'))
        });

        AniLINKUI.addStyle(`
            .anlink-range-inputs { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
            .anlink-input-group { flex: 1; }
            .anlink-input-group label { display: block; margin-bottom: 8px; font-size: 14px; color: #26a69a; font-weight: 500; }
            .anlink-input-group input { width: 100%; padding: 12px; border: 2px solid #444; border-radius: 8px; background: #1a1a1a; color: #fff; font-size: 16px; text-align: center; transition: all 0.2s; }
            .anlink-input-group input:focus { outline: none; border-color: #26a69a; box-shadow: 0 0 0 3px rgba(38,166,154,0.1); }
            .anlink-range-divider { color: #26a69a; font-weight: bold; font-size: 18px; margin-top: 24px; }
        `);

        const [startInput, endInput] = modal.querySelectorAll('input');

        const validate = () => {
            const s = Math.max(1, Math.min(total, +startInput.value));
            const e = Math.max(s, Math.min(total, +endInput.value));
            startInput.value = s; endInput.value = e;
        };

        // Input validation and arrow key navigation for number inputs
        [startInput, endInput].forEach(input => {
            input.addEventListener('input', validate);
            input.addEventListener('keydown', e => {
                if (e.key === 'ArrowUp') { e.preventDefault(); input.value = Math.min(total, (+input.value || 0) + 1); validate(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = Math.max(1, (+input.value || 2) - 1); validate(); }
            });
        });
        // Quick select buttons
        modal.querySelectorAll('.anlink-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const [s, e] = btn.dataset.range.split(',').map(Number);
                startInput.value = s; endInput.value = e;
                validate();
                setTimeout(() => primaryBtn.focus(), 100); // Focus extract button after quick select
            });
        });

        // Focus management - start with first input and select all text
        setTimeout(() => { startInput.focus(); startInput.select(); }, 100);
    });
}

/***************************************************************
 * Apply episode range filtering with modern UI
 ***************************************************************/
async function applyEpisodeRangeFilter(allEpLinks) {
    const status = AniLINKUI.query('.anlink-status-bar');
    if (allEpLinks.length <= EP_RANGE_THRESHOLD) return allEpLinks;

    status.textContent = `Found ${allEpLinks.length} episodes. Waiting for selection...`;
    const selection = await showEpisodeRangeSelector(allEpLinks.length);

    if (!selection) {
        status.textContent = 'Cancelled by user.';
        throw new Error('Episode range selection cancelled by user.');
    }

    const filtered = allEpLinks.slice(selection.start - 1, selection.end);
    status.textContent = `Extracting episodes ${selection.start}-${selection.end} of ${allEpLinks.length}...`;
    return filtered;
}

/***************************************************************
 * Source Picker Modal - Select preferred sources and fallback order
 ***************************************************************/
async function showSourceSelector(sourcesGetter, siteKey, defaults = {}) {
    const storageKey = `sources_config`;
    const saved = GM_getValue(storageKey, {})[siteKey];
    const availableSources = await (typeof sourcesGetter === 'function' ? sourcesGetter() : sourcesGetter);
    if (!availableSources?.length) throw new Error('No available sources found.');

    return new Promise((resolve, reject) => {
        const defaultSources = defaults.sources || availableSources;
        const savedSources = Array.isArray(saved?.sources) ? saved.sources : defaultSources;
        const config = { mode: saved?.mode || defaults.mode || 'single', sources: [...new Set([...savedSources.filter(s => availableSources.includes(s)), ...availableSources.filter(s => !savedSources.includes(s))])], selected: savedSources.filter(s => availableSources.includes(s)) };

        const bodyHTML = `
            <small style="display:block;color:#ccc;font-size:11px;margin-bottom:12px;text-align:center;">Drag to reorder • Top = highest priority</small>
            <div class="anlink-source-mode">
                <label><input type="radio" name="mode" value="single" ${config.mode === 'single' ? 'checked' : ''}> Single (1st available)</label>
                <label ${defaults.forceSingle && 'title="Multi-mode is disabled for this site"'}><input type="radio" name="mode" value="multi" ${defaults.forceSingle && 'disabled'}  ${config.mode === 'multi' ? 'checked' : ''}> Multi (all selected)</label>
            </div>
            <div class="anlink-source-list" data-mode="${config.mode}">
                ${config.sources.map((s, i) => `<div class="anlink-source-item" draggable="true" data-source="${s}">
                    <span class="anlink-drag-handle">☰</span>
                    <input type="checkbox" id="src_${i}" ${config.selected.includes(s) ? 'checked' : ''}>
                    <label for="src_${i}">${s}</label>
                    <span class="anlink-priority">#${i + 1}</span>
                </div>`).join('')}
            </div>
            <div class="anlink-quick-select">
                <button class="anlink-quick-btn" data-action="all">Select All</button>
                <button class="anlink-quick-btn" data-action="none">Deselect All</button>
                <button class="anlink-quick-btn" data-action="reset">Reset</button>
            </div>
            <div class="anlink-help-text">Sources tried in order until one succeeds</div>
        `;

        const { modal, primaryBtn } = createModal({
            title: 'Source Preferences',
            icon: '🎬',
            subtitle: `${availableSources.length} sources available`,
            bodyHTML,
            width: '480px',
            onConfirm: () => {
                const mode = modal.querySelector('input[name="mode"]:checked').value;
                const sources = [...list.querySelectorAll('.anlink-source-item')]
                    .filter(item => item.querySelector('input[type="checkbox"]').checked)
                    .map(item => item.dataset.source);
                if (!sources.length) { showToast('⚠️ Please select at least one source'); return false; }
                const config = { sources, mode };
                GM_setValue(storageKey, { ...GM_getValue(storageKey, {}), [siteKey]: config });
                resolve(config);
            },
            onCancel: () => reject(new Error('Source selection cancelled by user.'))
        });

        AniLINKUI.addStyle(`
            .anlink-source-mode { display: flex; gap: 16px; margin-bottom: 16px; padding: 12px; background: rgba(38,166,154,0.1); border-radius: 8px; }
            .anlink-source-mode label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #ccc; transition: color 0.2s; }
            .anlink-source-mode input[type="radio"] { accent-color: #26a69a; }
            .anlink-source-mode label:has(input:checked) { color: #26a69a; font-weight: 600; }
            .anlink-source-mode label:has(input:disabled) { color: #555; cursor: not-allowed; }
            .anlink-source-list { max-height: 320px; overflow-y: auto; margin-bottom: 16px; border: 1px solid #444; border-radius: 8px; padding: 8px; background: #1a1a1a; }
            .anlink-source-item { display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 6px; background: #2d2d2d; border: 1px solid #444; border-radius: 6px; cursor: move; transition: all 0.2s; }
            .anlink-source-item:hover { border-color: #26a69a; background: #333; }
            .anlink-source-item.dragging { opacity: 0.5; }
            .anlink-drag-handle { color: #666; cursor: grab; font-size: 18px; }
            .anlink-drag-handle:active { cursor: grabbing; }
            .anlink-source-item input[type="checkbox"] { accent-color: #26a69a; width: 18px; height: 18px; cursor: pointer; }
            .anlink-source-item label { flex: 1; cursor: pointer; color: #eee; user-select: none; }
            .anlink-priority { font-size: 12px; color: #26a69a; font-weight: 600; min-width: 28px; text-align: right; }
            .anlink-source-list[data-mode="single"] .anlink-source-item:has(input:not(:checked)) { opacity: 0.4; }
        `);
        const list = modal.querySelector('.anlink-source-list');
        const modeInputs = modal.querySelectorAll('input[name="mode"]');
        let draggedItem = null;

        list.addEventListener('dragstart', e => {
            const item = e.target.closest('.anlink-source-item');
            if (!item) return;
            draggedItem = item;
            item.classList.add('dragging');
        });

        list.addEventListener('dragend', e => {
            const item = e.target.closest('.anlink-source-item');
            if (item) item.classList.remove('dragging');
            updatePriorities();
        });

        list.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem) return;
            const afterElement = [...list.querySelectorAll('.anlink-source-item:not(.dragging)')]
                .find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
            if (afterElement) list.insertBefore(draggedItem, afterElement);
            else list.appendChild(draggedItem);
        });
        const updatePriorities = () => {
            list.querySelectorAll('.anlink-source-item').forEach((item, i) => {
                const priority = item.querySelector('.anlink-priority');
                const checkbox = item.querySelector('input[type="checkbox"]');
                priority.textContent = checkbox.checked ? `#${i + 1}` : '';
            });
        };

        modeInputs.forEach(input => input.addEventListener('change', e => { list.dataset.mode = e.target.value; updatePriorities(); }));
        list.addEventListener('change', e => { if (e.target.type === 'checkbox') updatePriorities(); });
        modal.querySelectorAll('.anlink-quick-btn').forEach(btn => btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const checkboxes = list.querySelectorAll('input[type="checkbox"]');
            if (action === 'all') checkboxes.forEach(cb => cb.checked = true);
            else if (action === 'none') checkboxes.forEach(cb => cb.checked = false);
            else if (action === 'reset') {
                const items = [...list.querySelectorAll('.anlink-source-item')];
                const defaultOrder = defaults.sources || availableSources;
                items.forEach(item => item.querySelector('input[type="checkbox"]').checked = defaultOrder.includes(item.dataset.source));
                list.append(...defaultOrder.map(source => items.find(i => i.dataset.source === source)).filter(Boolean), ...items.filter(i => !defaultOrder.includes(i.dataset.source)));
            }
            updatePriorities();
        }));
        updatePriorities();
        setTimeout(() => primaryBtn.focus(), 100);
    });
}

/***************************************************************
 * Display a simple toast message on the top right of the screen
 ***************************************************************/
let toasts = [];

function showToast(message, duration = 5000) {
    const maxToastHeight = window.innerHeight * 0.5;
    const toastHeight = 70;
    const maxToasts = Math.floor(maxToastHeight / toastHeight);

    console.log(message);

    // Inject toast styles if not already present
    if (!showToast.stylesReady) {
        AniLINKUI.addStyle(`
            @keyframes anlink-toast-slide-in { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes anlink-toast-slide-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
            .anlink-toast { position: fixed; right: 20px; min-width: 300px; max-width: 400px; background: linear-gradient(145deg, rgba(31,52,50,.78), rgba(24,31,34,.72)); border: 1px solid rgba(180,255,245,.2); border-radius: 14px; padding: 16px 20px; box-shadow: 0 18px 55px rgba(0,0,0,.42), 0 0 24px rgba(38,166,154,.08) inset; z-index: 10000; display: flex; align-items: flex-start; gap: 12px; animation: anlink-toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); backdrop-filter: blur(22px) saturate(135%); transition: top 0.4s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: auto; }
            .anlink-toast.slide-out { animation: anlink-toast-slide-out 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards; }
            .anlink-toast-icon { flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(38,166,154,.48); border: 1px solid rgba(180,255,245,.18); border-radius: 50%; color: #f2fffd; font-size: 14px; font-weight: bold; }
            .anlink-toast-content { flex: 1; color: #e8f6f3; font-size: 14px; line-height: 1.5; font-weight: 500; }
            .anlink-toast-content a { color: #26a69a; text-decoration: none; font-weight: 600; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
            .anlink-toast-content a:hover { border-bottom-color: #26a69a; }
            .anlink-toast-close { flex-shrink: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); border-radius: 50%; color: #c7d8d5; cursor: pointer; font-size: 16px; line-height: 1; transition: all 0.2s; padding: 0; }
            .anlink-toast-close:hover { background: rgba(255,255,255,.16); color: #fff; transform: scale(1.1); }
            @media (max-width: 680px) {
                .anlink-toast { left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right)); min-width: 0; max-width: none; width: auto; }
            }
        `);
        showToast.stylesReady = true;
    }

    // Create the new toast element
    const toast = document.createElement("div");
    toast.className = "anlink-toast";
    toast.style.top = `${20 + toasts.length * toastHeight}px`;

    // Infer toast type and icon from message content
    const lowerMsg = message.toString().toLowerCase();
    const iconMap = { error: ['❌', '#ef5350'], success: ['✅', '#66bb6a'], warning: ['⚠️', '#ffa726'], loading: ['⏳', '#42a5f5'], help: ['💡', '#ab47bc'], info: ['ℹ️', null] };
    const typeChecks = [
        [['error', 'failed', 'couldn\'t', 'could not'], 'error'],
        [['success', 'complete', 'copied', 'exported', 'sent to'], 'success'],
        [['warning', 'no episodes', 'not found', 'rate limited'], 'warning'],
        [['loading', 'fetching', 'extracting', 'processing'], 'loading'],
        [['install', 'mpv', 'handler'], 'help']
    ];
    const toastType = typeChecks.find(([keywords]) => keywords.some(k => lowerMsg.includes(k)))?.[1] || 'info';
    const [icon, borderColor] = iconMap[toastType];
    if (borderColor) toast.style.borderLeft = `4px solid ${borderColor}`;

    toast.innerHTML = `
        <div class="anlink-toast-icon">${icon}</div>
        <div class="anlink-toast-content">${message}</div>
        <button class="anlink-toast-close" aria-label="Close">×</button>
    `;

    AniLINKUI.root.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('.anlink-toast-close');
    const removeToast = () => {
        toast.classList.add('slide-out');
        setTimeout(() => {
            if (AniLINKUI.root.contains(toast)) toast.remove();
            toasts = toasts.filter(t => t !== toast);
            // Reposition remaining toasts
            toasts.forEach((t, index) => {
                t.style.top = `${20 + index * toastHeight}px`;
            });
        }, 300);
    };

    closeBtn.addEventListener('click', removeToast);

    // Add the new toast to the list
    toasts.push(toast);

    // Auto-remove after delay (or dont remove if duration is 0)
    if (duration > 0) {
        setTimeout(() => removeToast(), duration);
    }

    // Limit the number of toasts to maxToasts
    if (toasts.length > maxToasts) {
        const oldestToast = toasts.shift();
        oldestToast.classList.add('slide-out');
        setTimeout(() => {
            if (AniLINKUI.root.contains(oldestToast)) oldestToast.remove();
        }, 300);

        // Reposition remaining toasts
        toasts.forEach((t, index) => {
            t.style.top = `${20 + index * toastHeight}px`;
        });
    }
}

// On overlay open, show a help link for mpv-handler if not detected
function showMPVHandlerHelp() {
    showToast('To play directly in MPV, install <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a> and reload this page.');
}

// Simple query selector shortcuts
const _$ = (s, p=document) => (p || document).querySelector(s);
const _$$ = (s, p=document) => (p || document).querySelectorAll(s);

/***********************************************************************
 * AniLINK UI Host - Shadow DOM for overlays and FAB
 ***********************************************************************/

const AniLINKUI = (() => {
    let host;
    let root;
    let activeView = 'downloader';
    let extractorOverlay;
    let downloaderOverlay;
    let fab;
    let styleNode;

    const ensure = () => {
        // If host was removed from DOM (e.g., SPA navigation), recreate everything
        if (!host?.isConnected || !root) {
            const preservedStyles = styleNode?.textContent || '';
            host = Object.assign(document.createElement('div'), { id: 'AniLINK_UIHost' });
            host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;';
            root = host.attachShadow({ mode: 'open' });
            styleNode = document.createElement('style');
            if (preservedStyles) styleNode.textContent = preservedStyles;
            root.appendChild(styleNode);
            document.body.appendChild(host);
            // Reset overlay references since old ones are now detached
            extractorOverlay = null;
            downloaderOverlay = null;
            fab = null;
        }
        return root;
    };

    const addStyle = css => { ensure(); styleNode.textContent += `\n${css}`; };
    const query = (selector, parent = root) => parent?.querySelector(selector);
    const queryAll = (selector, parent = root) => parent ? [...parent.querySelectorAll(selector)] : [];
    const setVisible = (element, visible) => {
        if (!element) return;
        element.classList.toggle('anlink-view-hidden', !visible);
        element.setAttribute('aria-hidden', String(!visible));
        syncPointerEvents();
    };
    const syncPointerEvents = () => {
        host && (host.style.pointerEvents = 'none');
    };
    const updateFab = () => {
        const downloader = typeof anilinkDownloader === 'undefined' ? null : anilinkDownloader;
        const extractorVisible = extractorOverlay && !extractorOverlay.classList.contains('anlink-view-hidden');
        const downloaderVisible = downloaderOverlay && !downloaderOverlay.classList.contains('anlink-view-hidden');
        const shouldShow = downloader?.settings?.fabAlwaysVisible !== false || extractorVisible || downloaderVisible;
        if (fab) fab.classList.toggle('anlink-fab-hidden', !shouldShow);
        if (fab) {
            const count = downloader?.activeTaskCount?.() || 0;
            fab.dataset.count = count || '';
            fab.querySelector('.anlink-fab-count').textContent = count || '';
        }
        syncPointerEvents();
    };
    const switchView = view => {
        ensure();
        activeView = view;
        if (!extractorOverlay && view === 'extractor') extractEpisodes();
        setVisible(extractorOverlay, view === 'extractor');
        setVisible(downloaderOverlay, view === 'downloader');
        fab?.classList.toggle('anlink-fab-downloader', view === 'downloader');
        fab?.setAttribute('aria-label', view === 'downloader' ? 'Open extractor' : 'Open downloads');
        if (fab) {
            fab.querySelector('.anlink-fab-icon').textContent = view === 'downloader' ? '←' : '⇩';
            fab.title = view === 'downloader' ? 'Open extractor' : 'Open downloads';
        }
        updateFab();
    };
    const createFab = () => {
        if (fab) return fab;
        fab = Object.assign(document.createElement('button'), {
            className: 'anlink-fab anlink-fab-hidden',
            type: 'button',
            title: 'Open AniLINK Extractor',
            innerHTML: '<span class="anlink-fab-icon">←</span><span class="anlink-fab-count"></span>'
        });
        fab.addEventListener('click', () => {
            if (activeView === 'downloader') switchView('extractor');
            else if (typeof anilinkDownloaderUI !== 'undefined') anilinkDownloaderUI.show();
        });
        root.appendChild(fab);
        return fab;
    };
    const mountExtractor = overlay => {
        ensure();
        extractorOverlay = overlay;
        root.appendChild(overlay);
        createFab();
        switchView('extractor');
    };
    const mountDownloader = overlay => {
        ensure();
        downloaderOverlay = overlay;
        root.appendChild(overlay);
        createFab();
        setVisible(downloaderOverlay, false);
    };
    const removeExtractor = () => {
        extractorOverlay?.remove();
        extractorOverlay = null;
        if (activeView === 'extractor') switchView('downloader');
    };
    const close = () => {
        if (activeView === 'extractor') setVisible(extractorOverlay, false);
        else setVisible(downloaderOverlay, false);
        updateFab();
    };
    const animateDrop = source => {
        if (!source || !fab) return;
        const from = source.getBoundingClientRect();
        const to = fab.getBoundingClientRect();
        const chip = Object.assign(document.createElement('span'), { className: 'anlink-fab-drop-chip', textContent: '⇩' });
        const deltaX = to.left + to.width / 2 - from.left - from.width / 2;
        const deltaY = to.top + to.height / 2 - from.top - from.height / 2;
        Object.assign(chip.style, { left: `${from.left + from.width / 2 - 12}px`, top: `${from.top + from.height / 2 - 12}px`, opacity: '1', transform: 'translate(0, 0) scale(1)' });
        root.appendChild(chip);
        const finish = () => chip.isConnected && chip.remove();
        const animate = () => {
            if (typeof chip.animate === 'function') {
                const animation = chip.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${deltaX}px, ${deltaY}px) scale(.25)`, opacity: .1 }
                ], { duration: 520, easing: 'cubic-bezier(.22,.8,.32,1)', fill: 'forwards' });
                animation.addEventListener('finish', finish, { once: true });
                animation.addEventListener('cancel', finish, { once: true });
            } else {
                chip.style.transition = 'transform .52s cubic-bezier(.22,.8,.32,1), opacity .52s ease';
                chip.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(.25)`;
                chip.style.opacity = '.1';
                setTimeout(finish, 540);
            }
        };
        requestAnimationFrame(animate);
    };

    addStyle(`
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        .anlink-view-hidden { opacity: 0 !important; transform: translateY(18px) scale(.985) !important; pointer-events: none !important; visibility: hidden !important; }
        .anlink-fab { position: fixed; right: var(--anlink-fab-right, 26px); bottom: var(--anlink-fab-bottom, 26px); width: var(--anlink-fab-size, 58px); height: var(--anlink-fab-size, 58px); border: 1px solid #26a69a; border-radius: 50%; display: grid; place-items: center; background: rgba(38,166,154,.12); color: #7ce4d8; box-shadow: 0 12px 32px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.12) inset; cursor: pointer; pointer-events: auto; transition: opacity .28s, transform .28s, background .28s; z-index: 1001; }
        .anlink-fab:hover { transform: translateY(-3px) scale(1.04); color: #fff; background: linear-gradient(135deg, #31c7b8, #168d81); }
        .anlink-fab-hidden { opacity: 0; transform: scale(.65); pointer-events: none; }
        .anlink-fab-icon { font: 700 30px/1 system-ui, sans-serif; transform: translateY(-1px); }
        .anlink-fab-count { position: absolute; top: -3px; right: -2px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #ffca28; color: #1c2524; font: 700 11px/20px system-ui, sans-serif; }
        .anlink-fab-count:empty { display: none; }
        .anlink-fab-drop-chip { position: fixed; z-index: 2147483647; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #ffca28; color: #26302f; font: 700 15px/1 system-ui, sans-serif; pointer-events: none; box-shadow: 0 5px 16px rgba(0,0,0,.35); will-change: transform, opacity; }
        @media (max-width: 680px) {
            .anlink-fab { right: var(--anlink-fab-right, max(12px, env(safe-area-inset-right))); bottom: var(--anlink-fab-bottom, max(12px, env(safe-area-inset-bottom))); width: var(--anlink-fab-size, 52px); height: var(--anlink-fab-size, 52px); }
            .anlink-fab-icon { font-size: 27px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
    `);

    const bootstrap = () => { ensure(); createFab(); updateFab(); };
    return { ensure, addStyle, query, queryAll, mountExtractor, mountDownloader, switchView, removeExtractor, close, updateFab, animateDrop, bootstrap, get root() { return ensure(); } };
})();


// =============== DOWNLOADER ================= \\
// TODO: Improve download progress bar for non m3u8 downloads (mp4 has very less parts, and due to that progressbar jumps in big steps with slow updates, which is not a good UX)
const dlUtils = {
    anlinkGMRequest: (url, options = {}) => {
        const requestFn = typeof GM_xmlhttpRequest === 'function'
            ? GM_xmlhttpRequest
            : typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null;
        if (!requestFn) throw new Error('No GM cross-origin request API is available.');

        let request;
        let settled = false;
        const promise = new Promise((resolve, reject) => {
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            try {
                request = requestFn({
                    method: options.method || 'GET',
                    url,
                    headers: options.headers || {},
                    responseType: options.responseType || 'arraybuffer',
                    timeout: options.timeout || 0,
                    anonymous: options.anonymous,
                    onprogress: options.onprogress,
                    onload: response => finish(resolve, {
                        status: response.status,
                        statusText: response.statusText,
                        response: response.response,
                        responseHeaders: response.responseHeaders || '',
                        finalUrl: response.finalUrl || url
                    }),
                    onerror: response => finish(reject, new Error(`GM request failed for ${url} (${response.status || 'network error'})`)),
                    ontimeout: () => finish(reject, new Error(`GM request timed out for ${url}`)),
                    onabort: () => finish(reject, Object.assign(new Error('GM request aborted'), { name: 'AbortError' }))
                });
            } catch (error) {
                finish(reject, error);
            }
        });

        return { promise, abort: () => request?.abort?.() };
    },

    anlinkParseHeaders: (rawHeaders = '') => {
        const headers = new Headers();
        for (const line of rawHeaders.split(/\r?\n/)) {
            const separator = line.indexOf(':');
            if (separator > 0) headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
        }
        return headers;
    },

    anlinkFormatBytes: (bytes) => {
        if (!Number.isFinite(bytes)) return 'N/A';
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let unit = -1;
        do { value /= 1024; unit++; } while (value >= 1024 && unit < units.length - 1);
        return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
    },

    anlinkFormatRate: (bytesPerSecond) => { return `${dlUtils.anlinkFormatBytes(bytesPerSecond)}/s`; },

    anlinkFormatDuration: (milliseconds) => {
        if (!Number.isFinite(milliseconds)) return 'N/A';
        const seconds = Math.max(0, Math.round(milliseconds / 1000));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
    },

    anlinkSafeFilename: (filename) => {
        const normalized = String(filename || 'download').normalize('NFKC');
        const extensionMatch = normalized.match(/(\.[A-Za-z0-9]{1,8})$/);
        const extension = extensionMatch?.[1] || '';
        let stem = extension ? normalized.slice(0, -extension.length) : normalized;
        stem = stem.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+/g, ' ').replace(/^\.+/, '').trim().slice(0, 170);
        if (!stem || /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `download-${Date.now()}`;
        return `${stem}${extension}`;
    },

    anlinkSafeDirectoryName: (directoryName) => String(directoryName || '').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120),

    anlinkEscapeHtml: (value) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),

    anlinkNewId: () => {
        return globalThis.crypto?.randomUUID?.() || `anlink-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    },

    assertSupportedDownloadUrl: (url) => {
        if (UNSUPPORTED_DOWNLOAD_URL_PATTERNS.some(pattern => pattern.test(String(url)))) {
            const match = url.match(/^https?:\/\/([^\/]+)\//);
            throw new Error(`This link (${match ? match[1] : url}) is known to not be supported, try again with another source.`);
        }
    },
}

class DownloadTask {
    constructor(controller, filename, anime, url, options) {
        this._controller = controller;
        this.id = dlUtils.anlinkNewId();
        this.filename = dlUtils.anlinkSafeFilename(filename);
        this.anime = anime || '';
        this.url = url;
        this.options = options;
        this._status = 'queued';
        this._listeners = new Map();
        this._runPromise = null;
        this._paused = false;
        this._cancelled = false;
        this._resumeResolvers = [];
        this._activeRequests = new Set();
        this._pendingHlsWrites = new Map();
        this._nextHlsWrite = 0;
        this._hlsOutputOffset = 0;
        this._writeChain = Promise.resolve();
        this._throttleChain = Promise.resolve();
        this._rateState = { tokens: options.speedLimitBps, timestamp: performance.now() };
        this._samples = [{ timestamp: performance.now(), bytes: 0 }];
        this._stats = {
            bytesWritten: 0,
            bytesReceived: 0,
            totalSize: 0,
            totalSegments: 0,
            completedSegments: 0,
            activeThreads: 0,
            threads: options.threads,
            retries: 0,
            errors: [],
            speedBps: 0,
            speedLimitBps: options.speedLimitBps,
            rangeSupported: null,
            phase: 'main',
            trackIndex: 0,
            trackTotal: 0,
            trackLabel: '',
            format: options.format,
            contentType: '',
            startedAt: null,
            finishedAt: null,
            lastProgressAt: null
        };
        this._logs = [];
        this._log('Task created');
    }

    get status() { return this._status; }
    get filepath() { return this._filepath || `${this._controller.directoryName || 'selected directory'}\\${this.filename}`; }
    get totalSize() { return this._stats.totalSize; }
    get filesize() { return dlUtils.anlinkFormatBytes(this._stats.bytesWritten); }
    get totalsize() { return this._stats.totalSize ? dlUtils.anlinkFormatBytes(this._stats.totalSize) : '?'; }
    get filesegments() { return this._stats.completedSegments; }
    get totalsegments() { return this._stats.totalSegments; }
    get speedBps() { return this._stats.speedBps; }
    get speed() { return dlUtils.anlinkFormatRate(this._stats.speedBps); }
    get eta() { return this._stats.speedBps && this._stats.totalSize ? dlUtils.anlinkFormatDuration((this._stats.totalSize - this._stats.bytesWritten) / this._stats.speedBps * 1000) : 'N/A'; }
    get stats() { return this._controller.getTaskStats(this.id); }
    get error() { return this._stats.error || null; }
    get logs() { return [...this._logs]; }

    _log(message, level = 'info') {
        this._logs.push({ at: Date.now(), level, message: String(message) });
        if (this._logs.length > 200) this._logs.splice(0, this._logs.length - 200);
        this._emit('log', this._logs[this._logs.length - 1]);
    }

    on(event, listener) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(listener);
        return () => this._listeners.get(event)?.delete(listener);
    }

    pause() { return this._controller.pauseTask(this.id); }
    resume() { return this._controller.resumeTask(this.id); }
    cancel() { return this._controller.cancelTask(this.id); }
    setSpeedLimit(speedLimitBps) { return this._controller.setSpeedLimit(this.id, speedLimitBps); }
    setThreads(threads) { return this._controller.setThreads(this.id, threads); }
    start(force = false) { return this._controller.startTask(this.id, { force }); }

    _setStatus(status) {
        this._status = status;
        this._log(`Status: ${status}`);
        this._emit('status', this.stats);
    }

    _emit(event, value) {
        for (const listener of this._listeners.get(event) || []) {
            try { listener(value, this); } catch (error) { console.error('[AniLINK Downloader] Task listener failed:', error); }
        }
    }

    _waitForResume() {
        if (!this._paused) return Promise.resolve();
        return new Promise(resolve => this._resumeResolvers.push(resolve));
    }

    _resume() {
        this._paused = false;
        for (const resolve of this._resumeResolvers.splice(0)) resolve();
    }

    _wake() {
        for (const resolve of this._resumeResolvers.splice(0)) resolve();
    }
}

const DOWNLOADER_SITE_SETTING_KEYS = ['maxConcurrentTasks', 'defaultThreads', 'defaultSpeedLimitBps'];
const DOWNLOADER_GLOBAL_SETTING_KEYS = ['preferredResolution', 'notifications', 'overwrite', 'historyLimit', 'historyCollapsed', 'subtitleDirectory', 'fabAlwaysVisible'];

class Downloader {
    static formats = new Map();
    #dirHandle = null;
    #fallbackMode = false;
    #tasks = new Map();
    #keyCache = new Map();
    #queue = [];
    #activeTasks = new Set();
    #settings;
    #storageKey;
    #globalStorageKey;
    #history = [];
    #listeners = new Map();

    constructor() {
        // Shared mental context: Keeping this isolated allows seamless UI integration later.
        this.#storageKey = `anilink_downloader_${location.host}`;
        this.#globalStorageKey = 'anilink_downloader_global_settings';
        const store = this.#loadStore();
        this.#settings = store.settings;
        this.#history = store.history;
        this._ready = this.init();
    }

    /**
     * Initializes the downloader and dynamically loads required dependencies via GM_xhr
     * to safely bypass the host site's Content Security Policy (CSP).
     */
    async init() {
        if (this._initialized) return this;
        if (!window.showDirectoryPicker && !unsafeWindow?.showDirectoryPicker) console.warn('[AniLINK Downloader] File System Access API is unavailable.');
        
        // Example of CSP-safe dependency injection (e.g., if you need a lightweight muxer later)
        // const depUrl = "https://cdn.jsdelivr.net/npm/some-pure-js-lib.js";
        // const scriptText = await this.#fetchXHR(depUrl, { responseType: 'text' });
        // this.#dependencies.SomeLib = new Function(`${scriptText}; return SomeLib;`)();
        
        this._initialized = true;
        return this;
    }

    get directoryName() { return this.#dirHandle?.name || ''; }
    get tasks() { return [...this.#tasks.values()]; }
    get history() { return [...this.#history]; }
    get settings() { return { ...this.#settings }; }
    get hasActiveTasks() { return this.#activeTasks.size > 0 || this.#queue.length > 0; }

    on(event, listener) {
        if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
        this.#listeners.get(event).add(listener);
        return () => this.#listeners.get(event)?.delete(listener);
    }

    #emit(event, value) {
        for (const listener of this.#listeners.get(event) || []) {
            try { listener(value, this); } catch (error) { console.error('[AniLINK Downloader] Manager listener failed:', error); }
        }
    }

    #defaultSettings() {
        return {
            maxConcurrentTasks: 1,
            defaultThreads: 6,
            defaultSpeedLimitBps: Infinity,
            preferredResolution: 0,
            notifications: 'completed-and-failed',
            overwrite: true,
            historyLimit: 15,
            historyCollapsed: true,
            subtitleDirectory: '',
            fabAlwaysVisible: false
        };
    }

    #loadStore() {
        const defaults = this.#defaultSettings();
        try {
            const saved = JSON.parse(localStorage.getItem(this.#storageKey) || '{}');
            const localSettings = saved.settings || {};
            const globalSaved = GM_getValue(this.#globalStorageKey, null);
            const hasGlobalStore = globalSaved && typeof globalSaved === 'object' && Object.keys(globalSaved).length > 0;
            const globalSource = hasGlobalStore ? globalSaved : localSettings;
            const globalSettings = Object.fromEntries(DOWNLOADER_GLOBAL_SETTING_KEYS
                .filter(key => Object.prototype.hasOwnProperty.call(globalSource, key))
                .map(key => [key, globalSource[key]]));
            if (!Object.prototype.hasOwnProperty.call(globalSettings, 'preferredResolution')) {
                globalSettings.preferredResolution = Number(globalSaved?.preferredQuality ?? localSettings.preferredResolution ?? localSettings.preferredQuality) || 0;
            }
            const settings = {
                ...defaults,
                ...globalSettings,
                ...Object.fromEntries(DOWNLOADER_SITE_SETTING_KEYS
                    .filter(key => Object.prototype.hasOwnProperty.call(localSettings, key))
                    .map(key => [key, localSettings[key]]))
            };
            settings.preferredResolution = Math.max(0, Number(settings.preferredResolution) || 0);
            settings.historyLimit = Math.min(100, Math.max(1, Number(settings.historyLimit) || 15));
            settings.subtitleDirectory = dlUtils.anlinkSafeDirectoryName(settings.subtitleDirectory);
            settings.fabAlwaysVisible = settings.fabAlwaysVisible === true;
            if (!Number.isFinite(settings.defaultSpeedLimitBps) || settings.defaultSpeedLimitBps <= 0) settings.defaultSpeedLimitBps = Infinity;
            if (!hasGlobalStore) GM_setValue(this.#globalStorageKey, Object.fromEntries(DOWNLOADER_GLOBAL_SETTING_KEYS.map(key => [key, settings[key]])));
            const history = Array.isArray(saved.history) ? saved.history.map(item => ['queued', 'preparing', 'downloading', 'paused'].includes(item.status) ? { ...item, status: 'interrupted' } : item) : [];
            return { settings, history };
        } catch { return { settings: defaults, history: [] }; }
    }

    #saveStore(emit = true) {
        const historyLimit = Math.min(100, Math.max(1, Number(this.#settings.historyLimit) || 15));
        this.#history = this.#history.slice(0, historyLimit);
        localStorage.setItem(this.#storageKey, JSON.stringify({
            settings: Object.fromEntries(DOWNLOADER_SITE_SETTING_KEYS.map(key => [key, this.#settings[key]])),
            history: this.#history
        }));
        GM_setValue(this.#globalStorageKey, Object.fromEntries(DOWNLOADER_GLOBAL_SETTING_KEYS.map(key => [key, this.#settings[key]])));
        if (emit) this.#emit('change', this);
    }

    updateSettings(changes = {}) {
        const next = { ...this.#settings, ...changes };
        next.maxConcurrentTasks = Math.max(1, Math.floor(Number(next.maxConcurrentTasks) || 1));
        next.defaultThreads = Math.max(1, Math.floor(Number(next.defaultThreads) || 6));
        next.defaultSpeedLimitBps = next.defaultSpeedLimitBps === Infinity ? Infinity : Math.max(0, Number(next.defaultSpeedLimitBps) || 0) || Infinity;
        next.preferredResolution = Math.max(0, Number(next.preferredResolution) || 0);
        next.historyLimit = Math.min(100, Math.max(1, Math.floor(Number(next.historyLimit) || 15)));
        next.subtitleDirectory = dlUtils.anlinkSafeDirectoryName(next.subtitleDirectory);
        next.fabAlwaysVisible = next.fabAlwaysVisible === true;
        if (!['off', 'completed', 'completed-and-failed', 'all'].includes(next.notifications)) next.notifications = 'completed-and-failed';
        this.#settings = next;
        this.#saveStore();
        this.#emit('history', this);
        this.#pump();
        return this.settings;
    }

    clearHistory() {
        this.#history = [];
        this.#saveStore();
        this.#emit('history', this);
    }

    removeHistory(id) {
        this.#history = this.#history.filter(item => item.id !== id);
        this.#saveStore();
        this.#emit('history', this);
    }

    async retryHistory(id) {
        const record = this.#history.find(item => item.id === id);
        if (!record) throw new Error('Download history record not found.');
        if (!this.#dirHandle && !await this.setDirectory()) return null;
        const task = this.addTask(record.filename, record.anime, record.url, {
            format: record.format, quality: record.quality, threads: record.threads,
            speedLimitBps: record.speedLimitBps, referer: record.referer,
            preferredResolution: record.preferredResolution, subtitleDirectory: record.subtitleDirectory, tracks: record.tracks || []
        });
        task._historyId = record.id;
        this.#history = this.#history.filter(item => item.id !== record.id && item.id !== task.id);
        this.#saveStore(false);
        task.start().catch(() => { });
        return task;
    }

    hasVisibleState() { return this.hasActiveTasks || this.#history.length > 0; }
    activeTaskCount() { return this.#activeTasks.size + this.#queue.length; }

    static registerFormat(name, handler) {
        if (!name || typeof handler !== 'function') throw new TypeError('A format name and handler function are required.');
        Downloader.formats.set(name.toLowerCase().replace(/^\./, ''), handler);
    }

    getFormatContext(taskId) {
        const task = this.#requireTask(taskId);
        return Object.freeze({
            task,
            request: (url, options) => this.#requestWithRetry(task, url, options),
            fetchText: url => this.#fetchText(task, url),
            writeAt: (position, data) => this.#writeAt(task, position, data),
            throttle: bytes => this.#throttle(task, bytes),
            recordBytes: (written, received = written) => this.#recordBytes(task, written, received),
            setTotalSize: totalSize => { task._stats.totalSize = Math.max(0, Number(totalSize) || 0); },
            setTotalSegments: totalSegments => { task._stats.totalSegments = Math.max(0, Number(totalSegments) || 0); },
            setStatus: status => task._setStatus(status)
        });
    }

    /**
     * Prompts the user to select an output directory.
     * Must be called via a transient user activation (e.g., button click).
     */
    setDirectory() {
        if (this.#dirHandle) return Promise.resolve(true);
        if (this.#fallbackMode) return Promise.resolve(true);
        const picker = window.showDirectoryPicker || unsafeWindow?.showDirectoryPicker;
        if (!picker) {
            this.#fallbackMode = true;
            showToast('Direct folder access is unavailable here. Browser download fallback is enabled.');
            return Promise.resolve(true);
        }
         // Wrap in try/catch because some mobile browsers throw synchronously
        try {
            return picker.call(window, { mode: 'readwrite' })
                .then(handle => { this.#dirHandle = handle; return true; })
                .catch(error => {
                    if (error?.name === 'AbortError') {
                        showToast('Direct folder access is unavailable here. Browser download fallback is enabled.');
                        this.#fallbackMode = true;
                        return Promise.resolve(true);
                    }
                    throw error;
                });
        } catch (error) {
            // Synchronous failure (common on mobile browsers that expose the API but block it)
            console.warn('[AniLINK] Directory picker unavailable:', error);
            this.#fallbackMode = true;
            showToast('Direct folder access is unavailable here. Browser download fallback is enabled.');
            return Promise.resolve(true);
        }
    }

    addTask(filename, anime, url, options = {}) {
        if (!url) throw new TypeError('A download URL is required.');
        const inferredFormat = options.format || options.type || new URL(url).pathname.split('.').pop() || 'bin';
        const normalizedOptions = {
            threads: Math.max(1, Math.floor(options.threads ?? this.#settings.defaultThreads)),
            segmentSize: Math.max(256 * 1024, Math.floor(options.segmentSize ?? 8 * 1024 * 1024)),
            speedLimitBps: options.speedLimitBps === Infinity ? Infinity : Number.isFinite(options.speedLimitBps) && options.speedLimitBps > 0 ? options.speedLimitBps : this.#settings.defaultSpeedLimitBps,
            headers: { ...(options.headers || {}) },
            referer: options.referer,
            origin: options.origin,
            anonymous: options.anonymous,
            timeout: options.timeout ?? 30000,
            retries: Math.max(0, Math.floor(options.retries ?? 3)),
            overwrite: options.overwrite ?? this.#settings.overwrite,
            format: String(inferredFormat).toLowerCase().replace(/^\./, '').split('?')[0],
            allowBufferedFallback: options.allowBufferedFallback === true,
            allowLive: options.allowLive === true,
            quality: options.quality,
            preferredResolution: Math.max(0, Number(options.preferredResolution ?? this.#settings.preferredResolution) || 0),
            subtitleDirectory: dlUtils.anlinkSafeDirectoryName(options.subtitleDirectory ?? this.#settings.subtitleDirectory),
            tracks: Array.isArray(options.tracks) ? options.tracks.map(track => ({ ...track })) : []
        };
        const task = new DownloadTask(this, filename, anime, url, normalizedOptions);
        this.#tasks.set(task.id, task);
        task.on('status', () => this.#persistTask(task));
        task.on('status', () => this.#settings.notifications === 'all' && !['completed', 'failed'].includes(task.status) && this.#notifyTask(task));
        task.on('progress', () => this.#emit('change', this));
        this.#persistTask(task);
        return task;
    }

    getTask(taskId) { return this.#tasks.get(typeof taskId === 'string' ? taskId : taskId?.id); }

    removeTask(taskId) {
        const task = this.#requireTask(taskId);
        if (['downloading', 'preparing', 'paused'].includes(task.status)) throw new Error('Pause or cancel the task before removing it.');
        return this.#tasks.delete(task.id);
    }

    startTask(taskId, { force = false } = {}) {
        const task = this.#requireTask(taskId);
        if (task._runPromise) {
            if (force && task.status === 'queued') {
                this.#forceStart(task);
            } else if (task.status === 'queued') {
                this.#queue = [task, ...this.#queue.filter(item => item !== task)];
                this.#pump();
            }
            return task._runPromise;
        }
        const runPromise = new Promise((resolve, reject) => {
            task._resolveRun = resolve;
            task._rejectRun = reject;
            if (!this.#queue.includes(task)) this.#queue.push(task);
            this.#persistTask(task);
        });
        task._runPromise = runPromise;
        if (force) this.#forceStart(task); else this.#pump();
        runPromise.catch(() => {}); // Suppress console noise if caller ignores the promise
        return runPromise;
    }

    pauseTask(taskId) {
        const task = this.#requireTask(taskId);
        if (!['preparing', 'downloading'].includes(task.status)) return false;
        task._paused = true;
        task._setStatus('paused');
        for (const request of task._activeRequests) request.abort();
        return true;
    }

    setSpeedLimit(taskId, speedLimitBps) {
        const task = this.#requireTask(taskId);
        if (speedLimitBps !== Infinity && (!Number.isFinite(speedLimitBps) || speedLimitBps <= 0)) throw new RangeError('Speed limit must be a positive number or Infinity.');
        task.options.speedLimitBps = speedLimitBps;
        task._stats.speedLimitBps = speedLimitBps;
        task._rateState.tokens = Math.min(task._rateState.tokens, speedLimitBps);
        task._emit('status', task.stats);
        return speedLimitBps;
    }

    setThreads(taskId, threads) {
        const task = this.#requireTask(taskId);
        if (task.status !== 'queued') throw new Error('Thread count can only be changed before a task starts.');
        task.options.threads = Math.max(1, Math.floor(threads));
        task._stats.threads = task.options.threads;
        return task.options.threads;
    }

    resumeTask(taskId) {
        const task = this.#requireTask(taskId);
        if (task.status !== 'paused') return false;
        task._resume();
        task._setStatus('downloading');
        return true;
    }

    cancelTask(taskId) {
        const task = this.#requireTask(taskId);
        if (['completed', 'failed', 'cancelled'].includes(task.status)) return false;
        task._cancelled = true;
        task._paused = false;
        task._wake();
        for (const request of task._activeRequests) request.abort();
        task._setStatus('cancelled');
        this.#queue = this.#queue.filter(item => item !== task);
        if (!this.#activeTasks.has(task)) this.#recordHistory(task);
        this.#finishQueuedTask(task, Object.assign(new Error('Download cancelled'), { name: 'AbortError' }));
        return true;
    }

    getTaskStats(taskId) {
        const task = this.#requireTask(taskId);
        const now = performance.now();
        const elapsedMs = task._stats.startedAt ? (task._stats.finishedAt || Date.now()) - task._stats.startedAt : 0;
        return {
            id: task.id, filename: task.filename, anime: task.anime, url: task.url, status: task.status,
            ...task._stats, elapsedMs, elapsed: dlUtils.anlinkFormatDuration(elapsedMs), filesize: task.filesize,
            totalsize: task.totalsize, speed: task.speed, eta: task.eta, activeRequests: task._activeRequests.size,
            paused: task._paused, cancelled: task._cancelled, now
        };
    }

    #requireTask(taskId) {
        const task = this.getTask(taskId);
        if (!task) throw new Error(`Unknown download task: ${taskId?.id || taskId}`);
        return task;
    }

    async #run(task) {
        task._stats.startedAt = Date.now();
        task._setStatus('preparing');
        try {
            if (!this.#dirHandle && !this.#fallbackMode) throw new Error('Select an output directory before starting a download.');
            dlUtils.assertSupportedDownloadUrl(task.url);
            await this.#openWriter(task);
            task._log(`Writing partial file: ${task._partialFilename}`);
            if (Downloader.formats.has(task.options.format)) await Downloader.formats.get(task.options.format)(task, this.getFormatContext(task));
            else if (['m3u8', 'hls'].includes(task.options.format) || /\.m3u8(?:$|\?)/i.test(task.url)) await this.#runHls(task);
            else if (task.options.format === 'mpd' || /\.mpd(?:$|\?)/i.test(task.url)) throw new Error('DASH (.mpd) is not implemented yet; register a format handler before starting this task.');
            else await this.#runDirect(task);
            if (task._cancelled) throw Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
            await this.#closeWriter(task);
            await this.#finalizeFile(task);
            await this.#downloadTracks(task);
            task._stats.finishedAt = Date.now();
            task._setStatus('completed');
            task._emit('complete', task.stats);
            this.#recordHistory(task);
            return task;
        } catch (error) {
            if (task._cancelled || error?.name === 'AbortError' && task.status === 'cancelled') {
                task._stats.error = 'Download cancelled';
                task._stats.finishedAt = Date.now();
                task._setStatus('cancelled');
                task._log(task._partialFilename ? `Partial file retained: ${task.filepath}` : 'Download cancelled before a file was finalized.', 'warning');
                this.#recordHistory(task);
            } else {
                task._stats.error = error.message || String(error);
                task._stats.errors.push(task._stats.error);
                task._stats.finishedAt = Date.now();
                task._setStatus('failed');
                await this.#closeWriter(task);
                await this.#discardPartialFile(task);
                task._log(task._partialFilename ? `Partial file could not be removed: ${task.filepath}` : `Failed download; partial file removed or no file was created: ${task._stats.error}`, 'error');
                task._emit('error', error);
                this.#recordHistory(task);
            }
            throw error;
        } finally {
            await this.#closeWriter(task);
            task._emit('settled', task);
        }
    }

    clearTask(taskId) {
        const task = this.#requireTask(taskId);
        if (['preparing', 'downloading', 'paused'].includes(task.status)) {
            const unsubscribe = task.on('settled', () => { unsubscribe(); this.#tasks.delete(task.id); this.#emit('change', this); });
            task.cancel();
            return true;
        }
        if (task.status === 'queued') task.cancel();
        this.#tasks.delete(task.id);
        this.#emit('change', this);
        return true;
    }

    #finishQueuedTask(task, error) {
        if (!task._resolveRun) return;
        if (error) task._rejectRun(error); else task._resolveRun(task);
        task._resolveRun = task._rejectRun = null;
        task._runPromise = null;
    }

    #persistTask(task) {
        const historyId = task._historyId || task.id;
        const record = {
            id: historyId, filename: task.filename, partialFilename: task._partialFilename || '', anime: task.anime, url: task.url, status: task.status,
            format: task.options.format, quality: task.options.quality || '', threads: task.options.threads,
            preferredResolution: task.options.preferredResolution, subtitleDirectory: task.options.subtitleDirectory, tracks: task.options.tracks, speedLimitBps: task.options.speedLimitBps,
            referer: task.options.referer || '', logs: task.logs, stats: { ...task._stats }, updatedAt: Date.now()
        };
        this.#history = this.#history.filter(item => item.id !== historyId);
        if (!['completed', 'failed', 'cancelled'].includes(task.status)) this.#history.push(record);
        this.#history.sort((a, b) => b.updatedAt - a.updatedAt);
        this.#saveStore();
        this.#emit('history', this);
    }

    #recordHistory(task) {
        const record = {
            id: task._historyId || task.id, filename: task.filename, partialFilename: task._partialFilename || '', anime: task.anime, url: task.url, status: task.status,
            format: task.options.format, quality: task.options.quality || '', threads: task.options.threads,
            preferredResolution: task.options.preferredResolution, subtitleDirectory: task.options.subtitleDirectory, tracks: task.options.tracks, speedLimitBps: task.options.speedLimitBps,
            referer: task.options.referer || '', logs: task.logs, stats: { ...task._stats }, updatedAt: Date.now()
        };
        this.#history = this.#history.filter(item => item.id !== record.id);
        this.#history.push(record);
        this.#history.sort((a, b) => b.updatedAt - a.updatedAt);
        this.#saveStore();
        this.#emit('history', this);
        this.#notifyTask(task);
    }

    #notifyTask(task) {
        const preference = this.#settings.notifications;
        const shouldNotify = preference === 'all' || preference === 'completed' && task.status === 'completed' || preference === 'completed-and-failed' && ['completed', 'failed'].includes(task.status);
        const message = task.status === 'completed' ? `${task.filename} finished.` : task.status === 'failed' ? `${task.filename} failed: ${task.error || 'unknown error'}` : `${task.filename}: ${task.status}.`;
        if (task.status === 'failed') showToast(`Download failed: ${dlUtils.anlinkEscapeHtml(task.filename)} — ${dlUtils.anlinkEscapeHtml(task.error || 'unknown error')}`);
        if (!shouldNotify) return;
        if (typeof GM_notification === 'function') GM_notification({ title: 'AniLINK Downloader', text: message, timeout: 5000 });
        else showToast(message);
    }

    #launchTask(task) {
        this.#activeTasks.add(task);
        this.#run(task).then(task._resolveRun, task._rejectRun).finally(() => {
            task._resolveRun = task._rejectRun = null;
            task._runPromise = null;
            this.#activeTasks.delete(task);
            this.#pump();
        });
    }

    #forceStart(task) {
        if (task.status !== 'queued' || !task._runPromise) return;
        this.#queue = this.#queue.filter(item => item !== task);
        this.#launchTask(task);
        this.#emit('change', this);
    }

    #pump() {
        while (this.#activeTasks.size < this.#settings.maxConcurrentTasks && this.#queue.length) {
            const task = this.#queue.shift();
            if (task._cancelled) { this.#finishQueuedTask(task, new Error('Download cancelled')); continue; }
            this.#launchTask(task);
        }
        this.#emit('change', this);
    }

    async #openWriter(task) {
        if (!this.#dirHandle) {
            const filename = task.filename;
            task._partialFilename = filename.replace(/(\.[^.]+)?$/, '.partial$1');
            task._filepath = `browser downloads\\${filename}`;
            task._memoryParts = new Map();
            task._writer = {
                write: async command => {
                    if (command?.type !== 'write') throw new Error('Unsupported fallback writer command.');
                    task._memoryParts.set(command.position, command.data instanceof Uint8Array ? command.data : new Uint8Array(command.data));
                },
                close: async () => { }
            };
            task._log('Using browser download fallback; no local partial file can be retained.', 'warning');
            return;
        }
        let filename = task.filename;
        if (!task.options.overwrite) {
            const extension = filename.match(/\.[^.]+$/)?.[0] || '';
            const stem = extension ? filename.slice(0, -extension.length) : filename;
            for (let suffix = 0; ; suffix++) {
                const candidate = `${stem}${suffix ? ` (${suffix})` : ''}${extension}`;
                try { await this.#dirHandle.getFileHandle(candidate); } catch { filename = candidate; break; }
            }
            task.filename = filename;
        }
        const extension = filename.match(/\.[^.]+$/)?.[0] || '';
        let stem = extension ? filename.slice(0, -extension.length) : filename;
        let partialFilename = `${stem}.partial${extension}`;
        let fileHandle;
        try {
            fileHandle = await this.#dirHandle.getFileHandle(partialFilename, { create: true });
        } catch (error) {
            const fallbackStem = `AniLINK-${Date.now()}-${task.id.slice(0, 8)}`;
            stem = fallbackStem;
            filename = `${fallbackStem}${extension}`;
            partialFilename = `${fallbackStem}.partial${extension}`;
            task.filename = filename;
            task._log(`Filename rejected; using ${partialFilename}: ${error.message || error}`, 'warning');
            fileHandle = await this.#dirHandle.getFileHandle(partialFilename, { create: true });
        }
        task._fileHandle = fileHandle;
        task._partialFilename = partialFilename;
        task._filepath = `${this.#dirHandle.name}\\${partialFilename}`;
        task._writer = await fileHandle.createWritable({ keepExistingData: false });
        task._log(`Opened ${partialFilename}`);
    }

    async #finalizeFile(task) {
        if (!this.#dirHandle) {
            const parts = [...(task._memoryParts || new Map()).entries()]
                .sort(([first], [second]) => first - second)
                .map(([, bytes]) => bytes);
            const blob = new Blob(parts, { type: task._stats.contentType || 'application/octet-stream' });
            await this.#saveBlob(task, blob, task.filename);
            task._memoryParts = null;
            task._partialFilename = '';
            task._filepath = `browser downloads\\${task.filename}`;
            task._log(`Saved ${task.filename} through the browser download manager.`);
            return;
        }
        const extension = task.filename.match(/\.[^.]+$/)?.[0] || '';
        const stem = extension ? task.filename.slice(0, -extension.length) : task.filename;
        const finalFilename = `${stem}${extension}`;
        const partialHandle = await this.#dirHandle.getFileHandle(task._partialFilename);
        const partialFile = await partialHandle.getFile();
        const finalHandle = await this.#dirHandle.getFileHandle(finalFilename, { create: true });
        const writer = await finalHandle.createWritable({ keepExistingData: false });
        try {
            const reader = partialFile.stream().getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await writer.write(value);
            }
        } finally {
            await writer.close();
        }
        await this.#dirHandle.removeEntry(task._partialFilename);
        task._partialFilename = '';
        task.filename = finalFilename;
        task._filepath = `${this.#dirHandle.name}\\${finalFilename}`;
        task._log(`Finalized ${finalFilename} -> ${task._filepath}`);
    }

    async #discardPartialFile(task) {
        if (!this.#dirHandle || !task._partialFilename) {
            task._partialFilename = '';
            return;
        }
        const partialFilename = task._partialFilename;
        try {
            await this.#dirHandle.removeEntry(partialFilename);
            task._partialFilename = '';
            task._filepath = `${this.#dirHandle.name}\\${task.filename}`;
            task._log(`Removed failed partial file: ${partialFilename}`, 'warning');
        } catch (error) {
            if (error?.name === 'NotFoundError') {
                task._partialFilename = '';
                return;
            }
            task._stats.errors.push(`Partial file cleanup failed: ${error.message || error}`);
            task._log(`Could not remove failed partial file ${partialFilename}: ${error.message || error}`, 'error');
            showToast(`Could not remove failed partial file: ${dlUtils.anlinkEscapeHtml(error.message || error)}`);
        }
    }

    gm_download_failed_toasted = false;
    async #saveBlob(task, blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        try {
            if (typeof GM.download === 'function') {    // using GM.download instead of GM_download as some browsers (like Via) have broken ghost GM_download implementation
                try {
                    await new Promise((resolve, reject) => {
                        let settled = false;
                        const finish = (callback, value) => { if (settled) return; settled = true; callback(value); };
                        try {
                            GM.download({
                                url: objectUrl,
                                name: filename,
                                saveAs: false,
                                onload: () => finish(resolve),
                                onerror: details => finish(reject, new Error(details?.error || details?.details || 'Browser download failed.'))
                            });
                        } catch (error) { finish(reject, error); }
                    });
                    return;
                } catch (error) { task._log(`GM.download fallback failed: ${error.message || error}`, 'warning'); }
            }

            if (!this.gm_download_failed_toasted) {
                showToast('Automatic download not supported in current browser; using browser download fallback.');
                this.gm_download_failed_toasted = true;
            }
            const anchor = Object.assign(document.createElement('a'), { href: objectUrl, download: filename });
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 60000); }
    }

    #trackExtension(track, response) {
        const contentType = response?.contentType || dlUtils.anlinkParseHeaders(response?.responseHeaders || '').get('content-type') || '';
        const urlExtension = new URL(track.file).pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
        if (/mpegurl/.test(contentType) && /^(caption|subtitle)s?/i.test(track.kind || '')) return '.vtt';
        if (urlExtension) return `.${urlExtension}`;
        if (/vtt|webvtt/.test(contentType)) return '.vtt';
        if (/subrip/.test(contentType)) return '.srt';
        if (/ttml|mpegtt/.test(contentType)) return '.ttml';
        if (/ass|ssa/.test(contentType)) return '.ass';
        if (/audio\/mpeg/.test(contentType)) return '.mp3';
        if (/audio\/mp4/.test(contentType)) return '.m4a';
        return /^(audio|music)/i.test(track.kind || '') ? '.bin' : '.vtt';
    }

    async #fetchTrack(task, track) {
        if (!/\.m3u8(?:$|\?)/i.test(track.file)) return this.#requestWithRetry(task, track.file, { responseType: 'arraybuffer' });
        const playlist = await this.#loadHlsPlaylist(task, track.file);
        const parsed = this.#parseHlsMediaPlaylist(playlist);
        if (!parsed.jobs.length) throw new Error(`Subtitle playlist has no segments: ${track.file}`);
        const pieces = [];
        let previousRangeEnd = 0;
        for (const job of parsed.jobs) {
            const byteRange = this.#parseHlsRange(job.range, previousRangeEnd);
            if (byteRange) previousRangeEnd = byteRange.end + 1;
            const response = await this.#requestWithRetry(task, new URL(job.uri, playlist.url).href, { headers: byteRange ? { Range: `bytes=${byteRange.start}-${byteRange.end}` } : {} });
            pieces.push(new Uint8Array(response.response || new ArrayBuffer(0)));
        }
        const textPieces = pieces.map(bytes => new TextDecoder().decode(bytes));
        const merged = textPieces.map((text, index) => index ? text.replace(/^\uFEFF?WEBVTT[^\r\n]*(?:\r?\n[^\r\n]*)*?\r?\n\r?\n/i, '') : text).join('\n');
        const text = /WEBVTT/i.test(merged) ? merged : `WEBVTT\n\n${merged}`;
        task._log(`Subtitle HLS details: playlist=${track.file}; segments=${parsed.jobs.length}; outputBytes=${text.length}`);
        return { response: new TextEncoder().encode(text), responseHeaders: 'Content-Type: text/vtt', contentType: 'text/vtt' };
    }

    async #downloadTracks(task) {
        const tracks = (task.options.tracks || []).filter(track => track?.file && (track.kind || 'caption'));
        if (!tracks.length) return;
        task._stats.phase = 'tracks';
        task._stats.trackIndex = 0;
        task._stats.trackTotal = tracks.length;
        task._stats.trackLabel = '';
        task._emit('progress', task.stats);
        task._log(`Episode tracks: ${tracks.map(track => `${track.kind || 'track'}=${track.label || 'unnamed'} -> ${track.file}`).join(' | ')}`);
        const extension = task.filename.match(/\.[^.]+$/)?.[0] || '';
        const stem = extension ? task.filename.slice(0, -extension.length) : task.filename;
        const usedNames = new Set();
        let directory;
        const subtitleDirectory = task.options.subtitleDirectory;
        if (this.#dirHandle) {
            try { directory = subtitleDirectory ? await this.#dirHandle.getDirectoryHandle(subtitleDirectory, { create: true }) : this.#dirHandle; }
            catch (error) {
                const message = `Could not create the subtitle folder${subtitleDirectory ? ` "${subtitleDirectory}"` : ''}: ${error.message || error}`;
                task._stats.errors.push(message);
                task._stats.phase = 'track-error';
                task._log(message, 'error');
                task._emit('progress', task.stats);
                showToast(dlUtils.anlinkEscapeHtml(message));
                return;
            }
        }
        for (const track of tracks) {
            task._stats.trackLabel = track.label || track.kind || 'track';
            task._emit('progress', task.stats);
            try {
                const response = await this.#fetchTrack(task, track);
                const label = dlUtils.anlinkSafeFilename(track.label || track.kind || 'track').replace(/\.[^.]+$/, '') || 'track';
                const trackExtension = this.#trackExtension(track, response);
                let trackFilename = `${stem}.${label}${trackExtension}`;
                for (let suffix = 2; usedNames.has(trackFilename); suffix++) trackFilename = `${stem}.${label} (${suffix})${trackExtension}`;
                usedNames.add(trackFilename);
                const bytes = response.response instanceof Uint8Array ? response.response : new Uint8Array(response.response || new ArrayBuffer(0));
                if (directory) {
                    const fileHandle = await directory.getFileHandle(trackFilename, { create: true });
                    const writer = await fileHandle.createWritable({ keepExistingData: false });
                    await writer.write(bytes);
                    await writer.close();
                } else await this.#saveBlob(task, new Blob([bytes], { type: dlUtils.anlinkParseHeaders(response.responseHeaders || '').get('content-type') || 'application/octet-stream' }), `${subtitleDirectory ? `${subtitleDirectory}/` : ''}${trackFilename}`);
                task._stats.trackIndex++;
                task._log(`Saved ${track.kind || 'track'} ${track.label || 'unnamed'} as ${subtitleDirectory ? `${subtitleDirectory}/` : ''}${trackFilename}`);
            } catch (error) {
                const message = `Track ${track.label || track.file} failed: ${error.message || error}`;
                task._stats.trackErrors = [...(task._stats.trackErrors || []), message];
                task._stats.errors.push(message);
                task._stats.trackIndex++;
                task._log(message, 'error');
                showToast(`Subtitle/track failed: ${dlUtils.anlinkEscapeHtml(message)}`);
            }
            task._emit('progress', task.stats);
        }
        task._stats.trackLabel = '';
        task._emit('progress', task.stats);
    }

    async #closeWriter(task) {
        if (!task._writer) return;
        try {
            await task._writeChain;
            await task._writer.close();
        } catch (error) {
            task._stats.errors.push(`File close failed: ${error.message || error}`);
        } finally {
            task._writer = null;
        }
    }

    #headers(task, extra = {}) {
        const headers = { ...task.options.headers };
        if (task.options.referer && !Object.keys(headers).some(key => key.toLowerCase() === 'referer')) headers.Referer = task.options.referer;
        if (task.options.origin && !Object.keys(headers).some(key => key.toLowerCase() === 'origin')) headers.Origin = task.options.origin;
        return { ...headers, ...extra };
    }

    #headerSummary(headers) {
        const entries = headers instanceof Headers ? [...headers.entries()] : [...dlUtils.anlinkParseHeaders(headers).entries()];
        return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(' | ') : '(none)';
    }

    async #request(task, url, options = {}) {
        await task._waitForResume();
        if (task._cancelled) throw Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
        const request = dlUtils.anlinkGMRequest(url, {
            method: options.method || 'GET', headers: this.#headers(task, options.headers),
            responseType: options.responseType || 'arraybuffer', timeout: options.timeout ?? task.options.timeout,
            anonymous: task.options.anonymous, onprogress: options.onprogress
        });
        task._activeRequests.add(request);
        try { return await request.promise; } finally { task._activeRequests.delete(request); }
    }

    async #requestWithRetry(task, url, options = {}) {
        for (let attempt = 0; ; attempt++) {
            try {
                task._log(`${options.method || 'GET'} ${url}${options.headers?.Range ? ` (${options.headers.Range})` : ''}`);
                const response = await this.#request(task, url, options);
                if (response.status >= 200 && response.status < 300) return response;
                const error = Object.assign(new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim()), { status: response.status });
                if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt >= task.options.retries) throw error;
                task._stats.retries++;
                const retryAfter = Number(response.responseHeaders?.match(/(?:^|\n)Retry-After:\s*(\d+)/i)?.[1] || 0);
                await sleep(Math.max(250, retryAfter * 1000 || 1000 * 2 ** attempt));
            } catch (error) {
                if (error.name === 'AbortError' && task._paused && !task._cancelled) { await task._waitForResume(); continue; }
                if (!error.status && attempt < task.options.retries && !task._cancelled) { task._stats.retries++; await sleep(1000 * 2 ** attempt); continue; }
                throw error;
            }
        }
    }

    async #writeAt(task, position, data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        task._log(`Queue write: ${bytes.byteLength} bytes at offset ${position}`);
        task._writeChain = task._writeChain.then(() => task._writer.write({ type: 'write', position, data: bytes }));
        await task._writeChain;
    }

    async #throttle(task, bytes) {
        if (!Number.isFinite(task.options.speedLimitBps)) return;
        task._throttleChain = task._throttleChain.then(async () => {
            const limit = task.options.speedLimitBps;
            const now = performance.now();
            task._rateState.tokens = Math.min(limit, task._rateState.tokens + (Math.max(0, now - task._rateState.timestamp) / 1000) * limit);
            if (task._rateState.tokens >= bytes) {
                task._rateState.tokens -= bytes;
                task._rateState.timestamp = now;
                return;
            }
            await new Promise(r => setTimeout(r, Math.max(10, ((bytes - task._rateState.tokens) / limit) * 1000)));
            task._rateState.tokens = 0; // Consume the deficit implicitly gained during timeout
            task._rateState.timestamp = performance.now();
        });
        return task._throttleChain;
    }

    #recordBytes(task, written, received = written) {
        task._stats.bytesWritten += written;
        task._stats.bytesReceived += received;
        task._stats.lastProgressAt = Date.now();
        const now = performance.now();
        task._samples.push({ timestamp: now, bytes: task._stats.bytesWritten });
        while (task._samples.length > 2 && now - task._samples[0].timestamp > 5000) task._samples.shift();
        const first = task._samples[0];
        task._stats.speedBps = (task._stats.bytesWritten - first.bytes) / Math.max((now - first.timestamp) / 1000, 0.001);
        task._emit('progress', task.stats);
    }

    async #runWorkers(task, jobs, workerFn) {
        task._stats.totalSegments = jobs.length;
        let nextJob = 0;
        const worker = async () => {
            task._stats.activeThreads++;
            try {
                while (true) {
                    await task._waitForResume();
                    if (task._cancelled) throw Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
                    const index = nextJob++;
                    if (index >= jobs.length) return;
                    while (true) {
                        try { await workerFn(jobs[index], index); task._stats.completedSegments++; task._emit('progress', task.stats); break; }
                        catch (error) {
                            if (error.name === 'AbortError' && task._paused && !task._cancelled) { await task._waitForResume(); continue; }
                            throw error;
                        }
                    }
                }
            } finally { task._stats.activeThreads--; }
        };
        const results = await Promise.allSettled(Array.from({ length: Math.min(task.options.threads, Math.max(1, jobs.length)) }, worker));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) { for (const request of task._activeRequests) request.abort(); throw failure.reason; }
    }

    async #probeDirect(task) {
        let head;
        try {
            head = await this.#requestWithRetry(task, task.url, { method: 'HEAD', responseType: 'text' });
            task._log(`Initial HEAD probe: status=${head.status}; headers=${this.#headerSummary(head.responseHeaders)}`);
        } catch (error) {
            task._log(`Initial HEAD probe unavailable: ${error.message || error}`, 'warning');
            head = null;
        }
        const headHeaders = head ? dlUtils.anlinkParseHeaders(head.responseHeaders) : new Headers();
        const headSize = Number(headHeaders.get('content-length')) || 0;
        const probe = await this.#requestWithRetry(task, task.url, { headers: { Range: 'bytes=0-0' } });
        const headers = dlUtils.anlinkParseHeaders(probe.responseHeaders);
        task._log(`Initial range probe: status=${probe.status}; bytes=${probe.response?.byteLength || 0}; headers=${this.#headerSummary(headers)}`);
        task._stats.contentType = headers.get('content-type') || headHeaders.get('content-type') || '';
        const range = headers.get('content-range')?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
        if (probe.status === 206 && range) {
            const totalSize = Number(range[3]) || headSize;
            if (!totalSize) throw new Error('The server returned a range response without a total size.');
            task._stats.totalSize = totalSize;
            task._stats.rangeSupported = true;
            task._log(`Direct stream details: contentType=${task._stats.contentType || 'unknown'}; totalSize=${totalSize}; rangeSupported=true`);
            return { firstByte: probe.response, totalSize };
        }
        const body = new Uint8Array(probe.response || new ArrayBuffer(0));
        const reportedSize = Number(headers.get('content-length')) || headSize;
        if (task.options.allowBufferedFallback && probe.status === 200 && body.length && (!reportedSize || body.length === reportedSize)) {
            task._stats.totalSize = body.length;
            task._stats.rangeSupported = false;
            task._stats.bufferedFallback = true;
            task._log(`Direct stream details: contentType=${task._stats.contentType || 'unknown'}; totalSize=${body.length}; rangeSupported=false; bufferedFallback=true`);
            return { buffered: body, totalSize: body.length };
        }
        throw new Error(`The server does not support byte ranges; direct pause/resume and multi-threading are unavailable for ${task.url}`);
    }

    async #runDirect(task) {
        const probe = await this.#probeDirect(task);
        task._setStatus('downloading');
        if (probe.buffered) {
            await this.#throttle(task, probe.buffered.byteLength);
            await this.#writeAt(task, 0, probe.buffered);
            this.#recordBytes(task, probe.buffered.byteLength);
            task._stats.totalSegments = task._stats.completedSegments = 1;
            return;
        }
        const firstByte = new Uint8Array(probe.firstByte);
        await this.#writeAt(task, 0, firstByte);
        this.#recordBytes(task, 1);
        const jobs = [];
        for (let start = 1; start < probe.totalSize; start += task.options.segmentSize) jobs.push({ start, end: Math.min(probe.totalSize - 1, start + task.options.segmentSize - 1) });
        await this.#runWorkers(task, jobs, async job => {
            const response = await this.#requestWithRetry(task, task.url, { headers: { Range: `bytes=${job.start}-${job.end}` } });
            const range = dlUtils.anlinkParseHeaders(response.responseHeaders).get('content-range');
            const match = range?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
            if (response.status !== 206 || !match || +match[1] !== job.start || +match[2] > job.end) throw new Error(`Invalid range response for bytes ${job.start}-${job.end}.`);
            const bytes = new Uint8Array(response.response);
            if (bytes.byteLength !== +match[2] - +match[1] + 1) throw new Error(`Incomplete range response for bytes ${job.start}-${job.end}.`);
            await this.#throttle(task, bytes.byteLength);
            await this.#writeAt(task, job.start, bytes);
            this.#recordBytes(task, bytes.byteLength);
        });
        task._stats.completedSegments++;
        task._stats.totalSegments++;
    }

    async #fetchText(task, url) {
        await task._waitForResume();
        const response = await GM_fetch(url, { headers: this.#headers(task) });
        if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
        const text = await response.text();
        task._log(`Text probe: status=${response.status}; bytes=${text.length}; contentType=${response.headers.get('content-type') || 'unknown'}; url=${response.url || url}`);
        return { text, url: response.url || url, headers: response.headers };
    }

    #parseHlsAttributes(value) {
        return Object.fromEntries([...value.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)].map(([, key, raw]) => [key, raw.replace(/^"|"$/g, '')]));
    }

    async #loadHlsPlaylist(task, url, depth = 0) {
        if (depth > 3) throw new Error('HLS master playlist nesting is too deep.');
        const loaded = await this.#fetchText(task, url);
        const lines = loaded.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const variants = [];
        const mediaTracks = [];
        for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
            const uri = lines.slice(i + 1).find(line => !line.startsWith('#'));
            if (uri) variants.push({ uri: new URL(uri, loaded.url).href, ...this.#parseHlsAttributes(lines[i].slice(18)) });
        } else if (lines[i].startsWith('#EXT-X-MEDIA:')) {
            const track = this.#parseHlsAttributes(lines[i].slice(13));
            if (track.URI) track.URI = new URL(track.URI, loaded.url).href;
            mediaTracks.push(track);
        }
        const describeVariant = variant => {
            const resolution = variant.RESOLUTION || 'unknown';
            const height = resolution.match(/x(\d+)$/i)?.[1] || variant.NAME?.match(/(\d{3,4})\s*p?/i)?.[1] || '?';
            return `${variant.NAME || 'unnamed'} ${resolution} (${height}p, ${variant.BANDWIDTH || '?'}bps) -> ${variant.uri}`;
        };
        if (variants.length || mediaTracks.length) {
            task._log(`HLS playlist details: variants=${variants.length}; mediaTracks=${mediaTracks.length}; url=${loaded.url}`);
            variants.forEach(variant => task._log(`HLS variant: ${describeVariant(variant)}`));
            mediaTracks.forEach(track => task._log(`HLS media track: type=${track.TYPE || 'unknown'}; group=${track['GROUP-ID'] || 'unknown'}; name=${track.NAME || 'unknown'}; language=${track.LANGUAGE || 'unknown'}; uri=${track.URI || '(in-band)'}`));
        }
        if (variants.length) {
            const requested = Number(task.options.preferredResolution);
            const withHeights = variants.map(variant => ({ ...variant, height: Number(variant.RESOLUTION?.match(/x(\d+)$/i)?.[1] || variant.NAME?.match(/(\d{3,4})\s*p?/i)?.[1]) || 0 }));
            withHeights.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0) || (Number(b.BANDWIDTH) || 0) - (Number(a.BANDWIDTH) || 0));
            const selected = requested > 0 ? [...withHeights].sort((a, b) => Math.abs(a.height - requested) - Math.abs(b.height - requested) || a.height - b.height || (Number(b.BANDWIDTH) || 0) - (Number(a.BANDWIDTH) || 0))[0] : withHeights[0];
            task._stats.probedResolutions = withHeights.map(variant => variant.height).filter(Boolean);
            task._log(`HLS selection: requested=${requested > 0 ? `${requested}p` : 'auto'}; selected=${selected.height ? `${selected.height}p` : selected.NAME || 'unknown'}; url=${selected.uri}`);
            return this.#loadHlsPlaylist(task, selected.uri, depth + 1);
        }
        task._log(`HLS media playlist: segments and encryption tags will be parsed from ${loaded.url}`);
        return { url: loaded.url, lines };
    }

    #parseHlsMediaPlaylist(playlist) {
        let mediaSequence = 0;
        let currentKey = { METHOD: 'NONE' };
        let pendingRange = null;
        const jobs = [];
        let ended = false;
        for (const line of playlist.lines) {
            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) mediaSequence = Number(line.slice(22)) || 0;
            else if (line.startsWith('#EXT-X-ENDLIST')) ended = true;
            else if (line.startsWith('#EXT-X-KEY:')) currentKey = this.#parseHlsAttributes(line.slice(11));
            else if (line.startsWith('#EXT-X-MAP:')) { const attrs = this.#parseHlsAttributes(line.slice(11)); jobs.push({ kind: 'map', uri: attrs.URI, range: attrs.BYTERANGE, sequence: mediaSequence, key: { ...currentKey } }); }
            else if (line.startsWith('#EXT-X-BYTERANGE:')) pendingRange = line.slice(17);
            else if (!line.startsWith('#')) { jobs.push({ kind: 'segment', uri: line, range: pendingRange, sequence: mediaSequence++, key: { ...currentKey } }); pendingRange = null; }
        }
        return { jobs, ended };
    }

    #parseHlsRange(value, previousEnd = 0) {
        if (!value) return null;
        const [length, offset] = value.split('@').map(Number);
        return { start: Number.isFinite(offset) ? offset : previousEnd, end: (Number.isFinite(offset) ? offset : previousEnd) + length - 1 };
    }

    #hlsIv(value, sequence) {
        if (value) { const hex = value.replace(/^0x/i, '').padStart(32, '0').slice(-32); return Uint8Array.from(hex.match(/.{2}/g).map(byte => parseInt(byte, 16))); }
        const iv = new Uint8Array(16);
        let number = sequence;
        for (let i = 15; i >= 0; i--) { iv[i] = number & 255; number = Math.floor(number / 256); }
        return iv;
    }

    async #hlsKey(task, key, baseUrl) {
        if (!key || key.METHOD === 'NONE') return null;
        if (key.METHOD !== 'AES-128') throw new Error(`Unsupported HLS encryption method: ${key.METHOD}`);
        if (!key.URI) throw new Error('HLS AES-128 key has no URI.');
        const keyUrl = new URL(key.URI, baseUrl).href;
        if (!this.#keyCache.has(keyUrl)) {
            const response = await GM_fetch(keyUrl, { headers: this.#headers(task) });
            if (!response.ok) throw new Error(`HTTP ${response.status} while fetching HLS key.`);
            const rawKey = new Uint8Array(await response.arrayBuffer());
            if (rawKey.byteLength !== 16) throw new Error(`Invalid AES-128 key length: ${rawKey.byteLength}.`);
            this.#keyCache.set(keyUrl, crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']));
        }
        return { cryptoKey: await this.#keyCache.get(keyUrl) };
    }

    async #runHls(task) {
        const playlist = await this.#loadHlsPlaylist(task, task.url);
        const parsed = this.#parseHlsMediaPlaylist(playlist);
        task._log(`HLS media details: segments=${parsed.jobs.length}; ended=${parsed.ended}; contentType=application/vnd.apple.mpegurl`);
        if (!parsed.ended && !task.options.allowLive) throw new Error('Live HLS playlists are not supported unless allowLive is enabled.');
        if (!parsed.jobs.length) throw new Error('No HLS segments found.');
        task._stats.contentType = 'application/vnd.apple.mpegurl';
        task._stats.rangeSupported = true;
        task._setStatus('downloading');
        let previousRangeEnd = 0;
        const jobs = parsed.jobs.map(job => { const byteRange = this.#parseHlsRange(job.range, previousRangeEnd); if (byteRange) previousRangeEnd = byteRange.end + 1; return { ...job, url: new URL(job.uri, playlist.url).href, byteRange }; });
        await this.#runWorkers(task, jobs, async (job, index) => {
            const response = await this.#requestWithRetry(task, job.url, { headers: job.byteRange ? { Range: `bytes=${job.byteRange.start}-${job.byteRange.end}` } : {} });
            let bytes = new Uint8Array(response.response);
            const key = await this.#hlsKey(task, job.key, playlist.url);
            if (key) bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: this.#hlsIv(job.key.IV, job.sequence) }, key.cryptoKey, bytes));
            await this.#throttle(task, bytes.byteLength);
            task._pendingHlsWrites.set(index, { bytes, received: new Uint8Array(response.response).byteLength });
            task._writeChain = task._writeChain.then(async () => {
                while (task._pendingHlsWrites.has(task._nextHlsWrite)) {
                    const { bytes: next, received } = task._pendingHlsWrites.get(task._nextHlsWrite);
                    task._pendingHlsWrites.delete(task._nextHlsWrite++);
                    await task._writer.write({ type: 'write', position: task._hlsOutputOffset, data: next });
                    task._hlsOutputOffset += next.byteLength;
                    this.#recordBytes(task, next.byteLength, received);
                }
            });
            await task._writeChain;
        });
    }
}

class DownloaderUI {
    constructor(downloader) {
        this.downloader = downloader;
        this.overlay = null;
        this.container = null;
        this.historyOpen = downloader.settings.historyCollapsed === false;
        downloader.on('change', () => this.refresh());
        downloader.on('history', () => this.refreshHistory());
    }

    mount() {
        if (this.overlay) return this.overlay;
        AniLINKUI.addStyle(`
            #AniLINK_DownloaderOverlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 7vh 4vw; background: rgba(0,0,0,.78); backdrop-filter: blur(12px); opacity: 1; transform: translateY(0) scale(1); transition: opacity .28s ease, transform .28s ease, visibility .28s; pointer-events: auto; }
            #AniLINK_DownloaderPanel { width: min(1100px, 92vw); max-height: 86vh; overflow: hidden; display: flex; flex-direction: column; color: #edf5f4; background: linear-gradient(145deg, rgba(25,35,34,.98), rgba(28,28,31,.98)); border: 1px solid rgba(100,220,207,.18); border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset; }
            .anilink-dl-header { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,.08); }
            .anilink-dl-title { flex: 1; } .anilink-dl-title h2 { margin: 0; color: #65d6c8; font: 700 20px/1.2 system-ui, sans-serif; } .anilink-dl-title p { margin: 5px 0 0; color: #8ea3a1; font: 12px/1.3 system-ui, sans-serif; }
            .anilink-dl-icon-btn { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; background: rgba(255,255,255,.05); color: #d9eeeb; cursor: pointer; font-size: 17px; } .anilink-dl-icon-btn:hover { border-color: #26a69a; background: rgba(38,166,154,.18); }
            .anilink-dl-body { padding: 18px 22px 22px; overflow-y: auto; } .anilink-dl-section { margin-bottom: 22px; } .anilink-dl-section:last-child { margin-bottom: 0; }
            .anilink-dl-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; color: #9adbd3; font: 700 12px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
            .anilink-dl-section-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
            .anilink-dl-section-head button { border: 0; background: transparent; color: #82aaa6; cursor: pointer; font: 12px system-ui, sans-serif; } .anilink-dl-section-head button:hover { color: #65d6c8; }
            .anilink-dl-task { position: relative; padding: 14px; margin: 9px 0; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.035); transition: border-color .2s, background .2s; } .anilink-dl-task:hover { border-color: rgba(38,166,154,.42); background: rgba(38,166,154,.06); }
            .anilink-dl-task-top { display: flex; align-items: flex-start; gap: 10px; } .anilink-dl-task-name { min-width: 0; flex: 1; color: #f2fbfa; font: 600 14px/1.3 system-ui, sans-serif; overflow: auto; text-overflow: clip; white-space: nowrap; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent; } .anilink-dl-task-meta { margin-top: 4px; color: #829794; font: 11px/1.3 system-ui, sans-serif; }
            .anilink-dl-task-name::-webkit-scrollbar { height: 2px; } .anilink-dl-task-name::-webkit-scrollbar-track { background: transparent; } .anilink-dl-task-name::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }
            .anilink-dl-status { flex: none; padding: 4px 8px; border-radius: 10px; background: rgba(38,166,154,.14); color: #7ce4d8; font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .05em; } .anilink-dl-status.failed { background: rgba(239,83,80,.16); color: #ff8b89; } .anilink-dl-status.completed { background: rgba(102,187,106,.16); color: #a0e7a3; }
            .anilink-dl-progress { height: 7px; margin: 13px 0 9px; overflow: hidden; border-radius: 5px; background: rgba(0,0,0,.32); } .anilink-dl-progress > span { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, #26a69a, #8be7dc); transition: width .25s ease; } .anilink-dl-progress.indeterminate > span { width: 38%; animation: anlink-progress-slide 1.15s ease-in-out infinite; }
            .anilink-dl-log { margin-top: 10px; border-top: 1px solid rgba(255,255,255,.07); color: #8ea3a1; font: 11px/1.45 ui-monospace, monospace; } .anilink-dl-log summary { padding-top: 9px; cursor: pointer; color: #82aaa6; font: 11px system-ui, sans-serif; } .anilink-dl-log pre { max-height: 180px; margin: 8px 0 0; overflow: auto; white-space: pre; color: #b9cbc8; }
            .anilink-dl-stats { display: flex; flex-wrap: wrap; gap: 8px 16px; color: #9eb4b1; font: 11px/1.3 ui-monospace, monospace; } .anilink-dl-error { margin-top: 8px; color: #ff9997; font: 11px/1.4 system-ui, sans-serif; }
            .anilink-dl-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; } .anilink-dl-actions button, .anilink-dl-settings button { border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 6px 9px; background: rgba(255,255,255,.05); color: #d4e7e4; cursor: pointer; font: 11px system-ui, sans-serif; } .anilink-dl-actions button:hover, .anilink-dl-settings button:hover { border-color: #26a69a; color: #7ce4d8; }
            .anilink-dl-popover { position: absolute; right: 12px; top: 48px; z-index: 5; width: 230px; padding: 12px; border: 1px solid rgba(100,220,207,.24); border-radius: 10px; background: #202a29; box-shadow: 0 12px 30px rgba(0,0,0,.4); } .anilink-dl-popover label, .anilink-dl-settings label { display: block; margin: 8px 0 4px; color: #9eb4b1; font: 11px system-ui, sans-serif; } .anilink-dl-popover input, .anilink-dl-settings input, .anilink-dl-settings select { width: 100%; padding: 7px 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: #18211f; color: #ecf7f5; }
            .anilink-dl-empty { padding: 28px 12px; border: 1px dashed rgba(255,255,255,.12); border-radius: 10px; color: #829794; text-align: center; font: 13px system-ui, sans-serif; }
            .anilink-dl-settings { padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.03); } .anilink-dl-setting-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .anilink-dl-setting-wide { grid-column: 1 / -1; } .anilink-dl-help { margin-top: 12px; color: #829794; font: 11px/1.45 system-ui, sans-serif; } .anilink-dl-help a { color: #75cfc5; }
            .anilink-dl-settings small { display: block; color: #829794; font: 10px/1.3 system-ui, sans-serif; }
            button[data-action] * { pointer-events: none; }
            @media (max-width: 680px) {
                #AniLINK_DownloaderOverlay { padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
                #AniLINK_DownloaderPanel { width: 96vw; max-height: 92vh; width: 100%; max-height: 100%; border-radius: 14px; }
                .anilink-dl-header, .anilink-dl-body { padding-left: 14px; padding-right: 14px; gap: 8px; }
                .anilink-dl-setting-grid { grid-template-columns: 1fr; }
                .anilink-dl-setting-wide { grid-column: auto; }
                .anilink-dl-icon-btn { min-width: 40px; min-height: 40px; }
                .anilink-dl-actions button { min-height: 36px; }
            }
            @keyframes anlink-progress-slide { from { transform: translateX(-120%); } to { transform: translateX(280%); } }
        `);
        this.overlay = document.createElement('div');
        this.overlay.id = 'AniLINK_DownloaderOverlay';
        this.overlay.addEventListener('click', event => { if (event.target === this.overlay) AniLINKUI.close(); });
        const panel = document.createElement('div');
        panel.id = 'AniLINK_DownloaderPanel';
        this.overlay.appendChild(panel);
        AniLINKUI.mountDownloader(this.overlay);
        return this.overlay;
    }

    show() { this.mount(); AniLINKUI.switchView('downloader'); this.render(); }
    hide() { AniLINKUI.close(); }

    refresh() {
        if (!this.overlay || !this.overlay.isConnected) return;
        const panel = this.overlay.querySelector('#AniLINK_DownloaderPanel');
        if (!panel?.querySelector('[data-region="active"]')) return this.render();
        const active = this.downloader.tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status));
        const region = panel.querySelector('[data-region="active"]');
        const existing = new Map([...region.querySelectorAll('[data-task-id]')].map(card => [card.dataset.taskId, card]));
        if (!active.length) region.innerHTML = '<div class="anilink-dl-empty">No active downloads yet.<br>Choose episodes in the extractor to send them here.</div>';
        else {
            region.querySelector('.anilink-dl-empty')?.remove();
            active.forEach(task => {
                const card = existing.get(task.id) || this.renderTask(task);
                if (!card.isConnected) region.appendChild(card);
                this.updateTaskCard(task, card);
            });
            existing.forEach((card, id) => !active.some(task => task.id === id) && card.remove());
        }
        const activeHeader = region.closest('.anilink-dl-section')?.querySelector('.anilink-dl-section-head');
        activeHeader?.querySelector('.anilink-dl-section-actions')?.remove();
        if (active.length) activeHeader?.insertAdjacentHTML('beforeend', this.renderActiveActions(active));
        const activeLabel = panel.querySelector('.anilink-dl-title p');
        if (activeLabel) activeLabel.textContent = active.length ? `${active.length} active task${active.length === 1 ? '' : 's'}` : 'Ready for downloads';
        AniLINKUI.updateFab();
    }

    addEpisodes(episodes, quality, options = {}) {
        const { show = true, ...taskOptions } = options;
        const tasks = episodes.map(episode => this.addEpisode(episode, quality, taskOptions));
        if (show) this.show();
        return tasks;
    }

    addEpisode(episode, quality, options = {}) {
        const link = episode.links?.[quality];
        if (!link?.stream) throw new Error(`Episode ${episode.number} has no stream for ${quality}.`);
        const extension = link.type === '.m3u8' || link.type === 'm3u8' ? '.ts' : link.type || '.bin';
        const filename = `${episode.animeTitle} - ${String(episode.number).padStart(3, '0')}${episode.epTitle ? ` - ${episode.epTitle}` : ''}${extension}`;
        const task = this.downloader.addTask(filename, episode.animeTitle, link.stream, {
            ...options, format: link.type, quality, headers: options.headers, referer: link.referer, threads: options.threads,
            speedLimitBps: options.speedLimitBps, tracks: link.tracks || [], metadata: { episodeNumber: episode.number, quality }
        });
        task.start().catch(() => { });
        return task;
    }

    render() {
        if (!this.overlay) return;
        const panel = this.overlay.querySelector('#AniLINK_DownloaderPanel');
        const tasks = this.downloader.tasks;
        const active = tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status));
        const history = this.downloader.history.filter(item => ['completed', 'failed', 'cancelled', 'interrupted'].includes(item.status));
        panel.innerHTML = `
            <div class="anilink-dl-header">
                <button class="anilink-dl-icon-btn" data-action="back" title="Back to extractor">←</button>
                <div class="anilink-dl-title"><h2>Download Center</h2><p>${active.length ? `${active.length} active task${active.length === 1 ? '' : 's'}` : 'Ready for downloads'}</p></div>
                <button class="anilink-dl-icon-btn" data-action="settings" title="Downloader settings">⚙</button>
                <button class="anilink-dl-icon-btn" data-action="close" title="Close">×</button>
            </div>
            <div class="anilink-dl-body">
                <section class="anilink-dl-section"><div class="anilink-dl-section-head"><span>Active downloads</span>${this.renderActiveActions(active)}</div><div data-region="active"></div></section>
                <section class="anilink-dl-section"><div class="anilink-dl-section-head">History <button data-action="toggle-history">${this.historyOpen ? 'Collapse' : 'Expand'}</button></div><div data-region="history"></div></section>
            </div>
        `;
        const activeRegion = panel.querySelector('[data-region="active"]');
        if (!active.length) activeRegion.innerHTML = '<div class="anilink-dl-empty">No active downloads yet.<br>Choose episodes in the extractor to send them here.</div>';
        else active.forEach(task => activeRegion.appendChild(this.renderTask(task)));
        const historyRegion = panel.querySelector('[data-region="history"]');
        if (this.historyOpen) {
            if (!history.length) historyRegion.innerHTML = '<div class="anilink-dl-empty">Completed and interrupted downloads will appear here.</div>';
            else history.forEach(record => historyRegion.appendChild(this.renderHistory(record)));
        }
        this.bindActions(panel);
        AniLINKUI.updateFab();
    }

    renderActiveActions(active) {
        if (!active.length) return '';
        const hasPausable = active.some(task => ['preparing', 'downloading'].includes(task.status));
        const hasPaused = active.some(task => task.status === 'paused');
        const showResume = !hasPausable && hasPaused;
        return `<div class="anilink-dl-section-actions">${hasPausable ? '<button data-action="pause-all">Pause all</button>' : ''}${showResume ? '<button data-action="resume-all">Resume all</button>' : ''}<button data-action="cancel-all">Cancel all</button></div>`;
    }

    getProgressState(task, stats) {
        const trackPhase = stats.phase === 'tracks';
        const hasTotalSize = !trackPhase && stats.totalSize > 0;
        const totalParts = trackPhase ? stats.trackTotal : stats.totalSegments;
        const completedParts = trackPhase ? stats.trackIndex : stats.completedSegments;
        const hasTotalParts = totalParts > 0;
        const percent = hasTotalSize
            ? Math.min(100, stats.bytesWritten / stats.totalSize * 100)
            : hasTotalParts
                ? Math.min(100, completedParts / totalParts * 100)
                : 0;
        return { trackPhase, percent, indeterminate: task.status === 'downloading' && !hasTotalSize && !hasTotalParts };
    }

    renderTask(task) {
        const stats = task.stats;
        const progressState = this.getProgressState(task, stats);
        const escape = dlUtils.anlinkEscapeHtml;
        const displayFilename = task.filename;
        const displayStatus = stats.phase === 'tracks' ? 'tracks' : stats.phase === 'track-error' ? 'track error' : task.status;
        const card = document.createElement('article');
        card.className = 'anilink-dl-task';
        card.dataset.taskId = task.id;
        card.innerHTML = `
            <div class="anilink-dl-task-top"><div class="anilink-dl-task-name" title="${escape(displayFilename)}">${escape(displayFilename)}<div class="anilink-dl-task-meta">${escape(task.anime || 'Anime')} · ${escape(task.options.quality || task.options.format || 'source')}</div></div><span class="anilink-dl-status ${escape(task.status)}">${escape(displayStatus)}</span></div>
            <div class="anilink-dl-progress${progressState.indeterminate ? ' indeterminate' : ''}"><span style="width:${progressState.indeterminate ? 38 : progressState.percent}%"></span></div>
            <div class="anilink-dl-stats"><span data-field="size">${stats.filesize} / ${stats.totalsize}</span><span data-field="speed">${stats.speed}</span><span data-field="eta">ETA ${stats.eta}</span><span data-field="parts">Parts ${stats.completedSegments}/${stats.totalSegments || '?'}</span><span data-field="phase" hidden></span></div>
            ${task.error ? `<div class="anilink-dl-error">${escape(task.error)}</div>` : ''}
            <div class="anilink-dl-actions">
                ${task.status === 'queued' ? '<button data-action="start">Start</button>' : task.status === 'paused' ? '<button data-action="resume">Resume</button>' : ['preparing', 'downloading'].includes(task.status) ? '<button data-action="pause">Pause</button>' : ''}
                ${['queued', 'preparing', 'downloading', 'paused'].includes(task.status) ? '<button data-action="cancel">Cancel</button>' : ''}
                <button data-action="task-settings">More</button>
            </div>
            <details class="anilink-dl-log"><summary>Logs (${task.logs.length})</summary><pre data-field="logs"></pre></details>
        `;
        this.updateTaskCard(task, card);
        return card;
    }

    updateTaskCard(task, card) {
        const stats = task.stats;
        const progressState = this.getProgressState(task, stats);
        const { trackPhase, percent, indeterminate } = progressState;
        const progress = card.querySelector('.anilink-dl-progress');
        progress?.classList.toggle('track-phase', trackPhase);
        progress?.classList.toggle('indeterminate', indeterminate);
        const bar = progress?.querySelector('span');
        if (bar) bar.style.width = indeterminate ? '38%' : `${percent}%`;
        const status = card.querySelector('.anilink-dl-status');
        const displayStatus = stats.phase === 'tracks' ? 'tracks' : stats.phase === 'track-error' ? 'track error' : task.status;
        if (status) { status.className = `anilink-dl-status ${task.status}`; status.textContent = displayStatus; }
        const fields = { size: `${stats.filesize} / ${stats.totalsize}`, speed: stats.speed, eta: `ETA ${stats.eta}`, parts: trackPhase ? `Tracks ${stats.trackIndex}/${stats.trackTotal}` : `Parts ${stats.completedSegments}/${stats.totalSegments || '?'}` };
        for (const [name, value] of Object.entries(fields)) if (card.querySelector(`[data-field="${name}"]`)) card.querySelector(`[data-field="${name}"]`).textContent = value;
        const phase = card.querySelector('[data-field="phase"]');
        if (phase) { phase.hidden = !trackPhase; phase.textContent = stats.trackLabel ? `Downloading ${stats.trackLabel}` : 'Preparing tracks'; }
        const logsHeader = card.querySelector('.anilink-dl-log summary');
        if (logsHeader) logsHeader.textContent = `Logs (${task.logs.length})`;
        const logs = card.querySelector('[data-field="logs"]');
        if (logs) logs.textContent = task.logs.map(item => `[${new Date(item.at).toLocaleTimeString()}] ${item.level.toUpperCase()} ${item.message}`).join('\n');
        const error = card.querySelector('.anilink-dl-error');
        if (task.error && error) error.textContent = task.error;
        const actions = card.querySelector('.anilink-dl-actions');
        if (actions) {
            const pauseButton = actions.querySelector('[data-action="pause"], [data-action="resume"]');
            const startButton = actions.querySelector('[data-action="start"]');
            const cancelButton = actions.querySelector('[data-action="cancel"]');
            if (task.status === 'queued') {
                pauseButton?.remove();
                if (!startButton) actions.insertAdjacentHTML('afterbegin', '<button data-action="start">Start</button>');
            } else {
                startButton?.remove();
                const action = task.status === 'paused' ? 'resume' : ['preparing', 'downloading'].includes(task.status) ? 'pause' : null;
                if (action) {
                    const text = action === 'pause' ? 'Pause' : 'Resume';
                    if (pauseButton) { pauseButton.dataset.action = action; pauseButton.textContent = text; }
                    else actions.insertAdjacentHTML('afterbegin', `<button data-action="${action}">${text}</button>`);
                } else pauseButton?.remove();
            }
            if (['queued', 'preparing', 'downloading', 'paused'].includes(task.status)) {
                if (!cancelButton) actions.insertAdjacentHTML('beforeend', '<button data-action="cancel">Cancel</button>');
            } else cancelButton?.remove();
        }
    }

    refreshHistory(panel = this.overlay?.querySelector('#AniLINK_DownloaderPanel')) {
        const historyRegion = panel?.querySelector('[data-region="history"]');
        if (!historyRegion || !this.historyOpen) return;
        const history = this.downloader.history.filter(item => ['completed', 'failed', 'cancelled', 'interrupted'].includes(item.status));
        historyRegion.replaceChildren(...(history.length
            ? history.map(record => this.renderHistory(record))
            : [Object.assign(document.createElement('div'), { className: 'anilink-dl-empty', textContent: 'Completed and interrupted downloads will appear here.' })]));
    }

    renderHistory(record) {
        const escape = dlUtils.anlinkEscapeHtml;
        const card = document.createElement('article');
        card.className = 'anilink-dl-task';
        card.dataset.historyId = record.id;
        const displayFilename = record.partialFilename && record.status !== 'completed' ? record.partialFilename : record.filename;
        card.innerHTML = `<div class="anilink-dl-task-top"><div class="anilink-dl-task-name" title="${escape(displayFilename)}">${escape(displayFilename)}<div class="anilink-dl-task-meta">${escape(record.anime || 'Anime')} · ${new Date(record.updatedAt).toLocaleString()}</div></div><span class="anilink-dl-status ${escape(record.status)}">${escape(record.status)}</span></div><div class="anilink-dl-stats"><span>${dlUtils.anlinkFormatBytes(record.stats?.bytesWritten || 0)}</span><span>${escape(record.stats?.error || '')}</span></div><details class="anilink-dl-log"><summary>Logs (${record.logs?.length || 0})</summary><pre>${escape((record.logs || []).map(item => `[${new Date(item.at).toLocaleTimeString()}] ${String(item.level).toUpperCase()} ${item.message}`).join('\n'))}</pre></details><div class="anilink-dl-actions"><button data-action="retry-history">Retry</button><button data-action="remove-history" data-history-id="${escape(record.id)}">Clear</button></div>`;
        return card;
    }

    showSettingsDialog() {
        const settings = this.downloader.settings;
        const escape = dlUtils.anlinkEscapeHtml;
        const bodyHTML = `<div class="anilink-dl-settings">
            <div class="anilink-dl-setting-grid">
                <div><label>Parallel downloads</label><input name="maxConcurrentTasks" type="number" min="1" max="8" placeholder="1" value="${settings.maxConcurrentTasks}"></div>
                <div><label>Default threads</label><input name="defaultThreads" type="number" min="1" max="32" placeholder="6" value="${settings.defaultThreads}"></div>
                <div><label>Default speed limit (KB/s, 0 = unlimited)</label><input name="defaultSpeedLimitBps" type="number" min="0" placeholder="0" value="${Number.isFinite(settings.defaultSpeedLimitBps) ? Math.round(settings.defaultSpeedLimitBps / 1024) : 0}"></div>
                <div><label>Preferred stream resolution (360, 720, 1080, etc)</label><input name="preferredResolution" type="number" min="0" step="1" value="${settings.preferredResolution || ''}" placeholder="Auto"></div>
                <div><label>Subtitle folder (blank = alongside video)</label><input name="subtitleDirectory" type="text" value="${escape(settings.subtitleDirectory || '')}" placeholder="Optional folder name">${window.showDirectoryPicker ? '<small>This feature might not be supported in your browser. See <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility" target="_blank" rel="noreferrer">MDN</a> for more information.</small>' : ''}</div>
                <div style="display: flex; flex-direction: column;"><label style="margin-bottom: -4px;">Always show floating button</label><label style="display: flex; align-items: center; gap: 12px; background-color: #18211f; border: 1px solid #343c3a; border-radius: 6px; padding: 6px 10px; cursor: pointer;"><input name="fabAlwaysVisible" type="checkbox" ${settings.fabAlwaysVisible === true ? 'checked' : ''} onchange="this.nextElementSibling.textContent = this.checked ? 'True' : 'False'" style="accent-color: #3f51b5; width: 14px; height: 14px; margin: 0; cursor: pointer;"><span style="font-size: 14px; font-family: sans-serif; opacity: 0.85;">${settings.fabAlwaysVisible === true ? 'True' : 'False'}</span></label></div>
                <div><label>Notifications</label><select name="notifications">
                    <option value="off" ${settings.notifications==='off' ? 'selected' : '' }>Off</option>
                    <option value="completed" ${settings.notifications==='completed' ? 'selected' : '' }>Completed only</option>
                    <option value="completed-and-failed" ${settings.notifications==='completed-and-failed' ? 'selected' : ''}>Completed and failed</option>
                    <option value="all" ${settings.notifications==='all' ? 'selected' : '' }>All state changes</option>
                </select></div>
                <div><label>History retention</label><input name="historyLimit" type="number" min="1" max="100" placeholder="15" value="${Math.min(100, settings.historyLimit)}"></div>
            </div>
            <div class="anilink-dl-actions"><button type="button" data-action="clear-history">Clear history</button></div>
            <div class="anilink-dl-help">Need help? <a href="https://github.com/jeryjs/Userscripts/issues/new?title=%5BAniLINK%5D%20Downloader%20issue&body=%23%23%20Description%0A%0A%23%23%20Steps%20to%20reproduce%0A1.%20%0A2.%20%0A%0A%23%23%20Expected%20behavior%0A-%20Browser%3A%20%0A-%20Userscript%20manager%3A%20" target="_blank" rel="noreferrer">Report an issue on GitHub</a></div>
        </div>`;
        const { modal } = createModal({
            title: 'Downloader Settings',
            icon: '⚙',
            subtitle: 'Defaults apply to newly added tasks',
            bodyHTML: bodyHTML,
            width: '560px',
            onConfirm: dialog => {
                const value = name => dialog.querySelector(`[name="${name}"]`)?.value;
                const checked = name => dialog.querySelector(`[name="${name}"]`)?.checked;
                this.downloader.updateSettings({ maxConcurrentTasks: +value('maxConcurrentTasks'), defaultThreads: +value('defaultThreads'), defaultSpeedLimitBps: +(value('defaultSpeedLimitBps') || 0) * 1024 || Infinity, preferredResolution: +value('preferredResolution') || 0, subtitleDirectory: value('subtitleDirectory'), fabAlwaysVisible: checked('fabAlwaysVisible'), notifications: value('notifications'), historyLimit: +value('historyLimit') });
                AniLINKUI.updateFab();
                this.refresh();
            }
        });
        modal.querySelector('[data-action="clear-history"]').addEventListener('click', () => {
            if (confirm('Clear all completed and interrupted download history?')) {
                this.downloader.clearHistory();
                modal.remove();
            }
        });
    }

    bindActions(panel) {
        panel.querySelector('[data-action="back"]')?.addEventListener('click', () => AniLINKUI.switchView('extractor'));
        panel.querySelector('[data-action="close"]')?.addEventListener('click', () => AniLINKUI.close());
        panel.querySelector('[data-action="settings"]')?.addEventListener('click', () => this.showSettingsDialog());
        panel.querySelector('[data-action="toggle-history"]')?.addEventListener('click', () => {
            this.historyOpen = !this.historyOpen;
            this.downloader.updateSettings({ historyCollapsed: !this.historyOpen });
            this.render();
        });
        panel.onclick = event => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            if (action === 'pause-all') {
                this.downloader.tasks.filter(task => ['preparing', 'downloading'].includes(task.status)).forEach(task => task.pause());
            } else if (action === 'resume-all') {
                this.downloader.tasks.filter(task => task.status === 'paused').forEach(task => task.resume());
            } else if (action === 'cancel-all') {
                const active = this.downloader.tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status));
                if (!confirm(`Cancel ${active.length} active download${active.length === 1 ? '' : 's'}? Partial files will be kept.`)) return;
                active.forEach(task => task.cancel());
            } else if (action === 'start' || action === 'pause' || action === 'resume') {
                const task = this.downloader.getTask(button.closest('[data-task-id]').dataset.taskId);
                if (task) action === 'start' ? task.start(true) : task[action]();
            } else if (action === 'cancel') {
                const task = this.downloader.getTask(button.closest('[data-task-id]').dataset.taskId);
                if (!task || !confirm(`Cancel ${task.filename}? Its partial file will be kept in the output directory.`)) return;
                task.cancel();
            } else if (action === 'remove-history') {
                if (!confirm('Clear this download from history?')) return;
                this.downloader.removeHistory(button.dataset.historyId);
            } else if (action === 'retry-history') {
                this.downloader.retryHistory(button.closest('[data-history-id]').dataset.historyId).catch(error => showToast(`Retry failed: ${error.message || error}`));
            } else if (action === 'task-settings') this.showTaskPopover(button.closest('[data-task-id]'));
        };
    }

    showTaskPopover(card) {
        card.querySelector('.anilink-dl-popover')?.remove();
        const task = this.downloader.getTask(card.dataset.taskId);
        if (!task) return;
        const popover = document.createElement('div');
        popover.className = 'anilink-dl-popover';
        popover.innerHTML = `<label>Speed limit (KB/s, 0 = unlimited)</label><input name="speed" type="number" min="0" value="${Number.isFinite(task.options.speedLimitBps) ? Math.round(task.options.speedLimitBps / 1024) : 0}">${task.status === 'queued' ? '<label>Request threads</label><input name="threads" type="number" min="1" max="32" value="' + task.options.threads + '">' : ''}<div class="anilink-dl-actions"><button data-action="apply-task-settings">Apply</button></div>`;
        popover.querySelector('[data-action="apply-task-settings"]').addEventListener('click', () => {
            task.setSpeedLimit(+(popover.querySelector('[name="speed"]').value || 0) * 1024 || Infinity);
            if (task.status === 'queued') task.setThreads(+(popover.querySelector('[name="threads"]').value || task.options.threads));
            popover.remove();
            this.render();
        });
        card.appendChild(popover);
    }
}

const anilinkDownloader = new Downloader();
const anilinkDownloaderUI = new DownloaderUI(anilinkDownloader);
AniLINKUI.bootstrap();

window.addEventListener('beforeunload', event => {
    if (!anilinkDownloader.hasActiveTasks) return;
    event.preventDefault();
    event.returnValue = 'AniLINK downloads are still active. Leaving this page will interrupt them.';
});

// ================= TESTING =================== \\
function testdl() {
    const relayBtn = document.createElement('button');
    relayBtn.innerText = 'Start AniLINK Test Download';
    Object.assign(relayBtn.style, { position: 'fixed', top: '20px', right: '20px', zIndex: '999999', padding: '15px 20px', backgroundColor: '#ff4757', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' });
    document.body.appendChild(relayBtn);
    relayBtn.addEventListener('click', async () => {
        relayBtn.remove();
        const url = 'https://vault-16.owocdn.top/stream/16/06/fde781c4bbb0120e16fafe741cf61b4313bd2865ade7823ed9ff5f37e68c88b4/uwu.m3u8';
        const ref = 'https://kwik.cx/';
        const dl = new Downloader();
        unsafeWindow.dl = dl;
        if (!await dl.setDirectory()) return console.log('[AniLINK] Download aborted: No directory selected.');
        const task = dl.addTask('test_episode.ts', 'test_anime', url, { format: 'hls', threads: 8, headers: { Referer: ref, Origin: new URL(ref).origin }, speedLimitBps: Infinity });
        task.on('progress', stats => console.log(`[${task.id}] ${task.filename}: ${stats.filesize}/${stats.totalsize} @ ${stats.speed} (${stats.eta})`));
        task.on('error', error => console.error(`[${task.id}] failed:`, error));
        console.log(`[AniLINK] Launching task: ${task.id} — ${task.filepath}`);
        try { await task.start(); console.log('[AniLINK] Download complete:', task.stats); }
        catch (error) { console.error('[AniLINK] Download ended:', task.status, error); }
    });
}

// testdl();