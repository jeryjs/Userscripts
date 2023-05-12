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

    // Create a button element and add it to the page
    const btn = document.createElement('a');
    btn.id = "AniLINK_GenerateBtn";
    btn.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links For All Episodes';
    btn.onclick = onBtnPressed;
    btn.style.cursor = "pointer";
    btn.style.backgroundColor = "#00A651";
    const btnArea = document.querySelector('.cf-download');

    // If the user is not logged in then display placeholder text instead of the button
    if (btnArea) {
        btnArea.appendChild(btn);
    } else {
        document.querySelector('.list_dowload > div > span').innerHTML = `<b style="color:#FFC119;">GoGo Batch AniDl:</b> Please <a href="/login.html" title="login"><u>log in</u></a> to be able to batch download animes.`;
    }

    // Function to execute when the button is pressed
    function onBtnPressed() {
        // Disable the btn and update its textContent
        btn.onclick = null;
        btn.innerHTML = '<i class="icongec-dowload"></i> Generating Links...';  // icongec-dowload is to show download icon before the text
        btn.style.cursor = 'progress';

        // Create a map to store the links, and an array to store the quality options
        const links = new Map();
        const qualityOptions = [];

        // Create a container for the links and add it to the page
        const linksContainer = document.createElement('div');
        linksContainer.id = "AniLINK_LinksContainer";
        linksContainer.style.cssText = "height:0px; width:100%; color:cyan; background:black; overflow:scroll; resize:both;";
        document.querySelector('.list_dowload').appendChild(linksContainer);

        // Get all episode links and fetch their HTML content
        const epLinks = Array.from(document.querySelectorAll('#episode_related li > a')).reverse();
        const fetchPromises = epLinks.map(epLink =>
            fetch(epLink.href).then(response => {
                updateStatus(epLink.href);
                btn.innerHTML = `Processing Ep ${epLink.href.match(/(?:.+)-(\d+)$/)[1]}`;
                // btn.innerHTML = `Processing Ep ${response.url.match(/(.+)-(\d+)$/)[2]}`
                return response.text();
            }));

        // Log the episode being processed and display status on the button
        async function updateStatus(msg) { }

        // Process the fetched HTML content
        Promise.all(fetchPromises)
            .then(htmls => {
                htmls.forEach((html) => {
                    // Parse the HTML content and extract the episode title, number, and download links
                    const parser = new DOMParser();
                    const epPage = parser.parseFromString(html, 'text/html');
                    const [, epTitle, epNumber] = epPage.querySelector('.title_name h2').textContent.match(/(.+?) Episode (\d+)(?:.+)$/);
                    // updateStatus(`Processing episode: ${epTitle} - ${epNumber}`);
                    const episode = encodeURIComponent(`${epTitle} - ${("000" + epNumber).slice(-3)}`); // Pad the epNumber with zeros and append to epTitle and finally encode into url format

                    const dwnldLinks = Array.from(epPage.querySelectorAll('.cf-download a'));   // Get all download links
                    if (dwnldLinks.length === 0) { return; }    // Skip episodes with no download links

                    // Store the download links in the map, grouped by quality option
                    dwnldLinks.forEach(dwnldLink => {
                        const qualityOption = dwnldLink.textContent.trim();
                        if (!qualityOptions.includes(qualityOption)) { qualityOptions.push(qualityOption); }    // Add the quality option to the array if it doesn't exist

                        const link = dwnldLink.href;
                        if (!links.has(qualityOption)) { links.set(qualityOption, new Map()); }     // Set the quality option of the link

                        links.get(qualityOption).set(episode, link);    // Add the link to the map based on its quality option
                    });
                });

                // Generate innerHTML for the download links and add it to the container
                const qualityLinkLists = qualityOptions.map(qualityOption => {
                    const qualityLinks = links.get(qualityOption);  // Get the Links and Quality Option as a key-value pair
                    const sortedLinks = new Map([...qualityLinks.entries()].sort());    // Sort the links by episode number
                    // Create a list of links for each quality option and return as innerHTML
                    const listOfLinks = [...sortedLinks.entries()].map(([episode, link]) => {
                        const [, , epNumber] = decodeURIComponent(episode).match(/(.+?) - (\d+)/);   // Decode the epNumber from the encoded uri
                        return `<li>
                                    <span style="user-select:none; color:cyan;">
                                    Ep ${epNumber.replace(/^0+/, '')}: </span>
                                    <a download="${episode}.mp4" href="${link}" style="color:#FFC119;">
                                    ${link}</a>
                                </li>`;
                    }).join("");    // Join the list of links into a single string

                    // Append the list of links to the quality option header and return as innerHTML
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

                // Add a click event listener to each quality option header to select all links in that section
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

                // Add a click event listener to the page link at the bottom to reset the 'GenerateLinks' btn
                document.querySelectorAll('#episode_page a').forEach(page => {
                    page.addEventListener('click', () => {
                        btn.innerHTML = '<i class="icongec-dowload"></i> Regenerate Download Links For All Episodes';
                        btn.onclick = onBtnPressed;
                        btn.style.cursor = "pointer";
                    });
                });

                // Reveal the loaded links container
                linksContainer.style.height = "500px";
                // Change the button text and disable it when done processing
                btn.innerHTML = '<i class="icongec-dowload"></i> Download links generated!!';
                btn.style.cursor = 'not-allowed';
            });
    }
})();
