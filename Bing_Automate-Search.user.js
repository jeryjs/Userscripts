// ==UserScript==
// @name         Automatically search bing with random words.
// @namespace    https://github.com/jeryjs/
// @version      2.2.2
// @description  Automatically find random words from current search and search bing with it.
// @author       Jery
// @match        https://www.bing.com/*
// @license      MIT
// ==/UserScript==

var searches = JSON.parse(localStorage.getItem("searches")) || [];

// Constants
const MAX_WORDS = 30;
const TIMEOUT = 4000;

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
    searches.push(...text);
  });
  searches = [...new Set(searches)]; // Remove duplicates
  searches = searches.slice(0, MAX_WORDS); // Extract up to MAX_WORDS
  console.log(searches);

  localStorage.setItem("searches", JSON.stringify(searches));

  updateIcon(searches.length);
  document.querySelector("#sb_form_q").textContent = searches.pop();
  localStorage.setItem("searches", JSON.stringify(searches));
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
                    gotoNextSearch();
                    observer.disconnect();
                    break;
                }
            }
        }
    });

    observer.observe(targetNode, observerOptions);

    setTimeout(() => {
        gotoNextSearch();
        observer.disconnect();
    }, 10000);

  function gotoNextSearch() {
    countdownTimer(TIMEOUT/1000)
    setTimeout(() => {
      document.querySelector("#sb_form_q").textContent = searches.pop();
      document.querySelector("#sb_form_go").click();
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