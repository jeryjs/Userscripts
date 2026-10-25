// ==UserScript==
// @name        AniHIDE - Hide Unrelated Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     2.9.0
// @description Filter animes in the Home/New-Episodes pages to show only what you are watching or plan to watch based on your anime list on MAL or AL.
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://anitaku.tld/*
// @match       https://anitaku.io/*
// @match       https://aniwave.tld/*
// @match       https://aniwave.si/*
// @match       https://gogoanime.tld/*
// @match       https://gogoanime3.tld/*
// @match       https://animepahe.tld/*
// @match       https://animepahe.pw/*
// @match       https://kaa.lt/*
// @match       https://www.kaa.lt/*
// @match       https://hianimez.org/*
// @match       https://anixtv.in/anime
// @match       https://anixx.fun/anime
// @match       https://animesuge.tld/*
// @match       https://animesuge.re/*
// @match       https://animesuge.cz/*
// @match       https://anisuge.tv/*
// @match       https://www.miruro.tv/*
// @match       https://www.miruro.to/*
// @match       https://www.miruro.cx/*
// @match       https://www.miruro.bz/*
// @match       https://www.miruro.pw/*
// @match       https://www.miruro.ws/*
// @match       https://miruro.tv/*
// @match       https://miruro.to/*
// @match       https://miruro.cx/*
// @match       https://miruro.bz/*
// @match       https://miruro.pw/*
// @match       https://miruro.ws/*
// @match       https://animekai.tld/*
// @match       https://reanime.to/*
// @match       https://reanime.cz/*
// @match       https://animekaitv.to/*
// @match       https://animetsu.cc/*
// @match       https://kaido.tld/*
// @match       https://kuudere.tld/*
// @match       https://otaku-streamers.com/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @grant       GM.xmlHttpRequest
// @require     https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @downloadURL https://update.greasyfork.org/scripts/470233/AniHIDE%20-%20Hide%20Unrelated%20Episodes.user.js
// @updateURL https://update.greasyfork.org/scripts/470233/AniHIDE%20-%20Hide%20Unrelated%20Episodes.meta.js
// ==/UserScript==


/**************************
 * Notify new Update
***************************/
if (GM_getValue("version") != GM_info.script.version) {
    // refreshList();
    GM_setValue("version", GM_info.script.version);
    const msg = `
        ${GM_info.script.name}:\n
        This scipt has been updated!!\n
        What's new:
         -Better handling of dynamic sites [improved detection]
         -Now skips unhiding manually added animes if they are in animelist [fix]
         -Support for alternative titles [Improved detection]
    `
    // alert(msg);
}

/* Preferred Format sample-
What's new:
         -Added AnimePahe [website]
         -Added Timeout for certain sites [workaround]
         -Notification shown for list refresh [feature]
         -Bug Fixes + Code Cleanup`
*/

/**************************
 * CONSTANTS
***************************/
const userSettingsKey = 'userSettings';
const animeListKey = 'animeList';
const manualListKey = 'manualList';


/***************************************************************
 * ANIME SITES
 * -----------
 * Each site may tune WHEN the first filtering pass runs, since many of
 * these are SPAs that render their grids after the initial paint. The three
 * knobs are checked in this priority order (first match wins):
 *
 *   timeout    fixed delay in ms before the first pass. Use when the render
 *             time is known/stable (e.g. 700 or 1200).
 *   waitUntil  CSS selector; waits until that element exists in the DOM, so
 *             the pass runs as soon as the grid is actually there. Preferred
 *             over timeout when the site has a reliable anchor element,
 *             because it adapts to slow/fast machines instead of guessing.
 *   observe    CSS selector for a MutationObserver, which re-runs the pass
 *             (debounced) whenever cards are injected later - e.g. infinite
 *             scroll, lazy images or tab switching. Only meaningful once the
 *             first pass has already happened.
 *
 * timeout beats waitUntil beats observe. Sites needing none of them simply
 * omit all three and get an immediate pass.
 ***************************************************************/
