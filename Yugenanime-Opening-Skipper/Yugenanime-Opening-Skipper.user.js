// ==UserScript==
// @name         Yugenanime Opening Skipper
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds a "Skip Opening" button to the player on Yugenanime.tv and skips the opening when clicked.
// @author       You
// @match        https://yugenanime.tv/watch/*/*/*/
// @require      https://update.greasyfork.org/scripts/457460/1133908/AniSkip.js
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	console.log("start");

	const aniskip = new AniSkip({
		userId: "uuid",
	});

	// Function to initialize the AniSkip functionality
	function initializeAniSkip(animeId, epNumber, epDuration) {
        console.log(`animeId: ${animeId}, epNumber: ${epNumber}, epDuration: ${epDuration}`);
		aniskip
			.getSkipTimes(animeId, epNumber, epDuration)
			.then((data) => {
				console.log(data);
			})
			.catch((response) => {
				console.error(response);
			});
	}

	// Use MutationObserver to check for changes and trigger initialization when needed
	const observer = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			// Observe changes within the iframe
			const iframe = document.querySelector(".player--section iframe");
			if (iframe) {
				const iframeObserver = new MutationObserver(function (mutations) {
					mutations.forEach(function (mutation) {
						// Handle changes within the iframe here
                        if (mutation.target.textContent.includes(":") && !mutation.target.textContent.includes("00:00")) {
                            console.log("duration available: " + mutation.target.textContent);
                            
                            const animeId = document.querySelector("div.data.m-15-t > a:nth-child(2)").href.split("/")[4];
                            const epNumber = document.location.href.split("/")[6];
                            const epDurationString = mutation.target.textContent.split(":");
                            const epDuration = epDurationString[0] * 60 + epDurationString[1];
                            initializeAniSkip(animeId, epNumber, epDuration);

                            iframeObserver.disconnect();
                            observer.disconnect();
                        }
					});
				});

				const iframeConfig = {
					childList: true,
					subtree: true,
				};
				iframeObserver.observe(iframe.contentDocument, iframeConfig);
			}
		});
	});

	// Observe changes in the target node
	const targetNode = document.querySelector(".player--section");
	console.log(targetNode);
	const config = { childList: true, subtree: true, attributes: true };
	observer.observe(targetNode, config);
})();
