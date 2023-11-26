// ==UserScript==
// @name         Automatically search bing with random words.
// @namespace    https://github.com/jeryjs/
// @version      1.0.0
// @description  Automatically find random words from current search and search bing with it.
// @author       Jery
// @match        https://www.bing.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

// Constants
const MAX_WORDS = 30
const COUNTDOWN = 15


// Create an element to represent the circular icon
const icon = document.createElement('div');
icon.style.position = 'fixed';
icon.style.top = '90px';
icon.style.left = '20px';
icon.style.width = '30px';
icon.style.height = '30px';
icon.style.borderRadius = '50%';
icon.style.backgroundColor = 'rgba(255, 192, 203, 0.6)';
icon.style.cursor = 'pointer';
icon.title = 'Search Random Words from Descriptions';

// Helper function to update the icon's appearance
function updateIcon(timeLeft) {
    icon.style.backgroundColor = timeLeft > 0 ? 'blue' : 'rgba(255, 192, 203, 0.6)';
    icon.textContent = timeLeft > 0 ? timeLeft.toString() : '';
}

// Perform a search for dynamically extracted random words from descriptions when the icon is clicked
icon.addEventListener('click', function() {
    const resultElements = document.querySelectorAll('.b_caption p');
    let words = [];
    resultElements.forEach(element => {
        const text = element.textContent.trim().split(/\s+/);
        words.push(...text);
    });
    words = [...new Set(words)]; // Remove duplicates
    words = words.slice(0, MAX_WORDS); // Extract up to MAX_WORDS
    console.log(words);

    const pages = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const windowFeatures = "height=400,width=1024";
        const page = window.open(`https://www.bing.com/search?q=${encodeURIComponent(word)}`, "_blank", windowFeatures);
        pages.push(page);
    }
    console.log(pages);
    
    // Update icon appearance to show the countdown
    updateIcon(COUNTDOWN);

    // Countdown timer
    let countdown = COUNTDOWN;
    const countdownInterval = setInterval(function() {
        countdown--;
        updateIcon(countdown);
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                if (!page.closed) {
                    page.close();
                }
            }
            updateIcon(0); // Reset icon appearance
        }
    }, 1000);
});

// Check if the current page is Bing
const isBingPage = window.location.hostname === 'www.bing.com';
if (isBingPage) {
    // Add the icon to the top left corner of the page
    document.body.appendChild(icon);
}