const animeSites = [
    {
        name: 'gogoanime',
        url: ['gogoanime3', 'gogoanimehd', 'gogoanime', 'anitaku', 'aniwave.si'],   // anitaku.io + aniwave.si are Themesia clones with an identical DOM
        item: '.listupd .bs',
        title: '.tt',
        thumbnail: '.limit img',
        exclude: '.series-gen, article.hentry',   // recommendation/related widgets: hiding suggestions the user deliberately lacks is pointless
        observe: '.listupd',
        timeout: 1200   // SPA: wait for the Themesia grid to render before the first pass
    },
    {
        name: 'animepahe',
        url: ['animepahe.si', 'animepahe.ru', 'animepahe.com', 'animepahe'],
        item: '.episode-wrap > .episode',
        title: '.episode-title > a',
        thumbnail: '.episode-snapshot',
        observe: '.episode-list-wrapper',
        timeout: 100
    },
    {
        name: 'animesuge',
        url: ['animesuge.re', 'animesuge.cz', 'anisuge.tv'],	// .to/.cc are dead and .su redirects to a scam domain
        item: '.item',
        title: '.name > a',
        thumbnail: '.poster img',
        exclude: '.side-panel',	// the anime/watch-page sidebar of recommended anime
        observe: '.main-card',
        timeout: 700
    },
    {
        name: 'miruro legacy',
        url: ['www.miruro'],
        item: 'div.animSlideUp[title]',
        title: 'h3[title^="Title: "] > a',
        thumbnail: 'img[alt^="Play "]',
        observe: 'section[aria-labelledby*="continueWatching"] + div',
        timeout: 1200
    },
    {
        name: 'miruro 2.0',
        url: ['miruro'],
        item: '.home-episode-grid > a, article[data-cover-card], a.schedule-card',
        title: 'p.text-sm, h3, p.side-title, p.truncate.font-semibold',
        thumbnail: 'img.card-image, img:not(.side-banner), a.schedule-card img',
        waitUntil: '.home-episode-grid > a, article[data-cover-card], a.schedule-card',
        observe: '.hz-stagger, .side-list, [class*=schedule]'
    },
    {
        name: 'animekai',
        url: ['animekai', 'anikai', 'animekaitv'],	// animekai.to/anikai.to are dead; animekaitv.to is current (anikai.se redirects there)
        item: '.item',
        title: '.name.d-title',
        thumbnail: '.poster img',
        exclude: '.w-side-section',	// watch-page sidebar of related/recommended anime
        observe: '.top-table',
    },
    {
        name: 'reanime',
        url: ['reanime', 'kuudere'],	// kuudere.to now redirects to reanime.to; official domains are .to and .cz
        item: 'a.group.block',
        title: 'h3',
        thumbnail: 'img',
        waitUntil: 'a.group.block',
        observe: '[class*=grid-cols-2]'
    },
    {
        name: 'otaku-streamers',
        url: ['otaku-streamers'],
        item: '.rcx-card, .item, .season-card, .os-at-list > a, .os-cal-card-wrap, .ru-card',
        title: '.rcx-title > a, .title, .season-title, .os-at-name, .os-cal-card-title, .ru-title',	// each layout's text holder; getAnimeTitle() only reads its direct text nodes
        thumbnail: '.rcx-poster img, .retina, .season-card img, .os-at-thumb > img, .os-cal-card-thumb > img, .ru-cover>img',
        exclude: '#cw-carousel-wrap, .osh-head + .os-tgrid',
        observe: '#site-content-inner, body'
    },
    {
        name: 'kaa',
        url: ['kaa.lt'],			// kickassanime's current domain; kaas.to + kickassanimes.io are dead
        item: '.show-item',
        title: '.show-title a span',	// .show-title itself only has whitespace text nodes
        thumbnail: '.v-image__image',	// Vuetify renders the cover as a background-image, not an <img>
        timeout: 1200
    },
    {
        name: 'hianime',
        url: ['hianimez', 'hianime'],	// hianime.to is dead; hianimez.org is current
        item: '.flw-item',
        title: '.film-name > a',
        thumbnail: '.film-poster > img',
    },
    {
        name: 'anixtv',
        url: ['anixtv', 'anixx'],		// anix.to is hijacked; official set is anixx.fun + anixtv.in/.us.cc/.pro. Only the /anime section is supported
        item: 'A.anime-card',
        title: '.card-title',
        thumbnail: '.anime-poster',	// the cover <img> carries no alt text, so the title comes from .card-title
        observe: '.slider',
        timeout: 700
    }
];

