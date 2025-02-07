// ==UserScript==
// @name         Superset Assessments - Bypass Tab Switch Detection & AI Answer Generator
// @namespace    https://github.com/jeryjs
// @version      1.7
// @description  Prevents tab switch detection, adds AI answer genrator with enhanced UI, caching, and error handling.
// @author       JeryJs
// @match        https://app.joinsuperset.com/assessments/*
// @icon         https://i.pinimg.com/736x/d9/b5/a6/d9b5a64b2a0f432e41f611ddd410d8be.jpg
// @license      MIT
// @grant        none
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @updateURL    https://github.com/jeryjs/Userscripts/raw/refs/heads/main/Superset/Assessment-Detection-Bypass-And-AI-Answers.user.js
// @downloadURL  https://github.com/jeryjs/Userscripts/raw/refs/heads/main/Superset/Assessment-Detection-Bypass-And-AI-Answers.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Visibility API Overrides ---
    Object.defineProperties(document, {
        'hidden': { get: function() { return false; }, configurable: true },
        'visibilityState': { get: function() { return 'visible'; }, configurable: true },
        'webkitHidden': { get: function() { return false; }, configurable: true },
        'webkitVisibilityState': { get: function() { return 'visible'; }, configurable: true }
    });

    const eventsToBlock = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focus', 'focusin', 'focusout'];
    eventsToBlock.forEach(eventType => {
        window.addEventListener(eventType, function(event) {
            event.stopImmediatePropagation();
            event.preventDefault();
            event.stopPropagation();
            console.debug(`[Bypass Script] Blocked event: ${eventType}`);
        }, true);
    });

    window.onblur = null;
    window.onfocus = null;
    window.onvisibilitychange = null;
    window.onwebkitvisibilitychange = null;

    console.log('Enhanced Tab switch detection bypass activated!');

    
    // --- AI Answer Generator Feature ---

    let chatbotContainer;
    let apiKey;
    const modelCache = {}; // In-memory cache for current session
    let outputTextArea;

    // Model definitions with ranking, subtitles, colors, and tooltips
    const models = [
        {
            name: "gemini-2.0-flash-thinking-exp-01-21",
            displayName: "Thinking",
            subtitle: "Best Quality | 10 RPM | Recommended for Complex Questions",
            rank: 1,
            color: "#E1BEE7", // Faded Lavender
            tooltip: "Highest quality model, may be slower and has an API quota of 10 requests per minute. Use sparingly."
        },
        {
            name: "gemini-2.0-pro-exp-02-05",
            displayName: "Pro",
            subtitle: "Good Quality | 2 RPM | Recommended for knowledge-based Questions",
            rank: 2,
            color: "#B2DFDB", // Faded Mint
            tooltip: "High quality model, good balance of quality and speed. Has an API quota of 2 requests per minute. Moderate usage recommended."
        },
        {
            name: "gemini-2.0-flash",
            displayName: "Flash",
            subtitle: "Fast Response | 15 RPM | Recommended for General Questions",
            rank: 3,
            color: "#FFD54F", // Faded Yellow
            tooltip: "Faster model, good for quick answers, quality may be slightly lower. Has an API quota of 15 requests per minute."
        },
        {
            name: "gemini-2.0-flash-lite-preview-02-05",
            displayName: "Flash Lite",
            subtitle: "Fastest & Cheapest | 30 RPM | Recommended only for very simple questions",
            rank: 4,
            color: "#F0F4C3", // Faded Lime
            tooltip: "Fastest and most cost-effective model, lowest quality, use for simpler questions. Has an API quota of 30 requests per minute."
        }
    ].sort((a, b) => a.rank - b.rank); // Sort by rank (1 = best)

    function createChatbotUI() {
        chatbotContainer = document.createElement('div');
        chatbotContainer.setAttribute('style', `
            width: 25%;
            height: 100%;
            padding: 10px;
            background-color: #f0f0f0;
            border-left: 1px solid #ccc;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        `);

        const title = document.createElement('h4');
        title.textContent = 'AI Answer Generator';
        chatbotContainer.appendChild(title);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.setAttribute('style', 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;'); // Increased gap and margin
        models.forEach(model => {
            const button = document.createElement('button');
            button.textContent = `Generate with ${model.displayName}`;
            button.setAttribute('data-model', model.name);
            button.setAttribute('title', model.tooltip); // Tooltip
            button.setAttribute('style', `
                background-color: ${model.color};
                padding: 8px 12px;
                border: 1px solid #ccc;
                border-radius: 5px;
                cursor: pointer;
                text-align: left; /* Align text to the left for better readability with subtitle */
            `);
            button.addEventListener('click', handleGenerateClick);

            const subtitle = document.createElement('div');
            subtitle.textContent = model.subtitle;
            subtitle.setAttribute('style', `
                font-size: 0.8em;
                color: #777;
                margin-top: -5px; /* Adjust spacing between button and subtitle */
                margin-bottom: 5px;
            `);
            button.appendChild(subtitle);

            buttonsContainer.appendChild(button);
        });
        chatbotContainer.appendChild(buttonsContainer);

        outputTextArea = document.createElement('textarea');
        outputTextArea.setAttribute('style', `
            width: 100%;
            height: 70%;
            box-sizing: border-box;
            padding: 8px;
            border: 1px solid #ccc;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
        `);
        outputTextArea.placeholder = 'AI Response will appear here...';
        chatbotContainer.appendChild(outputTextArea);

        const attemptViewDiv = document.querySelector("#attempt-view > div > div");
        if (attemptViewDiv) {
            attemptViewDiv.appendChild(chatbotContainer);
            clearInterval(intervalId);
            console.log("Chatbot UI appended successfully.");
        } else {
            console.warn("Target element still not found, retrying...");
        }
    }

    // New function to guide users to get and paste their API key
    function getApiKey() {
        const info = confirm("An API key is a secret token that lets our service access the AI API. Get one for FREE from https://aistudio.google.com/app/apikey.\n\nClick OK if you already have an API key.\nClick Cancel to open the key creation page.");
        if (!info) {
            window.open("https://github.com/jeryjs/Userscripts/tree/main/Superset#setup-instructions", "_blank");
            alert("Please go to the following site to generate your free key:\n https://aistudio.google.com/app/apikey \n\nAfter creating your API key, return here and click OK.");
        }
        const key = prompt("Please paste your Gemini API Key here.\n\nYour API key is a long alphanumeric string provided by Google. Make sure to copy it exactly.");
        return key;
    }

    async function handleGenerateClick(event) {
        outputTextArea.value = ""; // Clear previous output on new request
        // Use event.currentTarget to handle clicks on button or its children.
        const modelName = event.currentTarget.getAttribute('data-model');
        const questionTextElement = document.querySelector("#question-container > div.content.flex-1.flexbox.no-h-padding.scrollable > div:nth-child(2) > div");

        if (!questionTextElement) {
            outputTextArea.value = "Error: Question not found on page.";
            return;
        }

        const questionText = questionTextElement.innerHTML;

        if (!apiKey) {
            apiKey = GM_getValue('geminiApiKey');
            if (!apiKey) {
                apiKey = getApiKey();
                if (!apiKey) {
                    outputTextArea.value = "API Key is required to use the answer generator. Please follow the instructions to obtain one.";
                    return;
                }
                GM_setValue('geminiApiKey', apiKey);
            }
        }

        const cacheKey = `gemini-cache-${modelName}-${hashCode(questionTextElement.textContent)}`; // Include hash for long questions
        if (modelCache[cacheKey]) {
            console.log(`Cache hit for ${modelName}.`);
            outputTextArea.value = `Model: ${modelName}\nCached Response (time taken: ${modelCache[cacheKey].time} ms):\n${modelCache[cacheKey].answer}`;
            return;
        }

        outputTextArea.value = `Model: ${modelName}\nGenerating response...`;
        const startTime = Date.now();

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "system_instruction": {"parts":{"text": "Answer the aptitude based question inside this html smartly and concisely. Provide your reasoning and end with saying the answer number and the answer. Dont use markdown, but format the text neatly keeping in mind that the response will be displayed in a div with div.innerText = {ai.responseText}. If question is unclear or requires context from image or other parts of the page, ask for clarification or else provide the right answer to the best of your ability."}},
                    "contents": [{ "parts": [{"text": questionText}] }]
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    const errorText = `Model: ${modelName} - Too many requests. You may have spammed the same model past its Quota. Please wait 60 seconds or try another model.`;
                    console.error(errorText);
                    outputTextArea.value = errorText;
                    return;
                } else if (response.status === 400) {
                    const errorBody = await response.json();
                    const errorCode = errorBody.error.code;
                    const errorMessage = errorBody.error.message;
                    // Clear the stored API key
                    GM_setValue('geminiApiKey', "");
                    apiKey = "";
                    const fullError = `API error (400):\nError Code: ${errorCode}\nMessage: ${errorMessage}\n\nYour stored API key has been cleared. Please provide a valid API key.`;
                    console.error(fullError);
                    outputTextArea.value = fullError;
                    return;
                }
                const errorText = `API error for ${modelName}: ${response.status} ${response.statusText} - ${await response.text()}`;
                console.error(errorText);
                outputTextArea.value = errorText;
                return;
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
                const answerText = data.candidates[0].content.parts[0].text;
                const timeTaken = Date.now() - startTime;
                modelCache[cacheKey] = { answer: answerText, time: timeTaken };
                outputTextArea.value = `Model: ${modelName}\nResponse (time taken: ${timeTaken} ms):\n${answerText}`;
            } else {
                const warnText = `Unexpected API response format for ${modelName}: Check console for details.`;
                console.warn(warnText, data);
                outputTextArea.value = warnText;
            }

        } catch (error) {
            const errorMsg = `Error fetching from Gemini API for ${modelName}: ${error.message}`;
            console.error(errorMsg, error);
            outputTextArea.value = errorMsg;
        }
    }

    function changeApiKey() {
        apiKey = getApiKey();
        if (apiKey !== null && apiKey !== "") {
            GM_setValue('geminiApiKey', apiKey);
            alert("API Key updated successfully.");
        } else if (apiKey === "") {
            GM_setValue('geminiApiKey', apiKey);
            alert("API Key cleared. A valid key is required to use the service.");
        } else {
            alert("No API Key was provided. Please follow the instructions to obtain one.");
        }
    }

    function clearCache() {
        Object.keys(modelCache).forEach(key => delete modelCache[key]);
        alert("Cache cleared from memory.");
    }

    // Basic string hash function for cache keys (for long question texts)
    function hashCode(str) {
        let hash = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash.toString();
    }


    GM_registerMenuCommand("Change Gemini API Key", changeApiKey);
    GM_registerMenuCommand("Clear Response Cache", clearCache);

    // Clear output on main question navigation/submission buttons
    document.addEventListener('click', function(event) {
        if (event.target.matches('button.btn-rounded')) {
            outputTextArea.value = ""; // Clear output text area
        }
    });


    // Initialize UI after page load, with a loop to wait for the target element
    let intervalId = setInterval(createChatbotUI, 1000);

})();