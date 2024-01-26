// ==UserScript==
// @name        AniCHAT - Discuss Anime Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     0.1.8
// @description Get discussions from popular sites like MAL and AL for the anime you are watching right below your episode
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @require     https://unpkg.com/axios/dist/axios.min.js
// ==/UserScript==

/**************************
 * CONSTANTS
 ***************************/
const userSettingsKey = "userSettings";
const proxyUrl = "https://cors-anywhere.herokuapp.com/"; //"https://test.cors.workers.dev/?"; //'https://corsproxy.io/?';

/***************************************************************
 * ANIME SITES
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
		apiBaseUrl: "https://api.myanimelist.net/v2/forum",
		clientId: "cfdd50f8037e9e8cf489992df497c761",
		async getDiscussion(animeTitle, epNum) {
			// get the discussion
			let url = proxyUrl + `https://api.myanimelist.net/v2/forum/topics`;
			let response = await axios.get(url, {
				params: {
					q: `${animeTitle} Episode ${epNum} Discussion`,
					limit: 1,
				},
				headers: {
					"X-MAL-CLIENT-ID": "cfdd50f8037e9e8cf489992df497c761",
				},
			});
			const topic = response.data.data[0];

			// get the chats from the discussion
			url = proxyUrl + `https://api.myanimelist.net/v2/forum/topic/${topic.id}`;
			response = await axios.get(url, {
				headers: {
					"X-MAL-CLIENT-ID": "cfdd50f8037e9e8cf489992df497c761",
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

			const discussion = new Discussion(topic.id, 'https://myanimelist.net/forum/?topicid='+topic.id, chats);
			return discussion;
		},
	},
];

/***************************************************************
 * Classes for handling various data like settings, lists,
 * services and websites
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

// Chat class
class Chat {
	constructor(user, userLink, avatar, msg) {
		this.user = user;
		this.userLink = userLink;
		this.avatar = avatar;
		this.msg = msg;
	}
}

class Discussion {
	constructor(id, link, chats) {
		this.id = id;
		this.link = link;
		this.chats = chats;
	}
}

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
GM_registerMenuCommand("Show Options", showOptions);

/***************************************************************
 * Functions for working of script
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

// Change MAL username
function changeUsername() {
	const newUsername = prompt(`Enter your ${service.name} username:`);
	if (newUsername) {
		userSettings.usernames[service.name] = newUsername;
		GM_setValue(userSettingsKey, userSettings);
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

/***************************************************************
 * Functions for UI elements
 ***************************************************************/
// generate the discussion area
function generateDiscussionArea() {
	const discussionArea = document.createElement("div");
	discussionArea.className = "discussion-area";
	discussionArea.style.cssText = `border-radius: 10px; padding: 20px;`;

	const discussionTitle = document.createElement("h3");
	discussionTitle.className = "discussion-title";
	discussionTitle.textContent = `${site.getAnimeTitle()} Episode ${site.getEpNum()} Discussion`;
	discussionTitle.style.cssText = `display: flex; justify-content: space-between; margin-bottom: 20px;`;

	const serviceIcon = document.createElement("img");
	serviceIcon.className = "service-icon";
	serviceIcon.src = service.icon;
	serviceIcon.style.cssText = `height: 20px;`;
	discussionTitle.appendChild(serviceIcon);

	const discussionList = document.createElement("ul");
	discussionList.className = "discussion-list";

	discussionArea.appendChild(discussionTitle);
	discussionArea.appendChild(discussionList);

	return discussionArea;
}

// build a row for a single chat with the avatar in the left (with the username below it) and the message in the right
function buildChatRow(chat) {
	const chatRow = document.createElement("li");
	chatRow.className = "chat-row";
	chatRow.style.cssText = `display: flex; align-items: center; padding: 10px; border-top: 1px solid #eee;`;

	const userArea = document.createElement("div");
	userArea.className = "chat-user";
	username.href = chat.userLink;
	userArea.style.cssText = `width: 100px; display: flex; flex-direction: column; align-items: center; margin-right: 15px;`;

	const avatar = document.createElement("img");
	avatar.className = "user-avatar";
	avatar.src = chat.avatar;
	avatar.style.cssText = `width: 100px; height: 100px; object-fit: cover; border-radius: 25px;`;

	const username = document.createElement("span");
	username.className = "user-name";
	username.textContent = chat.user;
	username.style.cssText = `font-weight: bold; font-size: 14px; overflow: hidden; text-overflow: ellipsis; width: 100px; text-align: center;`;

	const msg = document.createElement("span");
	msg.className = "chat-msg";
	msg.innerHTML = chat.msg;
	msg.style.cssText = `font-size: 14px; padding-left: 10px; border-left: 1px solid #ccf;`;

	userArea.appendChild(avatar);
	userArea.appendChild(username);
	chatRow.appendChild(userArea);
	chatRow.appendChild(msg);

	return chatRow;
}

// Run the script
async function run() {
	const discussionArea = generateDiscussionArea();
	document.querySelector(site.chatArea).prepend(discussionArea);

	const loadingElement = document.createElement("img");
	loadingElement.src = "https://flyclipart.com/thumb2/explosion-gif-transparent-transparent-gif-sticker-741584.png";
	loadingElement.style.cssText = `width: 150px; margin-right: 30px;`;
	discussionArea.appendChild(loadingElement);

	const discussion = await service.getDiscussion(site.getAnimeTitle(), site.getEpNum());
	discussion.forEach((chat) => {
		discussionArea.querySelector("ul").appendChild(buildChatRow(chat));
	});

	discussionArea.querySelector('.discussion-title').href = discussion.link;
	loadingElement.remove();
}

run();
