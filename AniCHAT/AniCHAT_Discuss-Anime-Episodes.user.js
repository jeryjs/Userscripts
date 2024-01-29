// ==UserScript==
// @name        AniCHAT - Discuss Anime Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.1.0
// @description Get discussions from popular sites like MAL and AL for the anime you are watching right below your episode
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==

/**************************
 * CONSTANTS
 ***************************/
// key to store the user settings in the GM storage
const userSettingsKey = "userSettings";
// seconds to wait before loading the discussions (to avoid spamming the service)
const TIMEOUT = 30000;
// proxy to bypass the cors restriction on services like MAL
const PROXYURL = "https://proxy.cors.sh/"; //"https://test.cors.workers.dev/?"; //'https://corsproxy.io/?';

/***************************************************************
 * ANIME SITES & SERVICES
 ***************************************************************/
const animeSites = [
	{
		name: "yugenanime",
		url: ["yugenanime.tv"],
		chatArea: ".box.m-10-t.m-25-b.p-15",
		getAnimeTitle: () => document.querySelector(".ani-info-ep a > h1").textContent,
		getEpTitle: () => document.querySelector("h1.text-semi-bold.m-5-b").textContent,
		getEpNum: () => window.location.href.split("/")[6],
		timeout: 0,
	},
];

const services = [
	{
		name: "MyAnimeList",
		icon: "https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ",
		url: "https://myanimelist.net/",
		clientId: "dbe5cec5a2f33fdda148a6014384b984",
		proxyKey: "temp_2ed7d641dd52613591687200e7f7958b",
		async getDiscussion(animeTitle, epNum) {
			// get the discussion
			let url = PROXYURL + `https://api.myanimelist.net/v2/forum/topics`;
			let query = `${animeTitle} Episode ${epNum} Discussion`;
			let response = await axios.get(url, {
				params: {
					q: query,
					limit: 15,
				},
				headers: {
					"X-MAL-CLIENT-ID": this.clientId,
					"x-cors-api-key": this.proxyKey,
				},
			});
			const topic = response.data.data.find((topic) => topic.title.toLowerCase().includes(animeTitle.toLowerCase()) && topic.title.toLowerCase().includes(epNum.toLowerCase()));
			
			// 1 secound pause to avoid being rate-limited
			await new Promise(resolve => setTimeout(resolve, 1000));

			// get the chats from the discussion
			url = PROXYURL + `https://api.myanimelist.net/v2/forum/topic/${topic.id}`;
			response = await axios.get(url, {
				headers: {
					"X-MAL-CLIENT-ID": this.clientId,
					"x-cors-api-key": this.proxyKey,
				},
			});

			const data = response.data.data;
			let chats = [];
			data.posts.forEach((post) => {
				const user = post.created_by.name;
				const userLink = "https://myanimelist.net/profile/" + user;
				const avatar = post.created_by.forum_avator;
				const msg = post.body;
				chats.push(new Chat(user, userLink, avatar, msg));
			});

			const discussion = new Discussion(topic.title, "https://myanimelist.net/forum/?topicid=" + topic.id, chats);
			return discussion;
		},
	},
];

/***************************************************************
 * Classes for handling various data like settings & discussions
 ***************************************************************/
// User settings
class UserSettings {
	constructor(usernames = {}) {
		this.usernames = usernames;
	}
	static load() {
		return GM_getValue(userSettingsKey, new UserSettings());
	}
}

// Class to hold each row of a discussion
class Chat {
	constructor(user, userLink, avatar, msg) {
		this.user = user;
		this.userLink = userLink;
		this.avatar = avatar;
		this.msg = msg;
	}
}

// Class to hold the complete discussions
class Discussion {
	constructor(title, link, chats) {
		this.title = title;
		this.link = link;
		this.chats = chats;
	}
}

/***************************************************************
 * The UI elements
 ***************************************************************/
// generate the discussion area
function generateDiscussionArea() {
	const discussionArea = document.createElement("div");
	discussionArea.className = "discussion-area";

	const discussionTitle = document.createElement("h3");
	discussionTitle.className = "discussion-title";

	const discussionTitleText = document.createElement("a");
	discussionTitleText.textContent = `${site.getAnimeTitle()} Episode ${site.getEpNum()} Discussion`;
	discussionTitleText.title = 'Click to view the original discussion';
	discussionTitleText.target = "_blank";
	discussionTitle.appendChild(discussionTitleText);

	const serviceIcon = document.createElement("img");
	serviceIcon.className = "service-icon";
	serviceIcon.title = 'Powered by ' + service.name
	serviceIcon.src = service.icon;
	discussionTitle.appendChild(serviceIcon);

	const discussionList = document.createElement("ul");
	discussionList.className = "discussion-list";

	discussionArea.appendChild(discussionTitle);
	discussionArea.appendChild(discussionList);

	return discussionArea;
}

