// ==UserScript==
// @name         AutoGrind: Intelligent Bing Rewards Auto-Grinder
// @namespace    https://github.com/jeryjs/
// @version      4.0.1
// @description  This user script automatically finds random words from the current search results and searches Bing with them. Additionally, it auto clicks the unclaimed daily points from your rewards dashboard too.
// @icon         https://www.bing.com/favicon.ico
// @author       Jery
// @match        https://www.bing.com/search*
// @match        https://rewards.bing.com/*
// @license      MIT
// ==/UserScript==

/*=============================================*\
|*                CONFIGURATION               *|
\*=============================================*/
// Constants
var MAX_SEARCHES = localStorage.getItem("max-searches") || 33; // Maximum number of words to search
var TIMEOUT = localStorage.getItem("timeout") || 4000; // Timeout between searches
var UNDER_COOLDOWN = localStorage.getItem("under-cooldown") == "true" || false;	// Workaround for cooldown restriction
var OPEN_RANDOM_LINKS = localStorage.getItem("open-random-links") == "true" || false;	// Simulate real human searcg by opening links

// Configuration options for the user script
const configurations = [
	{
		id: "max-searches",
		name: "Max Searches",
		value: MAX_SEARCHES,
		type: "slider",
		range: [3, 50],
		description: "The maximum number of words to search.<br>Default: 33",
	},
	{
		id: "timeout",
		name: "Timeout",
		value: TIMEOUT,
		type: "slider",
		range: [1000, 10000],
		description: "The timeout between searches in milliseconds.<br>Default: 4000",
	},
	{
		id: "under-cooldown",
		name: "Under Cooldown",
		value: UNDER_COOLDOWN,
		type: "checkbox",
		description: "Enable this option if you are facing the 15 min cooldown restriction. For some accounts, Bing restricts the points earned to 9 points every 15 minutes. Enabling this option makes the script wait 15 mins after every 3 searches..<br>Default: False",
	},
	{
		id: "open-random-links",
		name: "Open Random Links",
		value: OPEN_RANDOM_LINKS,
		type: "checkbox",
		description: "Enable this option to open any random link from the page after every search. It has been observed that doing this removes the 15-point restriction after a while / reduces chances of getting the restriction.<br>Default: False",
	}
];


/*=============================================*\
|*					MAIN UI					   *|
\*=============================================*/
/**
 * Create a container for the auto-search icon and settings icon.
 * The auto-search icon starts the search process, and the settings icon opens the settings overlay.
 */
const autoSearchContainer = document.createElement("div");
autoSearchContainer.classList.add("auto-search-container");

const searchIcon = document.createElement("div");
searchIcon.classList.add("search-icon");
searchIcon.innerHTML = `<a style="font-size: 25px">🔍</a><span>Auto-Search</span>`;
searchIcon.title = "Start Auto-Search!!";
searchIcon.addEventListener("click", startSearch);

const settingsIcon = document.createElement("div");
settingsIcon.classList.add("settings-icon");
settingsIcon.innerHTML = `<a style="font-size: 20px;">⚙️</a><span>Configure</span>`;

autoSearchContainer.appendChild(searchIcon);
autoSearchContainer.appendChild(settingsIcon);

function updateIcon(content, classlist="searching") {
  searchIcon.classList.add(classlist);
  settingsIcon.classList.add(classlist);
  searchIcon.querySelector("span").textContent = content;
}

setTimeout(() => {
    if (searchIcon.textContent.includes("Auto-Search")) searchIcon.classList.add("shrink")
}, 3000);


/**
 * Create a settings overlay to configure the user script.
 * The settings overlay contains a list of configuration options that can be adjusted by the user.
 * The settings are stored in the local storage and are used to update the script's behavior.
 */
