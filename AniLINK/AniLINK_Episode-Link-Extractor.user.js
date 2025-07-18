// ==UserScript==
// @name        AniLINK - Episode Link Extractor
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     6.12.0
// @description Stream or download your favorite anime series effortlessly with AniLINK! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=animepahe.ru
// @author      Jery
// @license     MIT
// @match       https://anitaku.*/*
// @match       https://anitaku.bz/*
// @match       https://gogoanime.*/*
// @match       https://gogoanime3.cc/*
// @match       https://gogoanime3.*/*
// @match       https://animepahe.*/play/*
// @match       https://animepahe.*/anime/*
// @match       https://animepahe.ru/play/*
// @match       https://animepahe.com/play/*
// @match       https://animepahe.org/play/*
// @match       https://yugenanime.*/anime/*/*/watch/
// @match       https://yugenanime.tv/anime/*/*/watch/
// @match       https://yugenanime.sx/anime/*/*/watch/
// @match       https://hianime.*/watch/*
// @match       https://hianime.to/watch/*
// @match       https://hianime.nz/watch/*
// @match       https://hianime.sz/watch/*
// @match       https://otaku-streamers.com/info/*/*
// @match       https://beta.otaku-streamers.com/watch/*/*
// @match       https://beta.otaku-streamers.com/title/*/*
// @match       https://animeheaven.me/anime.php?*
// @match       https://animez.org/*/*
// @match       https://animeyy.com/*/*
// @match       https://*.miruro.to/watch?id=*
// @match       https://*.miruro.tv/watch?id=*
// @match       https://*.miruro.online/watch?id=*
// @match       https://anizone.to/anime/*
// @match       https://anixl.to/title/*
// @match       https://sudatchi.com/watch/*/*
// @match       https://animekai.to/watch/*
// @match       https://hianime.*/watch/*
// @match       https://hianime.to/watch/*
// @match       https://hianime.nz/watch/*
// @match       https://hianimeZ.*/watch/*
// @match       https://aninow.tv/w/*
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlHttpRequest
// @require     https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @grant       GM_addStyle
// @grant       GM_getValue
// ==/UserScript==

/**
 * Represents an anime episode with metadata and streaming links.
 */
class Episode {
    /**
     * @param {string} number - The episode number.
     * @param {string} animeTitle - The title of the anime.
     * @param {Object.<string, {stream: string, type: 'm3u8'|'mp4', tracks: Array<{file: string, kind: 'caption'|'audio', label: string}>}>} links - An object containing streaming links and tracks for each source.
     * @param {string} thumbnail - The URL of the episode's thumbnail image.
     * @param {string} [epTitle] - The title of the episode (optional).
     */
    constructor(number, animeTitle, links, thumbnail, epTitle) {
        this.number = String(number);   // The episode number
        this.animeTitle = animeTitle;     // The title of the anime.
        this.epTitle = epTitle; // The title of the episode (this can be the specific ep title or blank).
        this.links = this._processLinks(links);     // An object containing streaming links and tracks for each source: {"source1":{stream:"url", type:"m3u8|mp4", tracks:[{file:"url", kind:"caption|audio", label:"name"}]}}}
        this.thumbnail = thumbnail; // The URL of the episode's thumbnail image (if unavailable, then just any image is fine. Thumbnail property isnt really used in the script yet).
        this.filename = `${this.animeTitle} - ${this.number.padStart(3, '0')}${this.epTitle ? ` - ${this.epTitle}` : ''}.${Object.values(this.links)[0]?.type || 'm3u8'}`;   // The formatted name of the episode, combining anime name, number and title and extension.
        this.title = this.epTitle ?? this.animeTitle;
    }
    
