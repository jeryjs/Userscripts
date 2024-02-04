// ==UserScript==
// @name        AniCHAT - Discuss Anime Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.2.0
// @description Get discussions from popular sites like MAL and AL for the anime you are watching right below your episode
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @match       https://animepahe.*/*
// @match       https://animepahe.com/*/
// @match       https://kayoanime.*/*
// @match       https://kayoanime.com/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==

/**************************
 * CONSTANTS
 ***************************/
// seconds to wait before loading the discussions (to avoid spamming the service)
const TIMEOUT = 30000; // in milliseconds
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
	},
	{
		name: "animepahe",
		url: ["animepahe.ru", "animepahe.com"],
		chatArea: ".theatre",
		getAnimeTitle: () => document.querySelector(".theatre-info > h1 > a").textContent.split(' - ')[0],
		getEpTitle: () => document.querySelector(".theatre-info > h1 > a").textContent.split(' - ')[0],
		getEpNum: () =>  document.querySelector(".theatre-info > h1 > a").textContent.split(' - ')[1],
	},
	{
		name: "kayoanime",
		url: ["kayoanime.com"],
		chatArea: "#the-post",
		getAnimeTitle: () => document.querySelector("h1.entry-title").textContent.split(/Episode \d+ English.+/)[0].trim(),
		getEpTitle: () => document.querySelector(".toggle-head").textContent.trim(),
		getEpNum: () => document.querySelector("h1.entry-title").textContent.split(/Episode (\d+) English.+/)[1],
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
			let url = PROXYURL + `https://api.myanimelist.net/v2/anime?q=${animeTitle}&limit=1`;
			let response = await axios.get(url, {headers: {"X-MAL-CLIENT-ID": this.clientId, "x-cors-api-key": this.proxyKey}});
			const anime = response.data.data[0].node;

			// get the discussion url from the anime
			url = PROXYURL + `https://api.jikan.moe/v4/anime/${anime.id}/forum`;
			response = await axios.get(url, {headers: {"x-cors-api-key": this.proxyKey}});
			const topic = response.data.data.find(it => it.title.includes(`Episode ${epNum} Discussion`));

			// get the forum page
			url = PROXYURL + `https://api.myanimelist.net/v2/forum/topic/${topic.mal_id}?limit=100`;
			response = await axios.get(url, {headers: {"X-MAL-CLIENT-ID": this.clientId, "x-cors-api-key": this.proxyKey}});
			const data = response.data.data;

			let chats = [];
			data.posts.forEach((post) => {
				const user = post.created_by.name;
				const userLink = "https://myanimelist.net/profile/" + user;
				const avatar = post.created_by.forum_avator;
				const msg = bbcodeToHtml(post.body);
				const timestamp = new Date(post.created_at).getTime();
				chats.push(new Chat(user, userLink, avatar, msg, timestamp));
			});

			const discussion = new Discussion(topic.textContent, topic.href, chats);
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
		return GM_getValue("userSettings", new UserSettings());
	}
}

// Class to hold each row of a discussion
class Chat {
	constructor(user, userLink, avatar, msg, timestamp) {
		this.user = user;
		this.userLink = userLink;
		this.avatar = avatar;
		this.msg = msg;
		this.timestamp = timestamp;
	}

	getRelativeTime() {
		const now = new Date().getTime();
		const diff = now - this.timestamp;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const weeks = Math.floor(days / 7);
		const months = Math.floor(days / 30);
		const years = Math.floor(days / 365);

		if (years > 0) {
			return `${years} ${years === 1 ? "year" : "years"} ago`;
		} else if (months > 0) {
			return `${months} ${months === 1 ? "month" : "months"} ago`;
		} else if (weeks > 0) {
			return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
		} else if (days > 0) {
			return `${days} ${days === 1 ? "day" : "days"} ago`;
		} else if (hours > 0) {
			return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
		} else if (minutes > 0) {
			return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
		} else {
			return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
		}
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
	discussionTitleText.title = "Click to view the original discussion";
	discussionTitleText.target = "_blank";
	discussionTitle.appendChild(discussionTitleText);

	const serviceIcon = document.createElement("img");
	serviceIcon.className = "service-icon";
	serviceIcon.title = "Powered by " + service.name;
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

	const userAvatar = document.createElement("div");
	userAvatar.className = "user-avatar";
	userAvatar.innerHTML = `<img src="${chat.avatar}" alt="${chat.user}">`;

	const userMsg = document.createElement("div");
	userMsg.className = "user-msg";

	const name = document.createElement("span");
	name.className = "chat-name";
	name.textContent = chat.user;

	const time = document.createElement("span");
	time.className = "chat-time";
	time.textContent = chat.getRelativeTime();
	time.title = new Date(chat.timestamp).toLocaleString(undefined, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		hour12: true,
	});