const settingsOverlay = document.createElement("div");
settingsOverlay.classList.add("settings-overlay");
settingsOverlay.style = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: none; justify-content: center; align-items: center; z-index: 1000;`;

const settingsContent = document.createElement("div");
settingsContent.style = `background-color: white; padding: 20px; border-radius: 10px; display: flex; flex-direction: column;`;

configurations.forEach(config => {
  const settingItem = document.createElement("div");
  settingItem.classList.add("settings-item");

  const name = document.createElement("div");
  name.classList.add("settings-item-name");
  name.textContent = config.name;

  const inputContainer = document.createElement("div");
  inputContainer.classList.add("settings-item-input");
  let input;
  if (config.type === "slider") {
    input = document.createElement("input");
    input.type = "range";
    input.min = config.range[0];
    input.max = config.range[1];
    input.value = localStorage.getItem(config.id) || config.value;
  } else if (config.type === "checkbox") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = localStorage.getItem(config.id) === "true" || config.value;
  }
  input.id = config.id;
  input.addEventListener("change", () => {
    localStorage.setItem(config.id, input.type === "checkbox" ? input.checked : input.value);
    updateConfigVariable(config.id, input.type === "checkbox" ? input.checked : input.value);
    currentValue.textContent = input.type === "checkbox" ? (input.checked ? "True" : "False") : input.value;
  });
  inputContainer.appendChild(input);

  const currentValue = document.createElement("div");
  currentValue.classList.add("settings-item-value");
  currentValue.textContent = input.type === "checkbox" ? (input.checked ? "True" : "False") : input.value;

  const description = document.createElement("div");
  description.classList.add("settings-item-description");
  description.innerHTML = config.description;

  settingItem.appendChild(name);
  settingItem.appendChild(inputContainer);
  settingItem.appendChild(currentValue);
  settingItem.appendChild(description);

  settingsContent.appendChild(settingItem);
});

const closeButton = document.createElement("button");
closeButton.textContent = "Close";
closeButton.style = `align-self: center; margin-top: 10px; padding: 5px 10px; border-radius: 5px; background-color: lightgray;`;
closeButton.addEventListener("click", () => {
  settingsOverlay.style.display = "none";
});

settingsContent.appendChild(closeButton);
settingsOverlay.appendChild(settingsContent);
document.body.appendChild(settingsOverlay);

settingsIcon.addEventListener("click", () => {
  settingsOverlay.style.display = "flex";
});

/**
 * This function updates the configuration variables based on the user's input in the settings overlay.	
 * @param {string} name - The name of the configuration variable to update.
 * @param {string} value - The new value of the configuration variable.
 * @returns {void}
 * @example updateConfigVariable("max-searches", 50);
*/
function updateConfigVariable(name, value) {
  if (name === "max-searches") MAX_SEARCHES = parseInt(value);
  else if (name === "timeout") TIMEOUT = parseInt(value);
  else if (name === "under-cooldown") UNDER_COOLDOWN = value == "true";
}


/*=============================================*\
|* 				HELPER FUNCTIONS			   *|
\*=============================================*/
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

	// updateIcon(searches.length);
	window.open(`https://www.bing.com/search?q=${searches.pop()}&qs=ds&form=QBRE`, "_self");
	localStorage.setItem("searches", JSON.stringify(searches));
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
		if (document.querySelector(selector) || isMobile) {
			callback(selector);
			return;
		}
	}
	setTimeout(() => waitForElements(selectors, callback), 500);
}


/*=============================================*\
|*                MAIN SCRIPT                 *|
\*=============================================*/
// Load previous searches from local storage or initialize an empty array
var searches = JSON.parse(localStorage.getItem("searches")) || [];

// Adjust timeout if under cooldown and within search limit
if (UNDER_COOLDOWN && searches.length % 4 == 0 && searches.length <= MAX_SEARCHES - 4) {
	TIMEOUT = 900000; // 15 minutes
}
// Check if the current page is Bing search page
const isSearchPage = window.location.href.startsWith("https://www.bing.com/search");
// Check if the current page is Bing rewards page
const isRewardPage = window.location.href.startsWith("https://rewards.bing.com/");
// Check whether current device is a mobile or not
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);


/**
 * Wait for the page to load the points element first.
 * For android, this step is skipped.
 * Bing seems to have 2 different selectors for the points element
 * based on which browser is being used, so the possible selectors are
 * put inside [pointsElem]
 */
