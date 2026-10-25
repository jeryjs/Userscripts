// ==UserScript==
// @name        AniCHAT - Discuss Anime Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     2.11.0
// @description Get discussions from popular sites like MAL and Reddit for the anime you are watching right below your episode
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://anitaku.tld/*
// @match       https://anitaku.io/*
// @match       https://gogoanime.tld/*
// @match       https://gogoanime3.tld/*
// @match       https://animepahe.tld/*/*
// @match       https://animepahe.pw/*/*
// @match       https://aniwave.tld/watch/*
// @match       https://aniwave.si/watch/*
// @match       https://hianime.tld/watch/*
// @match       https://hianimez.org/*
// @match       https://hianimes.re/*
// @match       https://hianimetv.si/*
// @match       https://hianime.ec/*
// @match       https://aniwatch.ch/*
// @match       https://kayoanime.com/*
// @match       https://kaas.tld/*/*
// @match       https://kaa.lt/*
// @match       https://www.kaa.lt/*
// @match       https://*.kickassanime.tld/*/*
// @match       https://anix.tld/*/*/*
// @match       https://anix.vc/*/*/*
// @match       https://animesuge.tld/anime/*
// @match       https://animesuge.re/anime/*
// @match       https://animesuge.cz/anime/*
// @match       https://anisuge.tv/anime/*
// @match       https://www.miruro.tv/*
// @match       https://www.miruro.to/*
// @match       https://www.miruro.cx/*
// @match       https://www.miruro.bz/*
// @match       https://www.miruro.pw/*
// @match       https://www.miruro.ws/*
// @match       https://miruro.tv/*
// @match       https://miruro.to/*
// @match       https://miruro.cx/*
// @match       https://miruro.bz/*
// @match       https://miruro.pw/*
// @match       https://miruro.ws/*
// @match       https://animekai.tld/watch/*
// @match       https://animekaitv.to/watch/*
// @match       https://reanime.tld/*
// @match       https://reanime.to/*
// @match       https://reanime.cz/*
// @match       https://otaku-streamers.com/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @grant       GM.xmlHttpRequest
//				Using GM_fetch for bypassing CORS
// @require     https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @downloadURL https://update.greasyfork.org/scripts/485793/AniCHAT%20-%20Discuss%20Anime%20Episodes.user.js
// @updateURL https://update.greasyfork.org/scripts/485793/AniCHAT%20-%20Discuss%20Anime%20Episodes.meta.js
// ==/UserScript==

/**************************
 * CONSTANTS
 ***************************/
// seconds to wait before loading the discussions (to avoid spamming the service)
const TIMEOUT = 30000; // in milliseconds

// unofficial MAL API with a Jikan v4-compatible schema. Replaced api.jikan.moe, whose public API was discontinued on 2026-10-01.
const TENRAI_API = 'https://api.tenrai.org/v1';

/***************************************************************
 * ANIME SITES & SERVICES
 ***************************************************************/