const services = [
    {
        name: "MyAnimeList",
        icon: "https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ",
        statuses: ['watching', 'plan_to_watch', 'on_hold', 'dropped', 'completed', ''],
        apiBaseUrl: 'https://api.myanimelist.net/v2/users',
        _clientId: "cfdd50f8037e9e8cf489992df497c761",
        async getAnimeList(username, status) {
            const url = `${this.apiBaseUrl}/${username}/animelist?fields="alternative_titles"&status=${status}&limit=1000`;
            const response = await GM_fetch(url, { headers: { 'X-MAL-CLIENT-ID': this._clientId } });   // using GM_fetch to bypass CORS restrictions
            const data = (await response.json()).data;
            return data.map(entry => {
                const titles = [entry.node.title, ...Object.values(entry.node.alternative_titles).flat()].filter(title => title != '');
                return new AnimeEntry(titles);
            });
        }
    },
    {
        name: "AniList",
        icon: "https://anilist.co/img/icons/android-chrome-512x512.png",
        statuses: ['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED', ''],
        apiBaseUrl: 'https://graphql.anilist.co',
        async getAnimeList(username, status) {
            let page = 1, entries = [], hasNextPage = true;
            while (hasNextPage) {
                const query = `
                    query {
                        Page(page:${page}, perPage:50) {
                            pageInfo { hasNextPage, currentPage },
                            mediaList(userName:"${username}", type:ANIME, status:${status}) {
                                media { title { romaji, english, native, userPreferred } }
                            }
                        }
                    }
                `;
                const response = await GM_fetch(this.apiBaseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ query })
                });
                const data = (await response.json()).data.Page;
                entries = entries.concat(data.mediaList);
                hasNextPage = data.pageInfo.hasNextPage;
                page = data.pageInfo.currentPage + 1;
            }
            return entries.map(entry => {
                const titles = Object.values(entry.media.title).filter(title => title != null)
                return new AnimeEntry(titles)
            });
        }
    },
    {
        name: "Kitsu",
        icon: "https://kitsu.app/images/favicon.ico",
        statuses: ['current', 'planned'],   // JSON:API status values, not MAL's enum
        apiBaseUrl: 'https://kitsu.app/api/edge',
        _headers: { Accept: 'application/vnd.api+json' },   // Kitsu requires the JSON:API media type
        async getAnimeList(username, status) {
            // Kitsu is keyed by user id, so resolve the username first.
            const u = await GM_fetch(`${this.apiBaseUrl}/users?filter[name]=${encodeURIComponent(username)}`, { headers: this._headers });
            const found = (await u.json()).data;
            if (!found?.length) throw new Error(`No Kitsu user found for '${username}'.`);
            const userId = found[0].id;

            const response = await GM_fetch(`${this.apiBaseUrl}/library-entries?filter[user_id]=${userId}&filter[status]=${status}&include=anime&page[limit]=500`, { headers: this._headers });
            const data = await response.json();
            // The anime live in `included` (side-loaded via ?include=anime), not in `data`.
            return (data.included || [])
                .filter(a => a.type === 'anime')
                .map(a => {
                    const at = a.attributes;
                    const titles = [at.canonicalTitle, at.titles?.en, at.titles?.en_jp, ...(at.abbreviatedTitles || [])].filter(Boolean);
                    return new AnimeEntry(titles);
                });
        }
    }
];


/***************************************************************
 * Classes for handling various data like settings, lists,
 * services and websites
 ***************************************************************/
// User settings
class UserSettings {
    constructor(usernames = {}) {
        this.usernames = usernames;
    }
    static load() {
        return GM_getValue(userSettingsKey, new UserSettings());
    }
}

// Anime entry
class AnimeEntry {
    constructor(titles) {
        this.titles = titles;
        this.skip = false;
    }
}

// Anime list
class AnimeList {
    constructor(key) {
        this.entries = GM_getValue(key, []);
    }

    clear() {
        this.entries = [];
    }

    removeEntry(entry) {
        this.entries = this.entries.filter(e => !entry.titles.some(title => e.titles.includes(title)));
    }

    addEntry(entry) {
        this.entries.push(entry);
    }

    getEntry(title) {
        return this.entries.find(e => e.titles.some(t => t.includes(title)) );
    }