if (isSearchPage) {
	// Add the auto-search icons to the top left corner of the page
	document.body.appendChild(autoSearchContainer);

	let pointsElems = ["#id_rc", ".points-container"];
	waitForElements(pointsElems, function (pointsElem) {
		/**
		 * If the current URL contains the "&form=STARTSCRIPT" parameter,
		 * the script automatically extracts words from the page and starts the search.
		 * This is a workaround for automating the script locally, without the need for
		 * clicking the start icon.
		 */
		if (window.location.href.includes("&form=STARTSCRIPT")) {
			startSearch();
		}
		/**
		 * If the current URL contains the "&form=QBRE" parameter,
		 * and the [searches] array is not empty, the script automatically waits
		 * for a few secs (on mobile, it waits fixed time and on desktop it waits until points element is updated),
		 * and then proceeds to the next search in the current tab.
		 */
		else if (searches.length > 0 && window.location.href.includes("&qs=ds&form=QBRE")) {
			updateIcon(`${searches.length} left`);
			let targetNode = document.querySelector(pointsElem);

			let observerOptions = {characterData: true, childList: true, subtree: true};

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
			 * If [OPEN_RANDOM_LINKS] is enabled, it also opens a random link from the search results.
			 */
			function gotoNextSearch() {
				countdownTimer(TIMEOUT / 1000);
				if (OPEN_RANDOM_LINKS) {
					try {
						let searchLinks = document.querySelectorAll("li.b_algo > h2 > a");
						searchLinks[Math.floor(Math.random() * searchLinks.length)].click()
					} catch (e) {
						console.error(`Ran into an error: ${e.message}`)
					}
				}
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
				let c = parseInt(count);
				const intervalId = setInterval(() => {
					updateIcon(c, "counting");
					if (c === 0) {
						clearInterval(intervalId);
					}
					c--;
				}, 1000);
			}
		}
	});
}


/**
 * If the current page is the Bing rewards page, the script automatically clicks the unclaimed daily points.
 * The script waits for the daily points button to appear and then clicks it.
 * As of v4.0.0, this functionality is still a work in progress, and is expected to be finished by next patch.
 */
if (isRewardPage) {
	// Automatically click the unclaimed daily points on the rewards dashboard
	waitForElements(["#daily-sets"], function (dailySets) {
		const dailySetsButton = document.querySelector(dailySets);
		if (!dailySetsButton.textContent.includes("complete")) {
			dailySetsButton.click();
		}
	});

}

/*=============================================*\
|*					CSS STYLES				   *|
\*=============================================*/

const stylesheet = Object.assign(document.createElement("style"), {textContent: `
    .auto-search-container {
        position: fixed;
        top: 90px;
        left: 20px;
		display: inline-grid;
		align-items: flex-start;
		z-index: 1000;
    }
    .auto-search-container span {
		margin-left: 5px;
    }
    .search-icon, .settings-icon {
        display: flex;
        align-items: center;
		overflow: hidden;
        cursor: pointer;
        border-radius: 20px;
        background-color: lightgray;
        padding: 2px 10px 2px 0px;
        transition: all 0.5s ease;
    }
    .b_dark .search-icon,
    .b_dark .settings-icon {
        background-color: #333;
    }
    .search-icon.shrink {
        width: 27px;
        transition: width 0.5s;
    }
    .search-icon.shrink:hover {
        width: 100%;
    }
    .settings-icon {
		opacity: 0;
        width: 23px;
        transition: all 0.5s ease;
    }
	.auto-search-container:hover .settings-icon,
	.auto-search-container .settings-icon.searching {
		opacity: 1;
	}
    .settings-icon:hover {
        width: 100%;
    }
    .search-icon.searching {
        background-color: lightblue !important;
    }
    .b_dark .search-icon.searching {
        background-color: midnightblue !important;
    }
    .search-icon.counting {
        background-color: lightgreen !important;
    }
    .b_dark .search-icon.counting {
        background-color: green !important;
    }
	

	/******** Settings Overlay *********/

	.b_dark .settings-overlay > div {
		background-color: black !important;
	}
	.settings-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 10px 0;
	}
	.settings-item:hover {
		border: ivory groove 1px;
		border-radius: 10px;
	}
	.settings-item-name {
		flex-basis: 20%;
		text-align: left;
	}
	.settings-item-input {
		flex-basis: 10%;
    	text-align: center;
	}
	.settings-item-value {
		flex-basis: 20%;
		text-align: center;
	}
	.settings-item-description {
		flex-basis: 40%;
		height: 0;
		width: 50vw;
		padding: 5px 10px 20px 10px;
		border: grey solid 1px;
		border-radius: 10px;
		overflow: hidden;
		transition: height 0.3s ease;
	}
	.settings-item:hover .settings-item-description {
		height: 60px;
		overflow-y: scroll;
		place-content: center;
		text-align: center;
   		padding: 20px;
	}
`})
document.head.appendChild(stylesheet);