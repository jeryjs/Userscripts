// ==UserScript==
// @name         Automatically search bing with random words.
// @namespace    https://github.com/jeryjs/
// @version      2.4.0
// @description  Automatically find random words from current search and search bing with it.
// @author       Jery
// @match        https://www.bing.com/*
// @license      MIT
// ==/UserScript==
  
var searches = JSON.parse(localStorage.getItem("searches")) || [];

// Constants
const MAX_WORDS = 32;
var TIMEOUT = 4000;

/*
 * UNDER_COOLDOWN is a flag that indicates whether the user is under the restriction 
 * that forcec only points to be available only for a maximum of 3 searches every 15 minutes. 
 * If you are experiencing a countdown or restriction on your searches, 
 * set UNDER_COOLDOWN to true. 
 * If you are not experiencing any restrictions, leave it as false.
 *
 * If [UNDER_COOLDOWN] is true then only 3 searches are made every 15 mins.
 */
const UNDER_COOLDOWN = false
if (UNDER_COOLDOWN && searches.length % 4 == 0 && searches.length <= MAX_WORDS-4) {
  TIMEOUT = 900000;
}

// Create an element to represent the circular icon
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

// Helper function to update the icon's appearance
function updateIcon(content, color="blue") {
  icon.style.backgroundColor =
    content > 0 ? color : "rgba(255, 192, 203, 0.6)";
  icon.textContent = content > 0 ? content.toString() : "";
}

// Perform a search for dynamically extracted random words from descriptions when the icon is clicked
icon.addEventListener("click", function () {
  const resultElements = document.querySelectorAll(".b_caption p");
  let searches = [];
  resultElements.forEach((element) => {
    const text = element.textContent.trim().split(/\s+/);
    for (let i = 0; i < text.length; i += Math.floor(Math.random() * 5) + 1) {
      const chunk = text.slice(i, i + Math.floor(Math.random() * 5) + 1).join(' ');
      if (chunk && chunk !== '...') searches.push(chunk);
    }
  });
  searches = [...new Set(searches)]; // Remove duplicates
  searches = searches.slice(0, MAX_WORDS); // Extract up to MAX_WORDS
  console.log(searches);

  localStorage.setItem("searches", JSON.stringify(searches));

  updateIcon(searches.length);
  window.open(`https://www.bing.com/search?q=${searches.pop()}&qs=ds&form=QBRE`,"_self");
  localStorage.setItem("searches", JSON.stringify(searches));
});


//=============================================\\


const isBingPage = window.location.hostname === "www.bing.com";
const isAndroid = navigator.userAgent.includes('Android');


// Check if the current page is Bing
if (isBingPage) {
  // Add the icon to the top left corner of the page
  document.body.appendChild(icon);
}

// Start the search if previously interrupted
function waitForElement(selector, callback) {
    if (document.querySelector(selector) || isAndroid) {
        callback();
    } else {
        setTimeout(() => waitForElement(selector, callback), 500);
    }
}

waitForElement(".points-container", function () {
	if (searches.length > 0 && window.location.href.includes("&qs=ds&form=QBRE")) {
		updateIcon(searches.length);
		let targetNode = document.querySelector(".points-container");

		let observerOptions = {
			characterData: true,
			childList: true,
			subtree: true,
		};

		if (!isAndroid) {
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

		function gotoNextSearch() {
			countdownTimer(TIMEOUT / 1000);
			setTimeout(() => {
				window.open(`https://www.bing.com/search?q=${searches.pop()}&qs=ds&form=QBRE`, "_self");
				localStorage.setItem("searches", JSON.stringify(searches));
			}, TIMEOUT);
		}
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
