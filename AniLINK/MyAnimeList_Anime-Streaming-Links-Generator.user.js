// ==UserScript==
// @name        MyAnimeList - Anime Streaming Links Generator
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.2.0
// @description Stream or download your favorite anime series effortlessly with AniLINK! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=myanimelist.net
// @author      Jery
// @license     MIT
// @match       https://myanimelist.net/animelist/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlHttpRequest
// @connect     animez.org
//				Using GM_fetch for bypassing CORS
// @require     https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

// --- Helper Functions ---

/**
 * Placeholder for a function that fetches HTML content from a URL using GM_xmlhttpRequest
 * and returns a parsed DOM Document.
 * @param {string} url - The URL to fetch.
 * @param {object} [options] - Optional fetch options (e.g., headers, method).
 * @returns {Promise<Document>} A promise resolving to the parsed HTML Document.
 */
async function fetchPage(url, options = {}) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: options.method || "GET",
            url: url,
            headers: options.headers || {},
            responseType: "document",
            onload: (response) => {
                // Check if the document contains a Cloudflare challenge message
                if (response.responseText.includes("Just a moment")) {
                    reject(new Error(`Cloudflare challenge detected for ${url}`));
                    return;
                }
                if (response.status >= 200 && response.status < 300) {
                    resolve(response.response);
                } else {
                    reject(new Error(`Failed to fetch ${url}: ${response.statusText}`));
                }
            },
            onerror: (error) => {
                reject(new Error(`Network error fetching ${url}: ${error.statusText}`));
            },
            ontimeout: () => {
                reject(new Error(`Timeout fetching ${url}`));
            }
        });
    });
}

/**
 * Placeholder for a function that fetches JSON content from a URL using GM_xmlhttpRequest.
 * @param {string} url - The URL to fetch.
 * @param {object} [options] - Optional fetch options (e.g., headers, method, data).
 * @returns {Promise<object>} A promise resolving to the parsed JSON object.
 */
async function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: options.method || "GET",
            url: url,
            headers: options.headers || { "Accept": "application/json" },
            data: options.data,
            responseType: "json",
            onload: (response) => {
                if (response.status >= 200 && response.status < 300) {
                    resolve(response.response);
                } else {
                    console.error(`Failed to fetch ${url}: ${response.status}`);
                    reject(new Error(`Failed to fetch: ${response.status} - ${response.statusText}`));
                }
            },
            onerror: (error) => {
                reject(new Error(`Network error fetching: ${error.status} - ${error.statusText}`));
            },
            ontimeout: () => {
                reject(new Error(`Timeout fetching ${url}`));
            }
        });
    });
}


class Anime {
    constructor(id, title, poster, url, sourceSite) {
        this.id = id;               // ID of the anime taken from the sourceSite
        this.title = title;         // Title of the anime series
        this.poster = poster,       // Anime poster
            this.url = url;             // URL of the anime on the source website
        this.sourceSite = sourceSite; // Name of the website (e.g., 'AnimePahe')
        this.episodes = [];       // Array to hold Episode objects (can be populated later)
    }

    get domain() { return new URL(this.url).hostname; }
}

class Episode {
    constructor(number, epTitle, links, thumbnail) {
        this.number = String(number);
        this.epTitle = epTitle; // The episode title (can be blank or undefined)
        this.links = links; // { source: { stream, type: 'mp4|m3u8', tracks: [] } }
        this.thumbnail = thumbnail;
        // Use the anime title from the parent Anime object if available, otherwise use the episode title
        this.name = (parentAnimeTitle, epNum, epTitle) => `${parentAnimeTitle} - ${String(epNum).padStart(3, '0')}${epTitle ? ` - ${epTitle}` : ''}.${Object.values(this.links)[0]?.type || 'm3u8'}`;
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
        try {
            const episode = await episodePromise;
            if (episode) {
                yield episode;
            }
        } catch (error) {
            showToast(`Error processing episode promise: ${error.message}`);
            console.error("Error processing episode promise:", error);
        }
    }
}