const animeSites = [
	{
		name: "animepahe",
		url: ["animepahe.si", "animepahe"],
		chatArea: ".theatre",
		getAnimeTitle: () => document.querySelector(".theatre-info > h1 > a").textContent.split(' - ')[0],
		getEpTitle: () => document.querySelector(".theatre-info > h1 > a").textContent.split(' - ')[0],
		getEpNum: () =>  document.querySelector(".dropup.episode-menu > button").innerText.split("Episode ")[1],
		styles: '.discussion-area { max-width:1100px; margin:15px auto 0; }',
	},
	{
		name: "gogoanime",
		url: ['gogoanime3', 'gogoanimehd', 'gogoanime', 'anitaku', 'aniwave.si'],   // anitaku.io + aniwave.si are Themesia clones with an identical DOM
		chatArea: '.cmt',
		getAnimeTitle: () => document.querySelector('.entry-title').textContent.split(/Episode \d+.*/)[0].trim(),	// strip the 'Episode N English Subbed' suffix
		getEpTitle: () => document.querySelector('.entry-title').textContent.split(/Episode \d+.*/)[0].trim(),
		getEpNum: () => location.href.split('-episode-')[1]?.split('-')[0],	// URLs look like /<slug>-episode-2-english-subbed-2/
		styles: `.chat-msg { color: white; font-size: 14px; } .discussion-title > a { font-size: 24px; color: goldenrod; }`
	},
	{
		name: "aniwave",
		url: ['aniwave', 'lite.aniwave'],
		chatArea: "#comments",
		getAnimeTitle: () => document.querySelector(".name .title").textContent,
		getEpTitle: () => document.querySelector(".name .title").textContent,
		getEpNum: () => window.location.href.split("/ep-")[1],
	},
	{
		name: "hianime",
		url: ["aniwatchtv", "hianime.to", "hianime.nz", "hianime.mm", "hianime.sx", "hianime"],
		chatArea: ".show-comments",
		getAnimeTitle: () => document.querySelector("h2.film-name > a").textContent,
		getEpTitle: () => document.querySelector("div.ssli-detail > .ep-name").textContent,
		getEpNum: () => waitForElm(".ssl-item.ep-item.active > .ssli-order").then(elm => elm.textContent),
		styles: `.chat-row .user-avatar { width: auto; overflow: visible; }`
	},
	{
		name: "kayoanime",
		url: ["kayoanime.com"],
		chatArea: "#the-post",
		getAnimeTitle: () => document.querySelector("h1.entry-title").textContent.split(/Episode \d+ English.+/)[0].trim(),
		getEpTitle: () => document.querySelector(".toggle-head").textContent.trim(),
		getEpNum: () => document.querySelector("h1.entry-title").textContent.split(/Episode (\d+) English.+/)[1],
	},
	{
		name: "kickassanime",
		url: ["kaas", "kickassanimes", "kickassanime", "kaa.lt"],	// kaa.lt is the current domain; kickassanimes.io + kickassanime.mx are dead
		chatArea: () => document.querySelector("#disqus_thread").parentElement,
		getAnimeTitle: () => document.querySelector("h1").textContent.trim(),
		getEpTitle: () => document.querySelector("h1").textContent.trim(),
		getEpNum: () => location.pathname.match(/\/ep-(\d+)/)?.[1],	// /<slug>/ep-3-<hash>; the old .text-overline now reads 'Server:'
	},
	{
		name: "anix",
		url: ["anixtv", "anixx"],		// anix.to is hijacked; the official set is anixx.fun + anixtv.in/.us.cc/.pro
		chatArea: () => document.querySelector("#disqus_thread")?.parentElement || document.querySelector('#comments'),
		getAnimeTitle: () => document.querySelector("h1")?.textContent.trim(),
		getEpTitle: () => document.querySelector("h1")?.textContent.trim(),
		getEpNum: () => location.pathname.match(/\/ep-(\d+)/)?.[1] ?? new URLSearchParams(location.search).get('ep'),
		chatArea: () => document.querySelector("#disqus_thread").parentElement,
		getAnimeTitle: () => document.querySelector(".ani-name").textContent,
		getEpTitle: () => document.querySelector(".ani-name").textContent,
		getEpNum: () => window.location.href.split("/ep-")[1],
	},
	{
		name: "animesuge",
		url: ["animesuge.re", "animesuge.cz", "anisuge.tv"],	// .to/.cc are dead and .su redirects to a scam domain
		chatArea: '.show-comments',
		getAnimeTitle: () => document.querySelector("h1").textContent.trim(),
		getEpTitle: () => document.querySelector("h1").textContent.trim(),
		getEpNum: () => location.pathname.match(/\/ep-(\d+)/)?.[1],	// /anime/<slug>-<id>/ep-<n>
		initDelay: 1000,	// Time to wait (for page to load) before attaching the discussion area
	},
	{
		name: "miruro legacy",
		url: ["www.miruro"],
		chatArea: '[class^="_commentSectionContainer_"]',
		getAnimeTitle: () => document.querySelector("h1 > a > span").textContent.trim(),
		getEpTitle: () => document.querySelector('[class^="_titleContainer_"] > span:last-child').textContent.trim(),
		getEpNum: () => (new URLSearchParams(location.search)).get('ep'),
		getServiceId: () => ({ MAL: document.querySelector("a[href*='myanimelist.net/']")?.href?.split('/')?.pop(), AL: (document.querySelector("a[href*='anilist.co/anime/']")?.href.match(/anime\/(\d+)/))[1] }),
		styles: `#AniCHAT a:-webkit-any-link { color: lightblue; } ul.discussion-list { padding-inline-start: 0px; }`,
		initDelay: 5000,	// Time to wait (for page to load) before attaching the discussion area
	},
	{
		name: "miruro 2.0",
		url: ["miruro"],
		chatArea: () => document.querySelector('iframe[src*="theanimecommunity.com"]')?.parentElement?.parentElement,	// the site's own comments live in a TheAnimeCommunity iframe
		getAnimeTitle: () => document.querySelector("a.watch-anime-title").textContent.trim(),
		getEpTitle: () => document.querySelector(".watch-now-row h1")?.textContent.trim() || '',
		getEpNum: () => (new URLSearchParams(location.search)).get('ep'),
		styles: `#AniCHAT a:-webkit-any-link { color: lightblue; } ul.discussion-list { padding-inline-start: 0px; }`,
		initDelay: 5000,	// Time to wait (for page to load) before attaching the discussion area
	},
	{
		name: "animekai",
		url: ["animekai", "anikai", "animekaitv"],	// animekai.to/anikai.to are dead; animekaitv.to is current
		chatArea: () => document.querySelector("#disqus_thread").parentElement,
		getAnimeTitle: () => document.querySelector("h1").textContent.trim(),
		getEpTitle: () => document.querySelector("h1").textContent.trim(),
		getEpNum: () => location.pathname.match(/\/ep-(\d+)/)?.[1],	// /watch/<slug>-<id>/ep-<n>; the old .eplist a.active is gone
		initDelay: 1000,	// Time to wait (for page to load) before attaching the discussion area
	},
	{
		name: "reanime",
		url: ["reanime", "kuudere"],	// kuudere.to now redirects to reanime.to; official domains are .to and .cz
		chatArea: '.comment-list',
		getAnimeTitle: () => document.title.split(' - ')[0].trim(),	// the watch page's h1 reads 'Episodes', so the title comes from the <title>
		getEpTitle: () => document.title.split(' - ')[0].trim(),
		getEpNum: () => new URLSearchParams(location.search).get('ep'),
		initDelay: 1000,	// Time to wait (for page to load) before attaching the discussion area
	},
	{
		name: "otaku-streamers",
		url: ["otaku-streamers"],
		chatArea: '.wp-comments',
		getAnimeTitle: () => [...document.querySelectorAll('.wp-breadcrumb > *')].map(e => e.textContent.trim()).filter(Boolean)[0] || '',
		getEpTitle: () => '',
		getEpNum: () => [...document.querySelectorAll('.wp-breadcrumb > *')].map(e => e.textContent.trim()).find(t => /^Episode\s+\d+/i.test(t))?.match(/\d+/)[0] || null,
		initDelay: 1000,	// Time to wait (for page to load) before attaching the discussion area
	},
];

