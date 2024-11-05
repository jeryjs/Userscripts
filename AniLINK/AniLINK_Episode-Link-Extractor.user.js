// ==UserScript==
// @name        AniLINK - Episode Link Extractor
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     5.0.2
// @description Stream or download your favorite anime series effortlessly with AniLINK! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=animepahe.ru
// @author      Jery
// @license     MIT
// @match       https://anitaku.*/*
// @match       https://anitaku.pe/*
// @match       https://gogoanime.*/*
// @match       https://gogoanime3.cc/*
// @match       https://gogoanime3.*/*
// @match       https://animepahe.*/play/*
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
        url: ['anitaku.to/', 'gogoanime3.co/', 'gogoanime3', 'anitaku', 'gogoanime'],
        epLinks: '#episode_related > li > a',
        epTitle: '.title_name > h2',
        linkElems: '.cf-download > a',
        thumbnail: '.headnav_left > a > img',
        addStartButton: function() {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; background-color: #145132;`;
            button.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links';

            // Add the button to the page if user is logged in otherwise show placeholder
            if (document.querySelector('.cf-download')) document.querySelector('.cf-download').appendChild(button);
            else document.querySelector('.list_dowload > div > span').innerHTML = `<b style="color:#FFC119;">AniLINK:</b> Please <a href="/login.html" title="login"><u>log in</u></a> to be able to batch download animes.`;
            return button;
        },
        extractEpisodes: async function (status) {
            status.textContent = 'Starting...';
            const throttleLimit = 12; // Number of episodes to extract in parallel
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            let episodes = {};
            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                let episodePromises = chunk.map(async epLink => { try {
                    const page = await fetchPage(epLink.href);
                    
                    const [, epTitle, epNumber] = page.querySelector(this.epTitle).textContent.match(/(.+?) Episode (\d+(?:\.\d+)?)/);
                    const episodeTitle = `${epNumber.padStart(3, '0')} - ${epTitle}`;
                    const thumbnail = page.querySelector(this.thumbnail).src;
                    status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, '0')}...`;
                    const links = [...page.querySelectorAll(this.linkElems)].reduce((obj, elem) => ({ ...obj, [elem.textContent.trim()]: elem.href }), {});
                    status.textContent = `Extracted ${epTitle} - ${epNumber.padStart(3, '0')}`;

                    episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, 'mp4', thumbnail);
                } catch (e) { showToast(e) } });
                await Promise.all(episodePromises);
            }
            return episodes;
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
        extractEpisodes: async function (status) {
            status.textContent = 'Getting list of episodes...';
            let episodes = {};
            const epLinks = Array.from(document.querySelectorAll(this.epLinks));
            const throttleLimit = 12;    // Number of episodes to extract in parallel

            for (let i = 0; i < epLinks.length; i += throttleLimit) {
                const chunk = epLinks.slice(i, i + throttleLimit);
                let episodePromises = chunk.map(async (epLink, index) => { try {
                    status.textContent = `Loading ${epLink.pathname}`
                    const page = await fetchPage(epLink.href); 

                    const animeTitle = page.querySelector(this.animeTitle).textContent;
                    const epNumber = epLink.href.match(/(\d+)\/?$/)[1];
                    const epTitle = page.querySelector(this.epTitle).textContent.match(/^${epNumber} : (.+)$/) || animeTitle;
                    const thumbnail = document.querySelectorAll(this.thumbnail)[index].src;
                    const episodeTitle = `${epNumber.padStart(3, '0')} - ${animeTitle}` + (epTitle != animeTitle ? `- ${epTitle}` : '');
                    status.textContent = `Extracting ${episodeTitle}...`;
                    const links = await this._getVideoLinks(page, status, episodeTitle);

                    episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, 'm3u8', thumbnail);
                } catch (e) { showToast(e) }});
                await Promise.all(episodePromises);
            }
            return episodes;
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
        epLinks: '.dropup.episode-menu .dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
        addStartButton: function() {
            GM_addStyle(`.theatre-settings .col-sm-3 { max-width: 20%; }`);
            document.querySelector("div.theatre-settings > div.row").innerHTML += `
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
        extractEpisodes: async function (status) {
            status.textContent = 'Starting...';
            let episodes = {};
            const episodePromises = Array.from(document.querySelectorAll(this.epLinks)).map(async epLink => { try {
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
    },
    {
        name: 'HiAnime',
        url: ['hianime.to', 'hianime.sx', 'hianime.mn', 'hianime.nz'],
        animeTitle: '.anis-watch-detail .film-name a',
        epLinks: '.ss-list a',
        epNumber: '.ssli-order',
        epTitle: '.ep-name',
        thumbnail: '.anis-watch-detail img.film-poster-img',
        addStartButton: function() {
            const button = document.createElement('div');
            button.id = "AniLINK_startBtn";
            button.className = "pc-item pc-live";
            button.innerHTML = '<a class="btn btn-sm"><i style="color: #ffbade;" class="material-symbols-outlined">downloading</i><span class="m-hide">Generate Download Links</span><span class="w-hide">Download</span></a><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0" />';
            button.title = 'Generate Download Links';
            document.querySelector('.pc-right').appendChild(button);
            return button;
        },
        extractEpisodes: async function (status) {
            status.textContent = 'Getting Episodes List...';
            let epList = [...document.querySelectorAll(this.epLinks)].map(item => ({
                "epId": new URL(item.href).searchParams.get('ep'),
                "epNum": item.querySelector(this.epNumber).textContent,
                "epTitle": item.querySelector(this.epTitle).textContent,
            }));
            console.log(epList);
            const animeTitle = document.querySelector(this.animeTitle).textContent;
            const thumbnail = document.querySelector(this.thumbnail).src;
            let episodes = {};
            const episodePromises = Array.from(epList).map(async item => { try {
                const episodeTitle = `${item.epNum.padStart(3, '0')} - ${animeTitle}` + (item.epTitle != `Episode ${item.epNum}` ? `- ${item.epTitle}` : '');
                const links = await this._getVideoLinks(item, status, episodeTitle);
                status.textContent = `Extracted ${episodeTitle}...`;
                console.log(links);
                episodes[episodeTitle] = new Episode(item.epNum.padStart(3, '0'), item.epTitle, links, 'm3u8', thumbnail);
            } catch (e) { showToast(e) } });
            await Promise.all(episodePromises);
            return episodes;
        },
        _getVideoLinks: async function (item, status, episodeTitle) {
            const baseUrl = `${document.location.origin}/ajax/v2/episode`;
            const animeUrl = document.location.href.split('?')[0];
            var serverRes = await fetch(`${baseUrl}/servers?episodeId=${item.epId}`);
            var serversDoc = (new DOMParser()).parseFromString((await serverRes.json()).html, 'text/html');
            let links = {};
            serversDoc.querySelectorAll('.server-item').forEach(async server => {
                var serverName = server.getAttribute('data-type') + " - " + server.textContent;
                var serverUrl = `${baseUrl}/sources?id=${server.getAttribute('data-id')}`;
                var serverRes = await fetch(serverUrl, { headers: { "X-Requested-With": "XMLHttpRequest", referer: animeUrl+`?ep=${item.epId}` } });
                showToast(serverRes.status);
                links[serverName] = (await serverRes.json()).link;
                status.textContent = `Parsed ${episodeTitle} - ${serverName}...`;
            });
            return links;
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

GM_registerMenuCommand('Extract Episodes', extractEpisodes);

// initialize
console.log('Initializing AniLINK...');
const site = websites.find(site => site.url.some(url => window.location.href.includes(url)));

// attach button to page
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

    // Extract episodes
    const episodes = await site.extractEpisodes(statusBar);

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