// --- Website Configurations ---
const websites = [
    {
        name: 'AnimePahe',
        domains: ['animepahe.com', 'animepahe.ru', 'animepahe.org'],
        searchTitles: async function (domain, title) {
            const searchUrl = `https://${domain}/api?m=search&l=8&q=${encodeURIComponent(title)}`;
            const responseData = await fetchJson(searchUrl);
            const resultsData = responseData.data;

            const results = resultsData.map(item => {
                const animeSession = item.session;
                if (!animeSession) {
                    console.warn("AnimePahe search result item missing session:", item);
                    return null; // Skip items without a session ID
                }
                const url = `https://${domain}/anime/${animeSession}`;
                // Return a new Anime instance
                return new Anime(item.session, item.title, item.poster, url, this.name);
            }).filter(item => item !== null);

            return results;
        },
        /**
         * @param {Anime} anime - The Anime object containing details like title and URL.
         * @param {function(string): void} updateStatus - Callback to update the UI status.
         */
        extractEpisodes: async function* (anime, updateStatus) {
            let currentPage = 1;
            let lastPage = 1;
            const throttleLimit = 5; // Limit concurrent Kwik fetches

            do {
                const apiUrl = `https://${anime.domain}/api?m=release&id=${anime.id}&sort=episode_asc&page=${currentPage}`;
                const releaseData = await fetchJson(apiUrl);

                if (!releaseData || !releaseData.data || releaseData.data.length === 0) {
                    // If it's the first page and no data, throw error. Otherwise, might just be end of pagination.
                    if (currentPage === 1) throw new Error(`No episode data found.`);
                    else break; // Stop if subsequent pages have no data
                }

                lastPage = releaseData.last_page;
                const episodesData = releaseData.data;

                // Process episodes in chunks
                for (let i = 0; i < episodesData.length; i += throttleLimit) {
                    const chunk = episodesData.slice(i, i + throttleLimit);
                    const episodePromises = chunk.map(async (epData) => {
                        const epPage = await fetchPage(`https://${anime.domain}/play/${anime.id}/${epData.session}`);
                        const [, epTitle, epNumber] = epPage.querySelector('.theatre-info > h1').outerText.split(/Watch (.+) - (\d+(?:\.\d+)?) Online$/);
                        const thumbnail = epData.snapshot;

                        updateStatus(`Fetching links for ${anime.title} - Ep ${epNumber}...`);

                        async function getVideoUrl(kwikUrl) {
                            const response = await GM_fetch(kwikUrl, { headers: { "Referer": `https://${anime.domain}` } });
                            const data = await response.text();
                            return eval(/(eval)(\(f.*?)(\n<\/script>)/s.exec(data)[2].replace("eval", "")).match(/https.*?m3u8/)[0];
                        }
                        let links = {};
                        for (const elm of [...epPage.querySelectorAll('#resolutionMenu > button')]) {
                            links[elm.textContent] = { stream: await getVideoUrl(elm.getAttribute('data-src')), type: 'm3u8' };
                        }

                        return new Episode(epNumber, epTitle, links, thumbnail);
                    });
                    // Yield resolved episodes from the current chunk
                    yield* yieldEpisodesFromPromises(episodePromises);
                }

                currentPage++;
            } while (currentPage <= lastPage);
        }
    },
    {
        name: 'AnimeZ',
        domains: ['animez.org'],
        searchTitles: async function (domain, title) {
            const searchUrl = `https://${domain}/?act=search&f[status]=all&f[keyword]=${encodeURIComponent(title)}`;
            const sPage = await fetchPage(searchUrl);
            return Array.from(sPage.querySelectorAll('li.TPostMv a')).map(item => {
                const url = item.href;
                const animeId = new URL(url).pathname.split('/')[1];
                return new Anime(animeId, item.title, item.querySelector('img').src, url, this.name);
            }).filter(item => item !== null);
        },
        extractEpisodes: async function* (anime, updateStatus) {
            updateStatus('Starting extraction for AnimeZ...');
            const sPage = await fetchPage(anime.url);
            const epLinks = Array.from(sPage.querySelectorAll('.list-chapter .wp-manga-chapter a'))
                .filter((el, index, self) => self.findIndex(e => e.href === el.href && e.textContent.trim() === el.textContent.trim()) === index);
            const throttleLimit = 12;
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                const episodePromises = chunk.map(async epLink => {
                    try {
                        const page = await fetchPage(epLink.href);
                        const epTitle = page.querySelector('#title-detail-manga').textContent;
                        const epNumber = page.querySelector('.wp-manga-chapter.active').textContent.replace(/\D/g, '');
                        const thumbnailElement = page.querySelector('.Image > figure > img');
                        const thumbnail = thumbnailElement ? thumbnailElement.src : "";
                        updateStatus(`Extracting ${epTitle} - Ep ${epNumber}...`);

                        // Helper to fetch and parse the video URL from the data-src attribute
                        async function getVideoUrl(kwikUrl) {
                            const response = await fetch(kwikUrl, { headers: { "Referer": `https://${anime.domain}` } });
                            const data = await response.text();
                            const match = data.match(/https.*?m3u8/);
                            return match ? match[0] : "";
                        }
                        let links = {};
                        for (const btn of page.querySelectorAll('#resolutionMenu > button')) {
                            links[btn.textContent] = { stream: await getVideoUrl(btn.getAttribute('data-src')), type: 'm3u8' };
                        }
                        return new Episode(epNumber, epTitle, links, thumbnail);
                    } catch (e) {
                        showToast(e);
                        return null;
                    }
                });
                yield* yieldEpisodesFromPromises(episodePromises);
            }
        }
    },
    {
        name: "Miruro",
        domains: ['miruro.to', 'miruro.tv', 'miruro.online'],
        searchTitles: async function (domain, title) {
            // Use the Miruro API to search for anime by title
            const url = `https://${domain}/api/search/browse?search=${encodeURIComponent(title)}&page=1&perPage=5&type=ANIME&sort=SEARCH_MATCH`;
            const results = await fetchJson(url);
            // Map API results to Anime objects
            return results.map(item => {
                const animeId = item.id;
                const malId = item.idMal;
                const animeTitle = item.title?.userPreferred || item.title?.romaji || item.title?.english;
                const poster = item.coverImage?.large || item.coverImage?.medium;
                const animeUrl = `https://${domain}/anime/${animeId}`;
                return new Anime(malId || animeId, animeTitle, poster, animeUrl, this.name);
            });
        },
        extractEpisodes: async function* (anime, updateStatus) {
            updateStatus('Fetching episode list...');
            // Try to get malId from anime.id or from url
            let malId = anime.id;
            if (!/^\d+$/.test(malId)) {
                // Try to extract from url if not numeric
                const match = anime.url.match(/id=(\d+)/);
                if (match) malId = match[1];
            }
            if (!malId) return showToast('MAL ID not found for this anime.');

            const apiDomain = anime.domain;
            const res = await fetchJson(`https://${apiDomain}/api/episodes?malId=${malId}`);
            if (!res || typeof res !== "object") {
                showToast('No episodes found.');
                return;
            }
            // Providers: { providerName: { animeId: ..., episodeList: { episodes: [...] } } }
            const providers = Object.entries(res).map(([p, s]) => {
                const v = Object.values(s)[0], ep = v?.episodeList?.episodes || v?.episodeList;
                return ep && { source: p.toLowerCase(), animeId: Object.keys(s)[0], useEpId: !!v?.episodeList?.episodes, epList: ep };
            }).filter(Boolean);

            // Use the provider with most episodes as base
            const baseProvider = providers.find(p => p.epList.length === Math.max(...providers.map(p => p.epList.length)));
            if (!baseProvider) {
                showToast('No episodes found.');
                return;
            }

            for (const baseEp of baseProvider.epList) {
                const num = String(baseEp.number).padStart(3, '0');
                let epTitle = baseEp.title, thumbnail = baseEp.snapshot;
                updateStatus(`Fetching Ep ${num}...`);
                let links = {};
                await Promise.all(providers.map(async ({ source, animeId, useEpId, epList }) => {
                    const ep = epList.find(ep => ep.number == baseEp.number);
                    if (!ep) return;
                    epTitle = epTitle || ep.title;
                    const epId = !useEpId ? `${animeId}/ep-${ep.number}` : ep.id;
                    try {
                        let sres;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            // retry with 1 sec delay for total of 3 times in case of 503
                            try {
                                sres = await fetchJson(`https://${apiDomain}/api/sources?episodeId=${epId}&provider=${source}`);
                                break; // Success, exit loop
                            } catch (err) {
                                if (err.message.includes(': 503 -') && attempt < 3) {
                                    await new Promise(res => setTimeout(res, 1000));
                                } else {
                                    throw err;
                                }
                            }
                        }
                        if (sres && sres.streams && sres.streams[0]) {
                            links[this._getLocalSourceName(source)] = { stream: sres.streams[0].url, type: "m3u8", tracks: sres.tracks || [] };
                        }
                    } catch (e) {
                        showToast(`Failed to fetch ep-${ep.number} from ${source}: ${e}`);
                    }
                }));
                if (!epTitle || /^Episode \d+/.test(epTitle)) epTitle = anime.title;
                yield new Episode(num, epTitle, links, thumbnail);
            }
        },
        _getLocalSourceName: function (source) {
            const sourceNames = { 'animepahe': 'kiwi', 'animekai': 'arc', 'animez': 'jet', 'zoro': 'zoro' };
            return sourceNames[source] || source.charAt(0).toUpperCase() + source.slice(1);
        },
    }
];