    // Use jaro-winkler algorithm to compare whether the given title is similar present in the animelist
    isEntryExist(title) {
        const threshold = 0.8;
        const a = title.toLowerCase();
        return this.entries.some(e => {
            return e.titles.some(t => {
                const b = t.toLowerCase(), m = a.length, n = b.length;
                if (n == 0 || m == 0) return false;
                const max = Math.floor(Math.max(n, m) / 2) - 1, ma = Array(n).fill(false), mb = Array(m).fill(false);
                let mtc = 0;
                for (let i = 0; i < n; i++) {
                    const s = Math.max(0, i - max), e = Math.min(m, i + max + 1);
                    for (let j = s; j < e; j++) {
                        if (!mb[j] && b[i] == a[j]) {
                            ma[i] = true, mb[j] = true, mtc++;
                            break;
                        }
                    }
                }
                if (mtc == 0) return false;
                let tr = 0, k = 0;
                for (let i = 0; i < n; i++) {
                    if (ma[i]) {
                        while (!mb[k]) k++;
                        if (b[i] !== a[k]) tr++;
                        k++;
                    }
                }
                const sim = (mtc / n + mtc / m + (mtc - tr / 2) / mtc) / 3;
                // if (sim >= threshold) console.log(`jaro-winkler: ${b} - ${a} = ${sim}`);
                return sim >= threshold;
            });
        });
    }
}

// Website class
class Website {
    /**
     * Initialize a new Website instance.
     * @param {animeSites[0]} site 
     */
    constructor(site) {
        this.site = site;

        // Apply initial CSS styles
        const items = expandSelectors(site.item, 'body ');
        const thumbs = site.thumbnail.split(',').map(t => t.trim());
        const hoverRules = items.flatMap(item => thumbs.flatMap(thumb => [`${item} ${thumb}:hover`, `${item}:hover ${thumb}`]));
        GM_addStyle(`
            /* Dim state and hover reveal both live in the stylesheet, so :hover can override the dim (inline styles can't be overridden without !important) */
            body .anihide-dim {
                opacity: 0.5 !important;
                filter: brightness(0.3) !important;
                transition: .4s ease-in-out !important;
            }
            ${hoverRules.join(',\n')} {
                opacity: 1 !important;
                filter: brightness(1) !important;
                transition: .2s ease-in-out !important;
            }
        `);

        /**
         * Prefixes every comma-separated part of a selector with a given prefix and suffix.
         * This is primarily useful for sites that have multiple selectors separated by ',' 
         * and for increasing specificity of the selectors to override existing styles.
         * @param {string} selector A CSS selector string, potentially containing multiple selectors separated by commas.
         * @param {string?} prefix may include a space at the end to separate it from the selector
         * @param {string?} suffix can be used to add pseudo-classes like :hover or :active, or any other suffix to the selector
         * @returns {string[]}
         * @example 
         * expandSelectors('.item, .card', 'body ', ':hover') // the space in 'body ' is important to separate it from the class selectors
         * returns ['body .item:hover', 'body .card:hover']
         */
        function expandSelectors(selector, prefix, suffix) {
            return selector.split(',').map(part => `${prefix || ''}${part.trim()}${suffix || ''}`);
        }
    }

    // Gets all the anime items on the page
    getAnimeItems() {
        return document.querySelectorAll(this.site.item);
    }

