// ==UserScript==
// @name        Episode Thumbnail Progress Bar for Miruro
// @namespace   https://github.com/jeryjs
// @match       https://www.miruro.tv/*
// @match       https://www.miruro.to/*
// @match       https://www.miruro.online/*
// @icon        https://www.miruro.tv/icons/favicon-32x32.png
// @grant       none
// @version     1.4
// @author      Jery
// @description 2/23/2025, 9:39:09 AM
// ==/UserScript==

function getFromStorage(key) {
	try {
		return JSON.parse(localStorage.getItem(key)) || {};
	} catch (e) {
		console.error("JSON parse error for", key, e);
		return {};
	}
}

const miruro = {
	// Returns all episode items on the page
	items: () => document.querySelectorAll('a[color][title][href^="/watch"]'),
	// Returns the SPA element that should be observed for changes
	observeTarget: () => document.querySelector('section[aria-labelledby*="continueWatching"] + div'),
	// Retrieves progress data from localStorage
	progressData: () => getFromStorage("miruro:watching:playback"),
	// Retrieves watched episodes data from localStorage
	watchedData: () => getFromStorage("miruro:watching:history"),
	// Returns the parent element of the thumbnail that the progress bar should be injected under
	getProgressBarAnchor: (item) => item.querySelector('img[alt^="Play "]')?.parentElement?.parentElement,
	// Extracts the anime ID from the item's href query parameter (?id=...)
	getAnimeId: (item) => {
		const href = item.getAttribute("href") || "";
		const idMatch = href.match(/watch\/([^&]+)\//);
		return idMatch ? idMatch[1] : "";
	},
	// Extracts the episode number from the item's specific DOM structure
	getEpNumber: (item) => {
		const divs = item.querySelectorAll(`svg[stroke*="currentColor"]`)[2].parentElement.parentElement.getElementsByTagName("div");
		if (!divs || divs.length < 3) return 0;
		const text = divs[2].textContent || "";
		return parseInt(text.split("/")[0].trim(), 10) || 0;
	},
};

console.log("AniMARK: Injecting progress bars under episode thumbnails...");
(function () {
	let observer;

	// Injects a progress bar under an episode thumbnail
	function addProgressBar(item) {
		const thumbnailAnchor = miruro.getProgressBarAnchor(item);
		if (!thumbnailAnchor) return;
		thumbnailAnchor.querySelector(".custom-progress-bar")?.remove();

		const animeId = miruro.getAnimeId(item);
		const epNumber = miruro.getEpNumber(item);
		const watched = miruro.watchedData()[animeId] || [];
        const episodeInfo = watched
            .filter((ep) => ep.number == epNumber)
            .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0))[0] || {};
		const episodeId = episodeInfo.id || "";
		if (!episodeId) return;
		const progressObj = miruro.progressData()[episodeId] || {};
		const playbackPercentage = progressObj.playbackPercentage || 0;

		const progressDiv = document.createElement("div");
		progressDiv.className = "custom-progress-bar";
		progressDiv.style.position = "absolute";
		progressDiv.style.bottom = "0";
		progressDiv.style.left = "0";
		progressDiv.style.height = "0.25rem";
		progressDiv.style.borderRadius = "var(--global-border-radius)";
		progressDiv.style.backgroundColor = "red";
		progressDiv.style.transition = "width 0.3s ease-in-out";
		progressDiv.style.width = playbackPercentage + "%";

		thumbnailAnchor.style.position = "relative";
		thumbnailAnchor.appendChild(progressDiv);
	}

	// Applies the progress bar injection to all episode items on the page
	function updateProgressBars() {
        console.log("AniMARK: Updating progress bars...");
		miruro.items().forEach((item) => addProgressBar(item));
	}

	// Attaches a MutationObserver to monitor SPA changes and update progress bars accordingly
	function attachObserver() {
        if (observer) observer.disconnect();
		const target = miruro.observeTarget();
		if (!target) return;

		observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
					observer.disconnect();
					updateProgressBars();
					observer.observe(target, { childList: true, subtree: true });
					break;
				}
			}
		});

        observer.observe(target, { childList: true, subtree: true });
	}

	// Polls for the target container; once detected, attaches the observer
	function pollForTarget(target) {
		if (target) {
			setTimeout(updateProgressBars, 500);
			attachObserver();
		} else {
			setTimeout(() => pollForTarget(miruro.observeTarget()), 1000);
		}
	}

	// Handle SPA navigation
	function initNavigationHandler() {
		let lastUrl = location.href;
		new MutationObserver(() => {
			const url = location.href;
			if (url !== lastUrl) {
				lastUrl = url;
				console.log("URL changed, re-running AniMARK");
				setTimeout(updateProgressBars, 500);
				attachObserver();
			}
		}).observe(document.querySelector("body"), { subtree: true, childList: true });
	}

	// Initialize the script once the DOM is ready
	function init() {
        setTimeout(() => {
            pollForTarget(miruro.observeTarget());
            initNavigationHandler();
        }, 500);
	}

    init();
})();