const services = [
	{
		name: "MyAnimeList",
		icon: "https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ",
		url: "https://myanimelist.net/",
		_clientId: "dbe5cec5a2f33fdda148a6014384b984",
		async getDiscussion(animeTitle, epNum, ids) {
			let animeId, topic, url, response, data;
			let headers = {headers: {"X-MAL-CLIENT-ID": this._clientId, 'x-requested-with': 'XMLHttpRequest', 'origin': window.location.origin}};
			// get the anime's MAL id using MAL API (or the Tenrai API if title is too long)
			try {
				if (ids?.MAL) {
					animeId = ids.MAL;
				} else if (ids?.AL) {
					response = await GM_fetch('https://graphql.anilist.co', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
						body: JSON.stringify({ query: `{ Media(id: ${ids.AL}, type: ANIME) { idMal } }` })
					});
					animeId = (await response.json()).data.Media.idMal;
				} else if (animeTitle.length > 500) {
					url = `https://api.myanimelist.net/v2/anime?q=${animeTitle}&limit=1`;
					response = await GM_fetch(url, headers);
					data = await response.json();
					animeId = data.data[0].node.id;
				} else {
					url = `${TENRAI_API}/anime?q=${animeTitle}&limit=1`;
					animeId = GM_getValue('cachedId_'+url, null);
					if (!animeId) {
						response = await GM_fetch(url, headers);
						data = await response.json();
						animeId = data.data[0].mal_id;
						GM_setValue('cachedId_'+url, animeId);
					}
				}
				console.log(`animeId: ${animeId}`);
			} catch (e) {
				throw new Error(`Couldn't find the anime id. Retry after a while or switch to another service.\n${e.code} : ${e}`);
			}
			// get the discussion url from the anime
			try {
				url = `${TENRAI_API}/anime/${animeId}/forum`;
				response = await GM_fetch(url, headers);
				data = await response.json();
				topic = data.data.find(it => it.title.includes(`Episode ${epNum} Discussion`));
				if (!topic) throw new NotFoundError(`No discussion found for episode ${epNum}.`, {
					// Recoverable: the near-misses go to the picker so the user can choose.
					candidates: (data?.data || []).map(t => ({ id: t.mal_id, label: t.title, url: t.url })),
					searchUrl: `https://myanimelist.net/forum/?animeid=${animeId}`
				});
				console.log(`topic: ${topic}`);
			} catch (e) {
				if (e instanceof NotFoundError) throw e;	// already carries the candidates
				throw new NetworkError(`No discussion found. Retry after a while or switch to another service.\n${e.code} : ${e}`);
			}
			return this.loadById(topic.mal_id);
		},
		// Fetches a MAL forum topic directly by its id, bypassing the episode search.
		loadById: async function (topicId) {
			let url, response, data;
			const headers = { headers: { 'X-MAL-CLIENT-ID': this._clientId, 'x-requested-with': 'XMLHttpRequest', 'origin': window.location.origin } };
			// get the forum page
			try {
				url = `https://api.myanimelist.net/v2/forum/topic/${topicId}?limit=100`;
				response = await GM_fetch(url, headers);
				data = await response.json();
				console.log(`data: ${data}`);
			} catch (e) {
				throw new NetworkError(`Error getting the discusssion (${topicId}). Retry after a while or switch to another service.`);
			}

			let chats = [];
			data.data.posts.forEach((post) => {
				const user = post.created_by.name;
				const userLink = "https://myanimelist.net/profile/" + user;
				const avatar = post.created_by.forum_avator;
				const msg = this._parseBBCode(post.body);
				const timestamp = new Date(post.created_at).getTime();
				const postId = data.data.posts.indexOf(post) + 1;
				const postLink = `https://myanimelist.net/forum/?goto=post&topicid=${topicId}&id=${post.id}`;
				chats.push(new Chat(user, userLink, avatar, msg, timestamp, null, postId, postLink));
			});

			// MAL's forum/topic response carries no `url`, so build it from the id.
			const discussion = new Discussion(data.data.title, `https://myanimelist.net/forum/?topicid=${topicId}`, chats);
			return discussion;
		},
		_parseBBCode(bbcode) {
			const mappings = [
				{ bbcode: /\[b\](.*?)\[\/b\]/g, html: "<strong>$1</strong>" },
				{ bbcode: /\[i\](.*?)\[\/i\]/g, html: "<em>$1</em>" },
				{ bbcode: /\[u\](.*?)\[\/u\]/g, html: "<u>$1</u>" },
				{ bbcode: /\[s\](.*?)\[\/s\]/g, html: "<s>$1</s>" },
				{ bbcode: /\[url=(.*?)\](.*?)\[\/url\]/g, html: '<a href="$1">$2</a>' },
				{ bbcode: /\[img.*?\](.*?)\[\/img\]/g, html: '<img src="$1" alt="">' },
				{ bbcode: /\[code\]([\s\S]*?)\[\/code\]/g, html: "<code>$1</code>" },
				{ bbcode: /\[quote\]/g, html: '<blockquote class="quote" style="font-size: 90%; border: 1px solid; padding: 5px;">' },
				{ bbcode: /\[quote=(.*?)\s*(message=\d+)?\]/g, html: '<blockquote class="quote" style="font-size: 90%; border: 1px solid; padding: 5px;"><h4>$1 Said:</h4>' },
				{ bbcode: /\[\/quote\]/g, html: '</blockquote>' },
				{ bbcode: /\[color=(.*?)\](.*?)\[\/color\]/g, html: '<span style="color: $1;">$2</span>' },
				{ bbcode: /\[size=(.*?)\](.*?)\[\/size\]/g, html: '<span style="font-size: $1;">$2</span>' },
				{ bbcode: /\[center\](.*?)\[\/center\]/g, html: '<div style="text-align: center;">$1</div>' },
				{ bbcode: /\[list\](.*?)\[\/list\]/g, html: "<ul>$1</ul>" },
				{ bbcode: /\[list=(.*?)\](.*?)\[\/list\]/g, html: '<ol start="$1">$2</ol>' },
				{ bbcode: /\[\*\](.*?)\[\/\*\]/g, html: "<li>$1</li>" },
				{ bbcode: /\[spoiler\]([\s\S]*?)\[\/spoiler\]/g, html: '<div class="spoiler"><input type="button" onclick="this.nextSibling.style.display=\'inline-block\';this.style.display=\'none\';" value="Show spoiler" style="display: inline-block;"><span class="spoiler_content" style="display: none;"><input type="button" onclick="this.parentNode.style.display=\'none\';this.parentNode.parentNode.childNodes[0].style.display=\'inline-block\';" value="Hide spoiler">$1</span></div>' },
				{ bbcode: /\[spoiler=(.*?)\]([\s\S]*?)\[\/spoiler\]/g, html: '<div class="spoiler"><input type="button" onclick="this.nextSibling.style.display=\'inline-block\';this.style.display=\'none\';" value="Show $1" style="display: inline-block;"><span class="spoiler_content" style="display: none;"><input type="button" onclick="this.parentNode.style.display=\'none\';this.parentNode.parentNode.childNodes[0].style.display=\'inline-block\';" value="Hide $1">$2</span></div>' },
				{ bbcode: /\[yt\](.*?)\[\/yt\]/g, html: '<iframe width="560" height="315" src="https://www.youtube.com/embed/$1" frameborder="0" allowfullscreen></iframe>' },
				{ bbcode: /\[yt\](.*?)\?(start|end)=(\d+)\[\/yt\]/g, html: '<iframe width="560" height="315" src="https://www.youtube.com/embed/$1?$2=$3" frameborder="0" allowfullscreen></iframe>' },
				{ bbcode: /\[yt\](.*?)\?start=(\d+)&end=(\d+)\[\/yt\]/g, html: '<iframe width="560" height="315" src="https://www.youtube.com/embed/$1?start=$2&end=$3" frameborder="0" allowfullscreen></iframe>' },
				{ bbcode: /@(\S+)/g, html: '<a href="https://myanimelist.net/profile/$1" target="_blank">@$1</a>' },
			];
			let html = bbcode;
			for (const mapping of mappings) { html = html.replace(mapping.bbcode, mapping.html); }
			return html;
		}
	},
	{
		name: "Reddit",
		icon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png",
		url: "https://www.reddit.com/",
		_clientId: "dbe5cec5a2f33fdda148a6014384b984",
		async getDiscussion(animeTitle, epNum) {
			let animeId, topic, url, response, posts;
			let headers = {headers: {'x-requested-with': 'XMLHttpRequest', 'origin': window.location.origin}};
			// get the anime's MAL id
			try {
				url = `${TENRAI_API}/anime?q=${animeTitle}&limit=1`;
				animeId = GM_getValue('cachedId_'+url, '');
				if (animeId == '') {
					response = await GM_fetch(url, headers);
					data = await response.json();
					if (data.data.length > 0) {
						animeId = data.data[0].mal_id;
						GM_setValue('cachedId_'+url, animeId);
					}
				}
			} catch (e) {
				throw new Error(`Couldn't find the anime id. Retry after a while or switch to another service.\n${e.code} : ${e.message}`);
			}
			// Get the discussion
			try {
				url = `https://api.reddit.com/r/anime/search.json?q=${animeTitle}+-+Episode+${epNum}+discussion+author:AutoLovepon&restrict_sr=on&include_over_18=on&sort=relevance&limit=50`;
				topic = (await fetchJson(url)).data.children.find(it => it.data.title.includes(` - Episode ${epNum} discussion`) && it.data.selftext.includes(`[MyAnimeList](https://myanimelist.net/anime/${animeId}`))?.data;
				if (!topic) throw new NotFoundError(`No discussion found for episode ${epNum}.`, {
					searchUrl: `https://www.reddit.com/r/anime/search/?q=${encodeURIComponent(animeTitle)} episode ${epNum}`
				});
				url = `https://api.reddit.com/r/anime/search.json?q=${animeTitle}+-+Episode+${epNum}+discussion+author:AutoLovepon&restrict_sr=on&include_over_18=on&sort=relevance&limit=50`;
			} catch (e) {
				if (e instanceof NotFoundError) throw e;
				throw new RateLimitError(`No discussion found. Retry after a while or switch to another service. (You may be rate limited)`);
			}
			// get the comments in the discussion
			try {
				url = topic.url.replace('www.reddit.com', 'api.reddit.com');
				posts = (await fetchJson(url))[1].data.children;
				if (posts[0].data.author == "AutoModerator") posts.shift();	// skip the first bot post
			} catch (e) {
				throw new NetworkError(`Error getting the discussion. Retry after a while or switch to another service.`);
			}

			let chats = [];
			for (let post of posts) chats.push(this._processPost(post.data));

			const discussion = new Discussion(topic.title, topic.url, chats);
			return discussion;
		},
		_processPost(post) {
			const user = post.author;
			const userLink = "https://www.reddit.com/user/" + user;
			const avatar = GM_fetch(`https://api.reddit.com/user/${user}/about`).then(r => r.json()).then(d => d.data.icon_img.split('?')[0]);
			const msg = ((el) => { el.innerHTML = post.body_html; return el.value; })(document.createElement('textarea'));
			const timestamp = post.created_utc * 1000;
			let replies = [];
			if (post.replies && post.replies.data)
				for (let reply of post.replies.data.children)
					if (reply.data?.body_html) replies.push(this._processPost(reply.data));
			return new Chat(user, userLink, avatar, msg, timestamp, replies, post.id, "https://www.reddit.com" + post.permalink);
		}
	},
	{
		name: "AniList",
		icon: "https://anilist.co/img/icons/android-chrome-512x512.png",
		url: "https://anilist.co/",
		async getDiscussion(animeTitle, epNum, ids) {
			let alId, thread, response, data;
			// Prefer the site-declared AniList id; otherwise resolve it by title.
			try {
				if (ids?.AL) {
					alId = ids.AL;
				} else {
					response = await this._gql({ query: 'query($title:String){ Media(search:$title, type:ANIME) { id } }', variables: { title: animeTitle } });
					alId = (await response.json()).data?.Media?.id;
				}
				if (!alId) throw new Error('no id');
				console.log(`alId: ${alId}`);
			} catch (e) {
				throw new Error(`Couldn't find the anime id. Retry after a while or switch to another service.\n${e}`);
			}
			// Thread titles use the same "Episode N Discussion" convention as MAL.
			try {
				response = await this._gql({ query: 'query($mid:Int){Page(page:1,perPage:50){threads(mediaCategoryId:$mid){id title siteUrl replyCount createdAt body}}}', variables: { mid: parseInt(alId) } });
				data = await response.json();
				thread = data.data.Page.threads.find(it => it.title.includes(`Episode ${epNum} Discussion`));
				console.log(`thread: ${thread?.title}`);
				if (!thread) throw new NotFoundError(`No discussion found for episode ${epNum}.`, {
					// Recoverable: the near-misses go to the picker so the user can choose.
					candidates: (data?.data?.Page?.threads || []).map(t => ({ id: t.id, label: t.title, url: t.siteUrl })),
					searchUrl: `https://anilist.co/search/anime?search=${encodeURIComponent(animeTitle)}`
				});
			} catch (e) {
				if (e instanceof NotFoundError) throw e;	// already carries the candidates
				throw new NetworkError(`No discussion found. Retry after a while or switch to another service.\n${e}`);
			}
			return this.loadById(thread.id, thread);
		},
		// Fetches an AniList thread's replies directly by thread id, bypassing the episode search.
		loadById: async function (threadId, meta = {}) {
			let comments = [], response, data;
			try {
				response = await this._gql({ query: 'query($tid:Int){ Page(page:1,perPage:100){ threadComments(threadId:$tid){ id comment createdAt likeCount user{ name avatar{ medium } } } } }', variables: { tid: threadId } });
				data = await response.json();
				// GraphQL returns HTTP 200 with an `errors` array and null `data`, so check both.
				if (data.errors) throw new Error(JSON.stringify(data.errors));
				if (!data.data) throw new Error('AniList returned no data for thread ' + threadId);
				comments = data.data.Page?.threadComments || [];
			} catch (e) {
				throw new NetworkError(`Error getting the discusssion (${meta.title}). Retry after a while or switch to another service.\n${e}`);
			}

			let chats = [];
			comments.forEach((post, i) => {
				const user = post.user?.name || 'Anonymous';
				const userLink = `https://anilist.co/user/${user}`;
				const avatar = post.user?.avatar?.medium || this.icon;
				const msg = this._parseMarkdown(post.comment || '');
				const timestamp = new Date(post.createdAt * 1000).getTime();
				chats.push(new Chat(user, userLink, avatar, msg, timestamp, null, i + 1, meta.siteUrl));
			});

			return new Discussion(meta.title, meta.siteUrl, chats);
		},
		_gql: body => GM_fetch('https://graphql.anilist.co', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify(body)
		}),
		// Minimal Markdown -> HTML. AniList comment bodies are Markdown, not BBCode.
		_parseMarkdown(md) {
			const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			const blocks = md.split(/\n{2,}/);
			const inline = t => esc(t)
				.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img src="$2" alt="$1">')
				.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank">$1</a>')
				.replace(/`([^`]+)`/g, '<code>$1</code>')
				.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
				.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
				.replace(/__([^_]+)__/g, '<strong>$1</strong>')
				.replace(/~~([^~]+)~~/g, '<s>$1</s>');
			return blocks.map(b => {
				const fenced = b.match(/^```(\w*)\n?([\s\S]*?)```$/);
				if (fenced) return `<pre><code>${esc(fenced[2])}</code></pre>`;
				if (/^#{1,6}\s/.test(b)) return `<h4>${inline(b.replace(/^#{1,6}\s*/, ''))}</h4>`;
				if (/^&gt;\s?/.test(b)) return `<blockquote>${inline(b.replace(/^&gt;\s?/gm, ''))}</blockquote>`;
				if (/^(-{3,}|\*{3,})$/.test(b.trim())) return '<hr>';
				const ul = b.split('\n').filter(l => /^\s*[-*+]\s+/.test(l));
				if (ul.length) return `<ul>${ul.map(l => `<li>${inline(l.replace(/^\s*[-*+]\s+/, ''))}</li>`).join('')}</ul>`;
				const ol = b.split('\n').filter(l => /^\s*\d+\.\s+/.test(l));
				if (ol.length) return `<ol>${ol.map(l => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
				return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
			}).join('');
		}
	},
];

// JSON fetch that reports a readable reason instead of a raw parse crash. Reddit answers
// blocked requests with an HTML page, which makes r.json() throw 'not valid JSON'.
async function fetchJson(url) {
	const response = await GM_fetch(url);
	if (!response.ok) throw new NetworkError(`HTTP ${response.status} ${response.statusText}`);
	const type = (response.headers.get('content-type') || '').split(';')[0].trim();
	if (type && type !== 'application/json') {
		const body = (await response.text()).slice(0, 100);
		throw new NetworkError(`Expected JSON but got ${type}: ${body}`);
	}
	return response.json();
}

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
// Errors thrown by a service. `candidates` powers the manual picker, so a
// NotFoundError is recoverable (offer the near-misses) rather than a dead end.
class AniChatError extends Error {
	constructor(message) {
		super(message);
		this.name = 'AniChatError';
	}
}

class NotFoundError extends AniChatError {
	constructor(message, options = {}) {
		super(message);
		this.name = 'NotFoundError';
		this.candidates = options.candidates || [];   // [{ id, label, url }]
		this.searchUrl = options.searchUrl || '';     // let the user hunt by hand
	}
}

class RateLimitError extends AniChatError {
	constructor(message) {
		super(message);
		this.name = 'RateLimitError';
	}
}

class NetworkError extends AniChatError {
	constructor(message) {
		super(message);
		this.name = 'NetworkError';
	}
}
class Chat {
	constructor(user, userLink, avatar, msg, timestamp, replies, id, link) {
		this.user = user;
		this.userLink = userLink;
		this.avatar = avatar;
		this.msg = msg;
		this.timestamp = timestamp;
		this.replies = replies;
		this.id = id;
		this.link = link;
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
async function generateDiscussionArea() {
	document.querySelector("#AniCHAT")?.remove();	// Remove existing discussion area (if it exists)

	const discussionArea = document.createElement("div");
	discussionArea.id = "AniCHAT";
	discussionArea.className = "discussion-area";

	const discussionTitle = document.createElement("h3");
	discussionTitle.className = "discussion-title";

	const discussionTitleText = document.createElement("a");
	discussionTitleText.textContent = `${await site.getAnimeTitle()} Episode ${await site.getEpNum()} Discussion`;
	discussionTitleText.title = "Click to view the original discussion";
	discussionTitleText.target = "_blank";
// Wrapped with the title so `space-between` on .discussion-title keeps them adjacent.
const titleWrap = document.createElement('span');
titleWrap.className = 'discussion-title__wrap';
titleWrap.appendChild(discussionTitleText);
titleWrap.appendChild(buildTitleEditor(discussionTitleText, async query => {
try {
// The heading is '<anime title> Episode <n> Discussion', so a corrected episode number
// has to come back out of the edited text - passing the old epNum ignored the edit.
const epMatch = query.match(/Episode[s]?[_ ]?(d+)/i);
const correctedTitle = epMatch ? query.slice(0, epMatch.index).trim() : query;
const correctedEp = epMatch ? epMatch[1] : await site.getEpNum();
const ids = site.getServiceId ? await site.getServiceId() : null;
renderDiscussion(discussionArea, await service.getDiscussion(correctedTitle, correctedEp, ids));
} catch (e) {
console.error(e);
discussionArea.querySelector('.error-message')?.remove();
const err = document.createElement('span');
err.className = 'error-message';
err.textContent = `AniCHAT:${String.fromCharCode(10)}${e.stack || e.message}`;
discussionArea.appendChild(err);
}
}));
discussionTitle.appendChild(titleWrap);

	const serviceSwitcher = buildServiceSwitcher();
	discussionTitle.appendChild(serviceSwitcher);

	const discussionList = document.createElement("ul");
	discussionList.className = "discussion-list";

	discussionArea.appendChild(discussionTitle);
	discussionArea.appendChild(discussionList);

	return discussionArea;
}

function buildServiceSwitcher() {
	const servicesArea = document.createElement('div');
	servicesArea.id = 'service-switcher';
	servicesArea.setAttribute('role', 'group');
	servicesArea.setAttribute('aria-label', 'Discussion source');

	// The active service is rendered FIRST so the collapsed bar always shows the current
	// source (the container clips from the left). The rest expand on hover/focus.
	const ordered = [service, ...services.filter(it => it !== service)];
	ordered.forEach(it => {
		const isCurrent = it === service;
		const i = services.indexOf(it);
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `service-icon ${isCurrent ? 'selected' : 'other'}`;
		btn.dataset.opt = i;
		btn.setAttribute('aria-pressed', String(isCurrent));
		btn.title = isCurrent ? `Powered by ${it.name}` : `Switch to ${it.name}`;
		btn.innerHTML = `<img src="${it.icon}" alt="${it.name}"><span class="service-name">${it.name}</span>`;
		btn.addEventListener('click', () => {
			if (it === service) return;		// already active, nothing to do
			GM_setValue('service', i);
			service = it;
			run();
		});
		servicesArea.appendChild(btn);
	});

	return servicesArea;
}

// build a row for a single chat in the discussion
async function buildChatRow(chat) {
	const chatRow = document.createElement("li");
	chatRow.className = "chat-row";

	const chatContent = document.createElement("div");
	chatContent.className = "chat-content";

	const userAvatar = document.createElement("div");
	userAvatar.className = "user-avatar";
	userAvatar.innerHTML = `<img src="${service.icon}" alt="${chat.user}">`;
	if (chat.avatar instanceof Promise) chat.avatar.then(avatarUrl => userAvatar.firstChild.src = avatarUrl);
    else userAvatar.firstChild.src = chat.avatar;

	const userMsg = document.createElement("div");
	userMsg.className = "user-msg";

	const name = document.createElement("a");
	name.className = "chat-name";
	name.textContent = chat.user;
	name.href = chat.userLink;
	name.target = "_blank";

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

	const chatId = document.createElement("a");
	chatId.className = "chat-id";
	chatId.textContent = `#${chat.id}`;
	chatId.href = chat.link;
	chatId.target = "_blank";

	userMsg.appendChild(chatId);
	userMsg.appendChild(name);
	userMsg.appendChild(time);
	userMsg.appendChild(msg);
	chatContent.appendChild(userAvatar);
	chatContent.appendChild(userMsg);
	chatRow.appendChild(chatContent);

	if (chat.replies && chat.replies.length > 0) {
		const repliesDiv = document.createElement("div");
		repliesDiv.className = "reply";
		for (let reply of chat.replies) {
			const replyRow = await buildChatRow(reply);
			repliesDiv.appendChild(replyRow);
		}
		chatRow.appendChild(repliesDiv);
	}

	return chatRow;
}

// Show countdown for loading the discussion.
function showLoading(timeout = TIMEOUT, onComplete) {
	const loadingArea = document.createElement("div");
	loadingArea.className = "loading-anichat";

	// Loading UI elements
	const loadingElement = document.createElement("div");
	loadingElement.innerHTML = `<img src="https://flyclipart.com/thumb2/explosion-gif-transparent-transparent-gif-sticker-741584.png" style="width: 150px; margin-right: 10px;">`;
	loadingElement.style.cssText = `display: flex; align-items: center;`;

	const progressBar = document.createElement("div");
	progressBar.className = "progress-bar";
	progressBar.style.cssText = `width: 100%; height: 10px; background-color: #ccc; position: relative; margin-bottom: 10px;`;

	const progressFill = document.createElement("div");
	progressFill.className = "progress-fill";
	progressFill.style.cssText = `width: 0%; height: 100%; background-color: #4CAF50; position: absolute; top: 0; left: 0; transition: width 0.1s linear;`;

	const message = document.createElement("span");
	message.textContent = `This ${timeout / 1000} secs timeout is set to reduce the load on the service`;
	message.style.cssText = "font-size: 14px; color: darkgrey;";

	const skipButton = document.createElement("button");
	skipButton.textContent = "Skip Waiting";
	skipButton.style.cssText = `background: #4CAF50; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: transform 0.2s ease; margin-top: 10px; align-self: start;`;
	skipButton.onmouseover = () => skipButton.style.transform = 'scale(1.1)';
	skipButton.onmouseout = () => skipButton.style.transform = 'scale(1)';

	const colDiv = document.createElement("div");
	colDiv.style.cssText = "display: flex; flex-direction: column; align-items: center;";
	colDiv.appendChild(message);
	colDiv.appendChild(skipButton);

	// Assemble UI
	progressBar.appendChild(progressFill);
	loadingElement.appendChild(colDiv);
	loadingArea.appendChild(loadingElement);
	loadingArea.appendChild(progressBar);

	// Loading logic
	let countdown = timeout;
	let skipRequested = false;

	const countdownInterval = setInterval(() => {
		if (!skipRequested) {
			countdown -= 100;
			progressFill.style.width = `${100 - (countdown / timeout) * 100}%`;
			if (countdown <= 0) complete();
		}
	}, 100);

	function complete() {
		clearInterval(countdownInterval);
		message.textContent = "Hold on tight~ The discussions are being loaded..."
		onComplete();
	}

	skipButton.onclick = () => {
		skipRequested = true;
		skipButton.remove();
		progressFill.style.width = '100%';
		complete();
	};
	if (!(document.body.isFirstLoad??true)) skipButton.click();	// Skip the loading timeout if not first load

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

/* The title and its editor sit in one flex item so space-between can't split them. */
.discussion-title__wrap {
display: inline-flex;
align-items: center;
min-width: 0;
}

.discussion-title__wrap > a {
		margin-right: 20px;
	}

	/* Service switcher: collapsed to the active icon, expands to icon + name on hover/focus */
	#service-switcher {
		display: flex;
		align-items: center;
		gap: 6px;
		max-width: 32px;			/* just the active icon */
		overflow: hidden;
		transition: max-width .3s ease-in-out;
	}
	#service-switcher:hover,
	#service-switcher:focus-within {
		max-width: 100%;
	}

	.service-icon {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		flex: 0 0 auto;			/* never shrink - let the container clip instead */
		padding: 3px 8px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		font: inherit;
		line-height: 1;
		opacity: .45;
		cursor: pointer;
		transition: opacity .2s ease-in-out, background-color .2s ease-in-out, border-color .2s ease-in-out;
	}

	.title-editor {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		margin-left: 8px;
		padding: 3px;
		border: none;
		border-radius: 4px;
		background: none;
		color: inherit;
		opacity: .35;
		cursor: pointer;
		transition: opacity .2s ease-in-out, background-color .2s ease-in-out;
	}

	.title-editor:hover {
		opacity: 1;
		background-color: rgba(128, 128, 128, .2);
	}

	.title-editor:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 1px;
	}

	.title-editor__input {
		flex: 1;
		min-width: 0;
		margin-right: 20px;	/* matches .discussion-title > a */
		padding: 2px 6px;
		border: 1px solid currentColor;
		border-radius: 4px;
		background: none;
		color: inherit;
		font: inherit;
	}

	.service-icon img {
		height: 18px;
		width: auto;
		display: block;
	}

	.service-icon .service-name {
		font-size: 12px;
		font-weight: bold;
		white-space: nowrap;		/* keep names on one line so the expand stays smooth */
	}

	.service-icon.other:hover {
		opacity: 1;
		background-color: rgba(128, 128, 128, .18);
	}

	.service-icon.selected {
		opacity: 1;
		border-color: currentColor;	/* rings the active source so it reads as 'current' */
		cursor: default;
	}

	.service-icon:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 1px;
	}

	ul.discussion-list {
		overflow: auto;
		max-height: 90vh;
	}

	.chat-row {
		display: flex;
		flex-direction: column;
		padding: 10px 0;
		border-top: 1px solid #eee;
	}

	.chat-content {
		display: flex;
		flex-direction: row;
	}

	.chat-row > .reply {
		display: flex;
		flex-direction: column;
		padding-left: 55px;
		border-left: 0.7px solid #eee;
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
		width: 100%;
    	flex-direction: column;
	}

	.chat-id {
		margin-bottom: -20px;
		font-size: 16px;
		align-self: end;
		color: grey !important;
		opacity: 0.3;
		transition: opacity 0.2s;
	}
	.chat-id:hover {
		opacity: 1;
	}

	.chat-name {
		font-weight: bold;
		font-size: 15px;
    	align-self: start;
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

	.manual-picker {
		margin: 12px 0;
		padding: 10px 12px;
		border: 1px solid #eee;
		border-radius: 8px;
	}

	.manual-picker__hint {
		margin: 0 0 8px;
		font-size: 14px;
	}

	.manual-picker__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.manual-picker__list li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.manual-picker__option {
		flex: 1;
		text-align: left;
		padding: 6px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: none;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition: background-color .2s ease-in-out, border-color .2s ease-in-out;
	}

	.manual-picker__option:hover {
		background-color: rgba(128, 128, 128, .18);
		border-color: currentColor;
	}

	.manual-picker__link,
	.manual-picker__search {
		font-size: 13px;
		white-space: nowrap;
	}

	.manual-picker__search {
		display: inline-block;
		margin-top: 10px;
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
let service = services[GM_getValue("service", 0)];

/***************************************************************
 * Functions for working of the script
 ***************************************************************/
// Returns a promise of the given element. Resolves when the element is found in the DOM.
function waitForElm(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
			let elm = document.querySelector(selector);
			// console.log(`Element Found!!: ${elm.textContent}`);
            return resolve(elm);
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
				let elm = document.querySelector(selector);
              	// console.log(`Element Detected!: ${elm.textContent}`);
                resolve(elm);
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

// Get the current website based on the URL
function getCurrentSite() {
	const currentUrl = window.location.href.toLowerCase();
	return animeSites.find((website) => website.url.some((site) => currentUrl.includes(site)));
}

// Use IntersectionObserver to call the callback when the element is in view
function withIntersectionObserver(element, callback) {
	new IntersectionObserver((entries, observer) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				callback();
				observer.disconnect();
			}
		});
	}, { threshold: 0.1 }).observe(element);
	if(!callback) return new Promise(r => callback=r);
}

