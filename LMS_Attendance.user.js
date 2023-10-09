// ==UserScript==
// @name         JAIN - LMS Attendance Helper
// @namespace    https://greasyfork.org/en/users/781076-jery-js
// @version      2.0.1
// @description  Simplify the process of taking the attendance in Jain University's LMS.
// @author       Jery
// @license      MIT
// @match        https://lms.futurense.com/mod/attendance/take.php
// @match        http://localhost:8080/22CSE306_AI22_%20Attendance%20Report.html
// @icon         https://www.nicepng.com/png/detail/270-2701205_jain-heritage-a-cambridge-school-kondapur-jain-university.png
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==


/**************************
 * Notify new Update
***************************/
if (GM_getValue("version") != GM_info.script.version) {
    GM_setValue("attendanceType", "modern");
    GM_setValue("version", GM_info.script.version);
    alert(`
        ${GM_info.script.name}:\n
        This scipt has been updated!!\n
        What's new:
         -'Modern' gui now supports typing in USN directly.\n
         -Bug Fixes
         -Code Cleanup`
    );
}


/***************************************************************
 * Add a start button to the page and use the
 * button beside it as a reference for the styles.
 ***************************************************************/
let startButton = document.createElement("button");
startButton.innerHTML = "Start taking attendance";
startButton.type = "button";
startButton.className = "btn btn-start";

// Style the start button
startButton.style.position = "inherit";
startButton.style.color = "#fff";
startButton.style.backgroundColor = "#6c757d";
startButton.style.transition = "color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out";

// Add hover (mouse-in) effects to the start button
startButton.addEventListener("mouseenter", function () {
    startButton.style.backgroundColor = "#5c636a";
    startButton.style.borderColor = "#565e64";
});
// Add hover (mouse-out) effects to the start button
startButton.addEventListener("mouseleave", function () {
    startButton.style.backgroundColor = "6c757d";
    startButton.style.borderColor = "inherit";
});

// Append the start button to the right of the reference element
document.querySelector(".btn.btn-secondary").parentElement.appendChild(startButton);

// Add an event listener to the start button
startButton.addEventListener("click", function () {
    startAttendance();
});

/***************************************************************
 * Add a dropdown menu to the right of the 'take
 * attendance' button for choosing attendance type.
 ***************************************************************/
let dropdown = document.createElement("select");
dropdown.id = "attendance-dropdown";
dropdown.title = "Choose preferred view for Attendance.\nClassic- Displays a dialog where you can type in USN.\nModern- Displays a GUI where you can mark the USNs.";

// Create the "Mark as Present" option and add it to the dropdown
let presentOption = document.createElement("option");
presentOption.value = "present";
presentOption.textContent = "Classic [Mark as Present]";
dropdown.appendChild(presentOption);

// Create the "Mark as Absent" option and add it to the dropdown
let absentOption = document.createElement("option");
absentOption.value = "absent";
absentOption.textContent = "Classic [Mark as Absent]";
dropdown.appendChild(absentOption);

// Create the "Use Modern" option and add it to the dropdown
let modernOption = document.createElement("option");
modernOption.value = "modern";
modernOption.textContent = "Modern [BETA]";
dropdown.appendChild(modernOption);

// Style the dropdown menu
dropdown.style.marginLeft = "5px";

// Append the dropdown to the right of the attendance button
document.querySelector(".btn.btn-start").parentElement.appendChild(dropdown);

// Set the attendance type to the last selected value
if (GM_getValue("attendanceType") == "present") dropdown.value = "present";
else if (GM_getValue("attendanceType") == "absent") dropdown.value = "absent";
else if (GM_getValue("attendanceType") == "modern") dropdown.value = "modern";

// Add an event listener to the dropdown
dropdown.addEventListener("change", function () {
    if (dropdown.value == "present") GM_setValue("attendanceType", "present");
    else if (dropdown.value == "absent") GM_setValue("attendanceType", "absent");
    else if (dropdown.value == "modern") GM_setValue("attendanceType", "modern");
});


/***************************************************************
 * Main Function to handle attendance.
 * CLASSIC: Shows a prompt for entering students USN number
 * MODERN: Shows a GUI with USN boxes for marking attendance.
 ***************************************************************/
function startAttendance() {
    if (dropdown.value != "modern")
        attendanceClassic();
    else
        attendanceModern();
}

// Attendance style: Classic
function attendanceClassic() {
    // Set all (unmarked) students to PRESENT/ABSENT at start.
    document.querySelector("td.cell.c4 [name='setallstatus-select']").value = "unselected";
    if (dropdown.value == "present") document.querySelector("td.cell.c6 input[name='setallstatuses']").checked = true;
    else if (dropdown.value == "absent") document.querySelector("td.cell.c5 input[name='setallstatuses']").checked = true;

    // Initialize a variable to end loop
    let stop = false;

    // Not using a while loop here because the script works in a single thread,
    // so it wont be able to reflect any changes until the while loop ends.
    let loop = () => {
        if (stop) return;
        // Create a prompt to get USN of student
        let usn = prompt("Enter the USN (or enter a non-numeric value to end)");
        // Check whether the input is a number or else terminate.
        if (isNaN(usn)) {
            stop = true;
        } else {
            // remove whitespaces from USN and pad it with 0s to make it 3 digit
            usn = usn.trim().toString().padStart(3, '0')
            // Initialize the rows and cells
            let rows = document.querySelectorAll("table tr");
            for (let i = 3; i < rows.length; i++) {
                let cells = rows[i].querySelectorAll("td");
                if (cells.length > 0 && cells[3].textContent.endsWith(usn)) {
                    if (dropdown.value == "present") cells[6].querySelector("input").checked = true;        // Mark the cell (student) PRESENT
                    else if (dropdown.value == "absent") cells[7].querySelector("input").checked = true;    // Mark the cell (student) ABSENT
                    showToast("Marked USN " + usn + " as present.")     // Display success message
                    break;
                }
                else {
                    showToast("No student with USN " + usn + " found.") // Display error message
                }
            }
        }
        setTimeout(loop, 0);
    };
    loop();
}