    // Processes the links to ensure they are absolute URLs.
    _processLinks(links) {
        for (const linkObj of Object.values(links)) {
            linkObj.stream &&= new URL(linkObj.stream, location.origin).href;
            linkObj.tracks?.forEach?.(track => track.file &&= new URL(track.file, location.origin).href);
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
 * 2. Optionally, add the following properties if needed (they arent used by the script, but they will come in handy when the animesite changes its layout):
 *    - `animeTitle`: A CSS selector to identify the anime title on the website.
 *    - `epLinks`: A CSS selector to identify the episode links on the website.
 *    - `epTitle`: A CSS selector to identify the episode title on the website.
 *    - `linkElems`: A CSS selector to identify the download link elements on the website.
 *    - `epNum`: A CSS selector to identify the episode number on the website.
 *    - `_getVideoLinks`: A function to extract video links from the website.
 *    - `styles`: Custom CSS styles to be applied to the website.
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
const websites = [
    {
        name: 'GoGoAnime',
        url: ['anitaku.to/', 'gogoanime3.co/', 'gogoanime3', 'anitaku', 'gogoanime'],
        epLinks: '#episode_related > li > a',
        epTitle: '.title_name > h2',
        linkElems: '.cf-download > a',
        thumbnail: '.headnav_left > a > img',
        addStartButton: function () {
            const button = Object.assign(document.createElement('a'), {
                id: "AniLINK_startBtn",
                style: "cursor: pointer; background-color: #145132;",
                innerHTML: document.querySelector("div.user_auth a[href='/login.html']")
                    ? `<b style="color:#FFC119;">AniLINK:</b> Please <a href="/login.html"><u>log in</u></a> to download`
                    : '<i class="icongec-dowload"></i> Generate Download Links'
            });
            const target = location.href.includes('/category/') ? '#episode_page' : '.cf-download';
            document.querySelector(target)?.appendChild(button);
            return button;
        },
        extractEpisodes: async function* (status) {
            const throttleLimit = 12; // Number of episodes to extract in parallel
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);

                        const [, epTitle, epNumber] = page.querySelector(this.epTitle).textContent.match(/(.+?) Episode (\d+(?:\.\d+)?)/);
                        const thumbnail = page.querySelector(this.thumbnail).src;
                        status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, '0')}...`;
                        const links = [...page.querySelectorAll(this.linkElems)].reduce((obj, elem) => ({ ...obj, [elem.textContent.trim()]: { stream: elem.href, type: 'mp4' } }), {});
                        status.textContent = `Extracted ${epTitle} - ${epNumber.padStart(3, '0')}`;

                        return new Episode(epNumber, epTitle, links, thumbnail); // Return Episode object
                    } catch (e) { showToast(e); return null; }
                }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
            }
        }
    },
    {
        name: 'YugenAnime',
        url: ['yugenanime.tv', 'yugenanime.sx'],
        epLinks: '.ep-card > a.ep-thumbnail',
        animeTitle: '.ani-info-ep .link h1',
        epTitle: 'div.col.col-w-65 > div.box > h1',
        thumbnail: 'a.ep-thumbnail img',
        addStartButton: function () {
            return document.querySelector(".content .navigation").appendChild(Object.assign(document.createElement('a'), { id: "AniLINK_startBtn", className: "link p-15", textContent: "Generate Download Links" }));
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Getting list of episodes...';
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);

            const throttleLimit = 6;    // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async (epLink, index) => {
                    try {
                        status.textContent = `Loading ${epLink.pathname}`;
                        const page = await fetchPage(epLink.href);

                        const animeTitle = page.querySelector(this.animeTitle).textContent;
                        const epNumber = epLink.href.match(/(\d+)\/?$/)[1];
                        const epTitle = page.querySelector(this.epTitle).textContent.match(/^${epNumber} : (.+)$/) || animeTitle;
                        const thumbnail = document.querySelectorAll(this.thumbnail)[index].src;
                        status.textContent = `Extracting ${`${epNumber.padStart(3, '0')} - ${animeTitle}` + (epTitle != animeTitle ? `- ${epTitle}` : '')}...`;
                        const rawLinks = await this._getVideoLinks(page, status, epTitle);
                        const links = Object.entries(rawLinks).reduce((acc, [quality, url]) => ({ ...acc, [quality]: { stream: url, type: 'm3u8' } }), {});

                        return new Episode(epNumber, epTitle, links, thumbnail);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        },
        _getVideoLinks: async function (page, status, episodeTitle) {
            const embedLinkId = page.body.innerHTML.match(new RegExp(`src="//${page.domain}/e/(.*?)/"`))[1];
            const embedApiResponse = await fetch(`https://${page.domain}/api/embed/`, { method: 'POST', headers: { "X-Requested-With": "XMLHttpRequest" }, body: new URLSearchParams({ id: embedLinkId, ac: "0" }) });
            const json = await embedApiResponse.json();
            const m3u8GeneralLink = json.hls[0];
            status.textContent = `Parsing ${episodeTitle}...`;
            // Fetch the m3u8 file content
            const m3u8Response = await fetch(m3u8GeneralLink);
            const m3u8Text = await m3u8Response.text();
            // Parse the m3u8 file to extract different qualities
            const qualityMatches = m3u8Text.matchAll(/#EXT-X-STREAM-INF:.*RESOLUTION=\d+x\d+.*NAME="(\d+p)"\n(.*\.m3u8)/g);
            const links = {};
            for (const match of qualityMatches) {
                const [_, quality, m3u8File] = match;
                links[quality] = `${m3u8GeneralLink.slice(0, m3u8GeneralLink.lastIndexOf('/') + 1)}${m3u8File}`;
            }
            return links;
        }
    },
    {
        name: 'AnimePahe',
        url: ['animepahe.ru', 'animepahe.com', 'animepahe.org'],
        epLinks: (location.pathname.startsWith('/anime/')) ? 'a.play' : '.dropup.episode-menu a.dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
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

            const throttleLimit = 36;  // Setting high throttle limit actually improves performance
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);

                        if (page.querySelector(this.epTitle) == null) return;
                        const [, animeTitle, epNum] = page.querySelector(this.epTitle).outerText.split(/Watch (.+) - (\d+(?:\.\d+)?) Online$/);
                        const epNumber = (epNum - firstEpNum + 1).toString();
                        const thumbnail = page.querySelector(this.thumbnail).src;
                        status.textContent = `Extracting ${animeTitle} - ${epNumber.padStart(3, "0")}...`;

                        async function getVideoUrl(kwikUrl) {
                            const response = await fetch(kwikUrl, { headers: { "Referer": "https://animepahe.com" } });
                            const data = await response.text();
                            return eval(/(eval)(\(f.*?)(\n<\/script>)/s.exec(data)[2].replace("eval", "")).match(/https.*?m3u8/)[0];
                        }
                        let links = {};
                        for (const elm of [...page.querySelectorAll(this.linkElems)]) {
                            links[elm.textContent] = { stream: await getVideoUrl(elm.getAttribute('data-src')), type: 'm3u8' };
                            status.textContent = `Parsed ${`${epNumber.padStart(3, '0')} - ${animeTitle}`}`;
                        }
                        return new Episode(epNumber, animeTitle, links, thumbnail);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        },
        styles: `div#AniLINK_LinksContainer { font-size: 10px; } #Quality > b > div > ul {font-size: 16px;}`
    },
    {
        name: 'Beta-Otaku-Streamers',
        url: ['beta.otaku-streamers.com'],
        epLinks: (document.location.pathname.startsWith('/title/')) ? '.item-title a' : '.video-container .clearfix > a',
        epTitle: '.title > a',
        epNum: '.watch_curep',
        thumbnail: 'video',
        addStartButton: function () {
            (document.location.pathname.startsWith('/title/')
                ? document.querySelector(".album-top-box") : document.querySelector('.video-container .title-box'))
                .innerHTML += `<a id="AniLINK_startBtn" class="btn btn-outline rounded-btn">Generate Download Links</a>`;
            return document.getElementById("AniLINK_startBtn");
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
                        const epTitle = page.querySelector(this.epTitle).textContent.trim();
                        const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '');
                        const thumbnail = page.querySelector(this.thumbnail).poster;

                        status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                        const links = { 'Video Links': { stream: page.querySelector('video > source').src, type: 'mp4' } };

                        return new Episode(epNumber, epTitle, links, thumbnail);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: 'Otaku-Streamers',
        url: ['otaku-streamers.com'],
        epLinks: 'table > tbody > tr > td:nth-child(2) > a',
        epTitle: '#strw_player > table > tbody > tr:nth-child(1) > td > span:nth-child(1) > a',
        epNum: '#video_episode',
        thumbnail: 'otaku-streamers.com/images/os.jpg',
        addStartButton: function () {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; background-color: #145132; float: right;`;
            button.innerHTML = 'Generate Download Links';
            document.querySelector('table > tbody > tr:nth-child(2) > td > div > table > tbody > tr > td > h2').appendChild(button);
            return button;
        },
        extractEpisodes: async function* (status) {
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            const throttleLimit = 12;    // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);
                        const epTitle = page.querySelector(this.epTitle).textContent;
                        const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '')

                        status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                        const links = { 'mp4': { stream: page.querySelector('video > source').src, type: 'mp4' } };

                        return new Episode(epNumber, epTitle, links, this.thumbnail); // Return Episode object
                    } catch (e) { showToast(e); return null; }
                }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
            }
        }
    },
    {
        name: 'AnimeHeaven',
        url: ['animeheaven.me'],
        epLinks: 'a.ac3',
        epTitle: 'a.c2.ac2',
        epNumber: '.boxitem.bc2.c1.mar0',
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
            const allEpLinks = Array.from(document.querySelectorAll(this.epLinks));
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            const throttleLimit = 12; // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);
                        const epTitle = page.querySelector(this.epTitle).textContent;
                        const epNumber = page.querySelector(this.epNumber).textContent.replace("Episode ", '');
                        const thumbnail = document.querySelector(this.thumbnail).src;

                        status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                        const links = [...page.querySelectorAll('#vid > source')].reduce((acc, source) => ({ ...acc, [source.src.match(/\/\/(\w+)\./)[1]]: { stream: source.src, type: 'mp4' } }), {});

                        return new Episode(epNumber, epTitle, links, thumbnail); // Return Episode object
                    } catch (e) { showToast(e); return null; }
                }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
            }
        }
    },
    {
        name: 'AnimeZ',
        url: ['animez.org', 'animeyy.com'],
        epLinks: 'li.wp-manga-chapter a',
        epTitle: '#title-detail-manga',
        epNum: '.wp-manga-chapter.active',
        thumbnail: '.Image > figure > img',
        addStartButton: function () {
            (document.querySelector(".MovieTabNav.ControlPlayer") || document.querySelector(".mb-3:has(#keyword_chapter)"))
                .innerHTML += `<div class="Lnk AAIco-link" id="AniLINK_startBtn">Extract Episode Links</div>`;
            return document.getElementById("AniLINK_startBtn");
        },
        extractEpisodes: async function* (status) {
            /// work in progress- stopped when animes.org started redirecting to some random manhwa site
            status.textContent = 'Fetching Episodes List...';
            const mangaId = (window.location.pathname.match(/-(\d+)(?:\/|$)/) || [])[1] || document.querySelector('[data-manga-id]')?.getAttribute('data-manga-id');
            if (!mangaId) return showToast('Could not determine manga_id for episode list.');
            const nav = [...document.querySelectorAll('#nav_list_chapter_id_detail li > :not(a.next)')];
            const maxPage = Math.max(1, ...Array.from(nav).map(a => +(a.getAttribute('onclick')?.match(/load_list_chapter\((\d+)\)/)?.[1] || 0)).filter(Boolean));
            // Parse all episode links from all pages in parallel
            status.textContent = `Loading all ${maxPage} episode pages...`;
            let allEpLinks = [];
            try {
                await Promise.all(Array.from({ length: maxPage }, (_, i) => fetch(`/?act=ajax&code=load_list_chapter&manga_id=${mangaId}&page_num=${i + 1}&chap_id=0&keyword=`).then(r => r.text()).then(t => {
                    let html = JSON.parse(t).list_chap;
                    const doc = document.implementation.createHTMLDocument('eps');
                    doc.body.innerHTML = html;
                    allEpLinks.push(...doc.querySelectorAll(this.epLinks));
                })));
            } catch (e) { showToast('Failed to load Episodes List: ' + e); return null; }
            // Remove duplicates
            allEpLinks = allEpLinks.filter((el, idx, self) => self.findIndex(e => e.href === el.href && e.textContent.trim() === el.textContent.trim()) === idx);
            const epLinks = await applyEpisodeRangeFilter(allEpLinks);
            const throttleLimit = 12;
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);
                        const epTitle = page.querySelector(this.epTitle).textContent;
                        const isDub = page.querySelector(this.epNum).textContent.includes('-Dub');
                        const epNumber = page.querySelector(this.epNum).textContent.replace(/-Dub/, '').trim();
                        const thumbnail = document.querySelector(this.thumbnail).src;

                        status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                        const links = { [isDub ? "Dub" : "Sub"]: { stream: page.querySelector('iframe').src.replace('/embed/', '/anime/'), type: 'm3u8' } };

                        return new Episode(epNumber, epTitle, links, thumbnail); // Return Episode object
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: 'Miruro',
        url: ['miruro.to', 'miruro.tv', 'miruro.online'],
        animeTitle: '.anime-title > a',
        thumbnail: 'a[href^="/info?id="] > img',
        baseApiUrl: `${location.origin}/api`,
        addStartButton: function (id) {
            const intervalId = setInterval(() => {
                const target = document.querySelector('.title-actions-container');
                if (target) {
                    clearInterval(intervalId);
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
            }, 200);
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Fetching episode list...';
            const animeTitle = (document.querySelector('p.title-romaji') || document.querySelector(this.animeTitle)).textContent;
            const malId = document.querySelector(`a[href*="/myanimelist.net/anime/"]`)?.href.split('/').pop();
            if (!malId) return showToast('MAL ID not found.');

            const res = await fetch(`${this.baseApiUrl}/episodes?malId=${malId}`).then(r => r.json());
            const providers = Object.entries(res).flatMap(([p, s]) => {
                if (p === "ANIMEZ") {
                    // AnimeZ: treat sub and dub as separate providers
                    const v = Object.values(s)[0], animeId = Object.keys(s)[0], eps = v?.episodeList?.episodes;
                    if (!eps) return [];
                    return ["sub", "dub"].map(type =>eps[type]?.length ? { source: `animez-${type}`, animeId, useEpId: true, epList: eps[type] } : null);
                } else {
                    // Default: original logic
                    let v = Object.values(s)[0], epl = v?.episodeList?.episodes || v?.episodeList;
                    // Fix the ep numbering offset for animepahe (sometimes S2 starts from ep 13 instead of ep 1)
                    if (p === "ANIMEPAHE") epl = epl?.map((e) => ({...e, number: (e.number - epl[0]?.number + 1)}));
                    return epl && { source: p.toLowerCase(), animeId: Object.keys(s)[0], useEpId: !!v?.episodeList?.episodes, epList: epl };
                }
            }).filter(Boolean);

            // Get the provider with most episodes to use as base for thumbnails, epTitle, epNumber, etc.
            // Preferred provider is Zoro, if available, since it has the best title format
            let baseProvider = providers.find(p => p.source === 'zoro') || providers.find(p => p.epList.length == Math.max(...providers.map(p => p.epList.length)));
            baseProvider = { ...baseProvider, epList: await applyEpisodeRangeFilter(baseProvider.epList) };

            if (!baseProvider) return showToast('No episodes found.');

            for (const baseEp of baseProvider.epList) {
                const num = String(baseEp.number).padStart(3, '0');
                let epTitle = baseEp.jptitle || baseEp.title, thumbnail = baseEp.snapshot; // will try to update with other providers if this is blank

                status.textContent = `Fetching Ep ${num}...`;
                let links = {};
                await Promise.all(providers.map(async ({ source, animeId, useEpId, epList }) => {
                    const ep = epList.find(ep => ep.number == baseEp.number);
                    epTitle = epTitle || ep.title; // update title if blank
                    const epId = !useEpId ? `${animeId}/ep-${ep.number}` : ep.id;
                    try {
                        const apiProvider = source.startsWith('animez-') ? 'animez' : source;
                        const sres = await fetchWithRetry(`${this.baseApiUrl}/sources?episodeId=${epId}&provider=${apiProvider}`);
                        const sresJson = await sres.json();
                        links[this._getLocalSourceName(source)] = { stream: sresJson.streams[0].url, type: "m3u8", tracks: sresJson.tracks || [] };
                    } catch (e) { showToast(`Failed to fetch ep-${ep.number} from ${source}: ${e}`); return null; }
                }));

                if (!epTitle || /^Episode \d+/.test(epTitle)) epTitle = undefined; // remove epTitle if episode title is blank or just "Episode X"
                yield new Episode(num, animeTitle, links, thumbnail || document.querySelector(this.thumbnail).src, epTitle);
            }
        },
        _getLocalSourceName: function (source) {
            const sourceNames = { 'animepahe': 'kiwi', 'animekai': 'arc', 'animez-sub': 'jet-sub', 'animez-dub': 'jet-dub', 'zoro': 'zoro' };
            return sourceNames[source] || source.charAt(0).toUpperCase() + source.slice(1);
        },
    },
    {
        name: 'AniZone',
        url: ['anizone.to/'],
        animeTitle: 'nav > span',
        epTitle: 'div.space-y-2 > div.text-center',
        epNumber: 'a[x-ref="activeEps"] > div > div',
        thumbnail: 'media-poster',
        epLinks: () => [...new Set(Array.from(document.querySelectorAll('a[href^="https://anizone.to/anime/"]')).map(a => a.href))],
        addStartButton: function () {
            const target = document.querySelector('button > span.truncate')?.parentElement || document.querySelector('.grow + div select');
            const button = Object.assign(document.createElement('button'), {
                id: "AniLINK_startBtn",
                className: target.className,
                style: "display: flex; justify-content: center; align-items: center; width: 100%;",
                innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" style="margin-right: 4px;" height="1em" viewBox="3 3 18 18"><path fill="currentColor" d="M5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.588 1.413T19 21H5Zm0-2h14V5H5v14Zm3-4.5h2.5v-6H8v6Zm5.25 0h2.5v-6h-2.5v6Zm5.25 0h2.5v-6h-2.5v6Z"/></svg><span class="truncate">Extract Episode Links</span>`
            });
            target.parentElement.appendChild(button);
            return button;
        },
        extractEpisodes: async function* (status) {
            const epLinks = await applyEpisodeRangeFilter(this.epLinks());
            const throttleLimit = 12; // Limit concurrent requests
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink);
                        const animeTitle = page.querySelector(this.animeTitle)?.textContent.trim();
                        const epNum = page.querySelector(this.epNumber)?.textContent.trim();
                        const epTitle = page.querySelector(this.epTitle)?.textContent.trim();
                        const thumbnail = page.querySelector(this.thumbnail)?.src;

                        status.textContent = `Extracting ${epNum} - ${epTitle}...`;
                        const links = { [page.querySelector('button > span.truncate').textContent]: { stream: page.querySelector("media-player").getAttribute("src"), type: "m3u8", tracks: [...page.querySelectorAll("media-provider>track")].map(t => ({ file: t.src, kind: t.kind, label: t.label })) } };

                        return new Episode(epNum, animeTitle, links, thumbnail, epTitle);
                    } catch (e) { showToast(e); return null; }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: 'AniXL',
        url: ['anixl.to/'],
        animeTitle: () => document.querySelector('a.link[href^="/title/"]').textContent,
        epLinks: () => [...document.querySelectorAll('div[q\\:key^="F0_"] a')].map(e=>e.href),
        addStartButton: () => document.querySelector('div.join')?.prepend( Object.assign(document.createElement('button'), {id: "AniLINK_startBtn", className: "btn btn-xs", textContent: "Generate Download Links"}) ),
        extractEpisodes: async function* (status) {
            const epLinks = await applyEpisodeRangeFilter(this.epLinks());
            const throttleLimit = 12; // Limit concurrent requests
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    return await fetchPage(epLink).then(page => {
                        const [, epNum, epTitle] = page.querySelector('a[q\\:id="1s"]').textContent.match(/Ep (\d+) : (.*)/d)
                        status.textContent = `Extracting ${epNum} - ${epTitle}...`;
                        const links = page.querySelector('script[type="qwik/json"]').textContent.match(/"[ds]ub","https:\/\/[^"]+\/media\/[^"]+\/[^"]+\.m3u8"/g)?.map(s => s.split(',').map(JSON.parse)).reduce((acc, [type, url]) => ({ ...acc, [type]: { stream: url, type: 'm3u8', tracks: [] } }), {});
                        return new Episode(epNum, this.animeTitle(), links, null, epTitle);
                    }).catch(e => { showToast(e); return null; });
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: 'Sudatchi',
        url: ['sudatchi.com/'],
        epLinks: () => [...document.querySelectorAll('.text-sm.rounded-lg')].map(e => `${location.href}/../${e.textContent}`),
        extractEpisodes: async function* (status) {
            for (let i = 0, l = await applyEpisodeRangeFilter(this.epLinks()); i < l.length; i += 6)
                yield* yieldEpisodesFromPromises(l.slice(i, i + 6).map(async link =>
                    await fetchPage(link).then(p => {
                        const tracks = JSON.parse([...p.scripts].flatMap(s => s.textContent.match(/\[{.*"}/)).filter(Boolean)[0].replaceAll('\\', '') + ']').map(i => ({ file: i.file.replace('/ipfs/', 'https://sudatchi.com/api/proxy/'), label: i.label, kind: i.kind }));
                        const links = { 'Sudatchi': { stream: p.querySelector('meta[property="og:video"]').content.replace(/http.*:8888/, location.origin), type: 'm3u8', tracks } };
                        return new Episode(link.split('/').pop(), p.querySelector('p').textContent, links, p.querySelector('video').poster);
                    }).catch(e => { showToast(e); return null; })
                ));
        }
    },
    {
        name: 'HiAnime',
        url: ['hianime.to/', 'hianimez.is/', 'hianimez.to/', 'hianime.nz/', 'hianime.bz/', 'hianime.pe/', 'hianime.cx/', 'hianime.gs/'],
        extractEpisodes: async function* (status) {
            for (let e of await applyEpisodeRangeFilter($('.ss-list > a').get())) {
                const [epId, epNum, epTitle] = [$(e).data('id'), $(e).data('number'), $(e).find('.ep-name').text()]; let thumbnail = '';
                status.textContent = `Extracting Episode ${epNum}...`;
                const links = await $((await $.get(`/ajax/v2/episode/servers?episodeId=${epId}`, r => $(r).responseJSON)).html).find('.server-item').map((_, i) => [[$(i).text().trim(), $(i).data('type')]] ).get().reduce(async (linkAcc, [server, type]) => {try {
                    await (new Promise(r => setTimeout(r, 1000))); // Throttle requests to avoid rate limiting
                    let data = await GM_fetch(`https://hianime.pstream.org/api/v2/hianime/episode/sources?animeEpisodeId=${location.pathname.split('/').pop()}?ep=${epId}&server=${server.toLowerCase()}&category=${type}`, { 'headers': { 'Origin': 'https://pstream.org' } }).then(r => r.json()).then(j => j.data);
                    thumbnail = data.tracks.find(t => t.lang === 'thumbnails')?.url || '';
                    return {...await linkAcc, [`${server}-${type}`]: { stream: data.sources[0].url, type: 'm3u8', tracks: data.tracks.filter(t=>t.lang!="thumbnails").map(t=> ({file: t.url, label: t.lang, kind: 'caption'})) }};
                } catch (e) { showToast(`Failed to fetch Ep ${epNum} from ${server}-${type} (you're probably being rate limited)`); return linkAcc; }}, Promise.resolve({}));
                yield new Episode(epNum, ($('.film-name > a').first().text()), links, thumbnail, epTitle);
            };
        }
    },
    {
        name: 'AniNow',
        url: ['aninow.tv/'],
        extractEpisodes: async function* (status) {
            for (let i = 0, l = await applyEpisodeRangeFilter([...document.querySelectorAll('a.episode-item')]); i < l.length; i+=6)
                yield* yieldEpisodesFromPromises(l.slice(i, i + 6).map(async a => {
                    status.textContent = `Extracting Episode ${a.innerText.padStart(3, '0')}...`;
                    const data = await fetchPage(a.href).then(p => JSON.parse(p.querySelector("#media-sources-data").dataset.mediaSources)).then(d => d.filter(l => !!l.url));
                    const links = data.reduce((acc, m) => (acc[`${m.providerdisplayname}-${m.language}-${m.quality}`] = {
                        stream: m.url.startsWith('videos/') ? `/storage/C:/Users/GraceAshby/OneDrive/aninow/media/${m.url}` : m.url,
                        type: m.url.endsWith('mp4') ? 'mp4' : 'm3u8',
                        tracks: m.subtitles.map(s => ({ file: s.filename, label: s.displayname, kind: 'caption' }))
                    }, acc), {});
                    return new Episode(a.innerText, document.querySelector('h1').innerText, links, document.querySelector('a>img').src);
                }));
        }
    },

    // AnimeKai is not fully implemented yet... its a work in progress...
    {
        name: 'AnimeKai',
        url: ['animekai.to/watch/'],
        animeTitle: '.title',
        thumbnail: 'img',
        addStartButton: function () {
            const button = Object.assign(document.createElement('button'), {
                id: "AniLINK_startBtn",
                className: "btn btn-primary", // Use existing site styles
                textContent: "Generate Download Links",
                style: "margin-left: 10px;"
            });
            // Add button next to the episode list controls or similar area
            const target = document.querySelector('.episode-section');
            if (target) {
                target.appendChild(button);
            } else {
                // Fallback location if the primary target isn't found
                document.querySelector('.eplist-nav')?.appendChild(button);
            }
            return button;
        },
        // --- Helper functions adapted from provided code ---
        _reverseIt: (n) => n.split('').reverse().join(''),
        _base64UrlEncode: (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        _base64UrlDecode: (n) => { n = n.padEnd(n.length + ((4 - (n.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/'); return atob(n); },
        _substitute: (input, keys, values) => { const map = Object.fromEntries(keys.split('').map((key, i) => [key, values[i] || ''])); return input.split('').map(char => map[char] || char).join(''); },
        _transform: (n, t) => { const v = Array.from({ length: 256 }, (_, i) => i); let c = 0, f = ''; for (let w = 0; w < 256; w++) { c = (c + v[w] + n.charCodeAt(w % n.length)) % 256;[v[w], v[c]] = [v[c], v[w]]; } for (let a = (c = 0), w = 0; a < t.length; a++) { w = (w + 1) % 256; c = (c + v[w]) % 256;[v[w], v[c]] = [v[c], v[w]]; f += String.fromCharCode(t.charCodeAt(a) ^ v[(v[w] + v[c]) % 256]); } return f; },
        _GenerateToken: function (n) { n = encodeURIComponent(n); return this._base64UrlEncode(this._substitute(this._base64UrlEncode(this._transform('sXmH96C4vhRrgi8', this._reverseIt(this._reverseIt(this._base64UrlEncode(this._transform('kOCJnByYmfI', this._substitute(this._substitute(this._reverseIt(this._base64UrlEncode(this._transform('0DU8ksIVlFcia2', n))), '1wctXeHqb2', '1tecHq2Xbw'), '48KbrZx1ml', 'Km8Zb4lxr1'))))))), 'hTn79AMjduR5', 'djn5uT7AMR9h')); },
        _DecodeIframeData: function (n) { n = `${n}`; n = this._transform('0DU8ksIVlFcia2', this._base64UrlDecode(this._reverseIt(this._substitute(this._substitute(this._transform('kOCJnByYmfI', this._base64UrlDecode(this._reverseIt(this._reverseIt(this._transform('sXmH96C4vhRrgi8', this._base64UrlDecode(this._substitute(this._base64UrlDecode(n), 'djn5uT7AMR9h', 'hTn79AMjduR5'))))))), 'Km8Zb4lxr1', '48KbrZx1ml'), '1tecHq2Xbw', '1wctXeHqb2')))); return decodeURIComponent(n); },
        _Decode: function (n) { n = this._substitute(this._reverseIt(this._transform('3U8XtHJfgam02k', this._base64UrlDecode(this._transform('PgiY5eIZWn', this._base64UrlDecode(this._substitute(this._reverseIt(this._substitute(this._transform('QKbVomcBHysCW9', this._base64UrlDecode(this._reverseIt(this._base64UrlDecode(n)))), '0GsO8otUi21aY', 'Go1UiY82st0Oa')), 'rXjnhU3SsbEd', 'rXEsS3nbjhUd')))))), '7DtY4mHcMA2yIL', 'IM7Am4D2yYHctL'); return decodeURIComponent(n); },
        // --- Main extraction logic ---
        extractEpisodes: async function* (status) {
            status.textContent = 'Starting AnimeKai extraction...';
            const animeTitle = document.querySelector(this.animeTitle)?.textContent || 'Unknown Anime';
            const thumbnail = document.querySelector(this.thumbnail)?.src || '';
            const ani_id = document.querySelector('.rate-box#anime-rating')?.getAttribute('data-id');

            if (!ani_id) {
                showToast("Could not find anime ID.");
                return;
            }

            const headers = {
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': window.location.href,
                'Accept': 'application/json, text/javascript, */*; q=0.01', // Ensure correct accept header
            };

            try {
                status.textContent = 'Fetching episode list...';
                const episodeListUrl = `${location.origin}/ajax/episodes/list?ani_id=${ani_id}&_=${this._GenerateToken(ani_id)}`;
                console.log(`Fetching episode list from: ${episodeListUrl}`);
                const epListResponse = await fetch(episodeListUrl, { headers });
                if (!epListResponse.ok) throw new Error(`Failed to fetch episode list: ${epListResponse.status}`);
                const epListJson = await epListResponse.json();
                console.log(`Episode list response:`, epListJson);
                const epListDoc = (new DOMParser()).parseFromString(epListJson.result, 'text/html');
                const episodeElements = Array.from(epListDoc.querySelectorAll('div.eplist > ul > li > a'));

                const throttleLimit = 5; // Limit concurrent requests to avoid rate limiting

                for (let i = 0; i < episodeElements.length; i += throttleLimit) {
                    const chunk = episodeElements.slice(i, i + throttleLimit);
                    const episodePromises = chunk.map(async epElement => {
                        const epNumber = epElement.getAttribute('num');
                        const epToken = epElement.getAttribute('token');
                        const epTitleText = epElement.querySelector('span')?.textContent || `Episode ${epNumber}`;

                        if (!epNumber || !epToken) {
                            showToast(`Skipping episode: Missing number or token.`);
                            return null;
                        }

                        try {
                            status.textContent = `Fetching servers for Ep ${epNumber}...`;
                            const serversUrl = `${location.origin}/ajax/links/list?token=${epToken}&_=${this._GenerateToken(epToken)}`;
                            const serversResponse = await fetch(serversUrl, { headers });
                            if (!serversResponse.ok) throw new Error(`Failed to fetch servers for Ep ${epNumber}: ${serversResponse.status}`);
                            const serversJson = await serversResponse.json();
                            const serversDoc = (new DOMParser()).parseFromString(serversJson.result, 'text/html');
                            console.log(JSON.stringify(serversDoc));

                            const serverElements = serversDoc.querySelectorAll('.server-items .server');

                            console.log(JSON.stringify(serverElements));
                            if (serverElements.length === 0) {
                                showToast(`No servers found for Ep ${epNumber}.`);
                                return null;
                            }

                            status.textContent = `Processing ${serverElements.length} servers for Ep ${epNumber}...`;

                            for (const serverElement of serverElements) {
                                const serverId = serverElement.getAttribute('data-lid');
                                const serverName = serverElement.textContent || `Server_${serverId?.slice(0, 4)}`; // Fallback name

                                if (!serverId) {
                                    console.warn(`Skipping server: Missing ID.`);
                                    continue;
                                }

                                try {
                                    // Fetch view link
                                    status.textContent = `Fetching video link for Ep ${epNumber}...`;
                                    const viewUrl = `${location.origin}/ajax/links/view?id=${serverId}&_=${this._GenerateToken(serverId)}`;
                                    const viewResponse = await fetch(viewUrl, { headers });
                                    if (!viewResponse.ok) throw new Error(`Failed to fetch view link for Ep ${epNumber}: ${viewResponse.status}`);
                                    const viewJson = await viewResponse.json();
                                    console.log(`View link response:`, viewJson);


                                    const decodedIframeData = JSON.parse(this._DecodeIframeData(viewJson.result));
                                    console.log(`Decoded iframe data:`, decodedIframeData);

                                    const megaUpEmbedUrl = decodedIframeData.url;

                                    if (!megaUpEmbedUrl) {
                                        showToast(`Could not decode embed URL for Ep ${epNumber}.`);
                                        return null;
                                    }

                                    // Fetch MegaUp media page to get encrypted sources
                                    const mediaUrl = megaUpEmbedUrl.replace(/\/(e|e2)\//, '/media/');
                                    status.textContent = `Fetching media data for Ep ${epNumber}...`;
                                    const mediaResponse = await GM_fetch(mediaUrl, { headers: { 'Referer': location.origin } });
                                    if (!mediaResponse.ok) throw new Error(`Failed to fetch media data for Ep ${epNumber}: ${mediaResponse.status}`);
                                    const mediaJson = await mediaResponse.json();
                                    console.log(`Media data response:`, mediaJson);


                                    if (!mediaJson.result) {
                                        showToast(`No result found in media data for Ep ${epNumber}.`);
                                        return null;
                                    }

                                    status.textContent = `Decoding sources for Ep ${epNumber}...`;
                                    const decryptedSources = JSON.parse(this._Decode(mediaJson.result).replace(/\\/g, ''));

                                    const links = {};
                                    decryptedSources.sources.forEach(source => {
                                        // Try to determine quality from URL or label if available
                                        const qualityMatch = source.file.match(/(\d{3,4})[pP]/);
                                        const quality = qualityMatch ? qualityMatch[1] + 'p' : 'Default';
                                        links[quality] = { stream: source.file, type: 'm3u8' };
                                    });

                                    status.textContent = `Extracted Ep ${epNumber}`;
                                    return new Episode(epNumber, animeTitle, links, thumbnail);

                                } catch (epError) {
                                    showToast(`Error processing Ep ${epNumber}: ${epError.message}`);
                                    console.error(`Error processing Ep ${epNumber}:`, epError);
                                    return null;
                                }

                            }
                        } catch (serverError) {
                            showToast(`Error fetching servers for Ep ${epNumber}: ${serverError.message}`);
                            console.error(`Error fetching servers for Ep ${epNumber}:`, serverError);
                            return null;
                        }
                    });

                    yield* yieldEpisodesFromPromises(episodePromises);
                }
            } catch (error) {
                showToast(`Failed AnimeKai extraction: ${error.message}`);
                console.error("AnimeKai extraction error:", error);
                status.textContent = `Error: ${error.message}`;
            }
        }
    }
];

/**
 * Fetches the HTML content of a given URL and parses it into a DOM object.
 *
 * @param {string} url - The URL of the page to fetch.
 * @returns {Promise<Document>} A promise that resolves to a DOM Document object.
 * @throws {Error} If the fetch operation fails.
 */
async function fetchPage(url) {
    const response = await fetch(url);
    if (response.ok) {
        const page = (new DOMParser()).parseFromString(await response.text(), 'text/html');
        return page;
    } else {
        showToast(`Failed to fetch HTML for ${url} : ${response.status}`);
        throw new Error(`Failed to fetch HTML for ${url} : ${response.status}`);
    }
}

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
        const episode = await episodePromise;
        if (episode) {
            yield episode;
        }
    }
}

/**
 * encodes a string to base64url format thats safe for URLs
 */
const safeBtoa = str => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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
console.log('Initializing AniLINK...');
const site = websites.find(site => site.url.some(url => window.location.href.includes(url)));

// register menu command to start script
GM_registerMenuCommand('Extract Episodes', extractEpisodes);

// attach start button to page
try {
    const startBtnId = "AniLINK_startBtn";
    (site.addStartButton(startBtnId) || document.getElementById(startBtnId))?.addEventListener('click', extractEpisodes);
} catch (e) {
    console.warn('Could not add start button to site. This might be due to the function not being implemented for this site.');
}

// append site specific css styles
document.body.style.cssText += (site.styles || '');

/***************************************************************
 * This function creates an overlay on the page and displays a list of episodes extracted from a website
 * The function is triggered by a user command registered with `GM_registerMenuCommand`.
 * The episode list is generated by calling the `extractEpisodes` method of a website object that matches the current URL.
 ***************************************************************/
async function extractEpisodes() {
    // Restore last overlay if it exists
    if (document.getElementById("AniLINK_Overlay")) {
        document.getElementById("AniLINK_Overlay").style.display = "flex";
        return;
    }
    // Flag to control extraction process
    let isExtracting = true;

    // --- Materialize CSS Initialization ---
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/icon?family=Material+Icons');

        #AniLINK_Overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 1000; display: flex; align-items: center; justify-content: center; }
        #AniLINK_LinksContainer { width: 80%; max-height: 85%; background-color: #222; color: #eee; padding: 20px; border-radius: 8px; overflow-y: auto; display: flex; flex-direction: column;} /* Flex container for status and qualities */
        .anlink-status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } /* Header for status bar and stop button */
        .anlink-status-bar { color: #eee; flex-grow: 1; margin-right: 10px; display: block; } /* Status bar takes space */
        .anlink-status-icon { background: transparent; border: none; color: #eee; cursor: pointer; padding-right: 10px; } /* status icon style */
        .anlink-status-icon i { font-size: 24px; transition: transform 0.3s ease-in-out; } /* Icon size and transition */
        .anlink-status-icon i::before { content: 'check_circle'; } /* Show check icon when not extracting */
        .anlink-status-icon i.extracting::before { content: 'auto_mode'; animation: spinning 2s linear infinite; } /* Spinner animation class */
        .anlink-status-icon:hover i.extracting::before { content: 'stop_circle'; animation: stop; } /* Show stop icon on hover when extracting */
        .anlink-quality-section { margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px; }
        .anlink-quality-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; } /* Added cursor pointer */
        .anlink-quality-header > span { color: #26a69a; font-size: 1.5em;  display: flex; align-items: center; flex-grow: 1; } /* Flex and align items for icon and text */
        .anlink-quality-header i { margin-right: 8px; transition: transform 0.3s ease-in-out; } /* Transition for icon rotation */
        .anlink-quality-header i.rotate { transform: rotate(90deg); } /* Rotate class */
        .anlink-episode-list { list-style: none; padding-left: 0; margin-top: 0; overflow: hidden; transition: max-height 0.5s ease-in-out; } /* Transition for max-height */
        .anlink-episode-item { margin-bottom: 5px; padding: 8px; border-bottom: 1px solid #333; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* Single line and ellipsis for item */
        .anlink-episode-item:last-child { border-bottom: none; }
        .anlink-episode-item > label > span { user-select: none; cursor: pointer; color: #26a69a; } /* Disable selecting the 'Ep: 1' prefix */
        .anlink-episode-item > label > span > img { display: inline; } /* Ensure the mpv icon is in the same line */
        .anlink-episode-checkbox { appearance: none; width: 20px; height: 20px; margin-right: 10px; margin-bottom: -5px; border: 1px solid #26a69a; border-radius: 4px; outline: none; cursor: pointer; transition: background-color 0.3s, border-color 0.3s; }
        .anlink-episode-checkbox:checked { background-color: #26a69a; border-color: #26a69a; }
        .anlink-episode-checkbox:checked::after { content: '✔'; display: block; color: white; font-size: 14px; text-align: center; line-height: 20px; animation: checkTilt 0.3s; }
        .anlink-episode-link { color: #ffca28; text-decoration: none; word-break: break-all; overflow: hidden; text-overflow: ellipsis; display: inline; } /* Single line & Ellipsis for long links */
        .anlink-episode-link:hover { color: #fff; }
        .anlink-header-buttons { display: flex; gap: 10px; }
        .anlink-header-buttons button { background-color: #26a69a; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; }
        .anlink-header-buttons button:hover { background-color: #2bbbad; }

        @keyframes spinning { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } /* Spinning animation */
        @keyframes checkTilt { from { transform: rotate(-20deg); } to { transform: rotate(0deg); } } /* Checkmark tilt animation */
    `);

    // Create an overlay to cover the page
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "AniLINK_Overlay";
    document.body.appendChild(overlayDiv);
    overlayDiv.onclick = e => !linksContainer.contains(e.target) &&
        (document.querySelector('.anlink-status-bar')?.textContent.startsWith("Cancelled") 
            ? overlayDiv.remove() 
            : overlayDiv.style.display = "none");

    // Create a container for links
    const linksContainer = document.createElement('div');
    linksContainer.id = "AniLINK_LinksContainer";
    overlayDiv.appendChild(linksContainer);

    // Status bar header - container for status bar and status icon
    const statusBarHeader = document.createElement('div');
    statusBarHeader.className = 'anlink-status-header';
    linksContainer.appendChild(statusBarHeader);

    // Create dynamic status icon
    const statusIconElement = document.createElement('a');
    statusIconElement.className = 'anlink-status-icon';
    statusIconElement.innerHTML = '<i class="material-icons extracting"></i>';
    statusIconElement.title = 'Stop Extracting';
    statusBarHeader.appendChild(statusIconElement);

    statusIconElement.addEventListener('click', () => {
        isExtracting = false; // Set flag to stop extraction
        statusBar.textContent = "Extraction Stopped.";
    });

    // Create a status bar
    const statusBar = document.createElement('span');
    statusBar.className = "anlink-status-bar";
    statusBar.textContent = "Extracting Links..."
    statusBarHeader.appendChild(statusBar);

    // Create a container for qualities and episodes
    const qualitiesContainer = document.createElement('div');
    qualitiesContainer.id = "AniLINK_QualitiesContainer";
    linksContainer.appendChild(qualitiesContainer);


    // --- Process Episodes using Generator ---
    statusBar.textContent = "Starting...";
    const episodeGenerator = site.extractEpisodes(statusBar);
    const qualityLinkLists = {}; // Stores lists of links for each quality

    for await (const episode of episodeGenerator) {
        if (!isExtracting) { // Check if extraction is stopped
            statusIconElement.querySelector('i').classList.remove('extracting'); // Stop spinner animation
            statusBar.textContent = "Extraction Stopped By User.";
            return; // Exit if extraction is stopped
        }
        if (!episode) continue; // Skip if episode is null (error during extraction)

        // Get all links into format - {[qual1]:[ep1,2,3,4], [qual2]:[ep1,2,3,4], ...}
        for (const quality in episode.links) {
            qualityLinkLists[quality] = qualityLinkLists[quality] || [];
            qualityLinkLists[quality].push(episode);
        }

        // Update UI in real-time - RENDER UI HERE BASED ON qualityLinkLists
        renderQualityLinkLists(qualityLinkLists, qualitiesContainer);
    }
    isExtracting = false; // Extraction completed
    statusIconElement.querySelector('i').classList.remove('extracting');
    statusBar.textContent = "Extraction Complete!";


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

            const episodes = sortedLinks[quality].sort((a, b) => a.number - b.number);

            if (!qualitySection) {
                // Create new section if it doesn't exist
                qualitySection = document.createElement('div');
                qualitySection.className = 'anlink-quality-section';
                qualitySection.dataset.quality = quality;

                const headerDiv = document.createElement('div'); // Header div for quality-string and buttons - ROW
                headerDiv.className = 'anlink-quality-header';

                // Create a span for the clickable header text and icon
                const qualitySpan = document.createElement('span');
                qualitySpan.innerHTML = `<i style="opacity: 0.5">(${sortedLinks[quality].length})</i> <i class="material-icons">chevron_right</i> ${quality}`;
                qualitySpan.addEventListener('click', toggleQualitySection);
                headerDiv.appendChild(qualitySpan);


                // --- Create Speed Dial Button in the Quality Section ---
                const headerButtons = document.createElement('div');
                headerButtons.className = 'anlink-header-buttons';
                headerButtons.innerHTML = `
                    <button type="button" class="anlink-select-links">Select</button>
                    <button type="button" class="anlink-copy-links">Copy</button>
                    <button type="button" class="anlink-export-links">Export</button>
                    <button type="button" class="anlink-play-links">Play with MPV</button>
                `;
                headerDiv.appendChild(headerButtons);
                qualitySection.appendChild(headerDiv);

                // --- Add Empty episodes list elm to the quality section ---
                episodeListElem = document.createElement('ul');
                episodeListElem.className = 'anlink-episode-list';
                episodeListElem.style.maxHeight = '0px';
                qualitySection.appendChild(episodeListElem);

                container.appendChild(qualitySection);

                // Attach handlers
                attachBtnClickListeners(episodes, qualitySection);
            } else {
                // Update header count
                const qualitySpan = qualitySection.querySelector('.anlink-quality-header > span');
                if (qualitySpan) {
                    qualitySpan.innerHTML = `<i style="opacity: 0.5">(${sortedLinks[quality].length})</i> <i class="material-icons">chevron_right</i> ${quality}`;
                }
                episodeListElem = qualitySection.querySelector('.anlink-episode-list');
            }

            // Update episode list items
            episodeListElem.innerHTML = '';
            episodes.forEach(ep => {
                const listItem = document.createElement('li');
                listItem.className = 'anlink-episode-item';
                listItem.innerHTML = `
                    <label>
                        <input type="checkbox" class="anlink-episode-checkbox" />
                        <span id="mpv-epnum" title="Play in MPV">Ep ${ep.number.replace(/^0+/, '')}: </span>
                        <a href="${ep.links[quality].stream}" class="anlink-episode-link" download="${encodeURI(ep.filename)}" data-epnum="${ep.number}" data-ep=${encodeURI(JSON.stringify({ ...ep, links: undefined }))} >${ep.links[quality].stream}</a>
                    </label>
                `;
                const episodeLinkElement = listItem.querySelector('.anlink-episode-link');
                const epnumSpan = listItem.querySelector('#mpv-epnum');
                const link = episodeLinkElement.href;
                const name = decodeURIComponent(episodeLinkElement.download);

                // On hover, show MPV icon & file name
                listItem.addEventListener('mouseenter', () => {
                    window.getSelection().isCollapsed && (episodeLinkElement.textContent = name);
                    epnumSpan.innerHTML = `<img width="20" height="20" fill="#26a69a" style="vertical-align:middle;" src="https://a.fsdn.com/allura/p/mpv-player-windows/icon?1517058933"> ${ep.number.replace(/^0+/, '')}: `;
                });
                listItem.addEventListener('mouseleave', () => {
                    episodeLinkElement.textContent = decodeURIComponent(link);
                    epnumSpan.textContent = `Ep ${ep.number.replace(/^0+/, '')}: `;
                });
                epnumSpan.addEventListener('click', e => {
                    e.preventDefault();
                    location.replace('mpv://play/' + safeBtoa(link) + `/?v_title=${safeBtoa(name)}` + `&cookies=${location.hostname}.txt`);
                    showToast('Sent to MPV. If nothing happened, install <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a>.');
                });

                episodeListElem.appendChild(listItem);
            });

            // Restore expand state only if section was previously expanded
            if (expandedState[quality]) {
                const icon = qualitySection.querySelector('.material-icons');
                episodeListElem.style.maxHeight = `${episodeListElem.scrollHeight}px`;
                icon.classList.add('rotate');
            }
        }
    }

    function toggleQualitySection(event) {
        // Target the closest anlink-quality-header span to ensure only clicks on the text/icon trigger toggle
        const qualitySpan = event.currentTarget;
        const headerDiv = qualitySpan.parentElement;
        const qualitySection = headerDiv.closest('.anlink-quality-section');
        const episodeList = qualitySection.querySelector('.anlink-episode-list');
        const icon = qualitySpan.querySelector('.material-icons'); // Query icon within the span
        const isCollapsed = episodeList.style.maxHeight === '0px';

        if (isCollapsed) {
            episodeList.style.maxHeight = `${episodeList.scrollHeight}px`; // Expand to content height
            icon.classList.add('rotate'); // Rotate icon on expand
        } else {
            episodeList.style.maxHeight = '0px'; // Collapse
            icon.classList.remove('rotate'); // Reset icon rotation
        }
    }

    // Attach click listeners to the speed dial buttons for each quality section
    function attachBtnClickListeners(episodeList, qualitySection) {
        const buttonActions = [
            { selector: '.anlink-select-links', handler: onSelectBtnPressed },
            { selector: '.anlink-copy-links', handler: onCopyBtnClicked },
            { selector: '.anlink-export-links', handler: onExportBtnClicked },
            { selector: '.anlink-play-links', handler: onPlayBtnClicked }
        ];

        buttonActions.forEach(({ selector, handler }) => {
            const button = qualitySection.querySelector(selector);
            button.addEventListener('click', () => handler(button, episodeList, qualitySection));
        });

        // Helper function to get checked episode items within a quality section
        function _getSelectedEpisodeItems(qualitySection) {
            return Array.from(qualitySection.querySelectorAll('.anlink-episode-item input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.closest('.anlink-episode-item'));
        }

        // Helper function to prepare m3u8 playlist string from given episodes
        function _preparePlaylist(episodes, quality) {
            let playlistContent = '#EXTM3U\n';
            episodes.forEach(episode => {
                const linkObj = episode.links[quality];;
                if (!linkObj) {
                    showToast(`No link found for source ${quality} in episode ${episode.number}`);
                    return;
                }
                // Add tracks if present (subtitles, audio, etc.)
                if (linkObj.tracks && Array.isArray(linkObj.tracks) && linkObj.tracks.length > 0) {
                    linkObj.tracks.forEach(track => {
                        // EXT-X-MEDIA for subtitles or alternate audio
                        if (track.kind && track.kind.startsWith('audio')) {
                            playlistContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio${episode.number}\",NAME=\"${track.label || 'Audio'}\",DEFAULT=${track.default ? 'YES' : 'NO'},URI=\"${track.file}\"\n`;
                        } else if (/^(caption|subtitle)s?/.test(track.kind)) {
                            playlistContent += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"subs${episode.number}\",NAME=\"${track.label || 'Subtitle'}\",DEFAULT=${track.default ? 'YES' : 'NO'},URI=\"${track.file}\"\n`;
                        }
                    });
                }
                playlistContent += `#EXTINF:-1,${episode.filename}\n`;
                playlistContent += `${linkObj.stream}\n`;
            });
            return playlistContent;
        }

        // Select Button click event handler
        function onSelectBtnPressed(button, episodes, qualitySection) {
            const episodeItems = qualitySection.querySelector('.anlink-episode-list').querySelectorAll('.anlink-episode-item');
            const checkboxes = Array.from(qualitySection.querySelectorAll('.anlink-episode-item input[type="checkbox"]'));
            const allChecked = checkboxes.every(cb => cb.checked);
            const anyUnchecked = checkboxes.some(cb => !cb.checked);

            if (anyUnchecked || allChecked === false) { // If any unchecked OR not all are checked (for the first click when none are checked)
                checkboxes.forEach(checkbox => { checkbox.checked = true; }); // Check all
                // Select all link texts
                const range = new Range();
                range.selectNodeContents(episodeItems[0]);
                range.setEndAfter(episodeItems[episodeItems.length - 1]);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                button.textContent = 'Deselect All'; // Change button text to indicate deselect
            } else { // If all are already checked
                checkboxes.forEach(checkbox => { checkbox.checked = false; }); // Uncheck all
                window.getSelection().removeAllRanges(); // Clear selection
                button.textContent = 'Select All'; // Revert button text
            }
            setTimeout(() => { button.textContent = checkboxes.some(cb => !cb.checked) ? 'Select All' : 'Deselect All'; }, 1500); // slight delay revert text
        }

        // copySelectedLinks click event handler
        function onCopyBtnClicked(button, episodes, qualitySection) {
            const selectedItems = _getSelectedEpisodeItems(qualitySection);
            const linksToCopy = selectedItems.length ? selectedItems.map(item => item.querySelector('.anlink-episode-link').href) : Array.from(qualitySection.querySelectorAll('.anlink-episode-item')).map(item => item.querySelector('.anlink-episode-link').href);

            const string = linksToCopy.join('\n');
            navigator.clipboard.writeText(string);
            button.textContent = 'Copied Selected';
            setTimeout(() => { button.textContent = 'Copy'; }, 1000);
        }

        // exportToPlaylist click event handler
        function onExportBtnClicked(button, episodes, qualitySection) {
            const quality = qualitySection.dataset.quality;
            const selectedItems = _getSelectedEpisodeItems(qualitySection);

            const items = selectedItems.length ? selectedItems : Array.from(qualitySection.querySelectorAll('.anlink-episode-item'));
            const playlist = _preparePlaylist(episodes.filter(ep => items.find(i => i.querySelector(`[data-epnum="${ep.number}"]`))), quality);
            const fileName = JSON.parse(decodeURI(items[0]?.querySelector('.anlink-episode-link')?.dataset.ep)).animeTitle + `${GM_getValue('include_source_in_filename', true) ? ` [${quality}]` : ''}.m3u8`;
            const file = new Blob([playlist], { type: 'application/vnd.apple.mpegurl' });
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: fileName });
            a.click();

            button.textContent = 'Exported Selected';
            setTimeout(() => { button.textContent = 'Export'; }, 1000);
        }

        // Play click event handler
        async function onPlayBtnClicked(button, episodes, qualitySection) {
            const quality = qualitySection.dataset.quality;
            const selectedEpisodeItems = _getSelectedEpisodeItems(qualitySection);
            const items = selectedEpisodeItems.length ? selectedEpisodeItems : Array.from(qualitySection.querySelectorAll('.anlink-episode-item'));
            const epList = episodes.filter(ep => items.find(i => i.querySelector(`[data-epnum="${ep.number}"]`))).filter(Boolean);

            button.textContent = 'Processing...';
            const playlistContent = _preparePlaylist(epList, quality);
            const uploadUrl = await GM_fetch("https://paste.rs/", {
                method: "POST",
                body: playlistContent
            }).then(r => r.text()).then(t => t + '.m3u8');
            console.log(`Playlist URL:`, uploadUrl);

            // Use mpv:// protocol to pass the paste.rs link to mpv (requires mpv-handler installed)
            const mpvUrl = 'mpv://play/' + safeBtoa(uploadUrl.trim()) + '/?v_title=' + safeBtoa(epList[0].animeTitle);
            location.replace(mpvUrl);

            button.textContent = 'Sent to MPV';
            setTimeout(() => { button.textContent = 'Play with MPV'; }, 2000);
            setTimeout(() => {
                showToast('If nothing happened, you need to install <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a> to enable this feature.');
            }, 1000);
        }
    }
}

/***************************************************************
 * Modern Episode Range Selector with Keyboard Navigation
 ***************************************************************/
async function showEpisodeRangeSelector(total) {
    return new Promise(resolve => {
        const modal = Object.assign(document.createElement('div'), {
            innerHTML: `
                <div class="anlink-modal-backdrop">
                    <div class="anlink-modal">
                        <div class="anlink-modal-header">
                            <div class="anlink-modal-icon">📺</div>
                            <h2>Episode Range</h2>
                            <div class="anlink-episode-count">${total} episodes found</div>
                            <small style="display:block;color:#ccc;font-size:11px;margin-top:2px;">
                                Note: Range is by episode count, not episode number<br>(e.g., 1-6 means the first 6 episodes listed).
                            </small>
                        </div>                        
                        <div class="anlink-modal-body">
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
                        </div>                        
                        <div class="anlink-modal-footer">
                            <button class="anlink-btn anlink-btn-cancel" data-key="Escape" tabindex="6"><kbd>Esc</kbd> Cancel</button>
                            <button class="anlink-btn anlink-btn-primary" data-key="Enter" tabindex="7"><kbd>Enter</kbd> Extract</button>
                        </div>
                    </div>
                </div>
            `,
            style: 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1001;'
        });

        // Enhanced styling with keyboard indicators
        GM_addStyle(`
            .anlink-modal-backdrop { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); }
            .anlink-modal { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); width: 420px; max-width: 90vw; color: #fff; overflow: hidden; }
            .anlink-modal-header { text-align: center; padding: 24px 24px 16px; background: linear-gradient(135deg, #26a69a 0%, #20847a 100%); }
            .anlink-modal-icon { font-size: 48px; margin-bottom: 8px; }
            .anlink-modal h2 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
            .anlink-episode-count { opacity: 0.9; font-size: 14px; }
            .anlink-modal-body { padding: 24px; }
            .anlink-range-inputs { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
            .anlink-input-group { flex: 1; }
            .anlink-input-group label { display: block; margin-bottom: 8px; font-size: 14px; color: #26a69a; font-weight: 500; }
            .anlink-input-group input { width: 100%; padding: 12px; border: 2px solid #444; border-radius: 8px; background: #1a1a1a; color: #fff; font-size: 16px; text-align: center; transition: all 0.2s; }
            .anlink-input-group input:focus { outline: none; border-color: #26a69a; box-shadow: 0 0 0 3px rgba(38,166,154,0.1); }
            .anlink-range-divider { color: #26a69a; font-weight: bold; font-size: 18px; margin-top: 24px; }
            .anlink-quick-select { display: flex; gap: 8px; margin-bottom: 16px; }
            .anlink-quick-btn { flex: 1; padding: 8px 12px; border: 1px solid #444; border-radius: 6px; background: transparent; color: #ccc; cursor: pointer; font-size: 12px; transition: all 0.2s; position: relative; }
            .anlink-quick-btn:hover, .anlink-quick-btn:focus { border-color: #26a69a; color: #26a69a; background: rgba(38,166,154,0.1); outline: none; }            .anlink-help-text { font-size: 11px; color: #888; text-align: center; margin-top: 12px; }
            .anlink-modal-footer { display: flex; gap: 12px; padding: 0 24px 24px; }
            .anlink-btn { flex: 1; padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; position: relative; }
            .anlink-btn:focus { outline: 2px solid #26a69a; outline-offset: 2px; }
            .anlink-btn-cancel { background: #444; color: #ccc; }
            .anlink-btn-cancel:hover, .anlink-btn-cancel:focus { background: #555; }
            .anlink-btn-primary { background: linear-gradient(135deg, #26a69a 0%, #20847a 100%); color: #fff; }
            .anlink-btn-primary:hover, .anlink-btn-primary:focus { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(38,166,154,0.3); }
            kbd { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; padding: 1px 4px; font-size: 10px; margin-right: 4px; }
        `);

        document.body.appendChild(modal);

        const [startInput, endInput] = modal.querySelectorAll('input');
        const buttons = modal.querySelectorAll('button');
        const primaryBtn = modal.querySelector('.anlink-btn-primary');
        const cancelBtn = modal.querySelector('.anlink-btn-cancel');

        const validate = () => {
            const s = Math.max(1, Math.min(total, +startInput.value));
            const e = Math.max(s, Math.min(total, +endInput.value));
            startInput.value = s; endInput.value = e;
        };

        const cleanup = () => modal.remove();
        const accept = () => { validate(); cleanup(); resolve({ start: +startInput.value, end: +endInput.value }); };
        const cancel = () => { cleanup(); resolve(null); };

        // Keyboard navigation with arrow keys for number inputs
        modal.addEventListener('keydown', e => {
            switch (e.key) {
                case 'Escape': e.preventDefault(); cancel(); break;
                case 'Enter': e.preventDefault(); accept(); break;
                case 'f': case 'F':
                    if (!e.target.matches('input') && !e.ctrlKey && !e.altKey) {
                        e.preventDefault();
                        startInput.focus();
                        startInput.select();
                    }
                    break;
            }
        });

        // Input validation and arrow key navigation for number inputs
        [startInput, endInput].forEach(input => {
            input.addEventListener('input', validate);
            input.addEventListener('keydown', e => {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    input.value = Math.min(total, (+input.value || 0) + 1);
                    validate();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    input.value = Math.max(1, (+input.value || 2) - 1);
                    validate();
                } else if (e.key === 'Tab' && !e.shiftKey && input === endInput) {
                    e.preventDefault();
                    modal.querySelector('.anlink-quick-btn').focus();
                }
            });
        });
        // Quick select buttons
        modal.querySelectorAll('.anlink-quick-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const [s, e] = btn.dataset.range.split(',').map(Number);
                startInput.value = s;
                endInput.value = e;
                validate();
                // Focus extract button after quick select
                setTimeout(() => primaryBtn.focus(), 100);
            });

            // Arrow key navigation between quick select buttons
            btn.addEventListener('keydown', e => {
                if (e.key === 'ArrowLeft' && index > 0) {
                    e.preventDefault();
                    modal.querySelectorAll('.anlink-quick-btn')[index - 1].focus();
                } else if (e.key === 'ArrowRight' && index < 2) {
                    e.preventDefault();
                    modal.querySelectorAll('.anlink-quick-btn')[index + 1].focus();
                } else if (e.key === 'Tab' && !e.shiftKey && index === 2) {
                    e.preventDefault();
                    cancelBtn.focus();
                }
            });
        });
        // Button handlers with enhanced keyboard navigation
        cancelBtn.addEventListener('click', cancel);
        cancelBtn.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                primaryBtn.focus();
            }
        });

        primaryBtn.addEventListener('click', accept);
        primaryBtn.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                cancelBtn.focus();
            }
        });

        // Focus management - start with first input and select all text
        setTimeout(() => {
            startInput.focus();
            startInput.select();
        }, 100);
    });
}

