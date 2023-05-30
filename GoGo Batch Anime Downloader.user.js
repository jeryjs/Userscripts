// ==UserScript==
// @name        GoGo Batch AniDl
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @match       https://gogoanime.*/*
// @grant       none
// @version     2.0
// @author      Jery
// @license     MIT
// @icon        https://www.google.com/s2/favicons?domain=gogoanime.cl
// @description Generates direct download links for all episodes of an anime, sorted by quality. You can copy the links into an app like IDM to batch download it all.
// ==/UserScript==

(function () {
    'use strict';

    // Constants
    const buttonId = "AniLINK_GenerateBtn";
    const linksContainerId = "AniLINK_LinksContainer";
    const qualityOptions = [];
    const links = new Map();

    // Create and add the button to the page
    function createButton() {
        const btn = document.createElement('a');
        btn.id = buttonId;
        btn.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links For All Episodes';
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
        button.removeEventListener('click', onButtonPressed);
        button.innerHTML = text;
        button.style.cursor = cursor;
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
        linksContainer.id = linksContainerId;
        linksContainer.style.cssText = "height:0px; width:100%; color:cyan; background:black; overflow:scroll; resize:both;";
        document.querySelector('.list_dowload').appendChild(linksContainer);

        // Generate HTML for each download link and then add them under their quality option header
        const qualityLinkLists = qualityOptions.map(qualityOption => {
            const qualityLinks = links.get(qualityOption);
            const sortedLinks = new Map([...qualityLinks.entries()].sort());

            // Generate HTML for each download link
            const listOfLinks = [...sortedLinks.entries()].map(([episode, link]) => {
                const [, , epNumber] = decodeURIComponent(episode).match(/(.+) - (\d+)/);
                return `<li>
                      <span style="user-select:none; color:cyan;">
                      Ep ${epNumber.replace(/^0+/, '')}: </span>
                      <a download="${episode}.mp4" href="${link}" style="color:#FFC119;">
                      ${link}</a>
                  </li>`;
            }).join("");

            // Generate HTML for each quality option with links under it
            return `<ol style="white-space: nowrap;">
                    <span id="Quality" style="display:flex; justify-content:center; align-items:center;">
                        <b style="color:#58FFA9; font-size:25px; cursor:pointer; user-select:none;">
                        -------------------${qualityOption}-------------------\n</b>
                    </span>
                    ${listOfLinks}
                </ol><br><br>`;
        });

        // Update the linksContainer with the finally generated links under each quality option header
        linksContainer.innerHTML = qualityLinkLists.join("");

        // Add click event listeners to quality headers to select all links
        document.querySelectorAll('#Quality b').forEach(header => {
            header.addEventListener('click', () => {
                const links = header.closest('ol').querySelectorAll('li');
                const range = new Range();
                range.selectNodeContents(links[0]);
                range.setEndAfter(links[links.length - 1]);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            });
        });

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

    // Call the createButton function to initialize the script
    createButton();
})();


/**
 * This user script adds a button to the GoGoAnime website that generates direct download links for all episodes of an anime, sorted by quality.
 * The generated links can be copied into a download manager like IDM to batch download all episodes.
 * The script uses DOM manipulation and fetch requests to extract episode information and download links from the page.
 * It also provides functionality to select and copy all links under each quality option and regenerate the download links when navigating to a different episode.
 */