// Run the script

// Swaps the panel contents for a freshly fetched discussion. Shared by the manual
// picker and the title editor so both update in place instead of reloading.
function renderDiscussion(discussionArea, discussion) {
	const list = discussionArea.querySelector('ul');
	list.innerHTML = '';
	discussion.chats.forEach(async chat => list.appendChild(await buildChatRow(chat)));
	const titleLink = discussionArea.querySelector('.discussion-title a');
	titleLink.href = discussion.link;
	titleLink.textContent = discussion.title;
}

// Rendered beside the heading: turns the title into an editable search box so a
// mis-matched discussion can be corrected, or another one found, in place.
function buildTitleEditor(titleText, onSearch) {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'title-editor';
	btn.title = 'Correct or search for a different discussion';
	btn.setAttribute('aria-label', btn.title);
	btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="16.2" y1="16.2" x2="21" y2="21"></line></svg>';

	let input = null;
	const open = () => {
		if (input) return;		// already editing
		input = document.createElement('input');
		input.type = 'search';
		input.className = 'title-editor__input';
		input.value = titleText.textContent;
		titleText.replaceWith(input);
		input.focus();
		input.select();

		const close = () => {
			if (!input) return;
			input.replaceWith(titleText);
			input = null;
		};
		input.addEventListener('keydown', e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const query = input.value.trim();
				close();
				if (query) onSearch(query);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				close();
			}
		});
		input.addEventListener('blur', close);
	};

	btn.addEventListener('click', open);
	return btn;
}