// build a row for a single chat in the discussion
function buildChatRow(chat) {
	const chatRow = document.createElement("li");
	chatRow.className = "chat-row";

	const userArea = document.createElement("div");
	userArea.className = "chat-user";
	userArea.href = chat.userLink;

	const avatar = document.createElement("img");
	avatar.className = "user-avatar";
	avatar.src = chat.avatar;

	const username = document.createElement("span");
	username.className = "user-name";
	username.textContent = chat.user;

	const msg = document.createElement("span");
	msg.className = "chat-msg";
	msg.innerHTML = bbcodeToHtml(chat.msg);

	userArea.appendChild(avatar);
	userArea.appendChild(username);
	chatRow.appendChild(userArea);
	chatRow.appendChild(msg);

	return chatRow;
}

// Countdown to show before load the discussions
function generateTimeoutProgressBar() {
	let countdown = TIMEOUT;
	const progressBar = document.createElement("div");
	progressBar.className = "progress-bar";
	progressBar.style.width = "100%";
	progressBar.style.height = "10px";
	progressBar.style.backgroundColor = "#ccc";
	progressBar.style.position = "relative";
	
	const progressFill = document.createElement("div");
	progressFill.className = "progress-fill";
	progressFill.style.width = "0%";
	progressFill.style.height = "100%";
	progressFill.style.backgroundColor = "#4CAF50";
	progressFill.style.position = "absolute";
	progressFill.style.top = "0";
	progressFill.style.left = "0";
	
	progressBar.appendChild(progressFill);
	// document.querySelector(site.chatArea).appendChild(progressBar);
	console.log("Countdown started: " + countdown + "ms");
	
	const countdownInterval = setInterval(() => {
		countdown-=100;
		const progressWidth = 100 - (countdown / TIMEOUT) * 100;
		progressFill.style.width = `${progressWidth}%`;
		if (countdown == 0) {
			clearInterval(countdownInterval);
		}
	}, 100);
	return progressBar;
}

// Add CSS styles to the page
const styles = `
	.discussion-area {
		border-radius: 10px;
		padding: 20px;
	}

	.discussion-title {
		display: flex;
		justify-content: space-between;
		margin-bottom: 20px;
	}

	.service-icon {
		height: 20px;
	}

	.chat-row {
		display: flex;
		align-items: center;
		padding: 10px;
		border-top: 1px solid #eee;
	}

	.chat-user {
		width: 90px;
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-right: 15px;
	}

	.user-avatar {
		width: 90px;
		height: 90px;
		object-fit: cover;
		border-radius: 25px;
	}

	.user-name {
		font-weight: bold;
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 90px;
		text-align: center;
		padding-top: 10px;
	}

	.chat-msg {
		font-size: 14px;
		padding: 10px;
		border-left: 1px solid #ccf;
	}

	.error-message {
		color: red;
		white-space: pre-wrap;
	}
`;

/***************************************************************
 * Initialize all data and setup menu commands
 ***************************************************************/
// User settings
let userSettings = UserSettings.load();

// Site instance
let site = getCurrentSite();

// Service instance
let service = services[0];
chooseService(parseInt(GM_getValue("service", 1)));

// Register menu commands
// GM_registerMenuCommand("Show Options", showOptions);

/***************************************************************
 * Functions for working of the script
 ***************************************************************/
// Show menu options as a prompt
function showOptions() {
	let options = {
		"Choose Service": chooseService,
	};
	let opt = prompt(
		`${GM_info.script.name}\n\nChoose an option:\n${Object.keys(options)
			.map((key, i) => `${i + 1}. ${key}`)
			.join("\n")}`,
		"1"
	);
	if (opt !== null) {
		let index = parseInt(opt) - 1;
		let selectedOption = Object.values(options)[index];
		selectedOption();
	}
}