// initialize
console.log('Initializing AniLINK for MAL...');
let site = "";

// Create a MutationObserver to watch for changes in the anime list
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        console.log(mutation);
        if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches("td.data.title.clearfix > a")) {
                    const button = document.createElement('button');
                    button.textContent = 'AniLINK';
                    button.style.cssText = "background-color: #00A651; color: white; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer;";
                    node.parentElement.appendChild(button);
                    button.addEventListener('click', () => startExtraction(node.textContent));
                }
            });
        }
    });
});

// Start observing the anime list for changes
setTimeout(() => {
    // attach button each entry
    document.querySelectorAll("td.data.title.clearfix > a").forEach(anime => {
        const button = document.createElement('button');
        button.textContent = 'AniLINK';
        button.style.cssText = "background-color: #00A651; color: white; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer;";
        button.onclick = () => startExtraction(anime.textContent);
        anime.parentElement.appendChild(button);
    });
}, 2000);

// This function now only triggers the UI display.
function startExtraction(title) {
    displayExtractionUI(title); // Pass the title to the UI function
}

// --- UI Dialog adapted from AniLINK_Episode-Link-Extractor.user.js ---
/**
 * Displays the UI for selecting site, domain, searching, and extracting episodes.
 * @param {string} initialTitle - The initial anime title from MAL.
 */