    // Gets the anime title from the anime item
    getAnimeTitle(animeItem) {
        const titleEl = animeItem.querySelector(this.site.title);
        // Get only text content, excluding child elements
        return titleEl ? Array.from(titleEl.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .join('').trim() : '';
    }

    undarkenRelatedEps(animeList) {
        this.getAnimeItems().forEach(item => {
            if (this.site.exclude && item.closest(this.site.exclude)) return;
            const thumbnail = item.querySelector(this.site.thumbnail);
            if (!thumbnail) return;
            const title = this.getAnimeTitle(item);
            const shouldUndarken = animeList.isEntryExist(title) && !manualList.getEntry(title)?.skip;
            thumbnail.classList.toggle('anihide-dim', !shouldUndarken);
        });
    }
}


/***************************************************************
 * Initialize all data and setup menu commands
 ***************************************************************/
// User settings
let userSettings = UserSettings.load();

// Anime list and manual list
const animeList = new AnimeList(animeListKey);
const manualList = new AnimeList(manualListKey);

// Service instance
let service = null;
chooseService(parseInt(GM_getValue('service', 1)));

// Register menu commands
GM_registerMenuCommand('Show Options', showOptions);


/***************************************************************
 * Functions for working of script
 ***************************************************************/
// Show menu options as a prompt
function showOptions() {
    let options = { 'Refresh Anime List': refreshList, 'Change Username': changeUsername, 'Manually Add/Remove Anime': modifyManualAnime, 'Choose Service': chooseService }
    let opt = prompt(
        `${GM_info.script.name}\n\nChoose an option:\n${Object.keys(options).map((key, i) => `${i + 1}. ${key}`).join('\n')}`, '1'
    )
    if (opt !== null) {
        let index = parseInt(opt) - 1
        let selectedOption = Object.values(options)[index]
        selectedOption()
    }
}

// Refresh the anime list from MAL and store it using GM_setValue
async function refreshList() {
    GM_setValue('lastRefreshTime', new Date().getTime());
    try {
        const username = userSettings.usernames[service.name]
        if (!username) {
            alert(`Please set your ${service.name} username to continue.`);
            changeUsername();
            return;
        }

        GM_notification("Refreshing your list...", GM_info.script.name, service.icon)

        const entriesWatching = await service.getAnimeList(username, service.statuses[0]);
        const entriesPlanned = await service.getAnimeList(username, service.statuses[1]);
        const entriesManual = manualList.entries;

        const oldAnimeList = animeList.entries.map(entry => entry.titles);
        animeList.clear();
        entriesWatching.forEach(entry => animeList.addEntry(entry));
        entriesPlanned.forEach(entry => animeList.addEntry(entry));
        entriesManual.forEach(entry => manualList.addEntry(entry));
        console.log('animeList', animeList.entries);
        const newAnimeList = animeList.entries.map(entry => entry.titles);

        GM_setValue(animeListKey, animeList.entries);

		const removedAnime = oldAnimeList.filter(oldAnime => !newAnimeList.some(newAnime => oldAnime[0] === newAnime[0]));
		const addedAnime = newAnimeList.filter(newAnime => !oldAnimeList.some(oldAnime => newAnime[0] === oldAnime[0]));
		const unchangedAnime = newAnimeList.filter(newAnime => oldAnimeList.some(oldAnime => newAnime[0] === oldAnime[0]));

        let msg = '';
        if (removedAnime.length > 0) msg += `-${removedAnime.map(a=>a[0]).join('\n-')}\n`;
        if (addedAnime.length > 0) msg += `+${addedAnime.map(a=>a[0]).join('\n+')}\n`;
        msg += `${unchangedAnime.map(a=>a[0]).join('\n')}`;

        alert(`Anime list refreshed (${newAnimeList.length - oldAnimeList.length}/${newAnimeList.length}):\n\n${msg}`);
        executeAnimeFiltering();
    } catch (error) {
        console.error('An error occurred while refreshing the anime list:', error);
        alert(`An error occurred while refreshing the anime list:\n\n${error}\n\n\nAlternatively, you can try to refresh the list from any other supported site and return here.\n\nSupported sites: ${animeSites.map(site => site.name).join(', ')}`);
    }
}

// Change MAL username
function changeUsername() {
    const newUsername = prompt(`Enter your ${service.name} username:`);
    if (newUsername) {
        userSettings.usernames[service.name] = newUsername;
        GM_setValue(userSettingsKey, userSettings);
        refreshList();
    }
}

// Manually add anime
function modifyManualAnime() {
    const animeTitle = prompt('This is a fallback mechanism to be used when the anime is not available on any service.\nFor both- Adding and Removing an anime, just enter the anime name.\n\nWith exact spelling, Enter the anime title:').trim();
    if (animeTitle == 'clear') { manualList.clear(); GM_setValue(manualListKey, manualList.entries); alert('Manual List Cleared'); return; }
    if (animeTitle) {
        const animeEntry = new AnimeEntry([animeTitle]);
        if (manualList.isEntryExist(animeTitle)) {
            manualList.removeEntry(animeEntry);
            alert(`Anime Removed Successfully:\n\n${animeEntry.titles}`);
        } else {
            animeEntry.skip = animeList.isEntryExist(animeTitle); // Mark to be skipped if already present in the animeList
            manualList.addEntry(animeEntry);
            alert(`Anime Added Successfully:\n\n${animeEntry.titles[0]}`);
        }
        GM_setValue(manualListKey, manualList.entries);
        executeAnimeFiltering();
    }
}

// Prompt the user to choose a service
function chooseService(ch) {
    let choice = typeof ch == 'number' ? ch : parseInt(GM_getValue('service', 1));

    if (typeof ch !== 'number') {
        const msg = `${GM_info.script.name}\n\nChoose a service:\n${services.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}`;
        choice = prompt(msg, choice);
    }
    if (choice == null) { return } else choice = parseInt(choice);
    let newService = services[choice - 1];

    if (!newService) {
        console.log('Invalid choice. Switch to a different service for now.');
        return chooseService(parseInt(GM_getValue('service', 1)));
    } else service = newService;

    GM_setValue('service', choice);

    if (typeof ch !== 'number') {
        GM_notification(`Switched to ${service.name} service.`, GM_info.script.name, service.icon);
        refreshList();
    }

    console.log(`Switched to ${service.name} service.`);
    return service;
}

// Resolves once the given selector exists in the DOM (used by a site's waitUntil).
// Polls every pollRate ms rather than using a MutationObserver, so it also catches
// elements that appear without any observable DOM mutation.
function waitForElm(selector, pollRate = 100) {
    return new Promise(resolve => {
        const tick = () => {
            const elm = document.querySelector(selector);
            if (elm) return resolve(elm);
            setTimeout(tick, pollRate);
        };
        tick();
    });
}

// Undarken related eps based on the anime titles
function executeAnimeFiltering() {
    const animeSite = getCurrentSite();
    if (!animeSite) return console.error('No matching website found.');

    const thisSite = new Website(animeSite);
    console.log('animeList', animeList);

    const entriesList = Object.create(animeList);
    entriesList.entries = animeList.entries.concat(manualList.entries);
    manualList.entries.forEach(e => {if (e.skip) entriesList.removeEntry(e)});
    // Watch for cards injected after the first pass (lazy images, infinite scroll, tab switches)
    const observeLaterCards = () => {
        const targets = document.querySelectorAll(animeSite.observe);	// every matching container, not just the first - pages often have several grids
        if (!targets.length) return;
        let timeoutId;
        const rerun = () => {
            clearTimeout(timeoutId); // Debounce the callback
            timeoutId = setTimeout(() => thisSite.undarkenRelatedEps(entriesList), 100);
        };
        targets.forEach(target => new MutationObserver(rerun).observe(target, { childList: true, subtree: true, attributeFilter: ['src'] }));
    };

    const runFirstPass = () => {
        observeLaterCards();
        thisSite.undarkenRelatedEps(entriesList);
    };

    // Priority: timeout > waitUntil > observe (see the ANIME SITES header above)
    if (animeSite.timeout != null) setTimeout(runFirstPass, animeSite.timeout);
    else if (animeSite.waitUntil) waitForElm(animeSite.waitUntil).then(runFirstPass);
    else runFirstPass();
}

// Get the current website based on the URL
function getCurrentSite() {
    const currentUrl = window.location.href.toLowerCase();
    return animeSites.find(website => website.url.some(site => currentUrl.includes(site)));
}

// Workaround for SPA sites like Miruro for which the script doesn't auto reload on navigation
function initScript() {
    executeAnimeFiltering();

    // Handle SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            console.log('URL changed, re-running AniHIDE');
            executeAnimeFiltering();
        }
    }).observe(document.querySelector('body'), { subtree: true, childList: true });

    // Also watch for History API changes
    window.addEventListener('popstate', executeAnimeFiltering);
    window.addEventListener('pushstate', executeAnimeFiltering);
    window.addEventListener('replacestate', executeAnimeFiltering);
}

// Initialize the script
initScript();

// Refresh the anime list if it has been more than a week since the last refresh
const lastRefreshTime = GM_getValue('lastRefreshTime', 0);
const currentTime = new Date().getTime();
const refreshInterval = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
if (currentTime - lastRefreshTime > refreshInterval || GM_getValue("version") != GM_info.script.version) {
    refreshList();
}
