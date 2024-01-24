// ==UserScript==
// @name         GoGoAnime Download Link Extractor
// @namespace    GoGo Link Extractor
// @version      2.1.1
// @description  Gives all download links to all episodes, sorted by host, selectable by quality
// @author       Jery
// @include      *gogoanime.pe/*
// @include      *gogoanime.vc/*
// @include      *gogoanime.*/*
// @icon         https://adclays.com/wp-content/uploads/2021/08/gogoanime.jpg
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

var button;

(function () {
    'use strict';

    //Create The download link generator button
    button = document.createElement('button');
    button.style = "height: 27px;   width: 180px;   color: white;    background: deeppink;"
    button.innerHTML = '\f Generate Download Links';
    button.onclick = btnPressed;


    document.getElementsByClassName('favorites_book')[0].getElementsByTagName('ul')[0].prepend(button);
})();


function btnPressed() {
    button.disabled = true;
    button.innerHTML = 'Fetching...';
    var downloadLink = document.querySelector('.dowloads').firstChild.href;
    let count = 0;
    var links = {};
    //Get all pages
    let episodeContainers = document.querySelector('#episode_related').children;
    let sortedEpContainers = Array.prototype.slice.call(episodeContainers, 0);
    sortedEpContainers.reverse();
    //console.log("first element is: " + derp[0].firstChild.href + "\nlast element: " + derp[derp.length - 1].firstChild.href);
    //console.log("first element is: " + firstChild.href + "\nlast element: " + firstChild.href)
    for (let epCont of sortedEpContainers) {
        let epLink = epCont.firstChild.href;
        // console.log("Ep Link: " + epLink)
        let control = GM_xmlhttpRequest({
            method: "GET",
            url: epLink,
            onload: function (response) {
                //parse
                let parser = new DOMParser();
                let epPage = parser.parseFromString(response.responseText, 'text/html');

                let downloadsLink = epPage.querySelector('.dowloads').firstChild.href;
                console.log("EpPage : " + epPage)
                let control2 = GM_xmlhttpRequest({
                    method: "GET",
                    url: downloadsLink,
                    onload: function (response2) {
                        count++;
                        let epIndex = sortedEpContainers.indexOf(epCont);
                        parser = new DOMParser();
                        let dlPage = parser.parseFromString(response2.responseText, 'text/html');

                        let downloadContainers = dlPage.getElementsByClassName('dowload');
                        console.log(downloadContainers)
                        console.log("Ep Index : " + epIndex + "\nEp Link : " + epLink + "\nDownload Link : " + downloadsLink)

                        for (let container of downloadContainers) {
                            console.log("Did this line execute.")
                            let host = container.firstChild.text.replaceAll('Download', '').trim();
                            if (links[host] === undefined) { links[host] = Array.apply(null, Array(episodeContainers.length)).map(function () { }); } //undefined array
                            console.log("Host : " + host)
                            links[host].splice(epIndex, 1, container.firstChild.href);
                            console.log("Container : " + container)
                        }



                        if (episodeContainers.length == count) {
                            console.log("Episode Container : " + episodeContainers)
                            let parentt = document.getElementsByClassName('list_dowload')[0];
                            let textt = parentt.getElementsByTagName('div')[0].getElementsByTagName('span')[0];
                            let tx = document.createElement("div"); //area for the links
                            let list = document.createElement('ul');


                            textt.innerHTML = "All Download Links: ";
                            tx.style.width = "100%";
                            tx.style.height = "100%";
                            tx.style.overflow = 'scroll';
                            tx.style.height = '400px';
                            tx.style.resize = 'both';

                            parentt.appendChild(tx);
                            tx.appendChild(list);

                            for (let host in links) {
                                let hostItem = document.createElement('li');
                                let linkList = document.createElement('ol');

                                hostItem.innerHTML =
                                    '<center><p style="color:cyan;font-size:25px"><b>\n\n-------------------' + host + '-------------------\n</b></p></center>';

                                list.appendChild(hostItem);
                                hostItem.appendChild(linkList);

                                for (let link of links[host]) {
                                    let linkItem = document.createElement('li');
                                    linkItem.innerHTML = '<p>' + link + '</p>';

                                    linkList.appendChild(linkItem);

                                    linkItem.style = "white-space: pre;   list-style-position: inside !important;"

                                    let linkP = linkItem.getElementsByTagName('p')[0];
                                    linkP.style = "display: inline !important; font-size: 13.5px;"
                                    console.log(linkItem)
                                }

                            }

                            button.innerHTML = 'Done!!';

                        }
                    }
                });
            }
        });

    }


}