async function displayExtractionUI(initialTitle) {
    const overlayId = `AniLINK_Overlay`;
    // Remove any existing overlay first
    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) {
        existingOverlay.remove();
    }

    // Flag to control extraction process
    let isExtracting = false;
    let currentSiteObject = null;
    let currentAnime = null;

    // --- Materialize CSS Initialization ---
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/icon?family=Material+Icons');

        #AniLINK_Overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; } /* Increased z-index */
        .anlink-hidden { display: none !important; } /* Utility class to hide elements */
        
        #AniLINK_InitialSetup { padding-bottom: 15px; border-bottom: 1px solid #444; margin-bottom: 15px; }
        #AniLINK_InitialSetup select, #AniLINK_InitialSetup input, #AniLINK_InitialSetup button { margin: 5px; padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #333; color: #eee; }
        #AniLINK_InitialSetup button { background-color: #26a69a; cursor: pointer; }
        #AniLINK_InitialSetup button:hover { background-color: #2bbbad; }
        
        #AniLINK_SearchResults { list-style: none; padding: 0; margin: 10px 0; }
        #AniLINK_SearchResults li { padding: 10px; border: 1px solid #444; border-radius: 4px; margin-bottom: 5px; cursor: pointer; display: flex; align-items: center; }
        #AniLINK_SearchResults li:hover { background-color: #333; }
        #AniLINK_SearchResults img { width: 40px; height: auto; margin-right: 10px; border-radius: 3px; }
        
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
        .anlink-episode-item span#mpv-epnum { user-select: none; }
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
    overlayDiv.id = overlayId;
    overlayDiv.style.display = "flex";
    document.body.appendChild(overlayDiv);

    // Create a container for links
    const linksContainer = document.createElement('div');
    linksContainer.id = "AniLINK_LinksContainer";
    overlayDiv.appendChild(linksContainer);
    // Close overlay on outside click
    overlayDiv.onclick = event => {
        if (!linksContainer.contains(event.target)) {
            overlayDiv.remove(); // Remove instead of hide
            isExtracting = false; // Ensure extraction stops if UI is closed
        }
    };

    // --- Initial Setup Section (Site/Domain/Search) ---
    const initialSetupDiv = document.createElement('div');
    initialSetupDiv.id = 'AniLINK_InitialSetup';
    linksContainer.appendChild(initialSetupDiv);

    // Website Selector
    const siteSelect = document.createElement('select');
    siteSelect.innerHTML = `<option value="">-- Select Website --</option>` + websites.map((site, index) => `<option value="${index}">${site.name}</option>`).join('');
    initialSetupDiv.appendChild(siteSelect);

    // Domain Selector
    const domainSelect = document.createElement('select');
    domainSelect.disabled = true;
    initialSetupDiv.appendChild(domainSelect);

    // Search Input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.value = initialTitle;
    searchInput.placeholder = 'Anime Title';
    initialSetupDiv.appendChild(searchInput);

    // Search Button
    const searchButton = document.createElement('button');
    searchButton.textContent = 'Search';
    initialSetupDiv.appendChild(searchButton);

    // Search Results Area
    const searchResultsDiv = document.createElement('div');
    searchResultsDiv.id = 'AniLINK_SearchResultsContainer';
    searchResultsDiv.className = 'anlink-hidden'; // Initially hidden
    const searchResultsList = document.createElement('ul');
    searchResultsList.id = 'AniLINK_SearchResults';
    searchResultsDiv.innerHTML = '<h4>Select the correct entry:</h4>';
    searchResultsDiv.appendChild(searchResultsList);
    linksContainer.appendChild(searchResultsDiv);

    // --- Extraction Section (Status/Qualities) ---
    const extractionDiv = document.createElement('div');
    extractionDiv.id = 'AniLINK_ExtractionContainer';
    extractionDiv.className = 'anlink-hidden'; // Initially hidden
    linksContainer.appendChild(extractionDiv);

    // Status bar header
    const statusBarHeader = document.createElement('div');
    statusBarHeader.className = 'anlink-status-header';
    extractionDiv.appendChild(statusBarHeader);

    // Status icon
    const statusIconElement = document.createElement('a');
    statusIconElement.className = 'anlink-status-icon';
    statusIconElement.innerHTML = '<i class="material-icons"></i>'; // Icon set later
    statusIconElement.title = 'Stop Extracting';
    statusBarHeader.appendChild(statusIconElement);

    // Status bar
    const statusBar = document.createElement('span');
    statusBar.className = "anlink-status-bar";
    statusBarHeader.appendChild(statusBar);

    // Qualities container
    const qualitiesContainer = document.createElement('div');
    qualitiesContainer.id = "AniLINK_QualitiesContainer";
    extractionDiv.appendChild(qualitiesContainer);

    // --- Event Listeners ---

    // Update domains when site changes
    siteSelect.addEventListener('change', () => {
        const siteIndex = parseInt(siteSelect.value);
        domainSelect.innerHTML = ''; // Clear previous domains
        if (!isNaN(siteIndex) && siteIndex >= 0) {
            currentSiteObject = websites[siteIndex];
            domainSelect.disabled = false;
            domainSelect.innerHTML = currentSiteObject.domains.map((domain, index) => `<option value="${index}">${domain}</option>`).join('');
        } else {
            currentSiteObject = null;
            domainSelect.disabled = true;
        }
    });

    // Search button action
    searchButton.addEventListener('click', async () => {
        const siteIndex = parseInt(siteSelect.value);
        const domainIndex = parseInt(domainSelect.value);
        const title = searchInput.value.trim();

        if (isNaN(siteIndex) || siteIndex < 0 || !currentSiteObject || isNaN(domainIndex) || domainIndex < 0 || !title) {
            showToast("Please select a website, domain, and enter a title.");
            return;
        }

        const selectedDomain = currentSiteObject.domains[domainIndex];
        searchResultsList.innerHTML = '<li>Searching...</li>';
        searchResultsDiv.classList.remove('anlink-hidden');
        initialSetupDiv.classList.add('anlink-hidden'); // Hide setup

        try {
            showToast(`Searching for "${title}" on ${currentSiteObject.name}...`);
            const entries = await currentSiteObject.searchTitles(selectedDomain, title);
            showToast(`Found ${entries.length} potential matches for "${title}".`);
            searchResultsList.innerHTML = ''; // Clear searching message

            if (!entries || entries.length === 0) {
                searchResultsList.innerHTML = '<li>No results found. <button id="anlink-back-search">Try Again</button></li>';
                document.getElementById('anlink-back-search').onclick = () => {
                    searchResultsDiv.classList.add('anlink-hidden');
                    initialSetupDiv.classList.remove('anlink-hidden');
                };
                return;
            }

            entries.forEach(entry => {
                const li = document.createElement('li');

                // Create an image element with error handling
                const img = document.createElement('img');
                img.alt = "Poster";
                img.style.width = "40px";
                img.style.height = "60px";
                img.style.objectFit = "cover";

                // Default fallback image (generic anime icon)
                img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ccc' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3Cpath fill='%23ccc' d='M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 10V8l5 4-5 4z'/%3E%3C/svg%3E";

                // Try to load the actual poster with a proxy
                if (entry.poster) {
                    // Option 2: Create a background-image with referrer policy
                    const style = document.createElement('style');
                    style.textContent = `
                        .anime-poster-${entry.id} {
                            background-image: url(${entry.poster});
                            background-size: cover;
                            background-position: center;
                            width: 40px;
                            height: 60px;
                            display: inline-block;
                            border-radius: 3px;
                            margin-right: 10px;
                        }
                    `;
                    document.head.appendChild(style);

                    // Instead of using img tag, use the styled div
                    li.innerHTML = `<div class="anime-poster-${entry.id}"></div> ${entry.title}`;
                } else {
                    // If no poster available, just use the fallback
                    li.appendChild(img);
                    li.appendChild(document.createTextNode(` ${entry.title}`));
                }

                li.onclick = () => {
                    currentAnime = entry;
                    searchResultsDiv.classList.add('anlink-hidden');
                    startEpisodeExtraction(); // Proceed to extraction
                };
                searchResultsList.appendChild(li);
            });

        } catch (error) {
            showToast(`Error searching on ${currentSiteObject.name}: ${error.message}`);
            console.error(`Search error for ${currentSiteObject.name}:`, error);
            searchResultsList.innerHTML = `<li>Search failed: ${error.message}. <button id="anlink-back-search">Try Again</button></li>`;
            document.getElementById('anlink-back-search').onclick = () => {
                searchResultsDiv.classList.add('anlink-hidden');
                initialSetupDiv.classList.remove('anlink-hidden');
            };
        }
    });

    // Stop button action
    statusIconElement.addEventListener('click', () => {
        if (isExtracting) {
            isExtracting = false; // Set flag to stop extraction
            updateStatus("Extraction Stopped By User.");
            statusIconElement.querySelector('i').classList.remove('extracting');
            statusIconElement.title = 'Extraction Stopped';
        }
    });

    // --- Helper Functions within UI Scope ---

    // Status update function to pass to extractor
    function updateStatus(message) {
        if (statusBar) {
            statusBar.textContent = message;
        }
        console.log("AniLINK Status:", message); // Also log to console
    }

    // Function to initiate episode extraction
    async function startEpisodeExtraction() {
        if (!currentSiteObject || !currentAnime) {
            showToast("Error: Site or Anime data missing.");
            return;
        }

        extractionDiv.classList.remove('anlink-hidden'); // Show extraction UI
        isExtracting = true;
        statusIconElement.querySelector('i').className = 'material-icons extracting'; // Start spinner
        statusIconElement.title = 'Stop Extracting';
        updateStatus(`Starting extraction for ${currentAnime.title}...`);

        const qualityLinkLists = {};

        try {
            // Pass the updateStatus function to the extractor
            const episodeGenerator = currentSiteObject.extractEpisodes(currentAnime, updateStatus);

            for await (const episode of episodeGenerator) {
                if (!isExtracting) break; // Check flag
                if (!episode) continue;

                // Update status bar (handled by updateStatus callback now)
                // updateStatus(`Processing ${currentAnime.title} - Ep ${episode.number}...`);

                for (const quality in episode.links) {
                    qualityLinkLists[quality] = qualityLinkLists[quality] || [];
                    qualityLinkLists[quality].push(episode);
                }
                renderQualityLinkLists(qualityLinkLists, qualitiesContainer, currentAnime.title);
            }

            if (isExtracting) { // Completed naturally
                isExtracting = false;
                statusIconElement.querySelector('i').classList.remove('extracting');
                statusIconElement.title = 'Extraction Complete';
                updateStatus(`Extraction Complete for ${currentAnime.title}!`);
            }

        } catch (error) {
            isExtracting = false;
            statusIconElement.querySelector('i').classList.remove('extracting');
            statusIconElement.title = 'Extraction Failed';
            updateStatus(`Extraction Failed: ${error.message}`);
            showToast(`Extraction failed for ${currentAnime.title}: ${error.message}`);
            console.error(`Extraction process error for ${currentAnime.title}:`, error);
        }
    }

    // Renders quality link lists inside a given container element
    function renderQualityLinkLists(sortedLinks, container, animeTitle) {
        // Track expanded state for each quality section
        const expandedState = {};
        container.querySelectorAll('.anlink-quality-section').forEach(section => {
            const quality = section.dataset.quality;
            const episodeList = section.querySelector('.anlink-episode-list');
            expandedState[quality] = episodeList && episodeList.style.maxHeight !== '0px';
        });

        // Only add/update sections, don't clear the whole container
        for (const quality in sortedLinks) {
            let qualitySection = container.querySelector(`.anlink-quality-section[data-quality="${quality}"]`);
            let episodeListElem;
            const episodes = sortedLinks[quality].sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

            if (!qualitySection) {
                // Create new section if it doesn't exist
                qualitySection = document.createElement('div');
                qualitySection.className = 'anlink-quality-section';
                qualitySection.dataset.quality = quality;

                const headerDiv = document.createElement('div');
                headerDiv.className = 'anlink-quality-header';

                const qualitySpan = document.createElement('span');
                qualitySpan.innerHTML = `<i class="material-icons">chevron_right</i> ${quality}`;
                qualitySpan.addEventListener('click', toggleQualitySection);
                headerDiv.appendChild(qualitySpan);

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

                episodeListElem = document.createElement('ul');
                episodeListElem.className = 'anlink-episode-list';
                episodeListElem.style.maxHeight = '0px';
                qualitySection.appendChild(episodeListElem);

                container.appendChild(qualitySection);

                attachBtnClickListeners(episodes, qualitySection, animeTitle);
            } else {
                // Update header count if needed
                episodeListElem = qualitySection.querySelector('.anlink-episode-list');
            }

            // Update episode list items only
            episodeListElem.innerHTML = '';
            episodes.forEach(ep => {
                const episodeName = ep.name(animeTitle, ep.number, ep.epTitle);
                const listItem = document.createElement('li');
                listItem.className = 'anlink-episode-item';
                listItem.innerHTML = `
                    <label style="display:flex;align-items:center;gap:8px;">
                        <input type="checkbox" class="anlink-episode-checkbox" />
                        <span id="mpv-epnum" title="Play in MPV">Ep ${ep.number.replace(/^0+/, '')}: </span>
                        <a href="${ep.links[quality]?.stream}" class="anlink-episode-link" download="${encodeURI(episodeName)}" data-epnum="${ep.number}" title="${episodeName.replace(/[<>:"/\\|?*]/g, '')}" ep-title="${ep.epTitle.replace(/[<>:"/\\|?*]/g, '')}">${ep.links[quality].stream}</a>
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
    function attachBtnClickListeners(episodeList, qualitySection, animeTitle) { // Accept animeTitle
        const buttonActions = [
            { selector: '.anlink-select-links', handler: onSelectBtnPressed },
            { selector: '.anlink-copy-links', handler: onCopyBtnClicked },
            { selector: '.anlink-export-links', handler: onExportBtnClicked },
            { selector: '.anlink-play-links', handler: onPlayBtnClicked }
        ];

        buttonActions.forEach(({ selector, handler }) => {
            const button = qualitySection.querySelector(selector);
            // Pass animeTitle to handlers that need it (like export/play)
            button.addEventListener('click', () => handler(button, episodeList, qualitySection, animeTitle));
        });

        // Helper function to get checked episode items within a quality section
        function _getSelectedEpisodeItems(qualitySection) {
            return Array.from(qualitySection.querySelectorAll('.anlink-episode-item input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.closest('.anlink-episode-item'));
        }

        // Helper function to prepare m3u8 playlist string from given episodes
        function _preparePlaylist(episodes, quality, animeTitle) { // Accept animeTitle
            let playlistContent = '#EXTM3U\n';
            episodes.forEach(episode => {
                // Generate name using the function
                const episodeName = episode.name(animeTitle, episode.number, episode.type);
                playlistContent += `#EXTINF:-1,${episodeName}\n`;
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
        function onExportBtnClicked(button, episodes, qualitySection, animeTitle) { // Accept animeTitle
            const quality = qualitySection.dataset.quality;
            const selectedItems = _getSelectedEpisodeItems(qualitySection);

            const items = selectedItems.length ? selectedItems : Array.from(qualitySection.querySelectorAll('.anlink-episode-item'));
            // Filter the main episodeList based on selected items' episode numbers
            const episodesToExport = episodes.filter(ep => items.some(item => item.querySelector(`a[data-epnum="${ep.number}"]`)));

            if (episodesToExport.length === 0) {
                showToast("No episodes selected for export.");
                return;
            }

            const playlist = _preparePlaylist(episodesToExport, quality, animeTitle); // Pass animeTitle
            // Generate filename based on the anime title and quality
            const fileName = `${animeTitle.replace(/[<>:"/\\|?*]/g, '_')}_${quality}.m3u`;
            const file = new Blob([playlist], { type: 'application/vnd.apple.mpegurl' });
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: fileName });
            a.click();
            URL.revokeObjectURL(a.href); // Clean up object URL

            button.textContent = 'Exported Selected';
            setTimeout(() => { button.textContent = 'Export'; }, 1000);
        }

        // PlayWithVLC click event handler
        function onPlayBtnClicked(button, episodes, qualitySection, animeTitle) { // Accept animeTitle
            const quality = qualitySection.dataset.quality;
            const selectedEpisodeItems = _getSelectedEpisodeItems(qualitySection);

            const items = selectedEpisodeItems.length ? selectedEpisodeItems : Array.from(qualitySection.querySelectorAll('.anlink-episode-item'));
            // Filter the main episodeList based on selected items' episode numbers
            const episodesToPlay = episodes.filter(ep => items.some(item => item.querySelector(`a[data-epnum="${ep.number}"]`)));

            if (episodesToPlay.length === 0) {
                showToast("No episodes selected to play.");
                return;
            }

            const playlist = _preparePlaylist(episodesToPlay, quality, animeTitle); // Pass animeTitle
            const file = new Blob([playlist], { type: 'application/vnd.apple.mpegurl', });
            const fileUrl = URL.createObjectURL(file);
            // Try opening the file URL directly, which might prompt download or open in associated player
            window.open(fileUrl);

            button.textContent = 'Playing Selected';
            setTimeout(() => { button.textContent = 'Play'; }, 2000);
            // Clean up object URL after a delay, allowing time for the browser/player to access it
            setTimeout(() => URL.revokeObjectURL(fileUrl), 5000);

            alert("Attempting to open playlist. Due to browser limitations, this may download the file instead of playing directly.\nIf it downloads, open the .m3u file with your preferred media player (like VLC).");
        }
    }
}


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