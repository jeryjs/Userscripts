// ==UserScript==
// @name        Episode Thumbnail Progress Bar for Miruro
// @namespace   https://github.com/jeryjs
// @match       https://www.miruro.tv/*
// @match       https://www.miruro.to/*
// @match       https://www.miruro.cx/*
// @match       https://www.miruro.bz/*
// @match       https://www.miruro.pw/*
// @match       https://www.miruro.ws/*
// @match       https://miruro.tv/*
// @match       https://miruro.to/*
// @match       https://miruro.cx/*
// @match       https://miruro.bz/*
// @match       https://miruro.pw/*
// @match       https://miruro.ws/*
// @icon        https://www.miruro.tv/icons/favicon-32x32.png
// @grant       none
// @version     1.7.1
// @author      Jery
// @description 2/23/2025, 9:39:09 AM
// ==/UserScript==

function getFromStorage(key) {
	try {
		return JSON.parse(localStorage.getItem(key)) || {};
	} catch (e) {
		console.error("JSON parse error for", key, e);
		return localStorage.getItem(key) || {};
	}
}

const miruro_legacy = {
	// Returns all episode items on the page
	items: () => document.querySelectorAll('div.animSlideUp[title]'),
	// Returns the SPA element that should be observed for changes
	observeTarget: () => document.querySelector('section[aria-labelledby*="continueWatching"] + div'),
	// Retrieves progress data from localStorage
	progressData: () => getFromStorage("priver:playback"),
	// Retrieves watched episodes data from localStorage
	watchedData: () => getFromStorage("priver:watching")?.history,
	// Retrieves progress data for a specific anime and episode
	getProgress: (animeId, epNumber) => {
		const data = getFromStorage("priver:navigation")?.animeIds;
		const mappedAnimeId = data?.[animeId];
		const progressObj = getFromStorage(`progress/${mappedAnimeId||animeId}/${epNumber}/v1`) || {};
		return progressObj.progress * 100 || 0;
	},
	// Returns the parent element of the thumbnail that the progress bar should be injected under
	getProgressBarAnchor: (item) => item.querySelector('img[alt^="Play "]')?.parentElement?.parentElement?.parentElement,
	// Extracts the anime ID from the item's href query parameter (?id=...)
	getAnimeId: (item) => {
		const href = item.querySelector('a').getAttribute("href") || "";
		const idMatch = href.match(/watch\/([^&]+)\//);
		return idMatch ? idMatch[1] : "";
	},
	// Extracts the episode number from the item's specific DOM structure
	getEpNumber: (item) => {
		const text = item.querySelector(`span > strong`)?.textContent || "";
		return parseInt(text.split("/")[0].trim(), 10) || 0;
	},
};
const miruro = {
	// Returns all episode items on the page (the "Latest Episodes" grid on the home page)
	items: () => document.querySelectorAll('.home-episode-grid > a'),
	// Returns the SPA element that should be observed for changes
	observeTarget: () => document.querySelector('.home-episode-grid'),
	// Retrieves progress data from localStorage
	progressData: () => getFromStorage("hermes:playback"),
	// Retrieves watched episodes data from localStorage
	watchedData: () => getFromStorage("hermes:watching")?.history,
	// Returns the parent element of the thumbnail that the progress bar should be injected under
	getProgressBarAnchor: (item) => item.querySelector(".card-artwork"),
	// Extracts the anime ID from the item's href (/watch/<id>/<slug>?ep=<n>)
	getAnimeId: (item) => {
		const href = item.getAttribute("href") || "";
		const idMatch = href.match(/watch\/([^/?]+)/);
		const data = getFromStorage("miruro:ui")?.identityMigration?.navigation;
		const mappedAnimeId = Object.entries(data)?.find(r => r?.[1] == idMatch?.[1])?.[0];
		if (mappedAnimeId) return mappedAnimeId;
		return idMatch ? idMatch[1] : "";
	},
	// Extracts the episode number from the item's href query parameter (?ep=...)
	getEpNumber: (item) => {
		const href = item.getAttribute("href") || "";
		const epMatch = href.match(/[?&]ep=(\d+)/);
		return epMatch ? parseInt(epMatch[1], 10) : 0;
	},
};

// The legacy app lives on the www. hosts, the 2.0 app on the bare ones.
const site = location.hostname.startsWith("www.") ? miruro_legacy : miruro;

console.log("AniMARK: Injecting progress bars under episode thumbnails...");
(function () {
	let observer;

	// Injects a progress bar under an episode thumbnail
	function addProgressBar(item) {
		const thumbnailAnchor = site.getProgressBarAnchor(item);
		if (!thumbnailAnchor) return;
		thumbnailAnchor.querySelector(".custom-progress-bar")?.remove();

		const animeId = site.getAnimeId(item);
		const epNumber = site.getEpNumber(item);
		// const watched = miruro.watchedData()[animeId] || [];
        // const episodeInfo = watched
        //     .filter((ep) => ep.number == epNumber)
        //     .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0))[0] || {};
		// const episodeId = episodeInfo.id || "";
		const episodeId = `${animeId}:${epNumber}`
		// if (!episodeId) return;
		const progressObj = site.progressData()[episodeId] || {};
		const playbackPercentage = site.getProgress?.(animeId, epNumber) || progressObj.playbackPercentage || 0;

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
		site.items().forEach((item) => addProgressBar(item));
	}

	// Attaches a MutationObserver to monitor SPA changes and update progress bars accordingly
	function attachObserver() {
        if (observer) observer.disconnect();
		const target = site.observeTarget();
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
			setTimeout(() => pollForTarget(site.observeTarget()), 300);
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
            pollForTarget(site.observeTarget());
            initNavigationHandler();
        }, 500);
	}

    init();
})();