function buildManualPicker(error) {
	const box = document.createElement('div');
	box.className = 'manual-picker';
	box.innerHTML = '<p class="manual-picker__hint">Could not match this episode automatically. Pick the discussion yourself:</p>';

	if (error.candidates?.length) {
		const list = document.createElement('ul');
		list.className = 'manual-picker__list';
		error.candidates.forEach(c => {
			const li = document.createElement('li');
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'manual-picker__option';
			btn.textContent = c.label;
			btn.addEventListener('click', async () => {
				box.innerHTML = '<p class="manual-picker__hint">Loading the discussion you picked...</p>';
				try {
						const discussion = await service.loadById(c.id, { title: c.label, siteUrl: c.url });
					discussion.chats.forEach(async chat => {
						document.querySelector('#AniCHAT ul').appendChild(await buildChatRow(chat));
					});
					const titleLink = document.querySelector('#AniCHAT .discussion-title a');
					titleLink.href = discussion.link;
					titleLink.textContent = discussion.title;
					box.remove();
				} catch (e) {
					console.error(e);
					// Same full error as the main path - message plus stack.
					box.innerHTML = '<p class="manual-picker__hint">That one failed too:</p><span class="error-message">' + (e.stack || e.message) + '</span>';
				}
			});
			li.appendChild(btn);
			if (c.url) {
				const link = document.createElement('a');
				link.className = 'manual-picker__link';
				link.href = c.url;
				link.target = '_blank';
				link.textContent = 'open';
				li.appendChild(link);
			}
			list.appendChild(li);
		});
		box.appendChild(list);
	}

	if (error.searchUrl) {
		const search = document.createElement('a');
		search.className = 'manual-picker__search';
		search.href = error.searchUrl;
		search.target = '_blank';
		search.textContent = 'Search the forum manually';
		box.appendChild(search);
	}

	return box;
}
async function run() {
    console.info(`Running AniCHAT on ${site.name}...`);
    const discussionArea = await generateDiscussionArea();

    // Add to page using fallback selectors
    const selectors = [
        { selector: () => site.chatArea && typeof site.chatArea === "string" ? document.querySelector(site.chatArea) : site.chatArea(), prepend: false },
        { selector: () => document.querySelector('#main > .container'), prepend: false },
        { selector: () => document.querySelector('#footer'), prepend: true },
        { selector: () => document.querySelector('footer'), prepend: true },
        { selector: () => document.body, prepend: false },
    ];
    for (let {selector, prepend} of selectors) {
        try {
            const element = selector();
            prepend ? element.prepend(discussionArea) : element.appendChild(discussionArea);
            break;
        } catch (error) { continue; }
    }

    // Add styles
    const styleElement = document.createElement("style");
    styleElement.textContent = styles + (site.styles || '');
    discussionArea.append(styleElement);

    // Loading and discussion loading logic
    const loadDiscussion = async () => {
		document.body.isFirstLoad = false;	// A flag to disable loading timeout on subsequent loads
        try {
            const ids = site.getServiceId ? await site.getServiceId() : null;
            const discussion = await service.getDiscussion(await site.getAnimeTitle(), await site.getEpNum(), ids);
            discussion.chats.forEach(async chat => {
                discussionArea.querySelector("ul").appendChild(await buildChatRow(chat));
            });
            discussionArea.querySelector(".discussion-title a").href = discussion.link;
            discussionArea.querySelector(".discussion-title a").textContent = discussion.title;
        } catch (error) {
            console.error(error);
            // A NotFoundError is recoverable - offer the near-misses instead of a dead end.
            if (error instanceof NotFoundError) {
                discussionArea.appendChild(buildManualPicker(error));
            } else {
                const errorElement = document.createElement("span");
                errorElement.className = "error-message";
                errorElement.textContent = `AniCHAT:
${error.stack}

Check the console logs for more detail.`;
                discussionArea.appendChild(errorElement);
            }
        } finally {
			document.querySelector(".loading-anichat")?.remove();
		}
    };

    // Initial loading with timeout
    discussionArea.appendChild(showLoading(TIMEOUT, () => {
        withIntersectionObserver(discussionArea, loadDiscussion);
    }));
}

// Workaround for SPA sites like Miruro for which the script doesn't auto reload on navigation
function initScript() {
	const initDelay = site.initDelay || 0;
    setTimeout(run, initDelay);

    // Handle SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            console.log('URL changed, re-running AniCHAT');
			setTimeout(run, initDelay);
        }
    }).observe(document.querySelector('body'), { subtree: true, childList: true });
}

try {
	initScript();
} catch (e) {
	console.error(`${e.message}\n\n${e.stack}`);
}
