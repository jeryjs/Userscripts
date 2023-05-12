// ==UserScript==
// @name        GoGo Batch AniDl
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @match       https://gogoanime.*/*
// @grant       none
// @version     1.3
// @author      Jery
// @license     MIT
// @icon        https://www.google.com/s2/favicons?domain=gogoanime.cl
// @description Generates direct download links for all episodes of an anime, sorted by quality. You can copy the links into an app like IDM to batch download it all.
// ==/UserScript==

(function () {
    'use strict';

    const btn = document.createElement('a');
    btn.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links For All Episodes';
    btn.onclick = onBtnPressed;
    btn.style.cursor = "pointer";
    btn.style.backgroundColor = "#008541";
    const btnArea = document.querySelector('.cf-download');

    if (btnArea) {
        btnArea.appendChild(btn);
    } else {
        document.querySelector('.list_dowload > div > span').innerHTML = `<b style="color:#fdba2f;">GoGo Batch AniDl:</b> Please <a href="/login.html" title="login"><u>log in</u></a> to be able to batch download animes.`;
    }

    function onBtnPressed() {
        btn.innerHTML = '<i class="icongec-dowload"></i> Processing...';
        btn.style.cursor = 'progress';
        btn.style.pointerEvents = 'none';

        const links = new Map();
        const qualityOptions = [];

        const linksContainer = document.createElement('div');
        linksContainer.style.cssText = "height: 500px; width: 100%; color: cyan; background: black; overflow: scroll; resize: both;";
        document.querySelector('.list_dowload').appendChild(linksContainer);

        const epLinks = Array.from(document.querySelectorAll('#episode_related li > a')).reverse();
        const fetchPromises = epLinks.map(epLink => fetch(epLink.href).then(response => response.text()));

        Promise.all(fetchPromises)
            .then(htmls => {
                htmls.forEach((html, index) => {
                    const parser = new DOMParser();
                    const epPage = parser.parseFromString(html, 'text/html');
                    const [_, epTitle, epNumber] = epPage.querySelector('.title_name h2').textContent.match(/(.+?) (Episode \d+)/);
                    const episode = encodeURIComponent(`${epTitle} - ${("000" + (index + 1)).slice(-3)}`);

                    const dwnldLinks = Array.from(epPage.querySelectorAll('.cf-download a')).filter(link => link.textContent.trim() !== '');
                    if (dwnldLinks.length === 0) { return; }

                    dwnldLinks.forEach(dwnldLink => {
                        const qualityOption = dwnldLink.textContent.trim();
                        if (!qualityOptions.includes(qualityOption)) { qualityOptions.push(qualityOption); }

                        const link = dwnldLink.href;
                        if (!links.has(qualityOption)) { links.set(qualityOption, new Map()); }

                        links.get(qualityOption).set(episode, link);
                    });
                });

                const qualityLinkLists = qualityOptions.map(qualityOption => {
                    const qualityLinks = links.get(qualityOption);
                    const sortedLinks = new Map([...qualityLinks.entries()].sort());
                    const linkListItems = [...sortedLinks.entries()].map(([episode, link]) => {
                        const [_, __, epNumber] = decodeURIComponent(episode).match(/(.+?) - (\d+)/);
                        return `<li><span style="user-select: none; color: cyan;">Ep ${epNumber.replace(/^0+/, '')}: </span> <a download="${episode}.mp4" href="${link}" style="color:#fdba2f;">${link}</a></li>`;
                    }).join("");

                    return `<ol style="white-space: pre;"><span id="Quality" style="display:flex; justify-content:center; align-items:center;"><b style="color:#008541; font-size:25px; cursor:pointer; user-select:none;">-------------------${qualityOption}-------------------\n</b></span>${linkListItems}</ol><br><br>`;
                });

                linksContainer.innerHTML = qualityLinkLists.join("");

                // Select all links on clicking the quality header
                document.querySelectorAll('#Quality b').forEach(header => {
                    header.addEventListener('click', () => {
                        const links = header.closest('ol').querySelectorAll('li a');
                        const range = new Range();
                        range.selectNodeContents(links[0]);
                        range.setEndAfter(links[links.length - 1]);
                        window.getSelection().removeAllRanges();
                        window.getSelection().addRange(range);
                    });
                });

                btn.innerHTML = '<i class="icongec-dowload"></i> Download links generated!!';
                btn.style.cursor = 'not-allowed';
            });
    }
})();