	const msg = document.createElement("span");
	msg.className = "chat-msg";
	msg.innerHTML = chat.msg;

	userMsg.appendChild(name);
	userMsg.appendChild(time);
	userMsg.appendChild(msg);
	chatRow.appendChild(userAvatar);
	chatRow.appendChild(userMsg);

	return chatRow;
}

// Countdown to show before load the discussions
function setLoadingTimeout() {
	let countdown = TIMEOUT;

	const loadingArea = document.createElement("div");
	loadingArea.className = "loading-discussion";

	const loadingElement = document.createElement("div");
	loadingElement.innerHTML = `<img src="https://flyclipart.com/thumb2/explosion-gif-transparent-transparent-gif-sticker-741584.png" style="width: 150px; margin-right: 10px;">`;
	loadingElement.style.cssText = `display: flex; align-items: center;`;

	const progressBar = document.createElement("div");
	progressBar.className = "progress-bar";
	progressBar.style.cssText = `width: "100%"; height: 10px; background-color: #ccc; position: relative;`;

	const progressFill = document.createElement("div");
	progressFill.className = "progress-fill";
	progressFill.style.cssText = `width: 0%; height: 100%; background-color: #4CAF50; position: absolute; top: 0; left: 0;`;

	const message = document.createElement("span");
	message.textContent = `This ${
		TIMEOUT / 1000
	} secs timeout is set to reduce the load on the service and you can configure the TIMEOUT by editing the script (line 21)`;
	message.style.cssText = "font-size: 14px; color: darkgrey;";

	progressBar.appendChild(progressFill);
	loadingElement.appendChild(message);
	loadingArea.appendChild(loadingElement);
	loadingArea.appendChild(progressBar);

	console.log("Countdown started: " + countdown + "ms");

	const countdownInterval = setInterval(() => {
		countdown -= 100;
		const progressWidth = 100 - (countdown / TIMEOUT) * 100;
		progressFill.style.width = `${progressWidth}%`;
		if (countdown == 0) {
			message.remove();
			loadingElement.remove();
			clearInterval(countdownInterval);
		}
	}, 100);

	return loadingArea;
}

