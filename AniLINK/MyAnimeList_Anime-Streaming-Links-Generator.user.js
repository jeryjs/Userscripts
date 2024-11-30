// ==UserScript==
// @name        MyAnimeList - Anime Streaming Links Generator
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.0.0
// @description Stream or download your favorite anime series effortlessly with AniLINK! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=myanimelist.net
// @author      Jery
// @license     MIT
// @match       https://myanimelist.net/animelist/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// ==/UserScript==

class Episode {
    constructor(number, title, links, type, thumbnail) {
        this.number = number;
        this.title = title;
        this.links = links;
        this.type = type;
        this.thumbnail = thumbnail;
        this.name = `${this.title} - ${this.number}`;
    }
}

const websites = [
    {
        name: 'GoGoAnime',
        domains: ['anitaku.pe', 'gogoanime3.co'],
        epLinks: '#episode_related > li > a',
        epTitle: '.title_name > h2',
        linkElems: '.cf-download > a',
        thumbnail: '.headnav_left > a > img',
        extractEpisodes: async function (status, startpage) {
            status.textContent = 'Starting...';
            let origin = startpage.querySelector('#original-origin').textContent;
            let episodes = {};
            const episodePromises = Array.from(startpage.querySelectorAll(this.epLinks)).map(async epLink => { try {
                const page = await fetchPage(epLink.href.replace(document.location.origin, origin));
                
                const [, epTitle, epNumber] = page.querySelector(this.epTitle).textContent.match(/(.+?) Episode (\d+(?:\.\d+)?)/);
                const episodeTitle = `${epNumber.padStart(3, '0')} - ${epTitle}`;
                const thumbnail = page.querySelector(this.thumbnail).src;
                const links = [...page.querySelectorAll(this.linkElems)].reduce((obj, elem) => ({ ...obj, [elem.textContent.trim()]: elem.href.replace(document.location.origin, origin) }), {});
                status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, '0')}...`;

                episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, 'mp4', thumbnail);
            } catch (e) { showToast(e) } });
            await Promise.all(episodePromises);
            return episodes;
        },
        searchTitles: async function (domain, title) {
            const searchUrl = `https://${domain}/search.html?keyword=${encodeURIComponent(title)}`;
            const searchPage = await fetchPage(searchUrl);
            return Array.from(searchPage.querySelectorAll('.items .name > a')).map(a => a.href.replace(document.location.origin, `https://${domain}`));
        },
        getStartPage: async function (url) {
            const entryPage = await fetchPage(url);
            const id = entryPage.querySelector('input#movie_id').value;
            const startPage = await fetchPage(`https://ajax.gogocdn.net/ajax/load-list-episode?ep_start=0&ep_end=9999&id=${id}`);
            let origin = url.split('/').slice(0, 3).join('/');
            startPage.body.innerHTML += `<a id="original-origin">${origin}</a>`;
            return startPage;
        }
    },
    {
        name: 'AnimePahe', 
        domains: ['animepahe.ru', 'animepahe.com', 'animepahe.org'],
        epLinks: '.dropup.episode-menu .dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
        extractEpisodes: async function (status, startpage) {
            status.textContent = 'Starting...';
            let episodes = {};
            const episodePromises = Array.from(startpage.querySelectorAll(this.epLinks)).map(async epLink => { try {
                const page = await fetchPage(epLink.href);
                
                if (page.querySelector(this.epTitle) == null) return;
                const [, epTitle, epNumber] = page.querySelector(this.epTitle).outerText.split(/Watch (.+) - (\d+(?:\.\d+)?) Online$/);
                const episodeTitle = `${epNumber.padStart(3, '0')} - ${epTitle}`;
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
                    status.textContent = `Parsed ${episodeTitle}`;
                }

                episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, 'm3u8', thumbnail);
            } catch (e) { showToast(e) } });
            await Promise.all(episodePromises);
            console.log(episodes);
            return episodes;
        },
        styles: `div#AniLINK_LinksContainer { font-size: 10px; } #Quality > b > div > ul {font-size: 16px;}`
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

// This function first prompts the user to select a website and domain to extract links from.
// It then calls the `searchAnime` method of the selected website object to search for the anime title.
async function startExtraction(title) {
    site = websites[
        parseInt(prompt("Select the website to extract links from:\n\n" + websites.map((site, index) => `${index + 1}. ${site.name}`).join("\n"), 1)) - 1
    ];
    let domain = site.domains[
        parseInt(prompt("Select the domain to extract links from:\n\n" + site.domains.map((domain, index) => `${index + 1}. ${domain}`).join("\n"), 1)) - 1
    ];

    let entries = [];
    try {
        entries = await site.searchTitles(domain, title);
    } catch (error) {
        showToast(error);
        return alert("AniLINK failed to extract links for this anime. Please try again later.\n\n" + error);
    }
    
    if (entries.length === 0) {
        showToast("No episodes found for this anime.");
        return;
    }

    if (entries.length === 1) {
        return await extractEpisodes(entries[0]);
    }
    
    if (entries.length > 1) {
        const entry = entries[
            parseInt(prompt("Select the entry to extract links from:\n\n" + entries.map((entry, index) => `${index + 1}. ${entry}`).join("\n"), 1) - 1)
        ];
        return await extractEpisodes(entry);
    }
}

// This function creates an overlay on the page and displays a list of episodes extracted from a website.
// The function is triggered by a user command registered with `GM_registerMenuCommand`.
// The episode list is generated by calling the `extractEpisodes` method of a website object that matches the current URL.
async function extractEpisodes(entryUrl) {
    // Restore last overlay if it exists
    // if (document.getElementById("AniLINK_Overlay")) {
    //     document.getElementById("AniLINK_Overlay").style.display = "flex";
    //     return;
    // }    

    // Create an overlay to cover the page
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "AniLINK_Overlay";
    overlayDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); z-index: 999; display: flex; align-items: center; justify-content: center;";
    document.body.appendChild(overlayDiv);
    overlayDiv.onclick = event => linksContainer.contains(event.target) ? null : overlayDiv.style.display = "none";

    // Create a form to display the Episodes list
    const linksContainer = document.createElement('div');
    linksContainer.id = "AniLINK_LinksContainer";
    linksContainer.style.cssText = "position:relative; height:70%; width:60%; color:cyan; background-color:#0b0b0b; overflow:auto; border: groove rgb(75, 81, 84); border-radius: 10px; padding: 10px 5px; resize: both; scrollbar-width: thin; scrollbar-color: cyan transparent; display: flex; justify-content: center; align-items: center;";
    overlayDiv.appendChild(linksContainer);

    // Create a progress bar to display the progress of the episode extraction process
    const statusBar = document.createElement('span');
    statusBar.id = "AniLINK_StatusBar";
    statusBar.textContent = "Extracting Links..."
    statusBar.style.cssText = "background-color: #0b0b0b; color: cyan;";
    linksContainer.appendChild(statusBar);

    // Fetch the start page of the anime series
    let entryPage = ""
    try {
        entryPage = await site.getStartPage(entryUrl);
    } catch (error) {
        alert("AniLINK failed to extract links for this anime. Please try again later.\n\n" + error);
        console.error(error);
        return;
    }

    // Extract episodes
    const episodes = await site.extractEpisodes(statusBar, entryPage);

    console.log(episodes);

    // Get all links into format - {[qual1]:[ep1,2,3,4], [qual2]:[ep1,2,3,4], ...}
    const sortedEpisodes = Object.values(episodes).sort((a, b) => a.number - b.number);
    const sortedLinks = sortedEpisodes.reduce((acc, episode) => {
        for (let quality in episode.links) (acc[quality] ??= []).push(episode);
        return acc;
    }, {});
    console.log('sorted', sortedLinks);


    const qualityLinkLists = Object.entries(sortedLinks).map(([quality, episode]) => {
        const listOfLinks = episode.map(ep => {
            return `<li id="EpisodeLink" style="list-style-type: none;">
                      <span style="user-select:none; color:cyan;">
                      Ep ${ep.number.replace(/^0+/, '')}: </span>
                      <a title="${ep.title.replace(/[<>:"/\\|?*]/g, '')}" download="${encodeURI(ep.name)}.${ep.type}" href="${ep.links[quality]}" style="color:#FFC119;">
                      ${ep.links[quality]}</a>
                  </li>`;
        }).join("");

        return `<ol style="white-space: nowrap;">
                      <span id="Quality" style="display:flex; justify-content:center; align-items:center;">
                        <b style="color:#58FFA9; font-size:25px; cursor:pointer; user-select:none;">
                          -------------------${quality}-------------------\n
                        </b>
                      </span>
                      ${listOfLinks}
                    </ol><br><br>`;
    });

    // Update the linksContainer with the finally generated links under each quality option header
    linksContainer.style.cssText = "position:relative; height:70%; width:60%; color:cyan; background-color:#0b0b0b; overflow:auto; border: groove rgb(75, 81, 84); border-radius: 10px; padding: 10px 5px; resize: both; scrollbar-width: thin; scrollbar-color: cyan transparent;";
    linksContainer.innerHTML = qualityLinkLists.join("");

    // Add hover event listeners to update link text on hover
    linksContainer.querySelectorAll('#EpisodeLink').forEach(element => {
        const episode = element.querySelector('a');
        const link = episode.href;
        const name = decodeURIComponent(episode.download);
        element.addEventListener('mouseenter', () => window.getSelection().isCollapsed && (episode.textContent = name));
        element.addEventListener('mouseleave', () => episode.textContent = decodeURIComponent(link));
    });

    // Add hover event listeners to quality headers to transform them into speed dials
    document.querySelectorAll('#Quality b').forEach(header => {
        const style = `style="background-color: #00A651; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; user-select: none;"`
        const sdHTML = `
            <div style="display: flex; justify-content: center; padding: 10px;">
                <ul style="list-style: none; display: flex; gap: 10px;">
                    <button type="button" ${style} id="AniLINK_selectLinks">Select</button>
                    <button type="button" ${style} id="AniLINK_copyLinks">Copy</button>
                    <button type="button" ${style} id="AniLINK_exportLinks">Export</button>
                    <button type="button" ${style} id="AniLINK_playLinks">Play with VLC</button>
                </ul>
            </div>`

        let headerHTML = header.innerHTML;
        header.parentElement.addEventListener('mouseenter', () => (header.innerHTML = sdHTML, attachBtnClickListeners()));
        header.parentElement.addEventListener('mouseleave', () => (header.innerHTML = headerHTML));
    });

    // Attach click listeners to the speed dial buttons
    function attachBtnClickListeners() {
        const buttonIds = [
            { id: 'AniLINK_selectLinks', handler: onSelectBtnPressed },
            { id: 'AniLINK_copyLinks', handler: onCopyBtnClicked },
            { id: 'AniLINK_exportLinks', handler: onExportBtnClicked },
            { id: 'AniLINK_playLinks', handler: onPlayBtnClicked }
        ];

        buttonIds.forEach(({ id, handler }) => {
            const button = document.querySelector(`#${id}`);
            button.addEventListener('click', () => handler(button));
        });

        // Select Button click event handler
        function onSelectBtnPressed(it) {
            const links = it.closest('ol').querySelectorAll('li');
            const range = new Range();
            range.selectNodeContents(links[0]);
            range.setEndAfter(links[links.length - 1]);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            it.textContent = 'Selected!!';
            setTimeout(() => { it.textContent = 'Select'; }, 1000);
        }

        // copySelectedLinks click event handler
        function onCopyBtnClicked(it) {
            const links = it.closest('ol').querySelectorAll('li');
            const string = [...links].map(link => link.children[1].href).join('\n');
            navigator.clipboard.writeText(string);
            it.textContent = 'Copied!!';
            setTimeout(() => { it.textContent = 'Copy'; }, 1000);
        }

        // exportToPlaylist click event handler
        function onExportBtnClicked(it) {
            // Export all links under the quality header into a playlist file
            const links = it.closest('ol').querySelectorAll('li');
            let string = '#EXTM3U\n';
            links.forEach(link => {
                const episode = decodeURIComponent(link.children[1].download);
                string += `#EXTINF:-1,${episode}\n` + link.children[1].href + '\n';
            });
            const fileName = links[0].querySelector('a').title + '.m3u';
            const file = new Blob([string], { type: 'application/vnd.apple.mpegurl' });
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: fileName });
            a.click();
            it.textContent = 'Exported!!';
            setTimeout(() => { it.textContent = 'Export'; }, 1000);
        }

        // PlayWithVLC click event handler
        function onPlayBtnClicked(it) {
            // Export all links under the quality header into a playlist file
            const links = it.closest('ol').querySelectorAll('li');
            let string = '#EXTM3U\n';
            links.forEach(link => {
                const episode = decodeURIComponent(link.children[1].download);
                string += `#EXTINF:-1,${episode}\n` + link.children[1].href + '\n';
            });
            const file = new Blob([string], { type: 'application/vnd.apple.mpegurl' });
            const fileUrl = URL.createObjectURL(file);
            window.open(fileUrl);
            it.textContent = 'Launching VLC!!';
            setTimeout(() => { it.textContent = 'Play with VLC'; }, 2000);
            alert("Due to browser limitations, there is a high possibility that this feature may not work correctly.\nIf the video does not automatically play, please utilize the export button and manually open the playlist file manually.");
        }

        return {
            onSelectBtnPressed,
            onCopyBtnClicked,
            onExportBtnClicked,
            onPlayBtnClicked
        };
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