// Prompt the user to choose a service
function chooseService(ch) {
	let choice = typeof ch == "number" ? ch : parseInt(GM_getValue("service", 1));

	if (typeof ch !== "number") {
		const msg = `${GM_info.script.name}\n\nChoose a service:\n${services.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}`;
		choice = prompt(msg, choice);
	}
	if (choice == null) {
		return;
	} else choice = parseInt(choice);
	let newService = services[choice - 1];

	if (!newService) {
		console.log("Invalid choice. Switch to a different service for now.");
		return chooseService(parseInt(GM_getValue("service", 1)));
	} else service = newService;

	GM_setValue("service", choice);

	if (typeof ch !== "number") {
		GM_notification(`Switched to ${service.name} service.`, GM_info.script.name, service.icon);
	}

	console.log(`Switched to ${service.name} service.`);
	return service;
}

// Get the current website based on the URL
function getCurrentSite() {
	const currentUrl = window.location.href.toLowerCase();
	return animeSites.find((website) => website.url.some((site) => currentUrl.includes(site)));
}

// Convert BBCode to HTML
function bbcodeToHtml(bbcode) {
	// Define the BBCode to HTML mappings
	const mappings = [
		{ bbcode: /\[b\](.*?)\[\/b\]/g, html: '<strong>$1</strong>' },
		{ bbcode: /\[i\](.*?)\[\/i\]/g, html: '<em>$1</em>' },
		{ bbcode: /\[u\](.*?)\[\/u\]/g, html: '<u>$1</u>' },
		{ bbcode: /\[s\](.*?)\[\/s\]/g, html: '<s>$1</s>' },
		{ bbcode: /\[url=(.*?)\](.*?)\[\/url\]/g, html: '<a href="$1">$2</a>' },
		{ bbcode: /\[img\](.*?)\[\/img\]/g, html: '<img src="$1" alt="">' },
		{ bbcode: /\[code\](.*?)\[\/code\]/g, html: '<code>$1</code>' },
		{ bbcode: /\[quote\](.*?)\[\/quote\]/g, html: '<blockquote>$1</blockquote>' },
		{ bbcode: /\[color=(.*?)\](.*?)\[\/color\]/g, html: '<span style="color: $1;">$2</span>' },
		{ bbcode: /\[size=(.*?)\](.*?)\[\/size\]/g, html: '<span style="font-size: $1;">$2</span>' },
		{ bbcode: /\[center\](.*?)\[\/center\]/g, html: '<div style="text-align: center;">$1</div>' },
		{ bbcode: /\[list\](.*?)\[\/list\]/g, html: '<ul>$1</ul>' },
		{ bbcode: /\[list=(.*?)\](.*?)\[\/list\]/g, html: '<ol start="$1">$2</ol>' },
		{ bbcode: /\[\*\](.*?)\[\/\*\]/g, html: '<li>$1</li>' },
	];
	// Replace each BBCode with its corresponding HTML
	let html = bbcode;
	for (const mapping of mappings) {
		html = html.replace(mapping.bbcode, mapping.html);
	}

	return html;
}

// Run the script
async function run() {
	const discussionArea = generateDiscussionArea();
	document.querySelector(site.chatArea).appendChild(discussionArea);

	const styleElement = document.createElement("style");
	styleElement.textContent = styles;
	discussionArea.append(styleElement);

	const loadingElement = document.createElement("img");
	loadingElement.src = "https://flyclipart.com/thumb2/explosion-gif-transparent-transparent-gif-sticker-741584.png";
	loadingElement.style.cssText = `width: 150px; margin-right: 30px;`;
	discussionArea.appendChild(loadingElement);
	discussionArea.appendChild(generateTimeoutProgressBar());

	try {
		setTimeout(async () => {
			const discussion = await service.getDiscussion(site.getAnimeTitle(), site.getEpNum());
			console.log(discussion);
			discussion.chats.forEach((chat) => {
				discussionArea.querySelector("ul").appendChild(buildChatRow(chat));
			});

			discussionArea.querySelector(".discussion-title a").href = discussion.link;
			discussionArea.querySelector(".discussion-title a").textContent = discussion.title;
			loadingElement.remove();
		}, TIMEOUT);
	} catch (error) {
		console.error(`${error.code} : ${error.message}`);
		const errorElement = document.createElement("span");
		errorElement.className = "error-message";
		errorElement.textContent = `AniCHAT:\n${error.code} : ${error.message}\nCheck the console logs for more detail.`;
		discussionArea.appendChild(errorElement);
	}
}

run();
