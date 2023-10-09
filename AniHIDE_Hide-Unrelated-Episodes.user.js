// ==UserScript==
// @name        AniHIDE - Hide Unrelated Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.1.4
// @description Filter animes in the Home/New-Episodes pages to show only what you are watching or plan to watch based on your anime list on MAL or AL.
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @match       https://gogoanimehd.*/*
// @match       https://gogoanimehd.to/*
// @match       https://gogoanime3.*/*
// @match       https://gogoanime3.net/*
// @match       https://animepahe.*/
// @match       https://animepahe.ru/
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==


/**************************
 * Notify new Update
***************************/
if (GM_getValue("version") != GM_info.script.version) {
    // refreshList();
    GM_setValue("version", GM_info.script.version);
    alert(`
        ${GM_info.script.name}:\n
        This scipt has been updated!!\n
        What's new:
         -Added Yugen List [service]
         -Added change service menu option [feature]
         -Added weekly auto-refresh [feature]
         -Added manual list clear option [hidden-feature]
         -Now shows number of changed anime on refresh [feature]`
    );
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
const MALClientId = 'cfdd50f8037e9e8cf489992df497c761';


/***************************************************************
 * ANIME SITES
 * -----------
 * the timeout variable is a workaround for sites like
 * AnimePahe which generate episodes page dynamically.
 ***************************************************************/
const animeSites = [
    {
        name: 'yugenanime',
        item: '.ep-grid > li',
        title: '.ep-origin-name',
        thumbnail: '.ep-thumbnail > img',
        timeout: 0
    },
    {
        name: 'gogoanime',
        item: '.items > li',
        title: '.name > a',
        thumbnail: '.img > a > img',
        timeout: 0
    },
    {
        name: 'animepahe',
        item: '.episode-wrap > .episode',
        title: '.episode-title > a',
        thumbnail: '.episode-snapshot > img',
        timeout: 500
    }
];


/***************************************************************
 * Classes for handling various data like settings, lists,
 * services and websites
 ***************************************************************/
// User settings
class UserSettings {
    constructor(username = '') {
        this.username = username;
    }

    save() {
        GM_setValue(userSettingsKey, this);
    }

    static load() {
        return GM_getValue(userSettingsKey, new UserSettings());
    }
}

// Anime entry
class AnimeEntry {
    constructor(title) {
        this.title = title;
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
        this.entries = this.entries.filter(e => e.title !== entry.title);
    }

    addEntry(entry) {
        this.entries.push(entry);
    }

    isEntryExist(title) {
        return this.entries.some(entry => entry.title.toLowerCase() === title.toLowerCase());
    }
}

// MAL service
class MALService {
    icon = "https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ";
    name = "MyAnimeList";
    statuses = ['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped']
    constructor(clientId) {
        this.clientId = clientId;
        this.apiBaseUrl = 'https://api.myanimelist.net/v2/users';
    }

    async getAnimeList(username, status) {
        const proxyUrl = 'https://corsproxy.io/?';
        const url = `${proxyUrl}${this.apiBaseUrl}/${username}/animelist?status=${status}&limit=1000`;
        const config = {
            headers: {
                'X-MAL-CLIENT-ID': this.clientId,
                'Origin': window.location.href
            }
        };
        const response = await axios.get(url, config);
        return response.data.data.map(entry => new AnimeEntry(entry.node.title));
    }
}

// Anilist service
// TODO: Add support for Anilist
class AnilistService {
    icon = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/AniList_logo.svg/2048px-AniList_logo.svg.png";
    name = "AniList";
    statuses = ['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped']
    constructor(clientId, token) {
        this.clientId = clientId;
        this.token = token;
        this.apiBaseUrl = '...';
    }

    async getAnimeList(username, status) {
        const url = `${this.apiBaseUrl}/${username}/?status=${status}`;
        const config = {
            headers: {
                'Authorization': token,
                'Origin': window.location.href
            }
        };
        const response = await axios.get(url, config);
        return response.data.data.map(entry => new AnimeEntry(entry.node.title));
    }
}

class YugenService {
    icon = "https://yugenanime.tv/static/img/logo__light.png";
    name = "YugenAnime";
    statuses = [1, 2, 3, 4, 5]
    constructor() {
        this.apiBaseUrl = 'https://yugenanime.tv/api/mylist';
    }

    async getAnimeList(username, status) {
        const url = `${this.apiBaseUrl}/?list_status=${status}`;
        const headers = {
            'accept': '*/*',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'x-requested-with': 'XMLHttpRequest',
            'Origin': window.location.href
        };
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
        });
        const data = await response.json();
        const doc = new DOMParser().parseFromString(data.query, 'text/html');
        const list = Array.from(doc.querySelectorAll('.list-entry-row'), row => {
            return new AnimeEntry(row.querySelector('.list-entry-title a').textContent.trim());
        });
        return list;
    }
}

