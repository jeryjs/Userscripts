// ==UserScript==
// @name        Google Classroom Edit Course Names
// @namespace   https://github.com/jeryjs
// @match       https://classroom.google.com/*
// @match       https://classroom.google.com/u/*/
// @grant       GM_getValue
// @grant       GM_setValue
// @version     1.0
// @author      Jery
// @description 10/17/2023, 12:19:29 AM
// ==/UserScript==

if (window.trustedTypes && window.trustedTypes.createPolicy) {
    window.trustedTypes.createPolicy('default', {
        createHTML: (string, sink) => string
    });
}

let editOpt = `<li id="Edit" class="VfPpkd-StrnGf-rymPhb-ibnC6b VfPpkd-ksKsZd-mWPk3d" role="menuitem" data-menu-item-skip-restore-focus="true"><span class="VfPpkd-StrnGf-rymPhb-pZXsl"></span><span jsname="K4r5Ff" class="VfPpkd-StrnGf-rymPhb-b9t22c">Edit Course Name</span></li>`;

let courseCardsContainer = document.querySelector('.JwPp0e');
let courseSidebarContainer = document.querySelector('.Du1LZe.vdOCJb.Tabkde');
console.log(courseSidebarContainer);
let courseDict = GM_getValue("courseDict", {});
console.log("Course dictionary:", courseDict);

function updateCourseNamesInHomepage() {
    let courseCards = courseCardsContainer.querySelectorAll(".gHz6xd.Aopndd.rZXyy");
    courseCards.forEach(c => {
        let optMenu = c.querySelector(".VfPpkd-StrnGf-rymPhb.DMZ54e");
        let cLink = c.querySelector(".R4EiSb > a");
        let cNameElem = c.querySelector(".YVvGBb.z3vRcc-ZoZQ1");
        if (!c.querySelector("#Edit")) {
            optMenu.innerHTML += editOpt;
            c.querySelector("#Edit").onclick = () => {
                let newName = prompt("Enter new course name:");
                if (newName) {
                    courseDict[cLink] = newName;
                    GM_setValue("courseDict", courseDict);
                    console.log("New course name saved:", newName);
                    cNameElem.textContent = newName;
                }
            }
        }
        if (cLink in courseDict) {
            cNameElem.textContent = courseDict[cLink];
        }
    });
}

function updateCourseNamesInSidebar() {
    let courseLinks = courseSidebarContainer.querySelectorAll(".TMOcX");
    courseLinks.forEach(c => {
        console.log(c);
        let cLink = c.href;
        let cNameElem = c.querySelector(".asQXV.YVvGBb");
        if (cLink in courseDict) {
            cNameElem.textContent = courseDict[c.href];
        }
    });
}

// updateCourseNamesInHomepage();

let homepageObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === "childList" && mutation.target === courseCardsContainer) {
            updateCourseNamesInHomepage();
        }
    });
});
let sidebarObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === "childList" && mutation.target === courseSidebarContainer) {
            updateCourseNamesInSidebar();
        }
    });
});

homepageObserver.observe(courseCardsContainer, { childList: true });
sidebarObserver.observe(courseSidebarContainer, { childList: true });