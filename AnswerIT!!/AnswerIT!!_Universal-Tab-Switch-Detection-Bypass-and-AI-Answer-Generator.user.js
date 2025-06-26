// ==UserScript==
// @name         AnswerIT!! - Universal Tab Switch Detection Bypass and AI Answer Generator
// @namespace    https://github.com/jeryjs
// @version      3.14.2
// @description  Universal tab switch detection bypass and AI answer generator with popup interface
// @author       Jery
// @match        https://app.joinsuperset.com/assessments/*
// @match        https://lms.talentely.com/*/*
// @match        https://leetcode.com/problems/*
// @match        https://www.linkedin.com/learning/*/*
// @icon         https://i.pinimg.com/736x/d9/b5/a6/d9b5a64b2a0f432e41f611ddd410d8be.jpg
// @license      MIT
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @updateURL    https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// @downloadURL  https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// ==/UserScript==

(function () {
	"use strict";

	// --- Configuration ---
	const config = {
		hotkey: GM_getValue("hotkey", "a"), // Default hotkey is 'a' (used with Alt)
		hotkeyModifier: "alt", // Currently only supports 'alt'
		popupState: { visible: false, snapped: 2, window: { x: 0, y: 0, w: 500, h: 800 } }, // Default popup state (not visible, snapped to right side)
		theme: GM_getValue("theme", "light"), // Default theme is 'light'
		autoRun: false, // Default auto-run to false to avoid wasting api calls
	};

	// --- Website Configurations ---
	const websites = [
		{
			name: "Superset Assessments",
			urls: ["app.joinsuperset.com/assessments"],
			questionSelectors: ["#question-container > div.content.flex-1.flexbox.no-h-padding.scrollable > div:nth-child(2) > div"],
			getQuestionItem: (element) => element.innerHTML,
			getQuestionIdentifier: (element) => element.textContent
		},
		{
			name: "Talentely",
			urls: ["lms.talentely.com"],
			questionSelectors: ["#question", ".question-text", () => document.querySelector(".test-question")],
			getQuestionIdentifier: (element) => element.querySelector("p").parentElement.nextElementSibling.textContent,
			getQuestionItem: (e) => {
				const isCodingQn = !!e.querySelector('.ace_content');
				if (isCodingQn) {
					const questionHtml = e.querySelector("p").parentElement.nextElementSibling.nextElementSibling.innerHTML;
					const currentCode = e.querySelector('#editor .ace_content').innerText;
					const codeLanguage = e.querySelector("input#programming-language-selector").value;
					return `Question HTML: ${questionHtml}\n\nCurrent active Code Editor Content: \`\`\`${codeLanguage}\n${currentCode}\`\`\``;
				}
				return e.innerHTML;
			}
		},
		{
			name: "Leetcode",
			urls: ["leetcode.com"],
			questionSelectors: ["#qd-content"],
			getQuestionIdentifier: (element) => element.querySelector('a[href*="/problems/"]').textContent,
			getQuestionItem: (element) => {
				const questionTitle = element.querySelector('a[href*="/problems/"]').textContent;
				const questionElement = element.querySelector('div[data-track-load="description_content"]').innerHTML;
				const codeEditorElement = element.querySelector('.lines-content')?.innerText;
				return `Question Title: ${questionTitle}\n\nQuestion Element: ${questionElement}\n\nCurrent active Code Editor Element: ${codeEditorElement}`;
			},
		},
		{
			name: "LinkedIn Learning",
			urls: ["linkedin.com/learning"],
			questionSelectors: [".ember-view.classroom-layout__media", "section.classroom-quiz__content"],
			getQuestionIdentifier: (element) => (element.querySelector('.chapter-quiz-question__header') || element).textContent.slice(0, 100).trim(),
			getQuestionItem: (element) => element.textContent.trim(),
		}
	];

	// --- Universal Detection Bypass ---
	function setupDetectionBypass() {
		// Visibility API Overrides
		Object.defineProperties(document, {
			"hidden": { get: function () { return false; }, configurable: true },
			"visibilityState": { get: function () { return "visible"; }, configurable: true },
			"webkitHidden": { get: function () { return false; }, configurable: true },
			"webkitVisibilityState": { get: function () { return "visible"; }, configurable: true },
		});

		// Block visibility events
		const eventsToBlock = ["visibilitychange", "webkitvisibilitychange", "blur", "focus", "focusin", "focusout", "fullscreenchange", "webkitfullscreenchange"];
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
	let currentQnIdentifier = null;
	let lastUsedModel = null;

	// Model definitions with ranking, subtitles, colors (for light theme), and tooltips
	const models = [
		{
			name: "gemini-2.5-pro",
			displayName: "Pro-Thinking",
			subtitle: "Highest Quality | 5 RPM | Best for Complex Questions",
			rank: 1,
			color: "#C8E6C9", // Light Green
			tooltip: "Latest experimental Gemini 2.5 Pro model with 1M token context window. Best for complex reasoning and detailed responses.",
		},
		{
			name: "gemini-2.5-flash-preview-05-20",
			displayName: "Flash-Thinking",
			subtitle: "Best Quality | 10 RPM | Recommended for Complex Questions",
			rank: 2,
			color: "#E1BEE7", // Faded Lavender
			tooltip: "Highest quality model, may be slower and has an API quota of 10 requests per minute. Use sparingly.",
			generationConfig: { thinkingConfig: { thinkingBudget: 8000 } }
		},
		// This model now points to the pro-thinking api and is redundant
		// {
		// 	name: "gemini-2.0-pro-exp-02-05",
		// 	displayName: "Pro",
		// 	subtitle: "Good Quality | 2 RPM | Recommended for knowledge-based Questions",
		// 	rank: 3,
		// 	color: "#B2DFDB", // Faded Mint
		// 	tooltip: "High quality model, good balance of quality and speed. Has an API quota of 2 requests per minute. Moderate usage recommended.",
		// },
		{
			name: "gemini-2.5-flash",
			displayName: "Flash",
			subtitle: "Fast Response | 15 RPM | Recommended for General Questions",
			rank: 3,
			color: "#FCDF80", // Faded Yellow
			tooltip: "Faster model, good for quick answers, quality may be slightly lower. Has an API quota of 15 requests per minute.",
			generationConfig: { thinkingConfig: { thinkingBudget: 0 } }
		},
		{
			name: "gemini-2.5-flash-lite-preview-06-17",
			displayName: "Flash Lite",
			subtitle: "Fastest & Cheapest | 30 RPM | Recommended only for very simple questions",
			rank: 4,
			color: "#F0F4C3", // Faded Lime
			tooltip: "Fastest and most cost-effective model, lowest quality, use for simpler questions. Has an API quota of 30 requests per minute.",
		},
	].sort((a, b) => a.rank - b.rank); // Sort by rank (1 = best)

	// CSS for popup UI
	GM_addStyle(`
		:root {
			--bg-main: #f5f5f5;
			--bg-header: #f8f9fa;
			--bg-textarea: #f9f9f9;
			--bg-insert-button: #e0e0e0;
			--color-text: #333;
			--color-subtitle: #555;
			--color-caption: #555;
			--color-footer: #777;
			--border-color: #ddd;
			--border-header: #e9ecef;
			--shadow-popup: 0 4px 20px rgba(0, 0, 0, 0.2);
			--shadow-button: 0 1px 2px rgba(0,0,0,0.05);
			--shadow-button-hover: 0 3px 5px rgba(0,0,0,0.1);
			--spinner-color: #555;
			--success-color: #4CAF50;
			--retry-color: #ff9800;
		}

		#ai-answer-popup.dark {
			--bg-main: #1e1e1e;
			--bg-header: #252525;
			--bg-textarea: #2d2d2d;
			--bg-insert-button: #3a3a3a;
			--color-text: #e0e0e0;
			--color-subtitle: #aaa;
			--color-caption: #aaa;
			--color-footer: #aaa;
			--border-color: #444;
			--border-header: #333;
			--shadow-popup: 0 4px 20px rgba(0, 0, 0, 0.5);
			--shadow-button: 0 1px 2px rgba(0,0,0,0.15);
			--shadow-button-hover: 0 3px 5px rgba(0,0,0,0.3);
			--spinner-color: #aaa;
			--success-color: #81C784; /* Lighter green for dark mode */
			--retry-color: #FFB74D; /* Lighter orange for dark mode */
		}

		#ai-answer-popup {
			position: fixed;
			top: 50%;
			right: 0px;
			width: 500px;
			max-width: 90vw;
			height: 100vh;
			background-color: var(--bg-main);
			border-radius: 8px;
			box-shadow: var(--shadow-popup);
			z-index: 9999;
			display: none;
			flex-direction: column;
			overflow: hidden;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		}

		#ai-answer-popup.visible {
			display: flex;
		}

		#ai-popup-header {
			padding: 12px 15px;
			background-color: var(--bg-header);
			border-bottom: 1px solid var(--border-header);
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		#ai-popup-title {
			margin: 0;
			font-size: 18px;
			font-weight: 600;
			color: var(--color-text);
		}

		#ai-popup-controls {
			display: flex;
			align-items: center;
   			gap: 5px;
		}

		#ai-popup-controls > button {
			background: none;
			border: none;
			cursor: pointer;
			font-size: 20px;
			color: var(--color-text);
		}

		#ai-caption {
			font-size: 0.85em;
			color: var(--color-caption);
			margin-bottom: 5px;
			font-style: italic;
		}

		#ai-popup-content {
			padding: 15px;
			overflow-y: auto;
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		#ai-models-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 10px;
			transition: all 0.3s ease;
		}

		.ai-model-button {
			width: 100%;
			text-align: left;
			border-radius: 6px;
			border: 1px solid var(--border-color);
			padding: 10px 12px;
			cursor: pointer;
			transition: all 0.2s ease;
			margin-bottom: 8px;
			display: flex;
			align-items: center;
			box-shadow: var(--shadow-button);
			position: relative; /* Needed for absolute positioning of icons */
			justify-content: space-between; /* Push icon container to the right */
		}

		.ai-model-button:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-button-hover);
		}

		.ai-model-text-container {
			display: flex;
			flex-direction: column;
			width: 100%;
		}

		.ai-model-name {
			font-weight: 500;
			font-size: 14px;
			color: var(--color-text);
		}

		.ai-model-subtitle {
			height: 0;
			overflow: hidden;
			font-size: 12px;
			color: var(--color-subtitle);
			transition: height 0.2s ease, opacity 0.2s ease, margin 0.2s ease;
			opacity: 0;
			margin-top: 0;
		}

		.ai-model-button:hover .ai-model-subtitle {
			height: auto;
			opacity: 1;
			margin-top: 4px;
		}

		.ai-model-button.loading {
			cursor: wait;
			opacity: 0.7;
		}

		.ai-model-button.success .ai-model-status-icon {
			display: flex; /* Show the status container */
		}

		.ai-model-status-container {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 24px; /* Fixed width for alignment */
			height: 24px;
			margin-left: 10px; /* Space between text and icon */
		}

		.ai-model-progress {
			display: none; /* Hidden by default */
			width: 18px;
			height: 18px;
			border: 2px solid var(--spinner-color);
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		.ai-model-button.loading .ai-model-progress {
			display: block; /* Show spinner when loading */
		}

		.ai-model-status-icon {
			display: none; /* Hidden by default, shown on success */
			cursor: pointer;
			position: relative; /* For hover effect positioning */
			width: 20px;
			height: 20px;
			align-items: center;
			justify-content: center;
		}

		.ai-model-success-icon,
		.ai-model-retry-icon {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			transition: opacity 0.2s ease;
		}

		.ai-model-success-icon {
			opacity: 1;
			color: var(--success-color);
			font-size: 20px; /* Adjust size as needed */
			line-height: 1;
		}

		.ai-model-retry-icon {
			opacity: 0;
			color: var(--retry-color);
			font-size: 18px; /* Adjust size as needed */
			line-height: 1;
		}

		.ai-model-status-icon:hover .ai-model-success-icon { opacity: 0; }
		.ai-model-status-icon:hover .ai-model-retry-icon { opacity: 1; }

		@keyframes spin {
			to { transform: rotate(360deg); }
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
			border: 1px solid var(--border-color);
			border-radius: 4px;
			font-family: monospace;
			font-size: 12px;
			resize: none;
			min-height: 150px;
			box-sizing: border-box;
			background-color: var(--bg-textarea);
			color: var(--color-text);
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
			color: var(--color-subtitle);
			margin-bottom: 4px;
			display: flex;
			align-items: center;
			cursor: pointer;
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
			border: 1px solid var(--border-color);
			border-radius: 4px;
			font-family: monospace;
			font-size: 12px;
			resize: vertical;
			min-height: 60px;
			display: none;
			background-color: var(--bg-textarea);
			color: var(--color-text);
		}

		#ai-custom-prompt.visible {
			display: block;
		}

		#ai-timer {
			font-family: monospace;
		}

		#ai-popup-footer {
			padding: 10px 15px;
			background-color: var(--bg-header);
			border-top: 1px solid var(--border-header);
			display: flex;
			justify-content: space-between;
			font-size: 0.8em;
			color: var(--color-footer);
		}

		#ai-status-text {
			font-style: italic;
		}

		#ai-insert-button {
			position: absolute;
			top: 5px;
			right: 5px;
			background-color: var(--bg-insert-button);
			border: 1px solid var(--border-color);
			border-radius: 4px;
			padding: 2px 8px;
			font-size: 0.8em;
			cursor: pointer;
			opacity: 0.8;
			transition: opacity 0.3s ease;
			color: var(--color-text);
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
		header.ondblclick = toggleSnapping;

		const title = document.createElement("h3");
		title.id = "ai-popup-title";
		title.textContent = "AnswerIT!!";

		// Container for buttons in the header
		const controls = document.createElement("div");
		controls.id = "ai-popup-controls";

		// --- Header controls ---
		const btn = (id, txt, title, onclick) => {
			let b = document.createElement('button');
			b.id = id;
			b.textContent = txt;
			b.title = title;
			b.onclick = onclick;
			return b;
		};
		controls.appendChild(btn(
			'ai-theme-toggle',
			config.theme === 'dark' ? '☀️' : '🌙',
			config.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
			toggleTheme
		));
		controls.appendChild(btn(
			'ai-auto-run-toggle',
			config.autoRun ? '⏸️' : '▶️',
			config.autoRun ? 'Disable auto-run (AI will not auto-answer on question change)' : 'Enable auto-run (automatically generate an answer with the last used model when the question changes)',
			toggleAutoRun
		));
		controls.appendChild(btn(
			'ai-popup-detach',
			config.popupState.snapped === 0 ? '🗖' : '🗗',
			config.popupState.snapped === 0 ? 'Attach to side' : 'Detach (float & drag anywhere)',
			toggleSnapping
		));
		controls.appendChild(btn('ai-popup-close', 'x', 'Close Popup', togglePopup));

		header.appendChild(title);
		header.appendChild(controls);

		// Content section
		const content = document.createElement("div");
		content.id = "ai-popup-content";

		// Add model buttons in a two-column grid
		const modelsGrid = document.createElement("div");
		modelsGrid.id = "ai-models-grid";
		models.forEach((model) => {
			const button = document.createElement("button");
			button.classList.add("ai-model-button");
			button.setAttribute("data-model", model.name);
			button.setAttribute("title", model.tooltip);
			button.style.backgroundColor = getThemedColor(model.color);
			button.addEventListener("click", (e) => handleGenerateClick(e, false));

			// Main container for text content
			const textContainer = document.createElement("div");
			textContainer.classList.add("ai-model-text-container");

			// Model name with cleaner display
			const modelNameSpan = document.createElement("span");
			modelNameSpan.classList.add("ai-model-name");
			modelNameSpan.textContent = model.displayName;

			// Subtitle hidden by default, shown on hover
			const subtitle = document.createElement("span");
			subtitle.classList.add("ai-model-subtitle");
			subtitle.textContent = model.subtitle;

			textContainer.appendChild(modelNameSpan);
			textContainer.appendChild(subtitle);

			// Status container (spinner, checkmark, retry)
			const statusContainer = document.createElement("div");
			statusContainer.classList.add("ai-model-status-container");

			const progressSpinner = document.createElement("div");
			progressSpinner.classList.add("ai-model-progress");

			const statusIcon = document.createElement("div");
			statusIcon.classList.add("ai-model-status-icon");
			statusIcon.title = "Retry generation (ignore cache)";

			const successIcon = document.createElement("span");
			successIcon.classList.add("ai-model-success-icon");
			successIcon.innerHTML = "&#10004;"; // Checkmark character

			const retryIcon = document.createElement("span");
			retryIcon.classList.add("ai-model-retry-icon");
			retryIcon.innerHTML = "&#8634;"; // Reload/Retry character

			statusIcon.appendChild(successIcon);
			statusIcon.appendChild(retryIcon);

			// Add retry listener to the status icon container
			statusIcon.addEventListener("click", (e) => {
				e.stopPropagation(); // Prevent button's main click handler
				e.preventDefault(); // Prevent any default action
				// Find the parent button to pass to handleGenerateClick
				const parentButton = e.currentTarget.closest('.ai-model-button');
				if (parentButton) {
					// Simulate the necessary parts of the event or pass the button directly
					handleGenerateClick({ currentTarget: parentButton }, true); // Pass retry flag
				}
			});

			statusContainer.appendChild(progressSpinner);
			statusContainer.appendChild(statusIcon);

			button.appendChild(textContainer);
			button.appendChild(statusContainer);

			modelsGrid.appendChild(button);
		});
		content.appendChild(modelsGrid);

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

		// --- Detach/Attach, Drag, and Resize ---
		function updatePopupPosition() {
			const p = popup;
			// Clamp the header to always stay within viewport
			let s = config.popupState, w = s.window, minW = 300, minH = 400, headerH = 48;
			header.style.cursor = s.snapped == 0 ? "move" : "default";
			if (s.snapped === 0) {
				// Convert percentage to pixels for x and y
				let pxW = Math.max(minW, w.w), pxH = Math.max(minH, w.h);
				let maxX = window.innerWidth - pxW, maxY = window.innerHeight - headerH;
				let pxX = Math.max(0, Math.min((w.x || 0) * window.innerWidth / 100, maxX));
				let pxY = Math.max(0, Math.min((w.y || 0) * window.innerHeight / 100, maxY));
				w.x = (pxX / window.innerWidth) * 100;
				w.y = (pxY / window.innerHeight) * 100;
				w.w = pxW; w.h = pxH;
				Object.assign(p.style, { left: w.x + '%', right: (window.innerWidth - pxW - pxX) + 'px', top: w.y + '%', width: pxW + 'px', height: pxH + 'px', maxHeight: '90vh', minWidth: minW + 'px', minHeight: minH + 'px', bottom: 'auto', resize: 'both' });
			} else {
				// Snap to left or right side
				const snapRight = s.snapped === 2;
				let pxW = Math.max(minW, w.w);
				let leftPx = snapRight ? (window.innerWidth - pxW) : 0;
				let rightPx = snapRight ? 0 : (window.innerWidth - pxW);
				Object.assign(p.style, { top: '0%', left: leftPx + 'px', right: rightPx + 'px', bottom: 'auto', width: pxW + 'px', height: '100vh', maxHeight: '100vh', minWidth: '300px', resize: 'horizontal' });
			}
		}
		updatePopupPosition();
		popup.updatePopupPosition = updatePopupPosition; // Expose the function for external calls

		// Drag logic (only when detached)
		let dragX = 0, dragY = 0, dragging = false;
		const popupTransition = 'left 0.25s ease-in, right 0.25s ease-in, top 0.25s ease-in, width 0.25s ease-in, height 0.25s ease-in, transform 0.25s ease-in';
		header.addEventListener("mousedown", e => {
			if (config.popupState.snapped !== 0) return;
			dragging = true;
			dragX = e.clientX - popup.offsetLeft;
			dragY = e.clientY - popup.offsetTop;
			document.body.style.userSelect = "none";
			popup.style.transition = 'none';
		});
		document.addEventListener("mousemove", e => {
			if (!dragging) return;
			let pxX = Math.max(0, Math.min(e.clientX - dragX, window.innerWidth - popup.offsetWidth));
			let pxY = Math.max(0, Math.min(e.clientY - dragY, window.innerHeight - 48));
			config.popupState.window.x = (pxX / window.innerWidth) * 100;
			config.popupState.window.y = (pxY / window.innerHeight) * 100;
			updatePopupPosition();
		});
		document.addEventListener("mouseup", () => {
			if (dragging) {
				dragging = false;
				document.body.style.userSelect = "";
				popup.style.transition = popupTransition;
				GM_setValue("popupState", config.popupState);
			}
		});

		// Resize logic
		popup.addEventListener("mousedown", e => { popup.style.transition = 'none'; }); // Disable transition during resize
		popup.addEventListener("mouseup", () => {
			console.log(config.popupState);
			popup.style.transition = popupTransition; // Re-enable transition after resize
			config.popupState.window.w = popup.offsetWidth;
			config.popupState.window.h = popup.offsetHeight;
			GM_setValue("popupState", config.popupState);
		});

		// Ensure popup stays attached to edge on window resize
		window.addEventListener('resize', updatePopupPosition);

		// --- Events ---
		// Attach keyboard shortcut handler
		document.addEventListener("keydown", function (event) {
			// Check if Alt+[configured key] is pressed using event.code for better compatibility
			if (event.altKey && event.code.toLowerCase() === `key${config.hotkey.toLowerCase()}`) {
				event.preventDefault();
				togglePopup();
			}
		});

		// Change insert button text based on selection state
		outputTextArea.onselectionchange = function (_) {
			if (outputTextArea.selectionStart !== outputTextArea.selectionEnd) {
				insertButton.textContent = "Insert Selection";
			} else {
				insertButton.textContent = "Insert";
			}
		};

		// Poll for question changes every 200ms to update UI state
		setInterval(() => {
			if (config.popupState.visible) {
				checkAndUpdateButtonStates();
			}
		}, 200);
	}

	function togglePopup() {
		if (!document.getElementById("ai-answer-popup")) {
			createPopupUI();
		}

		const popup = document.getElementById("ai-answer-popup");
		const isVisible = popup.classList.contains("visible");

		if (isVisible) {
			popup.classList.remove("visible");
			config.popupState.visible = false;
		} else {
			popup.classList.add("visible");
			config.popupState.visible = true;
		}
	}

	function getThemedColor(color) {
		if (config.theme === "light") return color; // No change for light theme

		let n = parseInt(color.slice(1), 16),
			r = n >> 16, g = n >> 8 & 255, b = n & 255,
			d = x => (x * 0.3 | 0);  // 30% brightness
		return "#" + ((1 << 24) | (d(r) << 16) | (d(g) << 8) | d(b)).toString(16).slice(1);
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
			themeToggle.textContent = "☀️";
			themeToggle.title = "Switch to light theme";
		} else {
			config.theme = "light";
			popup.classList.remove("dark");
			themeToggle.textContent = "🌙";
			themeToggle.title = "Switch to dark theme";
		}

		// Save the theme preference
		GM_setValue("theme", config.theme);

		// Update model button colors immediately
		const modelButtons = popup.querySelectorAll(".ai-model-button");
		models.forEach((model, index) => {
			if (modelButtons[index]) {
				modelButtons[index].style.backgroundColor = getThemedColor(model.color);
			}
		});
	}

	function toggleAutoRun(e) {
		const autoRunToggle = e.currentTarget;
		config.autoRun = !config.autoRun;
		GM_setValue("autoRun", config.autoRun);
		autoRunToggle.textContent = config.autoRun ? "⏸️" : "▶️";
		autoRunToggle.title = config.autoRun
			? "Disable auto-run (AI will not auto-answer on question change)"
			: "Enable auto-run (automatically generate an answer with the last used model when the question changes)";
	}

	function toggleSnapping() {
		const popup = document.getElementById("ai-answer-popup");
		if (!popup) return;
		const detachBtn = popup.querySelector("#ai-popup-detach");
		if (config.popupState.snapped === 0) {
			// Snap to whichever side is closer to the edge
			const rect = popup.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			config.popupState.snapped = (centerX < window.innerWidth / 2) ? 1 : 2; // 1=left, 2=right
		} else {
			config.popupState.snapped = 0;
		}
		GM_setValue("popupState", config.popupState);
		popup.updatePopupPosition();
		detachBtn.title = config.popupState.snapped === 0 ? "Attach to side" : "Detach (float & drag anywhere)";
		detachBtn.textContent = config.popupState.snapped === 0 ? "🗖" : "🗗";
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

	// Helper function to check for question change and reset buttons
	function checkAndUpdateButtonStates() {
		const currentQnElm = getQuestionElement();
		if (!currentQnElm) return;

		const newQnIdentifier = getQuestionIdentifier(currentQnElm);

		if (newQnIdentifier !== currentQnIdentifier) {
			// Update the tracker
			currentQnIdentifier = newQnIdentifier;

			// --- Update Button States ---
			const modelButtons = document.querySelectorAll('#ai-answer-popup .ai-model-button');
			modelButtons.forEach(button => {
				const modelName = button.getAttribute('data-model');
				const cacheKey = `gemini-cache-${modelName}-${newQnIdentifier}`;

				// Restore button state if it exists
				if (modelCache[cacheKey]?.state) {
					updateButtonState(button, modelCache[cacheKey].state, newQnIdentifier);
				} else {
					updateButtonState(button, 'idle');
				}
			});

			// clear the output text area and caption
			outputTextArea.value = ""; // Clear previous output
			const caption = document.getElementById("ai-caption");
			caption.textContent = "Response metadata will appear here";

			// --- Auto-run logic ---
			if (config.autoRun) {
				setTimeout(() => {
					// Only run if question is still the same after a short delay
					const checkQnElm = getQuestionElement();
					const checkQnId = checkQnElm ? getQuestionIdentifier(checkQnElm) : null;
					if (checkQnId === newQnIdentifier) {
						// Find the last used model button and simulate click
						const btn = document.querySelector(`.ai-model-button[data-model="${lastUsedModel.name}"]`);
						if (btn) handleGenerateClick({ currentTarget: btn }, false);
					}
				}, 700); // Short delay to ensure question is stable
			}
		}
	}

	function getQuestionIdentifier(element) {
		return hashCode(currentWebsite?.getQuestionIdentifier(element) || element.textContent);
	}

	function getQuestionItem(element) {
		if (!element) return "No question found";

		// If currentWebsite has a custom getQuestionItem function, use it
		if (currentWebsite && typeof currentWebsite.getQuestionItem === "function") {
			return currentWebsite.getQuestionItem(element);
		}

		// Extract HTML content only if its length is reasonable
		if (element.innerHTML.length < 15000) return element.innerHTML;
		return element.textContent;
	}

	// Helper function to build content parts for API, handling <img> tags as inline_data, else just text
	async function buildContentParts(questionItem) {
		let contentParts = [];
		let html = questionItem;
		let lastIndex = 0;
		const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

		let match;
		while ((match = imgRegex.exec(html)) !== null) {
			// Text before <img>
			if (match.index > lastIndex) {
				const before = html.slice(lastIndex, match.index);
				if (before.trim()) contentParts.push({ text: before });
			}
			const src = match[1];
			if (src.startsWith('data:')) {
				const [mime, data] = src.split(',');
				contentParts.push({ inline_data: { mime_type: mime.split(':')[1].split(';')[0], data } });
			} else {
				try {
					const blob = await GM_fetch(src).then(r => r.blob());
					const b64 = await blob.arrayBuffer().then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
					const mime = blob.type || 'image/*';
					contentParts.push({ inline_data: { mime_type: mime, data: b64 } });
				} catch {
					contentParts.push({ text: `[Image at ${src} could not be loaded]` });
				}
			}
			lastIndex = imgRegex.lastIndex;
		}
		// Remaining text after last <img>
		if (lastIndex < html.length) {
			const after = html.slice(lastIndex);
			if (after.trim()) contentParts.push({ text: after });
		}
		if (!contentParts.length) contentParts = [{ text: questionItem }];
		return contentParts;
	}

	async function handleInsertClick(e) {
		const btn = e.currentTarget;
		const originalBtn = btn.innerHTML;
		const text = outputTextArea.value.substring(outputTextArea.selectionStart, outputTextArea.selectionEnd) || outputTextArea.value;

		// Add a global style to force crosshair cursor everywhere
		const cursorStyleId = "ai-insert-crosshair-style";
		let cursorStyle = document.getElementById(cursorStyleId);
		if (!cursorStyle) {
			cursorStyle = document.createElement("style");
			cursorStyle.id = cursorStyleId;
			cursorStyle.textContent = `* { cursor: crosshair !important; }`;
			document.head.appendChild(cursorStyle);
		}

		btn.innerHTML = "Click a field to insert.";

		function cleanup() {
			// Remove the global crosshair cursor style
			if (cursorStyle && cursorStyle.parentNode) {
				cursorStyle.parentNode.removeChild(cursorStyle);
			}
			document.removeEventListener("click", onClick, true);
			btn.innerHTML = originalBtn; // Restore original button
		}

		async function onClick(ev) {
			if (document.getElementById("ai-answer-popup")?.contains(ev.target)) return;

			let focusedEl = document.activeElement;
			if (focusedEl.id == "ai-insert-button") {
				await new Promise(resolve => setTimeout(resolve, 500)); // Wait for any focus change
				focusedEl = document.activeElement; // Re-check focused element
			}
			if (!focusedEl) return;
			cleanup();

			// Check if it's an ACE editor (like leetcode or talentely)
			const aceContainer = focusedEl.closest('.ace_editor');
			if (aceContainer && (window.ace || ace)) {
				btn.innerHTML = `Inserting... This may take a few seconds.`;
				let editor = (window.ace || ace).edit(aceContainer);
				// workaround for some editors that block pasting
				text.split('').forEach(char => editor.insert(char));
			}
			// Try setting value directly if possible
			else if ("value" in focusedEl) {
				focusedEl.value += text;
				focusedEl.dispatchEvent(new Event('input', { bubbles: true })); // Trigger input event
			}
			// Otherwise, simulate key presses
			else {
				text.split('').forEach(async char => {
					btn.innerHTML = `Typing: ${char}`;
					focusedEl.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
					focusedEl.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
					focusedEl.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
					focusedEl.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
					await new Promise(r => setTimeout(r, 15 + Math.random() * 40)); // Simulate typing delay
				});
			}

			cleanup();
		}

		document.addEventListener("click", onClick, true);
	}

	async function handleGenerateClick(event, forceRetry = false) {
		const button = event.currentTarget;
		const modelName = button.getAttribute("data-model");
		const model = models.find(m => m.name === modelName);
		const caption = document.getElementById("ai-caption");

		lastUsedModel = model; // Track last used model for auto-run

		// --- Get Question Info ---
		const qElm = getQuestionElement();
		if (!qElm) {
			outputTextArea.value = "Error: Question not found on page. This site might not be supported yet.";
			stopTimer("Error");
			updateButtonState(button, 'error'); // Indicate error on button
			return;
		}
		let questionIdentifier = getQuestionIdentifier(qElm);
		let questionItem = getQuestionItem(qElm);
		const cacheKey = `gemini-cache-${modelName}-${questionIdentifier}`;

		// --- Prevent Re-clicking Same Question While Loading ---
		if (button.classList.contains('loading') && button.dataset.loadingIdentifier === questionIdentifier && !forceRetry) {
			console.log(`[AnswerIT!!] Still generating for ${modelName} and this question.`);
			return; // Already processing this specific question
		}

		// --- Cache Check (Bypass if forceRetry is true) ---
		if (!forceRetry && modelCache[cacheKey]?.state === 'success') {
			console.log(`[AnswerIT!!] Cache hit for ${modelName}.`);
			outputTextArea.value = modelCache[cacheKey].answer;
			caption.textContent = `Model: ${modelName} | Cached Response (original time: ${modelCache[cacheKey].time} ms)`;
			stopTimer("Loaded from cache");
			updateButtonState(button, modelCache[cacheKey].state, questionIdentifier); // Show success even for cache
			return;
		}

		// --- Reset UI and Start Loading State ---
		outputTextArea.value = ""; // Clear previous output
		caption.textContent = "Response metadata will appear here"; // Clear caption
		updateButtonState(button, 'loading', questionIdentifier);	// update ui immediately
		modelCache[cacheKey] = { state: 'loading' };
		startTimer(); // Start the main timer

		// --- Add Custom Prompt ---
		const customPromptArea = document.getElementById("ai-custom-prompt");
		if (customPromptArea && customPromptArea.value.trim()) {
			questionItem += `\n\n\nuser-prompt:[${customPromptArea.value.trim()}]`;
		}

		// --- API Key Check ---
		if (!apiKey) {
			apiKey = GM_getValue("geminiApiKey");
			if (!apiKey) {
				apiKey = getApiKey();
				if (!apiKey) {
					outputTextArea.value = "API Key is required to use the answer generator. Please follow the instructions to obtain one.";
					stopTimer("API Key Required");
					updateButtonState(button, 'error');
					return;
				}
				GM_setValue("geminiApiKey", apiKey);
			}
		}

		// --- API Call ---
		outputTextArea.value = `Generating response with ${modelName}...`;
		const startTime = Date.now();

		// Build content: handle <img> tags as inline_data, else just text
		const contentParts = await buildContentParts(questionItem);

		try {
			const response = await GM_fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					"system_instruction": {
						"parts": {
							"text": "You are an expert assistant helping with academic questions and coding problems. Analyze the provided content carefully and provide the most accurate answer.\nNote that the content can sometimes contain html that was directly extracted from the exam page so account that into consideration.\n\nContent Analysis:\n- If this is a multiple choice question, identify all options and select the correct one\n- If this is a coding question, provide complete, working, error-free code in the desired language\n- If this contains current code in the editor, build upon or fix that code as needed\n- If this is a theoretical or puzzle-like question, provide clear reasoning and explanation\n\nResponse Format:\n- For multiple choice: Provide reasoning, then clearly state \"Answer: [number] - [option text]\"\n- For coding: Provide the complete solution with brief explanation without any comments exactly in the format \"The Complete Code is:\n```[language]\n[Code]```\"\n- For other questions: Give concise but thorough explanations, then clearly state \"Short Answer: []\"\n- Format text clearly for textarea display (no markdown)\n- If the question is unclear or missing context, ask for specific clarification\n\nAlways prioritize accuracy over speed. Think through the problem step-by-step before providing your final answer."
						},
					},
					"contents": [{ "parts": contentParts }],
					generationConfig: model?.generationConfig || {},
				}),
			});

			const timeTaken = Date.now() - startTime;

			if (!response.ok) {
				let errorText = `API error for ${modelName}: ${response.status} ${response.statusText}\n\n`;
				let stopStatus = "API Error";
				try {
					const errorBody = await response.json();
					errorText += ` - ${errorBody?.error?.message || JSON.stringify(errorBody)}`;
					if (response.status === 429) {
						errorText = `Too many requests. You may have spammed the same model past its Quota. Please wait 60 seconds or try another model.`;
						stopStatus = "Rate limited";
					} else if (response.status === 400 && errorBody?.error?.message.includes("API key not valid")) {
						GM_deleteValue("geminiApiKey"); // Use deleteValue for clarity
						apiKey = ""; // Clear runtime key
						errorText = `API Key Error (400): Key rejected. Your stored API key has been cleared. Please provide a valid API key.`;
						stopStatus = "Invalid API Key";
					}
				} catch (e) { /* Ignore JSON parsing error if body is not JSON */ }

				console.error(errorText);
				outputTextArea.value = errorText;
				stopTimer(stopStatus);
				updateButtonState(button, 'error');
				return;
			}

			const data = await response.json();
			if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
				const answerText = data.candidates[0].content.parts[0].text;
				modelCache[cacheKey] = { answer: answerText, time: timeTaken, state: 'success' }; // Update cache
				outputTextArea.value = answerText;
				caption.textContent = `Model: ${modelName} | Response (${timeTaken} ms)`;
				updateButtonState(button, 'success', questionIdentifier);
				stopTimer("Response received");
			} else {
				const warnText = `Unexpected API response format for ${modelName}: Check console for details.`;
				console.warn(warnText, data);
				outputTextArea.value = warnText;
				modelCache[cacheKey] = { answer: warnText, time: 0, state: 'error' };
				updateButtonState(button, 'error');
				stopTimer("Unexpected response");
			}
		} catch (error) {
			const errorMsg = `Network/Fetch Error for ${modelName}: ${error.message}`;
			console.error(errorMsg, error);
			outputTextArea.value = errorMsg;
			modelCache[cacheKey] = { answer: errorMsg, time: 0, state: 'error' };
			updateButtonState(button, 'error');
			stopTimer("Network Error");
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

	// Helper function to manage button visual states
	function updateButtonState(button, state, identifier = null) {
		const statusContainer = button.querySelector('.ai-model-status-container');
		const progressSpinner = statusContainer?.querySelector('.ai-model-progress');
		const statusIcon = statusContainer?.querySelector('.ai-model-status-icon');

		// Clear previous states
		button.classList.remove('loading', 'success', 'error');
		button.disabled = false;
		delete button.dataset.loadingIdentifier;
		delete button.dataset.successIdentifier;
		if (progressSpinner) progressSpinner.style.display = 'none';
		if (statusIcon) statusIcon.style.display = 'none';

		switch (state) {
			case 'loading':
				button.classList.add('loading');
				button.disabled = true;
				if (identifier) button.dataset.loadingIdentifier = identifier;
				if (progressSpinner) progressSpinner.style.display = 'block';
				break;
			case 'success':
				button.classList.add('success');
				if (identifier) button.dataset.successIdentifier = identifier;
				if (statusIcon) {
					statusIcon.style.display = 'flex'; // Use flex to align center
					// Ensure the identifier is attached for retry logic if needed elsewhere
					statusIcon.dataset.questionIdentifier = identifier;
				}
				break;
			case 'error':
				button.classList.add('error'); // Add error class for potential styling
				// Optionally display an error icon here
				break;
			case 'idle':
				button.classList.remove('loading', 'success', 'error');
				button.disabled = false;
				break;
			default: break;
		}
	}


	// --- Event Listeners ---

	// Register Tampermonkey menu commands
	GM_registerMenuCommand("Toggle AI Popup (Alt+" + config.hotkey.toUpperCase() + ")", togglePopup);
	GM_registerMenuCommand("Change API Key", changeApiKey);
	GM_registerMenuCommand("Clear Response Cache", clearCache);
	GM_registerMenuCommand("Change Hotkey", changeHotkey);
	GM_registerMenuCommand("Detach/Attach Popup", () => document.getElementById("ai-popup-detach").click());

	// --- Initialization ---
	function initialize() {
		// Run detection bypass
		setupDetectionBypass();

		// Restore popupState separately for better intellisense and config clarity.
		config.popupState = { ...GM_getValue("popupState", config.popupState), visible: false };

		// Default to the Flash Lite model
		lastUsedModel = models[3];

		// Detect current website
		currentWebsite = detectCurrentWebsite();

		// Only create popup on websites with questions when opened
		document.addEventListener("DOMContentLoaded", function () {
			if (currentWebsite) {
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