/***************************************************************
 * Apply episode range filtering with modern UI
 ***************************************************************/
async function applyEpisodeRangeFilter(allEpLinks) {
    const status = document.querySelector('.anlink-status-bar');
    const epRangeThreshold = GM_getValue('ep_range_threshold', 24)
    if (allEpLinks.length <= epRangeThreshold) return allEpLinks;

    status.textContent = `Found ${allEpLinks.length} episodes. Waiting for selection...`;
    const selection = await showEpisodeRangeSelector(allEpLinks.length);

    if (!selection) {
        status.textContent = 'Cancelled by user.';
        return null;
    }

    const filtered = allEpLinks.slice(selection.start - 1, selection.end);
    status.textContent = `Extracting episodes ${selection.start}-${selection.end} of ${allEpLinks.length}...`;
    return filtered;
}

/***************************************************************
 * Display a simple toast message on the top right of the screen
 ***************************************************************/
let toasts = [];

function showToast(message) {
    const maxToastHeight = window.innerHeight * 0.5;
    const toastHeight = 50; // Approximate height of each toast
    const maxToasts = Math.floor(maxToastHeight / toastHeight);

    console.log(message);

    // Create the new toast element
    const x = document.createElement("div");
    x.innerHTML = message;
    x.style.color = "#000";
    x.style.backgroundColor = "#fdba2f";
    x.style.borderRadius = "10px";
    x.style.padding = "10px";
    x.style.position = "fixed";
    x.style.top = `${toasts.length * toastHeight}px`;
    x.style.right = "5px";
    x.style.fontSize = "large";
    x.style.fontWeight = "bold";
    x.style.zIndex = "10000";
    x.style.display = "block";
    x.style.borderColor = "#565e64";
    x.style.transition = "right 2s ease-in-out, top 0.5s ease-in-out";
    document.body.appendChild(x);

    // Add the new toast to the list
    toasts.push(x);

    // Remove the toast after it slides out
    setTimeout(() => {
        x.style.right = "-1000px";
    }, 3000);

    setTimeout(() => {
        x.style.display = "none";
        if (document.body.contains(x)) document.body.removeChild(x);
        toasts = toasts.filter(toast => toast !== x);
        // Move remaining toasts up
        toasts.forEach((toast, index) => {
            toast.style.top = `${index * toastHeight}px`;
        });
    }, 4000);

    // Limit the number of toasts to maxToasts
    if (toasts.length > maxToasts) {
        const oldestToast = toasts.shift();
        document.body.removeChild(oldestToast);
        toasts.forEach((toast, index) => {
            toast.style.top = `${index * toastHeight}px`;
        });
    }
}

// On overlay open, show a help link for mpv-handler if not detected
function showMPVHandlerHelp() {
    showToast('To play directly in MPV, install <a href="https://github.com/akiirui/mpv-handler" target="_blank" style="color:#1976d2;">mpv-handler</a> and reload this page.');
}