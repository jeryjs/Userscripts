// ==UserScript==
// @name        GoGo Batch Anime Downloader
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @match       https://gogoanime.*/*
// @grant       GM_xmlhttpRequest
// @version     1.0
// @author      jery js
// @description Generates direct download links for all episodes of an anime, sorted by quality. You can copy the links into an app like IDM to batch download it all.
// ==/UserScript==



(function () {
    'use strict';

    let btn = document.createElement('a');
    btn.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links For All Episodes';
    btn.onclick = onBtnPressed;
    btn.style.cursor = 'pointer';
    document.querySelector('.cf-download').appendChild(btn);
    
    if (!document.querySelector('a.account')) {
        alert('Uh-oh... You must be logged in to use this feature.');
        return;
    }

    function onBtnPressed() {
        btn.innerHTML = '<i class="icongec-dowload"></i> Processing...';
        btn.style.cursor = 'progress';

        let links = new Map();
        let qualityOptions = [];

        let linksContainer = document.createElement('div');
        linksContainer.style = "height: 500px; width: 100%; color: cyan; background: black; overflow: scroll; resize: both;";
        document.querySelector('.list_dowload').appendChild(linksContainer);

        let epList = Array.prototype.slice.call((document.querySelectorAll('#episode_related li > a')), 0).reverse();

        epList.forEach((epLink, index) => {
            fetch(epLink)
                .then(response => response.text())
                .then(html => {
                    let parser = new DOMParser();
                    let epPage = parser.parseFromString(html, 'text/html');
                    let title = epPage.querySelector('.title_name h2').innerText;
                    let episode = "Episode " + title.match(/\d+/)[0];

                    let dwnldLinks = Array.from(epPage.querySelectorAll('.cf-download a'));
                    dwnldLinks = dwnldLinks.filter(link => link.innerText.trim() !== '');
                    if (dwnldLinks.length === 0) {
                        return;
                    }

                    dwnldLinks.forEach((dwnldLink) => {
                        let qualityOption = dwnldLink.innerText.trim();
                        if (!qualityOptions.includes(qualityOption)) {
                            qualityOptions.push(qualityOption);
                        }

                        let link = dwnldLink.href;
                        if (!links.has(qualityOption)) {
                            links.set(qualityOption, new Map());
                        }

                        links.get(qualityOption).set(episode, link);
                    });

                    if (links.size === qualityOptions.length) {
                        let linkText = "";
                        qualityOptions.forEach((qualityOption) => {
                            linkText += '<center><p style="color:cyan;font-size:25px"><b>\n\n-------------------' + qualityOption + '-------------------\n</b></p></center>';
                            let qualityLinks = links.get(qualityOption);
                            let sortedLinks = new Map([...qualityLinks.entries()].sort());
                            let linkList = document.createElement('ol');
                            sortedLinks.forEach((link, episode) => {
                                let linkItem = document.createElement('li');
                                linkItem.style = "white-space: pre;   list-style-position: inside !important;"
                                linkItem.innerHTML = '<a download="' + episode + '.mp4" href="' + link + '" style="color:#fdba2f;">' + link + '</a>';
                                linkList.appendChild(linkItem);
                            });
                            linkText += linkList.outerHTML + '\n\n';
                        });
                        linksContainer.innerHTML = linkText;

                        btn.innerHTML = '<i class="icongec-dowload"></i> Download links generated!!';
                        btn.style.cursor = 'not-allowed';
                    }
                });
        });
    }
})();