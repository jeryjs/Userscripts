// ==UserScript==
// @name        Anime - Show Only Related Eps
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @match       https://yugenanime.*/*
// @match       https://gogoanime.*/
// @match       https://9anime.*/*
// @version     1.2
// @author      Jery
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==


// Anime Sites
const animeSites = [
    {
        name: 'yugenanime',
        item: '.ep-grid > li',
        title: '.ep-origin-name',
        thumbnail: '.ep-thumbnail > img'
    },
    {
        name: 'gogoanime',
        item: '.items > li',
        title: '.name > a',
        thumbnail: '.img > a > img'
    },
    {
        name: '9anime',
        item: '.ani.items > .item',
        title: '.info .name',
        thumbnail: '.ani.poster > a > img'
    }
];

// Constants
const userSettingsKey = 'userSettings';
const animeListKey = 'animeList';
const manualListKey = 'manualList';
const MALClientId = 'cfdd50f8037e9e8cf489992df497c761';

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
    constructor(clientId) {
        this.clientId = clientId;
        this.proxyUrl = 'https://corsproxy.io/?';
        this.apiBaseUrl = 'https://api.myanimelist.net/v2/users';
    }

    async getAnimeList(username, status) {
        const url = `${this.proxyUrl}${this.apiBaseUrl}/${username}/animelist?status=${status}&limit=1000`;
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

// Website class
class Website {
    constructor(site) {
        this.animeSite = site;

        // Apply initial CSS styles
        GM_addStyle(`
            /* Hide Unrelated New eps */
            ${site.item} ${site.thumbnail} {
                opacity: 0.5;
                filter: brightness(0.3);
                transition: .4s ease-in-out;
            }
        
            /* Show eps on Hover */
            ${site.item} ${site.thumbnail}:hover {
                opacity: 1 !important;
                filter: brightness(1) !important;
                transition: .2s ease-in-out !important;
            }
        `);
    }

    getAnimeItems() {
        return $(this.animeSite.item);
    }

    getAnimeTitle(animeItem) {
        return $(animeItem).find(this.animeSite.title).text().trim();
    }

    undarkenRelatedEps(animeList, manualList) {
        const animeItems = this.getAnimeItems();
        animeItems.each((_, animeItem) => {
            const animeTitle = this.getAnimeTitle(animeItem);
            const isRelated = animeList.isEntryExist(animeTitle) || manualList.isEntryExist(animeTitle);
            if (isRelated) {
                console.log(`Anime "${animeTitle}" is related:`, isRelated);
                $(animeItem).find(this.animeSite.thumbnail).css({
                    opacity: '1',
                    filter: 'brightness(1)',
                    transition: '.2s ease-in-out'
                });
            }
        });
    }
}

// User settings
let userSettings = UserSettings.load();

// Anime list and manual list
const animeList = new AnimeList(animeListKey);
const manualList = new AnimeList(manualListKey);

// MAL service instance
const malService = new MALService(MALClientId);

// Register menu command to change MAL username
GM_registerMenuCommand('Change MAL Username', changeUsername);
GM_registerMenuCommand('Refresh Anime List', refreshList);
GM_registerMenuCommand('Manually Add/Remove Anime', modifyManualAnime);

// Refresh the anime list from MAL and store it using GM_setValue
async function refreshList() {
    try {
        if (!userSettings.username) {
            alert('Please set your MAL username to continue.');
            changeUsername();
            return;
        }

        const entriesWatching = await malService.getAnimeList(userSettings.username, 'watching');
        const entriesPlanned = await malService.getAnimeList(userSettings.username, 'plan_to_watch');
        const entriesManual = manualList.entries;

        animeList.clear();
        entriesWatching.forEach(entry => animeList.addEntry(entry));
        entriesPlanned.forEach(entry => animeList.addEntry(entry));
        entriesManual.forEach(entry => manualList.addEntry(entry));

        GM_setValue(animeListKey, animeList.entries);
        console.log('Anime list refreshed:', animeList.entries);
        alert(`Anime list refreshed (${animeList.entries.length}):\n\n${animeList.entries.map((entry, i) => `${i + 1}. ${entry.title}`).join('\n')}`);
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
    const animeTitle = prompt('This is a fallback mechanism to be used when the anime is not available on MAL or AL.\nFor both- Adding and Removing an anime, just enter the anime name.\n\nWith exact spelling, Enter the anime title:').trim();
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

// Undarken related eps based on the anime titles
function undarkenRelatedEps() {
    const currentWebsite = getCurrentWebsite();
    if (!currentWebsite) {
        console.error('No matching website found.');
        return;
    }

    const animesite = new Website(currentWebsite);
    animesite.undarkenRelatedEps(animeList, manualList);
}

// Get the current website based on the URL
function getCurrentWebsite() {
    const currentUrl = window.location.href.toLowerCase();
    return animeSites.find(website => currentUrl.includes(website.name));
}

// Run the script
undarkenRelatedEps();
