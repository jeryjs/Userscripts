// ==UserScript==
// @name         AnswerIT!! - Universal Tab Switch Detection Bypass and AI Answer Generator
// @namespace    https://github.com/jeryjs
// @version      3.3.0
// @description  Universal tab switch detection bypass and AI answer generator with popup interface
// @author       Jery
// @match        https://app.joinsuperset.com/assessments/*
// @match        https://lms.talentely.com/test/*
// @match        https://leetcode.com/problems/*
// @icon         https://i.pinimg.com/736x/d9/b5/a6/d9b5a64b2a0f432e41f611ddd410d8be.jpg
// @license      MIT
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @updateURL    https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// @downloadURL  https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// ==/UserScript==

(function () {
	"use strict";

	// --- Configuration ---
	const config = {
		hotkey: GM_getValue("hotkey", "a"), // Default hotkey is 'a' (used with Alt)
		hotkeyModifier: "alt", // Currently only supports 'alt'
		popupVisible: false,
		aiEnabled: GM_getValue("aiEnabled", true),
		theme: GM_getValue("theme", "light"), // Default theme is 'light'
	};

	// --- Website Configurations ---
	const websites = [
		{
			name: "Superset Assessments",
			urls: ["app.joinsuperset.com/assessments"],
			questionSelectors: ["#question-container > div.content.flex-1.flexbox.no-h-padding.scrollable > div:nth-child(2) > div"],
			getQuestionText: (element) => element.innerHTML,
		},
		{
			name: "Talentely",
			urls: ["lms.talentely.com/test"],
			questionSelectors: ["#question", ".question-text", () => document.querySelector(".test-question")],
		},
		{
			name: "Leetcode",
			urls: ["leetcode.com"],
			questionSelectors: ["#qd-content"],
		},
	];

	// --- Universal Detection Bypass ---
	function setupDetectionBypass() {
		// Visibility API Overrides
		Object.defineProperties(document, {
			"hidden": {
				get: function () {
					return false;
				},
				configurable: true,
			},
			"visibilityState": {
				get: function () {
					return "visible";
				},
				configurable: true,
			},
			"webkitHidden": {
				get: function () {
					return false;
				},
				configurable: true,
			},
			"webkitVisibilityState": {
				get: function () {
					return "visible";
				},
				configurable: true,
			},
		});

		// Block visibility events
		const eventsToBlock = [
			"visibilitychange",
			"webkitvisibilitychange",
			"blur",
			"focus",
			"focusin",
			"focusout",
			"fullscreenchange",
			"webkitfullscreenchange",
		];
		eventsToBlock.forEach((eventType) => {
			window.addEventListener(
				eventType,
				function (event) {
					event.stopImmediatePropagation();
					event.preventDefault();
					event.stopPropagation();
					console.debug(`[Bypass Script] Blocked event: ${eventType}`);
				},
				true
			);
		});

		// Clear event handlers
		window.onblur = null;
		window.onfocus = null;
		window.onvisibilitychange = null;
		window.onwebkitvisibilitychange = null;
		window.onfullscreenchange = null;
		window.onwebkitfullscreenchange = null;

		// Block beacon API (often used for analytics on tab switching)
		const originalSendBeacon = navigator.sendBeacon;
		navigator.sendBeacon = function (url, data) {
			console.debug(`[Bypass Script] Blocked sendBeacon to ${url}`);
			return true; // Pretend it worked
		};

		// Additional page visibility trick
		if (typeof PageVisibilityPropertiesObject !== "undefined") {
			PageVisibilityPropertiesObject.hidden = false;
			PageVisibilityPropertiesObject.visibilityState = "visible";
		}

		console.log("[Answer it!!] Enhanced detection bypass activated");
	}

	// --- AI Answer Generator Feature ---
	let apiKey;
	const modelCache = {}; // In-memory cache for current session
	let outputTextArea;
	let currentWebsite = null;

	// Model definitions with ranking, subtitles, colors, and tooltips
	const models = [
		{
			name: "gemini-2.5-pro-exp-03-25",
			displayName: "Pro-Thinking",
			subtitle: "Highest Quality | 5 RPM | Best for Complex Questions",
			rank: 1,
			color: "#C8E6C9", // Light Green
			tooltip: "Latest experimental Gemini 2.5 Pro model with 1M token context window. Best for complex reasoning and detailed responses.",
		},
		{
			name: "gemini-2.0-flash-thinking-exp-01-21",
			displayName: "Flash-Thinking",
			subtitle: "Best Quality | 10 RPM | Recommended for Complex Questions",
			rank: 2,
			color: "#E1BEE7", // Faded Lavender
			tooltip: "Highest quality model, may be slower and has an API quota of 10 requests per minute. Use sparingly.",
		},
		{
			name: "gemini-2.0-pro-exp-02-05",
			displayName: "Pro",
			subtitle: "Good Quality | 2 RPM | Recommended for knowledge-based Questions",
			rank: 3,
			color: "#B2DFDB", // Faded Mint
			tooltip: "High quality model, good balance of quality and speed. Has an API quota of 2 requests per minute. Moderate usage recommended.",
		},
		{
			name: "gemini-2.0-flash",
			displayName: "Flash",
			subtitle: "Fast Response | 15 RPM | Recommended for General Questions",
			rank: 4,
			color: "#FFD54F", // Faded Yellow
			tooltip: "Faster model, good for quick answers, quality may be slightly lower. Has an API quota of 15 requests per minute.",
		},
		{
			name: "gemini-2.0-flash-lite-preview-02-05",
			displayName: "Flash Lite",
			subtitle: "Fastest & Cheapest | 30 RPM | Recommended only for very simple questions",
			rank: 5,
			color: "#F0F4C3", // Faded Lime
			tooltip: "Fastest and most cost-effective model, lowest quality, use for simpler questions. Has an API quota of 30 requests per minute.",
		},
	].sort((a, b) => a.rank - b.rank); // Sort by rank (1 = best)

	// CSS for popup UI
	GM_addStyle(`
        #ai-answer-popup {
            position: fixed;
            top: 50%;
            right: 0px;
            transform: translateY(-50%);
            width: 500px;
            max-width: 90vw;
            height: 100vh;
            background-color: #f5f5f5; /* Changed from pure white to off-white */
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            display: none;
            flex-direction: column;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        }

        #ai-answer-popup.dark {
            background-color: #1e1e1e;
            color: #e0e0e0;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        #ai-answer-popup.visible {
            display: flex;
        }

        #ai-popup-header {
            padding: 12px 15px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.3s, border-color 0.3s;
        }

        #ai-answer-popup.dark #ai-popup-header {
            background-color: #252525;
            border-bottom: 1px solid #333;
        }

        #ai-popup-title {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
            transition: color 0.3s;
        }

        #ai-answer-popup.dark #ai-popup-title {
            color: #e0e0e0;
        }

        #ai-popup-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        #ai-theme-toggle {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #666;
            transition: color 0.3s, transform 0.3s;
        }

        #ai-answer-popup.dark #ai-theme-toggle {
            color: #ddd;
        }

        #ai-theme-toggle:hover {
            transform: scale(1.1);
        }

        #ai-popup-close {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            color: #666;
            transition: color 0.3s;
        }

        #ai-answer-popup.dark #ai-popup-close {
            color: #ddd;
        }

        #ai-caption {
            font-size: 0.85em;
            color: #555;
            margin-bottom: 5px;
            font-style: italic;
            transition: color 0.3s;
        }

        #ai-answer-popup.dark #ai-caption {
            color: #aaa;
        }

        #ai-popup-content {
            padding: 15px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .ai-model-button {
            width: 100%;
            text-align: left;
            border-radius: 6px;
            border: 1px solid rgba(0,0,0,0.1);
            padding: 10px 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        #ai-answer-popup.dark .ai-model-button {
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        }
        
        /* Darker background colors for model buttons in dark theme */
        #ai-answer-popup.dark .ai-model-button[data-model="gemini-2.5-pro-exp-03-25"] {
            background-color: #2E7D32 !important; /* Darker Green */
        }
        
        #ai-answer-popup.dark .ai-model-button[data-model="gemini-2.0-flash-thinking-exp-01-21"] {
            background-color: #6A1B9A !important; /* Darker Purple */
        }
        
        #ai-answer-popup.dark .ai-model-button[data-model="gemini-2.0-pro-exp-02-05"] {
            background-color: #00695C !important; /* Darker Teal */
        }
        
        #ai-answer-popup.dark .ai-model-button[data-model="gemini-2.0-flash"] {
            background-color: #EF6C00 !important; /* Darker Amber */
        }
        
        #ai-answer-popup.dark .ai-model-button[data-model="gemini-2.0-flash-lite-preview-02-05"] {
            background-color: #827717 !important; /* Darker Lime */
        }

        .ai-model-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 3px 5px rgba(0,0,0,0.1);
        }

        #ai-answer-popup.dark .ai-model-button:hover {
            box-shadow: 0 3px 5px rgba(0,0,0,0.3);
        }

        .ai-model-text-container {
            display: flex;
            flex-direction: column;
            width: 100%;
        }

        .ai-model-name {
            font-weight: 500;
            font-size: 14px;
            color: #333;
            transition: color 0.3s;
        }

        #ai-answer-popup.dark .ai-model-name {
            color: #e0e0e0;
        }

        .ai-model-subtitle {
            height: 0;
            overflow: hidden;
            font-size: 12px;
            color: #555;
            transition: height 0.2s ease, opacity 0.2s ease, margin 0.2s ease, color 0.3s;
            opacity: 0;
            margin-top: 0;
        }

        #ai-answer-popup.dark .ai-model-subtitle {
            color: #aaa;
        }

        .ai-model-button:hover .ai-model-subtitle {
            height: auto;
            opacity: 1;
            margin-top: 4px;
        }

        #ai-output-container {
            margin-top: 10px;
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            flex-shrink: 1;
            flex-basis: auto;
            overflow: auto;
            margin-top: auto;
        }

        #ai-output-textarea {
            width: 100%;
            height: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            resize: none;
            min-height: 150px;
            box-sizing: border-box;
            background-color: #f9f9f9; /* Changed from pure white to subtle off-white */
            color: #000;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        }

        #ai-answer-popup.dark #ai-output-textarea {
            background-color: #2d2d2d;
            color: #e0e0e0;
            border-color: #444;
        }

        #ai-custom-prompt-container {
            margin-top: 15px;
            margin-bottom: 5px;
            display: flex;
            flex-direction: column;
            opacity: 0.7;
            transition: opacity 0.3s ease;
        }

        #ai-custom-prompt-container:hover {
            opacity: 1;
        }

        #ai-custom-prompt-label {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: color 0.3s;
        }

        #ai-answer-popup.dark #ai-custom-prompt-label {
            color: #aaa;
        }

        #ai-custom-prompt-label::before {
            content: "▶";
            font-size: 0.8em;
            margin-right: 5px;
            transition: transform 0.3s ease;
        }

        #ai-custom-prompt-label.expanded::before {
            transform: rotate(90deg);
        }

        #ai-custom-prompt {
            width: 100%;
            padding: 6px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
            min-height: 60px;
            display: none;
            background-color: #fff;
            color: #333;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s;
        }

        #ai-answer-popup.dark #ai-custom-prompt {
            background-color: #2d2d2d;
            color: #e0e0e0;
            border-color: #444;
        }

        #ai-custom-prompt.visible {
            display: block;
        }

        #ai-timer {
            font-family: monospace;
        }

        #ai-popup-footer {
            padding: 10px 15px;
            background-color: #f8f9fa;
            border-top: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            font-size: 0.8em;
            color: #777;
            transition: background-color 0.3s, border-color 0.3s, color 0.3s;
        }

        #ai-answer-popup.dark #ai-popup-footer {
            background-color: #252525;
            border-top: 1px solid #333;
            color: #aaa;
        }

        #ai-status-text {
            font-style: italic;
        }

        #ai-insert-button {
            position: absolute;
            top: -28px;
            right: 0;
            min-width: 60px; /* Ensure minimum width */
            height: 26px; /* Fixed height */
            display: flex; /* Use flexbox for better content centering */
            align-items: center; /* Center content vertically */
            justify-content: center; /* Center content horizontally */
            background-color: #e0e0e0;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 4px 10px;
            font-size: 0.9em;
            cursor: pointer;
            opacity: 1;
            color: #333;
            font-weight: 500;
            z-index: 10;
            transition: all 0.3s ease;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); /* Add subtle shadow for depth */
        }

        #ai-answer-popup.dark #ai-insert-button {
            background-color: #3a3a3a;
            border-color: #555;
            color: #e0e0e0;
        }

        #ai-insert-button:hover {
            opacity: 1;
        }

        #ai-output-container {
            position: relative;
        }
    `);

	function createPopupUI() {
		if (document.getElementById("ai-answer-popup")) {
			return; // Popup already exists
		}

		const popup = document.createElement("div");
		popup.id = "ai-answer-popup";

		 // Apply theme class based on config
		if (config.theme === "dark") {
			popup.classList.add("dark");
		}

		// Header section
		const header = document.createElement("div");
		header.id = "ai-popup-header";

		const title = document.createElement("h3");
		title.id = "ai-popup-title";
		title.textContent = "AI Answer Generator";

		// Container for theme toggle and close buttons
		const controls = document.createElement("div");
		controls.id = "ai-popup-controls";

		// Theme toggle button
		const themeToggle = document.createElement("button");
		themeToggle.id = "ai-theme-toggle";
		themeToggle.textContent = config.theme === "dark" ? "☀️" : "🌙";
		themeToggle.title = config.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
		themeToggle.addEventListener("click", toggleTheme);

		const closeButton = document.createElement("button");
		closeButton.id = "ai-popup-close";
		closeButton.textContent = "×";
		closeButton.addEventListener("click", togglePopup);

		controls.appendChild(themeToggle);
		controls.appendChild(closeButton);

		header.appendChild(title);
		header.appendChild(controls);

		// Content section
		const content = document.createElement("div");
		content.id = "ai-popup-content";

		// Add model buttons
		models.forEach((model) => {
			const button = document.createElement("button");
			button.classList.add("ai-model-button");
			button.setAttribute("data-model", model.name);
			button.setAttribute("title", model.tooltip);
			button.style.backgroundColor = model.color;
			button.addEventListener("click", handleGenerateClick);

			// Main container for text content
			const textContainer = document.createElement("div");
			textContainer.classList.add("ai-model-text-container");

			// Model name with cleaner display
			const modelName = document.createElement("span");
			modelName.classList.add("ai-model-name");
			modelName.textContent = model.displayName;

			// Subtitle hidden by default, shown on hover
			const subtitle = document.createElement("span");
			subtitle.classList.add("ai-model-subtitle");
			subtitle.textContent = model.subtitle;

			textContainer.appendChild(modelName);
			textContainer.appendChild(subtitle);
			button.appendChild(textContainer);

			content.appendChild(button);
		});

		// Custom prompt container
		const customPromptContainer = document.createElement("div");
		customPromptContainer.id = "ai-custom-prompt-container";

		const customPromptLabel = document.createElement("label");
		customPromptLabel.id = "ai-custom-prompt-label";
		customPromptLabel.textContent = "Custom Prompt";
		customPromptLabel.addEventListener("click", toggleCustomPrompt);

		const customPromptArea = document.createElement("textarea");
		customPromptArea.id = "ai-custom-prompt";
		customPromptArea.placeholder = "Enter custom instructions here (discouraged)";

		customPromptContainer.appendChild(customPromptLabel);
		customPromptContainer.appendChild(customPromptArea);
		content.appendChild(customPromptContainer);

		// Output container
		const outputContainer = document.createElement("div");
		outputContainer.id = "ai-output-container";

		const caption = document.createElement("div");
		caption.id = "ai-caption";
		caption.textContent = "Response metadata will appear here";

		const insertButton = document.createElement("button");
		insertButton.id = "ai-insert-button";
		insertButton.textContent = "Insert";
		insertButton.addEventListener("click", handleInsertClick);

		outputTextArea = document.createElement("textarea");
		outputTextArea.id = "ai-output-textarea";
		outputTextArea.placeholder = "AI Response will appear here...";
		outputTextArea.readOnly = true;

		outputContainer.appendChild(caption);
		outputContainer.appendChild(insertButton);
		outputContainer.appendChild(outputTextArea);
		content.appendChild(outputContainer);

		// Footer section
		const footer = document.createElement("div");
		footer.id = "ai-popup-footer";

		const statusText = document.createElement("span");
		statusText.id = "ai-status-text";
		statusText.textContent = "Ready";

		const timerSpan = document.createElement("span");
		timerSpan.id = "ai-timer";
		timerSpan.style.display = "none";

		const hotkeyInfo = document.createElement("span");
		hotkeyInfo.textContent = `Press ${config.hotkeyModifier.toUpperCase()}+${config.hotkey.toUpperCase()} to toggle`;

		footer.appendChild(statusText);
		footer.appendChild(timerSpan);
		footer.appendChild(hotkeyInfo);

		// Assemble popup
		popup.appendChild(header);
		popup.appendChild(content);
		popup.appendChild(footer);

		document.body.appendChild(popup);
	}

	function togglePopup() {
		if (!document.getElementById("ai-answer-popup")) {
			createPopupUI();
		}

		const popup = document.getElementById("ai-answer-popup");
		const isVisible = popup.classList.contains("visible");

		if (isVisible) {
			popup.classList.remove("visible");
			config.popupVisible = false;
		} else {
			popup.classList.add("visible");
			config.popupVisible = true;

			// Clear previous output when showing
			if (outputTextArea) {
				outputTextArea.value = "";
			}
		}
	}

	function toggleCustomPrompt() {
		const label = document.getElementById("ai-custom-prompt-label");
		const textarea = document.getElementById("ai-custom-prompt");

		label.classList.toggle("expanded");
		textarea.classList.toggle("visible");

		if (textarea.classList.contains("visible")) {
			textarea.focus();
		}
	}

	function toggleTheme() {
		const popup = document.getElementById("ai-answer-popup");
		const themeToggle = document.getElementById("ai-theme-toggle");
		
		if (config.theme === "light") {
			config.theme = "dark";
			popup.classList.add("dark");
			themeToggle.textContent = "☀️"; // Sun emoji for switching to light theme
			themeToggle.title = "Switch to light theme";
		} else {
			config.theme = "light";
			popup.classList.remove("dark");
			themeToggle.textContent = "🌙"; // Moon emoji for switching to dark theme
			themeToggle.title = "Switch to dark theme";
		}
		
		// Save the theme preference
		GM_setValue("theme", config.theme);
	}

	function changeHotkey() {
		const newHotkey = prompt("Enter a new hotkey (single character) to use with Alt:", config.hotkey);
		if (newHotkey && newHotkey.length === 1) {
			config.hotkey = newHotkey.toLowerCase();
			GM_setValue("hotkey", config.hotkey);

			// Update hotkey info in UI if popup exists
			const popup = document.getElementById("ai-answer-popup");
			if (popup) {
				const hotkeyInfo = popup.querySelector("#ai-popup-footer span:last-child");
				if (hotkeyInfo) {
					hotkeyInfo.textContent = `Press ${config.hotkeyModifier.toUpperCase()}+${config.hotkey.toUpperCase()} to toggle`;
				}
			}

			alert(`Hotkey updated to ALT+${config.hotkey.toUpperCase()}`);
		} else if (newHotkey) {
			alert("Please enter a single character only.");
		}
	}

	let timerInterval = null;
	let startTimestamp = 0;

	function startTimer() {
		const statusText = document.getElementById("ai-status-text");

		if (statusText) {
			startTimestamp = Date.now();
			clearInterval(timerInterval); // Clear any existing interval

			timerInterval = setInterval(() => {
				const elapsed = Date.now() - startTimestamp;
				const seconds = Math.floor(elapsed / 1000)
					.toString()
					.padStart(2, "0");
				const milliseconds = Math.floor((elapsed % 1000) / 10)
					.toString()
					.padStart(2, "0");
				statusText.textContent = `Generating (${seconds}:${milliseconds})`;
			}, 10); // Update every 10ms for smooth timer
		}
	}

	function stopTimer(status = "Ready") {
		const statusText = document.getElementById("ai-status-text");

		clearInterval(timerInterval);

		if (statusText) {
			statusText.textContent = status;
		}
	}

	function getApiKey() {
		const info = confirm(
			"An API key is a secret token that lets our service access the AI API. Get one for FREE from https://aistudio.google.com/app/apikey.\n\nClick OK if you already have an API key.\nClick Cancel to open the key creation page."
		);
		if (!info) {
			window.open("https://aistudio.google.com/app/apikey", "_blank");
			alert(
				"Please go to the following site to generate your free key:\n https://aistudio.google.com/app/apikey \n\nAfter creating your API key, return here and click OK."
			);
		}
		const key = prompt(
			"Please paste your Gemini API Key here.\n\nYour API key is a long alphanumeric string provided by Google. Make sure to copy it exactly."
		);
		return key;
	}

	function detectCurrentWebsite() {
		const currentUrl = window.location.href;
		for (const site of websites) {
			for (const urlPattern of site.urls) {
				if (currentUrl.includes(urlPattern)) {
					return site;
				}
			}
		}
		return null;
	}

	function getQuestionElement() {
		if (!currentWebsite) {
			currentWebsite = detectCurrentWebsite();
			if (!currentWebsite) {
				return null;
			}
		}

		// Try all selectors in the array
		if (currentWebsite.questionSelectors && Array.isArray(currentWebsite.questionSelectors)) {
			for (const selector of currentWebsite.questionSelectors) {
				let element = null;

				// Handle if selector is a function
				if (typeof selector === "function") {
					try {
						element = selector();
					} catch (error) {
						console.error(`Error executing selector function: ${error.message}`);
					}
				}
				// Handle if selector is a string (CSS selector)
				else if (typeof selector === "string") {
					element = document.querySelector(selector);
				}

				if (element) {
					updateStatusWithFoundElement(element);
					return element;
				}
			}
		}

		return null;
	}

	function updateStatusWithFoundElement(element) {
		const statusText = document.getElementById("ai-status-text");
		if (statusText) {
			// Create a simplified identifier for the element
			let elementId = "";
			if (element.id) {
				elementId = `#${element.id}`;
			} else if (element.className) {
				elementId = `.${element.className.split(" ")[0]}`;
			} else {
				elementId = element.tagName.toLowerCase();
			}

			statusText.textContent = `Ready (${elementId} found)`;
		}
	}

	function getQuestionText(element) {
		if (!element) return "No question found";

		// If currentWebsite has a custom getQuestionText function, use it
		if (currentWebsite && typeof currentWebsite.getQuestionText === "function") {
			return currentWebsite.getQuestionText(element);
		}

		// Default implementation - extract HTML content
		return element.innerHTML || element.textContent || "Unable to extract question text";
	}

	let lastFocusedInput = null;

	// Track the last focused input or textarea field
	document.addEventListener("focusin", (event) => {
		if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
			if (!document.getElementById("ai-answer-popup").contains(event.target)) {
				lastFocusedInput = event.target;
			}
		}
	});

	function handleInsertClick() {
		if (!lastFocusedInput) {
			alert("No input field selected to insert the response. Please click on a text field first.");
			return;
		}

		const selectedText = outputTextArea.value.substring(outputTextArea.selectionStart, outputTextArea.selectionEnd);
		const textToInsert = selectedText || outputTextArea.value;

		if (lastFocusedInput) {
			const start = lastFocusedInput.selectionStart;
			const end = lastFocusedInput.selectionEnd;
			const currentValue = lastFocusedInput.value;

			lastFocusedInput.value = currentValue.slice(0, start) + textToInsert + currentValue.slice(end);
			lastFocusedInput.focus();
			lastFocusedInput.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
		}
	}

	async function handleGenerateClick(event) {
		const statusText = document.getElementById("ai-status-text");
		const caption = document.getElementById("ai-caption");
		outputTextArea.value = ""; // Clear previous output
		caption.textContent = "Response metadata will appear here"; // Clear caption
		startTimer(); // Start the timer

		// Get model name from button data attribute
		const modelName = event.currentTarget.getAttribute("data-model");

		// Get question text from the current website
		const questionElement = getQuestionElement();
		if (!questionElement) {
			outputTextArea.value = "Error: Question not found on page. This site might not be supported yet.";
			stopTimer("Error");
			return;
		}

		let questionText = getQuestionText(questionElement);

		// Add custom prompt if provided
		const customPromptArea = document.getElementById("ai-custom-prompt");
		if (customPromptArea && customPromptArea.value.trim()) {
			questionText += `\n\n\nuser-prompt:[${customPromptArea.value.trim()}]`;
		}

		// Check for API key
		if (!apiKey) {
			apiKey = GM_getValue("geminiApiKey");
			if (!apiKey) {
				apiKey = getApiKey();
				if (!apiKey) {
					outputTextArea.value = "API Key is required to use the answer generator. Please follow the instructions to obtain one.";
					stopTimer("API Key Required");
					return;
				}
				GM_setValue("geminiApiKey", apiKey);
			}
		}

		// Check cache
		const cacheKey = `gemini-cache-${modelName}-${hashCode(questionText)}`;
		if (modelCache[cacheKey]) {
			console.log(`Cache hit for ${modelName}.`);
			outputTextArea.value = modelCache[cacheKey].answer;
			caption.textContent = `Model: ${modelName} | Cached Response (time taken: ${modelCache[cacheKey].time} ms)`;
			stopTimer("Loaded from cache");
			return;
		}

		outputTextArea.value = `Generating response...`;
		const startTime = Date.now();

		try {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					"system_instruction": {
						"parts": {
							"text":
								"Answer the question inside this html smartly and concisely. Provide your reasoning and if there are multiple choice options, end with saying the answer number and the answer. If coding question, make sure to provide the fully working code that is error free smartly. Dont use markdown, but format the text neatly keeping in mind that the response will be displayed in a textarea. If question is unclear or requires context from image or other parts of the page, ask for clarification or else provide the right answer to the best of your ability.",
						},
					},
					"contents": [{ "parts": [{ "text": questionText }] }],
				}),
			});

			if (!response.ok) {
				if (response.status === 429) {
					const errorText = `Model: ${modelName} - Too many requests. You may have spammed the same model past its Quota. Please wait 60 seconds or try another model.`;
					console.error(errorText);
					outputTextArea.value = errorText;
					stopTimer("Rate limited");
					return;
				} else if (response.status === 400) {
					const errorBody = await response.json();
					const errorCode = errorBody.error.code;
					const errorMessage = errorBody.error.message;
					// Clear the stored API key
					GM_setValue("geminiApiKey", "");
					apiKey = "";
					const fullError = `API error (400):\nError Code: ${errorCode}\nMessage: ${errorMessage}\n\nYour stored API key has been cleared. Please provide a valid API key.`;
					console.error(fullError);
					outputTextArea.value = fullError;
					stopTimer("API Error");
					return;
				}
				const errorText = `API error for ${modelName}: ${response.status} ${response.statusText} - ${await response.text()}`;
				console.error(errorText);
				outputTextArea.value = errorText;
				stopTimer("API Error");
				return;
			}

			const data = await response.json();
			if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
				const answerText = data.candidates[0].content.parts[0].text;
				const timeTaken = Date.now() - startTime;
				modelCache[cacheKey] = { answer: answerText, time: timeTaken };
				outputTextArea.value = answerText;
				caption.textContent = `Model: ${modelName} | Response (time taken: ${timeTaken} ms)`;
				stopTimer("Response received");
			} else {
				const warnText = `Unexpected API response format for ${modelName}: Check console for details.`;
				console.warn(warnText, data);
				outputTextArea.value = warnText;
				stopTimer("Unexpected response");
			}
		} catch (error) {
			const errorMsg = `Error fetching from Gemini API for ${modelName}: ${error.message}`;
			console.error(errorMsg, error);
			outputTextArea.value = errorMsg;
			stopTimer("Error");
		}
	}

	function changeApiKey() {
		apiKey = getApiKey();
		if (apiKey !== null && apiKey !== "") {
			GM_setValue("geminiApiKey", apiKey);
			alert("API Key updated successfully.");
		} else if (apiKey === "") {
			GM_setValue("geminiApiKey", apiKey);
			alert("API Key cleared. A valid key is required to use the service.");
		} else {
			alert("No API Key was provided. Please follow the instructions to obtain one.");
		}
	}

	function clearCache() {
		Object.keys(modelCache).forEach((key) => delete modelCache[key]);
		alert("Cache cleared from memory.");
	}

	// Basic string hash function for cache keys
	function hashCode(str) {
		let hash = 0;
		for (let i = 0, len = str.length; i < len; i++) {
			let chr = str.charCodeAt(i);
			hash = (hash << 5) - hash + chr;
			hash |= 0; // Convert to 32bit integer
		}
		return hash.toString();
	}

	// --- Event Listeners ---

	// Keyboard shortcut handler
	document.addEventListener("keydown", function (event) {
		// Check if Alt+[configured key] is pressed using event.code for better compatibility
		if (event.altKey && event.code.toLowerCase() === `key${config.hotkey.toLowerCase()}`) {
			event.preventDefault();
			togglePopup();
		}
	});

	// Register Tampermonkey menu commands
	GM_registerMenuCommand("Toggle AI Popup (Alt+" + config.hotkey.toUpperCase() + ")", togglePopup);
	GM_registerMenuCommand("Change API Key", changeApiKey);
	GM_registerMenuCommand("Clear Response Cache", clearCache);
	GM_registerMenuCommand("Change Hotkey", changeHotkey);

	// --- Initialization ---
	function initialize() {
		// Run detection bypass
		setupDetectionBypass();

		// Detect current website
		currentWebsite = detectCurrentWebsite();

		// Only create popup on websites with questions when opened
		document.addEventListener("DOMContentLoaded", function () {
			if (config.aiEnabled && currentWebsite) {
				let attempts = 0;
				const maxAttempts = 30;

				function tryCreatePopup() {
					if (document.getElementById("ai-answer-popup")) {
						console.log("[AnswerIT!!] Popup already exists");
						return;
					}

					attempts++;
					createPopupUI();

					// Verify popup was created successfully
					if (!document.getElementById("ai-answer-popup") && attempts < maxAttempts) {
						console.log(`[AnswerIT!!] Popup creation attempt ${attempts} failed, retrying...`);
						setTimeout(tryCreatePopup, 500);
					} else if (attempts >= maxAttempts) {
						console.error("[AnswerIT!!] Failed to create popup after maximum attempts");
					} else {
						console.log("[AnswerIT!!] Popup created successfully");
					}
				}

				// Initial delay to let page load
				setTimeout(tryCreatePopup, 1000);
			}
		});
	}

	// Start the script
	initialize();
})();
