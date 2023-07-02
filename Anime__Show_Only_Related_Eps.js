// ==UserScript==
// @name        Anime - Show Only Related Eps
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @match       https://yugenanime.tv/latest/
// @match       https://gogoanime.*/
// @version     1.0
// @author      Jery
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==

// Register menu command to change MAL username
GM_registerMenuCommand('Change MAL Username', changeUsername);
GM_registerMenuCommand('Refresh List', refreshList);

// Apply initial CSS styles
GM_addStyle(`
    /* Hide Unrelated New eps */
    ul > li > a > img {
        opacity: 0.5;
        filter: brightness(0.3);
        transition: .4s ease-in-out;
    }

    /* Show eps on Hover */
    ul > li > a > img:hover {
        opacity: 1 !important;
        filter: brightness(1) !important;
        transition: .2s ease-in-out !important;
    }
`);

class AnimeEntry {
    constructor(title) {
        this.title = title;
    }
}

class AnimeList {
    constructor() { this.entries = GM_getValue(animeListKey, []) }

    addEntry(entry) { this.entries.push(entry) }

    clear() { this.entries = [] }

    isEntryExist(title) {
        return this.entries.some(
            entry => entry.title == title
        );
    }
}

class MAL {
    constructor(clientId) {
        this.clientId = clientId;
        this.proxyUrl = 'https://corsproxy.io/?';
        this.apiBaseUrl = 'https://api.myanimelist.net/v2/users';
    }

    async getAnimeList(username, status) {
        const url = `${this.proxyUrl}${this.apiBaseUrl}/${username}/animelist?status=${status}&limit=1000`;
        const config = {
            headers: {
                'X-MAL-CLIENT-ID': this.clientId
            }
        };
        const response = await axios.get(url, config);
        return response.data.data.map(entry => new AnimeEntry(entry.node.title));
    }
}

// Constants
const userSettingsKey = 'userSettings';
const animeListKey = 'animeList';
const MALClientId = 'cfdd50f8037e9e8cf489992df497c761';

// User settings
class UserSettings {
    constructor(username = '') { this.username = username; }

    save() { GM_setValue(userSettingsKey, this); }

    static load() { return GM_getValue(userSettingsKey, new UserSettings()); }
}

// Anime list
const animeList = new AnimeList();

// MAL service instance
const mal = new MAL(MALClientId);

// Initialize user settings
let userSettings = UserSettings.load();

// Refresh the anime list from MAL and store it using GM_setValue
async function refreshList() {
    try {
        if (!userSettings.username) {
            alert('Please set your MAL username in the UserScript settings.');
            return;
        }

        const entriesWatching = await mal.getAnimeList(userSettings.username, 'watching');
        const entriesPlanned = await mal.getAnimeList(userSettings.username, 'plan_to_watch');

        animeList.clear();
        entriesWatching.forEach(entry => animeList.addEntry(entry));
        entriesPlanned.forEach(entry => animeList.addEntry(entry));

        GM_setValue(animeListKey, animeList.entries);
        console.log('Anime list refreshed:', animeList.entries);
        alert(`Anime list refreshed (${animeList.entries.length}):\n\n${animeList.entries.map(entry => entry.title).join('\n')}`)
        undarkenRelatedEps();
    } catch (error) {
        console.error('An error occurred while refreshing the anime list:', error);
        alert('An error occurred while refreshing the anime list:\n\n' + error);
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

// Undarken related eps based on the anime titles
function undarkenRelatedEps() {
    const animeCards = $('.ep-grid > li');
    animeCards.each(function () {
        const animeTitle = $(this).find('.ep-origin-name').text().trim();
        const isRelated = animeList.isEntryExist(animeTitle);
        console.log(`Anime "${animeTitle}" is related:`, isRelated);
        if (isRelated) {
            $(this).find('img').css({
                opacity: '1',
                filter: 'brightness(1)',
                transition: '.2s ease-in-out'
            });
        }
    });
    console.log(animeList.entries);
}

// Run the script
undarkenRelatedEps();
