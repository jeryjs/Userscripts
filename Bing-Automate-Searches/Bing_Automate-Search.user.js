// ==UserScript==
// @name         Automatically search bing with random words.
// @namespace    https://github.com/jeryjs/
// @version      3.0.0
// @description  This user script automatically finds random words from the current search results and searches Bing with them.
// @author       Jery
// @match        https://www.bing.com/search*
// @license      MIT
// ==/UserScript==

// Load previous searches from local storage or initialize an empty array
var searches = JSON.parse(localStorage.getItem("searches")) || [];

// Constants
const MAX_SEARCHES = 33; // Maximum number of words to search
var TIMEOUT = 4000; // Timeout between searches

/*
 * UNDER_COOLDOWN is a flag that indicates whether the user is under the restriction 
 * that allows only a maximum of 3 searches every 15 minutes. 
 * If you are experiencing a countdown or restriction on your searches, 
 * set UNDER_COOLDOWN to true. 
 * If you are not experiencing any restrictions, leave it as false.
 *
 * If [UNDER_COOLDOWN] is true, then only 3 searches are made every 15 minutes.
 */
const UNDER_COOLDOWN = false;

// Adjust timeout if under cooldown and within search limit
if (UNDER_COOLDOWN && searches.length % 4 == 0 && searches.length <= MAX_SEARCHES - 4) {
	TIMEOUT = 900000; // 15 minutes
}

/**
 * Create an element to represent the circular icon.
 * The icon is positioned at the top left corner of the page and serves as a visual indicator for the user script.
 * When clicked, it triggers the startSearch function.
 */
const icon = document.createElement("div");
icon.style.position = "fixed";
icon.style.top = "90px";
icon.style.left = "20px";
icon.style.width = "30px";
icon.style.height = "30px";
icon.style.borderRadius = "50%";
icon.style.backgroundColor = "rgba(255, 192, 203, 0.6)";
icon.style.cursor = "pointer";
icon.title = "Search Random Words from Descriptions";

/**
 * Update the appearance of the icon based on the content parameter.
 * If the content is greater than 0, the icon's background color is set to the specified color.
 * If the content is 0, the icon's background color is set to the default color and the icon's text content is cleared.
 * @param {number} content - The content to be displayed on the icon.
 * @param {string} color - The color to be used for the icon's background.
 */
function updateIcon(content, color = "blue") {
	icon.style.backgroundColor = content > 0 ? color : "rgba(255, 192, 203, 0.6)";
	icon.textContent = content > 0 ? content.toString() : "";
}

// Add a click event listener to the icon that triggers the startSearch function
icon.addEventListener("click", startSearch);

/**
 * Perform a search for dynamically extracted random words from descriptions.
 * This function finds all the result elements on the page and extracts random words from their text content.
 * The extracted words are stored in the searches array, which is then used to perform searches on Bing.
 * The number of searches is limited to [MAX_SEARCHES].
 * The icon's appearance is updated based on the number of searches.
 * The last search is opened in the current tab.
 */
function startSearch() {
	const resultElements = document.querySelectorAll(".b_caption p");
	let searches = [];
	while (searches.length < MAX_SEARCHES) {
		resultElements.forEach((element) => {
			const text = element.textContent.trim().split(/\s+/);
			for (let i = 0; i < text.length; i += Math.floor(Math.random() * 5) + 1) {
				const chunk = text.slice(i, i + Math.floor(Math.random() * 5) + 1).join(" ");
				if (chunk && chunk !== "...") searches.push(chunk);
				if (searches.length >= MAX_SEARCHES) break;
			}
			if (searches.length >= MAX_SEARCHES) return;
		});
	}
	searches = [...new Set(searches)]; // Remove duplicates
	searches = searches.slice(0, MAX_SEARCHES); // Extract up to MAX_SEARCHES
	console.log(searches);

	localStorage.setItem("searches", JSON.stringify(searches));

	updateIcon(searches.length);
	window.open(`https://www.bing.com/search?q=${searches.pop()}&qs=ds&form=QBRE`, "_self");
	localStorage.setItem("searches", JSON.stringify(searches));
}