// Website class
class Website {
    constructor(site) {
        this.site = site;

        // Apply initial CSS styles
        GM_addStyle(`
            /* Show eps on Hover */
            ${site.item} ${site.thumbnail}:hover {
                opacity: 1 !important;
                filter: brightness(1) !important;
                transition: .2s ease-in-out !important;
            }
        `);
    }

    getAnimeItems() {
        return $(this.site.item);
    }

    getAnimeTitle(animeItem) {
        return $(animeItem).find(this.site.title).text().trim();
    }

    undarkenRelatedEps(animeList, manualList) {
        const animeItems = this.getAnimeItems();
        animeItems.each((_, animeItem) => {
            const animeTitle = this.getAnimeTitle(animeItem);
            const isRelated = animeList.isEntryExist(animeTitle) || manualList.isEntryExist(animeTitle);
            console.log(`Anime "${animeTitle}" is related:`, isRelated);
            if (isRelated) {
                $(animeItem).find(this.site.thumbnail).css({
                    opacity: '1',
                    filter: 'brightness(1)',
                    transition: '.2s ease-in-out'
                });
            } else {
                $(animeItem).find(this.site.thumbnail).css({
                    opacity: '0.5',
                    filter: 'brightness(0.3)',
                    transition: '.4s ease-in-out'
                });
            }
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
GM_registerMenuCommand('Change MAL Username', changeUsername);
GM_registerMenuCommand('Refresh Anime List', refreshList);
GM_registerMenuCommand('Manually Add/Remove Anime', modifyManualAnime);
GM_registerMenuCommand('Choose Service', chooseService);


/***************************************************************
 * Functions for working of script
 ***************************************************************/
// Refresh the anime list from MAL and store it using GM_setValue
async function refreshList() {
    try {
        if (!userSettings.username) {
            alert('Please set your MAL username to continue.');
            changeUsername();
            return;
        }
        console.log(service);

        GM_notification("Refreshing your list...", GM_info.script.name, service.icon)

        const entriesWatching = await service.getAnimeList(userSettings.username, service.statuses[0]);
        const entriesPlanned = await service.getAnimeList(userSettings.username, service.statuses[1]);
        const entriesManual = manualList.entries;

        const oldAnimeList = animeList.entries.map(entry => entry.title);
        animeList.clear();
        entriesWatching.forEach(entry => animeList.addEntry(entry));
        entriesPlanned.forEach(entry => animeList.addEntry(entry));
        entriesManual.forEach(entry => manualList.addEntry(entry));
        const newAnimeList = animeList.entries.map(entry => entry.title);

        GM_setValue(animeListKey, animeList.entries);

        const removedAnime = oldAnimeList.filter(anime => !newAnimeList.includes(anime));
        const addedAnime = newAnimeList.filter(anime => !oldAnimeList.includes(anime));
        const unchangedAnime = newAnimeList.filter(anime => oldAnimeList.includes(anime));

        let output = '';
        if (removedAnime.length > 0) output += `-${removedAnime.join('\n-')}\n`;
        if (addedAnime.length > 0) output += `+${addedAnime.join('\n+')}\n`;
        output += `${unchangedAnime.join('\n')}`;

        alert(`Anime list refreshed (${newAnimeList.length - oldAnimeList.length}/${newAnimeList.length}):\n\n${output}`);
        undarkenRelatedEps();
    } catch (error) {
        console.error('An error occurred while refreshing the anime list:', error);
        alert(`An error occurred while refreshing the anime list:\n\n${error}\n\n\nAlternatively, you can try to refresh the list from any other supported site and return here.\n\nSupported sites: ${animeSites.map(site => site.name).join(', ')}`);
    }
}

// Change MAL username
function changeUsername() {
    const newUsername = prompt('Enter your MAL username:');
    if (newUsername) {
        userSettings.username = newUsername;
        userSettings.save();
        refreshList();
    }
}

// Manually add anime
function modifyManualAnime() {
    const animeTitle = prompt('This is a fallback mechanism to be used when the anime is not available on any service.\nFor both- Adding and Removing an anime, just enter the anime name.\n\nWith exact spelling, Enter the anime title:').trim();
    if (animeTitle=='clear') { manualList.clear(); GM_setValue(manualListKey, manualList.entries); alert('Manual List Cleared'); return; }
    if (animeTitle) {
        const animeEntry = new AnimeEntry(animeTitle);
        if (manualList.isEntryExist(animeTitle)) {
            manualList.removeEntry(animeEntry);
            alert(`Anime Removed Successfully (reload page to see changes):\n\n${animeEntry.title}`);
        } else {
            manualList.addEntry(animeEntry);
            alert(`Anime Added Successfully:\n\n${animeEntry.title}`);
        }
        GM_setValue(manualListKey, manualList.entries);
        undarkenRelatedEps();
    }
}

// Prompt the user to choose a service
function chooseService(ch) {
    let choice = 0;
    if (typeof ch !== 'number')
        choice = prompt(GM_info.script.name+'\n\nChoose a service:\n1. MyAnimeList\n2. AniList (incomplete)\n3. YugenAnime', parseInt(GM_getValue('service', 1)));
    else choice = ch;

    if (choice == null) { return; } else choice = parseInt(choice);
    
    switch (choice) {
        case 1:
            service = new MALService(MALClientId);;
            GM_setValue('service', choice);
            if ((typeof ch !== 'number')) {
                GM_notification(`Switched to ${service.name} service.`, GM_info.script.name, service.icon);
                refreshList();
            }
            console.log(`Switched to ${service.name} service.`);
            break;
        case 2:
            // service = new AnilistService();
            alert('Anilist is not supported yet.\nSwitch to a different service for now.');
            chooseService(null)
            break;
        case 3:
            service = new YugenService();
            GM_setValue('service', choice);
            if ((typeof ch !== 'number')) {
                GM_notification(`Switched to ${service.name} service.`, GM_info.script.name, service.icon);
                refreshList();
            }
            console.log(`Switched to ${service.name} service.`);
            break;
        default:
            console.log('Invalid choice. Switch to a different service for now.');
            chooseService(1)
            break;
    }
    return service
}

// Undarken related eps based on the anime titles
function undarkenRelatedEps() {
    const animeSite = getCurrentSite();
    const thisSite = new Website(animeSite);
    console.log(animeSite)
    // Workaround for sites like AnimePahe which dynamically generate episodes page
    setTimeout(() => {
        if (!animeSite) console.error('No matching website found.');
        else thisSite.undarkenRelatedEps(animeList, manualList);
    }, animeSite.timeout);
}

// Get the current website based on the URL
function getCurrentSite() {
    const currentUrl = window.location.href.toLowerCase();
    return animeSites.find(website => currentUrl.includes(website.name));
}

// Run the script
undarkenRelatedEps();

// Refresh the anime list if it has been more than a week since the last refresh
const lastRefreshTime = GM_getValue('lastRefreshTime', 0);
const currentTime = new Date().getTime();
const refreshInterval = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
if (currentTime - lastRefreshTime > refreshInterval) {
    refreshList();
    GM_setValue('lastRefreshTime', currentTime);
}