// Attendance style: Modern
function attendanceModern() {
    // colors for USN boxes
    const colorPresent = "rgb(122, 255, 122)";
    const colorAbsent = "rgb(253, 186, 47)";

    // Create a overlay to cover the page
    let overlayDiv = document.createElement("div");
    overlayDiv.id = "attendance-overlay";
    overlayDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: center; justify-content: center;";
    document.body.appendChild(overlayDiv);

    // Create a form to display the USN boxes
    let formDiv = document.createElement("div");
    formDiv.id = "attendance-form";
    formDiv.style.cssText = "position: relative; width: 80%; height: 70%; background-color: rgba(255, 255, 255, 0.8); border-radius: 20px; padding: 20px; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; resize: both;";
    overlayDiv.appendChild(formDiv);

    // extract USN rows from the table and sort out their USN Boxes 
    let rows = Array.from(document.querySelectorAll("table tr")).slice(3);
    let sortedUSNs = rows.map(row => row.querySelectorAll("td")[3].textContent).sort();

    // Create a list to display the USN boxes
    let list = document.createElement("ul");
    list.id = "attendance-list";
    list.style.cssText = "list-style-type: none; display: flex; padding: 20px; flex-wrap: wrap; justify-content: center;";
    formDiv.appendChild(list);

    // Append each USN box to the list
    sortedUSNs.forEach(usn => {
        let listItem = document.createElement("li");
        listItem.className = "attendance-item"
        listItem.style.cssText = "width: 100px; height: 40px; margin: 5px; border-radius: 5px; display: flex; cursor: pointer; font-weight: bold; align-items: center; justify-content: center;";
        listItem.textContent = usn;

        let row = rows.find(row => row.querySelectorAll("td")[3].textContent === usn);
        let presentRadio = row.querySelectorAll("input")[0];
        let absentRadio = row.querySelectorAll("input")[1];

        listItem.style.backgroundColor = presentRadio.checked ? colorPresent : colorAbsent;

        // Mark USN as present/absent on clicking USN box
        listItem.addEventListener("click", function () {
            listItem.style.backgroundColor = listItem.style.backgroundColor === colorPresent ? colorAbsent : colorPresent;
            showToast(`Marked USN ${usn} as ${listItem.style.backgroundColor === colorPresent ? "present" : "absent"}.`);
            presentRadio.checked = listItem.style.backgroundColor === colorPresent;     // Mark as PRESENT if USN box is green
            absentRadio.checked = listItem.style.backgroundColor === colorAbsent;       // Mark as ABSENT if USN box is orange
        });

        list.appendChild(listItem);
    });

    // Add input box to attendance form for entering USN directly
    let inputBox = document.createElement("button");
    inputBox.id = "attendance-input";
    inputBox.style.cssText = "width: 100px; height: 40px; margin: 5px; border-radius: 5px; display: flex; cursor: pointer; font-weight: bold; align-items: center; justify-content: center;";
    inputBox.textContent = "Enter USN";
    // inputBox.addEventListener("keyup", function (event) {
    //     if (event.keyCode === 13) {
    //         event.preventDefault();
    //         showToast(`Marked USN ${usn} as ${listItem.style.backgroundColor === colorPresent ? "present" : "absent"}.`);
    //         presentRadio.checked = listItem.style.backgroundColor === colorPresent;
    //         absentRadio.checked = listItem.style.backgroundColor === colorAbsent;
    //     }
    // });
    inputBox.addEventListener("click", function () { attendanceClassic() });
    formDiv.appendChild(inputBox);

    // Close button to exit the attendance form
    let closeButton = document.createElement("button");
    closeButton.innerHTML = "Close";
    closeButton.className = "btn btn-secondary";
    closeButton.style.cssText = "position: sticky; width: fit-content; bottom: 10px; align-self: flex-end;";
    closeButton.addEventListener("click", function () {
        document.body.removeChild(overlayDiv);
    });
    formDiv.appendChild(closeButton);
}


/***************************************************************
 * Display a simple toast message on the top right of the screen
 ***************************************************************/
function showToast(message) {
    var x = document.createElement("div");
    x.innerHTML = message;
    x.style.color = "#000";
    x.style.backgroundColor = "#fdba2f";
    x.style.borderRadius = "10px";
    x.style.padding = "10px";
    x.style.position = "fixed";
    x.style.top = "5px";
    x.style.right = "5px";
    x.style.fontSize = "large";
    x.style.fontWeight = "bold";
    x.style.zIndex = "10000";
    x.style.display = "block";
    x.style.borderColor = "#565e64";
    x.style.transition = "right 2s ease-in-out";
    document.body.appendChild(x);

    setTimeout(function () {
        x.style.right = "-1000px";
    }, 2000);

    setTimeout(function () {
        x.style.display = "none";
        document.body.removeChild(x);
    }, 3000);
}