//=============================================\\

const isSearchPage = window.location.href.startsWith("https://www.bing.com/search");
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Check if the current page is Bing
if (isSearchPage) {
	// Add the icon to the top left corner of the page
	document.body.appendChild(icon);
}

/**
 * Wait for elements to appear on the page and execute a callback function when they are found.
 * This function repeatedly checks for the presence of the specified selectors on the page.
 * Once any of the selectors is found, the callback function is called with the selector as a parameter.
 * @param {Array} selectors - The selectors to wait for.
 * @param {Function} callback - The callback function to execute when the selectors are found.
 */
function waitForElements(selectors, callback) {
	for (let selector of selectors) {
		if (document.querySelector(selector)) {
			callback(selector);
			return;
		}
	}
	setTimeout(() => waitForElements(selectors, callback), 500);
}

/**
 * Wait for the page to load the points elment first.
 * For android, this step is skipped.
 * Bing seems to have 2 different selectors for the points element
 * based on which browser is being used, so the possible selectors are
 * put inside [pointsElem]
 */
let pointsElems = ["#id_rc", ".points-container"];
waitForElements(pointsElems, function (pointsElem) {
	/**
	 * If the current URL contains the "&form=STARTSCRIPT" parameter,
	 * the script automatically extracts words from the page and starts the search.
	 * This is a workaround for automating the script locally, without the need for
	 * clicking the start icon.
	 */
	if (searches.length > 0 && window.location.href.includes("&form=STARTSCRIPT")) {
		startSearch();
	}
	/**
	 * If the current URL contains the "&form=QBRE" parameter,
	 * and the [searches] array is not empty, the script automatically waits
	 * for a few secs (on mobile, it waits fixed time and on desktop it waits until points element is updated),
	 * and then proceeds to the next search in the current tab.
	 */
	else if (searches.length > 0 && window.location.href.includes("&qs=ds&form=QBRE")) {
		updateIcon(searches.length);
		let targetNode = document.querySelector(pointsElem);

		let observerOptions = {
			characterData: true,
			childList: true,
			subtree: true,
		};

		// Check if the user agent is not a Mobile
		if (!isMobile) {
			let oldTextContent = targetNode.textContent.trim();

			let observer = new MutationObserver((mutationsList, observer) => {
				for (let mutation of mutationsList) {
					if (mutation.type === "childList" || mutation.type === "characterData") {
						let newTextContent = targetNode.textContent.trim();
						if (newTextContent != oldTextContent) {
							gotoNextSearch();
							observer.disconnect();
							break;
						}
					}
				}
			});

			observer.observe(targetNode, observerOptions);
		}

		setTimeout(() => {
			gotoNextSearch();
		}, 5000);

		/**
		 * Go to the next search after a timeout.
		 * This function updates the icon's appearance with a countdown timer.
		 * After the timeout, it opens the next search in the current tab and updates the searches array in local storage.
		 */
		function gotoNextSearch() {
			countdownTimer(TIMEOUT / 1000);
			setTimeout(() => {
				window.open(`https://www.bing.com/search?q=${searches.pop()}&qs=ds&form=QBRE`, "_self");
				localStorage.setItem("searches", JSON.stringify(searches));
			}, TIMEOUT);
		}

		/**
		 * Start a countdown timer and update the icon's appearance.
		 * This function updates the icon's appearance every second with the remaining time in the countdown.
		 * @param {number} count - The duration of the countdown in seconds.
		 */
		function countdownTimer(count) {
			let c = count;
			const intervalId = setInterval(() => {
				updateIcon(c, "green");
				if (c === 0) {
					clearInterval(intervalId);
				}
				c--;
			}, 1000);
		}
	}
});
