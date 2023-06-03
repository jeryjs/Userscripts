// ==UserScript==
// @name        AniLINK: GoGoAnime
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     2.1.1
// @description Stream or download your favorite anime series effortlessly with AniLINK for GoGoAnime! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=gogoanime.llc
// @author      Jery
// @license     MIT
// @include     https://gogoanime.tld/*
// @match       https://gogoanime.cl/*
// @match       https://gogoanime.llc/*
// @grant       none
// ==/UserScript==

(function () {
    'use strict';

    // Constants
    const buttonId = "AniLINK_GenerateBtn";
    const linksContId = "AniLINK_LinksContainer";
    const qualityOptions = [];
    const links = new Map();

    // Create and add the generate button to the page
    function generateButton() {
        const btn = document.createElement('a');
        btn.id = buttonId;
        btn.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links';
        btn.style.cursor = "pointer";
        btn.style.backgroundColor = "#00A651";
        const btnArea = document.querySelector('.cf-download');

        // Add the button to the page if user is logged in otherwise show placeholder
        if (btnArea) {
            btnArea.appendChild(btn);
        } else {
            const loginMessage = document.querySelector('.list_dowload > div > span');
            loginMessage.innerHTML = `<b style="color:#FFC119;">GoGo Batch AniDl:</b> Please <a href="/login.html" title="login"><u>log in</u></a> to be able to batch download animes.`;
        }
        btn.addEventListener('click', onButtonPressed);
    }

    // Disable the button and update its text content
    function disableButton(cursor, text) {
        const button = document.getElementById(buttonId);
        button.innerHTML = text;
        button.style.cursor = cursor;
        button.removeEventListener('click', onButtonPressed);
    }
    // Enable the button with the provided text content
    function enableButton(text) {
        const button = document.getElementById(buttonId);
        button.innerHTML = text;
        button.style.cursor = 'pointer';
        button.addEventListener('click', onButtonPressed);
    }
    // Update the status message on the button
    async function updateStatus(episode) {
        const button = document.getElementById(buttonId);
        button.innerHTML = `Processing Ep ${episode.match(/(?:.+)-(\d+)$/)[1]}`;
    }

    // Function to execute when the button is pressed
    async function onButtonPressed() {
        disableButton('progress', '<i class="icongec-dowload"></i> Generating Links...');
        // Get page for each ep
        const epLinks = Array.from(document.querySelectorAll('#episode_related li > a')).reverse();
        try {
            // Get links for each ep and then get HTMl from it
            const fetchPromises = epLinks.map(epLink => fetchEpisodeHTML(epLink.href));
            const htmls = await Promise.all(fetchPromises);

            // Get download links for each ep
            htmls.forEach(html => extractLinksFromHTML(html));

            // Display download links in the linksContainer
            generateLinksHTML();

        } catch (error) {
            // Handle any errors
            console.error(error);
            enableButton('<i class="icongec-dowload"></i> Error generating download links');
            alert(`Error generating download links.\nCheck the console for more details.\n\n${error}`);
        }
    }

    // Fetch the HTML content of an episode link
    async function fetchEpisodeHTML(url) {
        const response = await fetch(url);
        if (response.ok) {
            updateStatus(url);
            return await response.text();
        } else {
            throw new Error(`Failed to fetch HTML for ${url}`);
        }
    }

    // Extract episode information and download links from the HTML content
    function extractLinksFromHTML(html) {
        const parser = new DOMParser();
        const epPage = parser.parseFromString(html, 'text/html');
        const titleElement = epPage.querySelector('.title_name h2');

        // Extract the episode title and number from the title element
        const [, epTitle, epNumber] = titleElement.textContent.match(/(.+?) Episode (\d+)(?:.+)$/);
        const episode = encodeURIComponent(`${epTitle} - ${("000" + epNumber).slice(-3)}`);

        // Extract the download links from the episode page
        const dwnldLinks = Array.from(epPage.querySelectorAll('.cf-download a'));
        if (dwnldLinks.length === 0) {
            return; // Skip episodes with no download links
        }

        dwnldLinks.forEach(dwnldLink => {
            const qualityOption = dwnldLink.textContent.trim();

            // Add quality option to the list if it's not already present
            if (!qualityOptions.includes(qualityOption)) { qualityOptions.push(qualityOption); }

            // Add the episode and download link to the corresponding quality option
            if (!links.has(qualityOption)) { links.set(qualityOption, new Map()); }

            links.get(qualityOption).set(episode, dwnldLink.href);
        });
    }

    // Generate the HTML for the download links
    function generateLinksHTML() {
        const linksContainer = document.createElement('div');
        linksContainer.id = linksContId;
        linksContainer.style.cssText = "height:0px; width:100%; color:cyan; background:black; overflow:scroll; resize:both; border: groove; border-color: #4b5154; border-radius: 10px; padding: 10px 5px;";
        document.querySelector('.list_dowload').appendChild(linksContainer);

        // Generate HTML for each download link and then add them under their quality option header
        const qualityLinkLists = qualityOptions.map(qualityOption => {
            const qualityLinks = links.get(qualityOption);
            const sortedLinks = new Map([...qualityLinks.entries()].sort());

            // Generate HTML for each download link
            const listOfLinks = [...sortedLinks.entries()].map(([episode, link]) => {
                const [, animeName, epNumber] = decodeURIComponent(episode).match(/^(.+) - (\d+)$/);
                return `<li id="EpisodeLINK" style="list-style-type: none;">
                      <span style="user-select:none; color:cyan;">
                      Ep ${epNumber.replace(/^0+/, '')}: </span>
                      <a title="${animeName.replace(/[<>:"/\\|?*]/g, '')}" download="${episode}.mp4" href="${link}" style="color:#FFC119;">
                      ${link}</a>
                  </li>`;
            }).join("");

            // Generate HTML for each quality option with links under it
            return `<ol style="white-space: nowrap;">
                    <span id="Quality" style="display:flex; justify-content:center; align-items:center;">
                        <b style="color:#58FFA9; font-size:25px; cursor:pointer; user-select:none;">
                        --------------${qualityOption}--------------\n</b>
                    </span>
                    ${listOfLinks}
                </ol><br><br>`;
        });

        // Update the linksContainer with the finally generated links under each quality option header
        linksContainer.innerHTML = qualityLinkLists.join("");

        // Add hover event listeners to the linksContainer
        attachHoverListeners(linksContainer);

        // Add click event listeners to episode page links to enable button
        document.querySelectorAll('#episode_page a').forEach(page => {
            page.addEventListener('click', () => {
                enableButton('<i class="icongec-dowload"></i> Regenerate Download Links For All Episodes');
            });
        });

        // Reveal the linksContainer once links are generated
        linksContainer.style.height = "500px";
        disableButton('not-allowed', '<i class="icongec-dowload"></i> Download links generated!!');
    }

    // Attach hover listeners to the linksContainer to handle various actions
    function attachHoverListeners(linksContainer) {
        // Add hover event listeners to update link text on hover
        const linkElements = linksContainer.querySelectorAll('#EpisodeLINK');
        linkElements.forEach(element => {
            let episode = element.querySelector('a');
            let link = episode.href;
            let name = decodeURIComponent(episode.download);
            element.addEventListener('mouseenter', () => {
                if (window.getSelection().isCollapsed) {    // Only update the link text if no text is selected
                    episode.textContent = name;
                }
            });
            element.addEventListener('mouseleave', () => {
                episode.textContent = decodeURIComponent(link);
            });
        });

        // Add hover event listeners to quality headers to transform them into speed dials
        document.querySelectorAll('#Quality b').forEach(header => {
            let headerHTML = header.innerHTML;
            let style = `style="background-color: #00A651; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; user-select: none;"`
            let sdHTML = `
            <div style="display: flex; justify-content: center; padding: 10px;">
                <ul style="list-style: none; display: flex; gap: 10px;">
                    <button type="button" ${style} id="AniLINK_selectLinks">Select</button>
                    <button type="button" ${style} id="AniLINK_copyLinks">Copy</button>
                    <button type="button" ${style} id="AniLINK_exportLinks">Export</button>
                    <button type="button" ${style} id="AniLINK_playLinks">Play with VLC</button>
                </ul>
            </div>`
            header.parentElement.addEventListener('mouseenter', () => {
                header.innerHTML = sdHTML;
                attachBtnClickListeners();
            });
            header.parentElement.addEventListener('mouseleave', () => {
                header.innerHTML = headerHTML;
            });
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
                let string = '';
                links.forEach(link => {
                    string += link.children[1].href + '\n';
                });
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
                    string += `#EXTINF:-1,${episode}\n`;
                    string += link.children[1].href + '\n';
                });
                const fileName = links[0].querySelector('a').title + '.m3u';
                const file = new Blob([string], { type: 'application/vnd.apple.mpegurl' });
                const a = document.createElement('a');
                a.href = window.URL.createObjectURL(file);
                a.download = fileName;
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
                    string += `#EXTINF:-1,${episode}\n`;
                    string += link.children[1].href + '\n';
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

    // Call the generateButton function to initialize the script
    generateButton();
})();


/**
 * This user script adds a button to the GoGoAnime website that generates direct download links for all episodes of an anime, sorted by quality.
 * The generated links can be copied into a download manager like IDM to batch download all episodes.
 * The script uses DOM manipulation and fetch requests to extract episode information and download links from the page.
 * It also provides functionality to select, copy and export (to playlist) all links under each quality option and regenerate the download links when navigating to a different episode.
 */
