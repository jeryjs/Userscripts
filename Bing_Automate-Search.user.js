// ==UserScript==
// @name         Automatically search bing with random words.
// @namespace    https://github.com/jeryjs/
// @version      2.1.0
// @description  Automatically find random words from current search and search bing with it.
// @author       Jery
// @match        https://www.bing.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

var searches = GM_getValue("searches", []);

// Constants
const MAX_WORDS = 30;

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
function updateIcon(content) {
  icon.style.backgroundColor =
    content > 0 ? "blue" : "rgba(255, 192, 203, 0.6)";
  icon.textContent = content > 0 ? content.toString() : "";
}

// Perform a search for dynamically extracted random words from descriptions when the icon is clicked
icon.addEventListener("click", function () {
  const resultElements = document.querySelectorAll(".b_caption p");
  let searches = [];
  resultElements.forEach((element) => {
    const text = element.textContent.trim().split(/\s+/);
    searches.push(...text);
  });
  searches = [...new Set(searches)]; // Remove duplicates
  searches = searches.slice(0, MAX_WORDS); // Extract up to MAX_WORDS
  console.log(searches);

  GM_setValue("searches", searches);

  updateIcon(searches.length);
  document.querySelector("#sb_form_q").textContent = searches.pop();
  GM_setValue("searches", searches);
  document.querySelector("#sb_form_go").click();
});

// Check if the current page is Bing
const isBingPage = window.location.hostname === "www.bing.com";
if (isBingPage) {
  // Add the icon to the top left corner of the page
  document.body.appendChild(icon);
}

// Start the search if previously interrupted
if (searches.length > 0 && window.location.href.includes("&qs=ds&form=QBRE")) {
    updateIcon(searches.length);
    let targetNode = document.querySelector("#id_rh");

    let observerOptions = {
        characterData: true,
        childList: true,
        subtree: true
    };

    let oldTextContent = targetNode.textContent.trim();

    let observer = new MutationObserver((mutationsList, observer) => {
        for (let mutation of mutationsList) {
            if (mutation.type === "childList" || mutation.type === "characterData") {
                let newTextContent = targetNode.textContent.trim();
                if (newTextContent != oldTextContent) {
                    // alert(`${oldTextContent} != ${newTextContent} - ${newTextContent != oldTextContent}`);
                    document.querySelector("#sb_form_q").textContent = searches.pop();
                    GM_setValue("searches", searches);
                    document.querySelector("#sb_form_go").click();
                    observer.disconnect();
                    break;
                }
            }
        }
    });

    observer.observe(targetNode, observerOptions);
}