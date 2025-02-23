// ==UserScript==
// @name        AniLINK - Episode Link Extractor
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     6.2.0
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
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// ==/UserScript==

class Episode {
    constructor(number, title, links, type, thumbnail) {
        this.number = number;   // The episode number
        this.title = title;     // The title of the episode (this can be the specific ep title or just the anime name).
        this.links = links;     // An object containing the download links for the episode, keyed by quality (eg: {"source1":"http://linktovideo.mp4", "source2":"vid2.mp4"}).
        this.type = type;       // The file type of the video links (eg: "mp4", "m3u8").
        this.thumbnail = thumbnail; // The URL of the episode's thumbnail image (if unavailable, then just any image is fine. Thumbnail property isnt really used in the script yet).
        this.name = `${this.title} - ${this.number.padStart(3, '0')}.${this.type}`;   // The formatted name of the episode, combining title and number.
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
        addStartButton: function() {
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
            status.textContent = 'Starting...';
            const throttleLimit = 12; // Number of episodes to extract in parallel
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);

                    const [, epTitle, epNumber] = page.querySelector(this.epTitle).textContent.match(/(.+?) Episode (\d+(?:\.\d+)?)/);
                    const thumbnail = page.querySelector(this.thumbnail).src;
                    status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, '0')}...`;
                    const links = [...page.querySelectorAll(this.linkElems)].reduce((obj, elem) => ({ ...obj, [elem.textContent.trim()]: elem.href }), {});
                    status.textContent = `Extracted ${epTitle} - ${epNumber.padStart(3, '0')}`;

                    return new Episode(epNumber, epTitle, links, 'mp4', thumbnail); // Return Episode object
                } catch (e) { showToast(e); return null; } }); // Handle errors and return null

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
        addStartButton: function() {
            return document.querySelector(".content .navigation").appendChild(Object.assign(document.createElement('a'), { id: "AniLINK_startBtn", className: "link p-15", textContent: "Generate Download Links" }));
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Getting list of episodes...';
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 6;    // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async (epLink, index) => { try {
                    status.textContent = `Loading ${epLink.pathname}`
                    const page = await fetchPage(epLink.href);

                    const animeTitle = page.querySelector(this.animeTitle).textContent;
                    const epNumber = epLink.href.match(/(\d+)\/?$/)[1];
                    const epTitle = page.querySelector(this.epTitle).textContent.match(/^${epNumber} : (.+)$/) || animeTitle;
                    const thumbnail = document.querySelectorAll(this.thumbnail)[index].src;
                    status.textContent = `Extracting ${`${epNumber.padStart(3, '0')} - ${animeTitle}` + (epTitle != animeTitle ? `- ${epTitle}` : '')}...`;
                    const links = await this._getVideoLinks(page, status, (`${epNumber.padStart(3, '0')} - ${animeTitle}` + (epTitle != animeTitle ? `- ${epTitle}` : '')));

                    return new Episode(epNumber, epTitle, links, 'm3u8', thumbnail); // Return Episode object
                } catch (e) { showToast(e); return null; } }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
            }
        },
        _getVideoLinks: async function (page, status, episodeTitle) {
            const embedLinkId = page.body.innerHTML.match(new RegExp(`src="//${page.domain}/e/(.*?)/"`))[1];
            const embedApiResponse = await fetch(`https://${page.domain}/api/embed/`, { method: 'POST', headers: {"X-Requested-With": "XMLHttpRequest"}, body: new URLSearchParams({ id: embedLinkId, ac: "0" }) });
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
        url: ['animepahe.ru', 'animepahe.com', 'animepahe.org', 'animepahe'],
        epLinks: (document.location.pathname.startsWith('/anime/'))? '.play': '.dropup.episode-menu .dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
        addStartButton: function() {
            GM_addStyle(`.theatre-settings .col-sm-3 { max-width: 20%; }`);
            (document.location.pathname.startsWith('/anime/'))
                ? document.querySelector(".col-6.bar").innerHTML += `
                    <div class="btn-group btn-group-toggle">
                        <label id="AniLINK_startBtn" class="btn btn-dark btn-sm">Generate Download Links</label>
                    </div>`
                : document.querySelector("div.theatre-settings > div.row").innerHTML += `
                    <div class="col-12 col-sm-3">
                        <div class="dropup">
                            <a class="btn btn-secondary btn-block" id="AniLINK_startBtn">
                                Generate Download Links
                            </a>
                        </div>
                    </div>
                `;
            return document.getElementById("AniLINK_startBtn");
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Starting...';
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 200;  // Setting high throttle limit actually improves performance

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);

                    if (page.querySelector(this.epTitle) == null) return;
                    const [, epTitle, epNumber] = page.querySelector(this.epTitle).outerText.split(/Watch (.+) - (\d+(?:\.\d+)?) Online$/);
                    const thumbnail = page.querySelector(this.thumbnail).src;
                    status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, "0")}...`;

                    async function getVideoUrl(kwikUrl) {
                        const response = await fetch(kwikUrl, { headers: { "Referer": "https://animepahe.com" } });
                        const data = await response.text();
                        return eval(/(eval)(\(f.*?)(\n<\/script>)/s.exec(data)[2].replace("eval", "")).match(/https.*?m3u8/)[0];
                    }
                    let links = {};
                    for (const elm of [...page.querySelectorAll(this.linkElems)]) {
                        links[elm.textContent] = await getVideoUrl(elm.getAttribute('data-src'));
                        status.textContent = `Parsed ${`${epNumber.padStart(3, '0')} - ${epTitle}`}`;
                    }

                    return new Episode(epNumber, epTitle, links, 'm3u8', thumbnail);
                } catch (e) { showToast(e); return null; } });

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
        addStartButton: function() {
            (document.location.pathname.startsWith('/title/')
                ? document.querySelector(".album-top-box"): document.querySelector('.video-container .title-box'))
                    .innerHTML += `<a id="AniLINK_startBtn" class="btn btn-outline rounded-btn">Generate Download Links</a>`;
            return document.getElementById("AniLINK_startBtn");
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Starting...';
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 12;

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);
                    const epTitle = page.querySelector(this.epTitle).textContent.trim();
                    const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '')
                    const thumbnail = page.querySelector(this.thumbnail).poster;

                    status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                    const links = { 'Video Links': page.querySelector('video > source').src };

                    return new Episode(epNumber, epTitle, links, 'mp4', thumbnail);
                } catch (e) { showToast(e); return null; } });

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
        addStartButton: function() {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; background-color: #145132; float: right;`;
            button.innerHTML = 'Generate Download Links';
            document.querySelector('table > tbody > tr:nth-child(2) > td > div > table > tbody > tr > td > h2').appendChild(button);
            return button;
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Starting...';
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 12;    // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);
                    const epTitle = page.querySelector(this.epTitle).textContent;
                    const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '')

                    status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                    const links = { 'mp4': page.querySelector('video > source').src };

                    return new Episode(epNumber, epTitle, links, 'mp4', this.thumbnail); // Return Episode object
                } catch (e) { showToast(e); return null; } }); // Handle errors and return null

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
        addStartButton: function() {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; border: 2px solid red; padding: 4px;`;
            button.innerHTML = 'Generate Download Links';
            document.querySelector("div.linetitle2.c2").parentNode.insertBefore(button, document.querySelector("div.linetitle2.c2"));
            return button;
        },
        extractEpisodes: async function* (status) {
            status.textContent = 'Starting...';
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 12; // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);
                    const epTitle = page.querySelector(this.epTitle).textContent;
                    const epNumber = page.querySelector(this.epNum).textContent.replace("Episode ", '');
                    const thumbnail = document.querySelector(this.thumbnail).src;

                    status.textContent = `Extracting ${epTitle} - ${epNumber}...`;
                    const links = [...page.querySelectorAll('#vid > source')].reduce((acc, source) => ({ ...acc, [source.src.match(/\/\/(\w+)\./)[1]]: source.src }), {});

                    return new Episode(epNumber, epTitle, links, 'mp4', thumbnail); // Return Episode object
                } catch (e) { showToast(e); return null; } }); // Handle errors and return null

                yield* yieldEpisodesFromPromises(episodePromises); // Use helper function
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



// initialize
console.log('Initializing AniLINK...');
const site = websites.find(site => site.url.some(url => window.location.href.includes(url)));

// register menu command to start script
GM_registerMenuCommand('Extract Episodes', extractEpisodes);

// attach start button to page
site.addStartButton().addEventListener('click', extractEpisodes);

// append site specific css styles
document.body.style.cssText += (site.styles || '');

// This function creates an overlay on the page and displays a list of episodes extracted from a website.
// The function is triggered by a user command registered with `GM_registerMenuCommand`.
// The episode list is generated by calling the `extractEpisodes` method of a website object that matches the current URL.
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
        .anlink-episode-checkbox { appearance: none; width: 20px; height: 20px; margin-right: 10px; border: 1px solid #26a69a; border-radius: 4px; outline: none; cursor: pointer; transition: background-color 0.3s, border-color 0.3s; }
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
    overlayDiv.onclick = event => linksContainer.contains(event.target) ? null : overlayDiv.style.display = "none";

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
        const previousExpandedState = {};
        container.querySelectorAll('.anlink-quality-section').forEach(section => {
            const quality = section.dataset.quality;
            const episodeList = section.querySelector('.anlink-episode-list');
            previousExpandedState[quality] = episodeList.style.maxHeight !== '0px';
        });

        container.innerHTML = ''; // Clear existing content
        for (const quality in sortedLinks) {
            const episodes = sortedLinks[quality].sort((a, b) => a.number - b.number); // Ensure episodes are sorted

            const qualitySection = document.createElement('div');
            qualitySection.className = 'anlink-quality-section';
            qualitySection.dataset.quality = quality; // Store quality-string in data attribute

            const headerDiv = document.createElement('div'); // Header div for quality-string and buttons - ROW
            headerDiv.className = 'anlink-quality-header';

            // Create a span for the clickable header text and icon
            const qualitySpan = document.createElement('span');
            qualitySpan.innerHTML = `<i class="material-icons">chevron_right</i> ${quality}`; // Expand icon and quality text
            qualitySpan.addEventListener('click', toggleQualitySection); // Add click listener to the span
            headerDiv.appendChild(qualitySpan);


            // --- Create Speed Dial Button in the Quality Section ---
            const headerButtons = document.createElement('div');
            headerButtons.className = 'anlink-header-buttons';
            headerButtons.innerHTML = `
                <button type="button" class="anlink-select-links">Select</button>
                <button type="button" class="anlink-copy-links">Copy</button>
                <button type="button" class="anlink-export-links">Export</button>
                <button type="button" class="anlink-play-links">Play</button>
            `;
            headerDiv.appendChild(headerButtons);
            qualitySection.appendChild(headerDiv);


            // --- Populate the quality section with episodes ---
            const episodeListElem = document.createElement('ul');
            episodeListElem.className = 'anlink-episode-list';
            episodeListElem.style.maxHeight = '0px'; // Default to collapsed

            episodes.forEach(ep => {
                const listItem = document.createElement('li');
                listItem.className = 'anlink-episode-item';
                listItem.innerHTML = `
                    <label>
                        <input type="checkbox" class="anlink-episode-checkbox" />
                        <span>Ep ${ep.number.replace(/^0+/, '')}: </span>
                        <a href="${ep.links[quality]}" class="anlink-episode-link" download="${encodeURI(ep.name)}" data-epnum="${ep.number}" title="${ep.title.replace(/[<>:"/\\|?*]/g, '')}">${ep.links[quality]}</a>
                    </label>
                `;
                const episodeLinkElement = listItem.querySelector('.anlink-episode-link');
                const link = episodeLinkElement.href;
                const name = decodeURIComponent(episodeLinkElement.download);
                listItem.addEventListener('mouseenter', () => window.getSelection().isCollapsed && (episodeLinkElement.textContent = name));
                listItem.addEventListener('mouseleave', () => episodeLinkElement.textContent = decodeURIComponent(link));

                episodeListElem.appendChild(listItem);
            });
            qualitySection.appendChild(episodeListElem); // Append ul inside section
            container.appendChild(qualitySection);

            // Attach handlers to the quality sections
            attachBtnClickListeners(episodes, qualitySection);

            // Restore expand state
            if (previousExpandedState[quality]) {
                const icon = qualitySpan.querySelector('.material-icons');
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
                playlistContent += `#EXTINF:-1,${episode.name}\n`;
                playlistContent += `${episode.links[quality]}\n`;
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
            const fileName = items[0]?.querySelector('.anlink-episode-link')?.title + `_${quality}.m3u`;
            const file = new Blob([playlist], { type: 'application/vnd.apple.mpegurl' });
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: fileName });
            a.click();

            button.textContent = 'Exported Selected';
            setTimeout(() => { button.textContent = 'Export'; }, 1000);
        }
        
        // PlayWithVLC click event handler
        function onPlayBtnClicked(button, episodes, qualitySection) {
            const quality = qualitySection.dataset.quality;
            const selectedEpisodeItems = _getSelectedEpisodeItems(qualitySection);
            
            const items = selectedEpisodeItems.length ? selectedEpisodeItems : Array.from(qualitySection.querySelectorAll('.anlink-episode-item'));
            const playlist = _preparePlaylist(episodes.filter(ep => items.find(i => i.querySelector(`[data-epnum="${ep.number}"]`))), quality);
            const file = new Blob([playlist], {type:'application/vnd.apple.mpegurl', });
            const fileUrl = URL.createObjectURL(file);
            window.open(fileUrl);
            
            button.textContent = 'Playing Selected';
            setTimeout(() => { button.textContent = 'Play'; }, 2000);
            alert("Due to browser limitations, there is a high possibility that this feature may not work correctly.\nIf the video does not automatically play, please utilize the export button and manually open the playlist file manually.");
        }
    }
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