// Add CSS styles to the page
const styles = `
	.discussion-area {
		border-radius: 10px;
		padding: 10px;
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
		padding: 10px 0;
		border-top: 1px solid #eee;
	}

	.user-avatar {
		width: 55px;
		height: 55px;
		margin-right: 10px;
	}
	
	.user-avatar > img {
		width: 55px;
		height: 55px;
		object-fit: cover;
		border-radius: 15px;
	}

	.user-msg {
		display: flex;
    	flex-direction: column;
	}

	.chat-name {
		font-weight: bold;
		font-size: 15px;
	}

	.chat-time {
		font-size: 12px;
		font-weight: bold;
		padding-top: 5px;
		color: darkgrey;
	}

	.chat-msg {
		padding: 10px 0;
	}

	.chat-msg img {
		max-width: 100%;
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

// Convert BBCode to HTML
function bbcodeToHtml(bbcode) {
	// Define the BBCode to HTML mappings
	const mappings = [
		{ bbcode: /\[b\](.*?)\[\/b\]/g, html: "<strong>$1</strong>" },
		{ bbcode: /\[i\](.*?)\[\/i\]/g, html: "<em>$1</em>" },
		{ bbcode: /\[u\](.*?)\[\/u\]/g, html: "<u>$1</u>" },
		{ bbcode: /\[s\](.*?)\[\/s\]/g, html: "<s>$1</s>" },
		{ bbcode: /\[url=(.*?)\](.*?)\[\/url\]/g, html: '<a href="$1">$2</a>' },
		{ bbcode: /\[img.*?\](.*?)\[\/img\]/g, html: '<img src="$1" alt="">' },
		{ bbcode: /\[code\]([\s\S]*?)\[\/code\]/g, html: "<code>$1</code>" },
		{ bbcode: /\[quote\]([\s\S]*?)\[\/quote\]/g, html: '<blockquote class="quote" style="font-size: 90%; border: 1px solid; padding: 5px;">$1</blockquote>' },
		{ bbcode: /\[quote=(.*?)\s*(message=\d+)?\]([\s\S]*?)\[\/quote\]/g, html: '<blockquote class="quote" style="font-size: 90%; border: 1px solid; padding: 5px;"><h4>$1 Said:</h4>$3</blockquote>' },
		{ bbcode: /\[color=(.*?)\](.*?)\[\/color\]/g, html: '<span style="color: $1;">$2</span>' },
		{ bbcode: /\[size=(.*?)\](.*?)\[\/size\]/g, html: '<span style="font-size: $1;">$2</span>' },
		{ bbcode: /\[center\](.*?)\[\/center\]/g, html: '<div style="text-align: center;">$1</div>' },
		{ bbcode: /\[list\](.*?)\[\/list\]/g, html: "<ul>$1</ul>" },
		{ bbcode: /\[list=(.*?)\](.*?)\[\/list\]/g, html: '<ol start="$1">$2</ol>' },
		{ bbcode: /\[\*\](.*?)\[\/\*\]/g, html: "<li>$1</li>" },
		{ bbcode: /\[spoiler\](.*?)\[\/spoiler\]/g, html: '<div class="spoiler"><input type="button" onclick="this.nextSibling.style.display=\'inline-block\';this.style.display=\'none\';" value="Show spoiler" style="display: inline-block;"><span class="spoiler_content" style="display: none;"><input type="button" onclick="this.parentNode.style.display=\'none\';this.parentNode.parentNode.childNodes[0].style.display=\'inline-block\';" value="Hide spoiler">$1</span></div>' },
		{ bbcode: /\[spoiler=(.*?)\](.*?)\[\/spoiler\]/g, html: '<div class="spoiler"><input type="button" onclick="this.nextSibling.style.display=\'inline-block\';this.style.display=\'none\';" value="Show $1" style="display: inline-block;"><span class="spoiler_content" style="display: none;"><input type="button" onclick="this.parentNode.style.display=\'none\';this.parentNode.parentNode.childNodes[0].style.display=\'inline-block\';" value="Hide $1">$2</span></div>' },
	];
	// Replace each BBCode with its corresponding HTML
	let html = bbcode;
	for (const mapping of mappings) {
		html = html.replace(mapping.bbcode, mapping.html);
	}

	return html;
}

// Get the current website based on the URL
function getCurrentSite() {
	const currentUrl = window.location.href.toLowerCase();
	return animeSites.find((website) => website.url.some((site) => currentUrl.includes(site)));
}

// Run the script
async function run() {
	const discussionArea = generateDiscussionArea();
	document.querySelector(site.chatArea).appendChild(discussionArea);

	const styleElement = document.createElement("style");
	styleElement.textContent = styles;
	discussionArea.append(styleElement);

	discussionArea.appendChild(setLoadingTimeout());

	setTimeout(async () => {
		try {
			const discussion = await service.getDiscussion(site.getAnimeTitle(), site.getEpNum());
			console.log(discussion);
			discussion.chats.forEach((chat) => {
				discussionArea.querySelector("ul").appendChild(buildChatRow(chat));
			});

			discussionArea.querySelector(".discussion-title a").href = discussion.link;
			discussionArea.querySelector(".discussion-title a").textContent = discussion.title;
		} catch (error) {
			console.error(`${error.code} : ${error.message}\n\n${error.stack}`);
			const errorElement = document.createElement("span");
			errorElement.className = "error-message";
			errorElement.textContent = `AniCHAT:\n${error.code} : ${error.message}\n\n${error.stack}\n\nCheck the console logs for more detail.`;
			discussionArea.appendChild(errorElement);
		}
	}, TIMEOUT);
}

run();
