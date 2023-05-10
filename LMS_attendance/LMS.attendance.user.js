// ==UserScript==
// @name         JAIN - LMS Attendance Helper
// @namespace    https://greasyfork.org/en/users/781076-jery-js
// @version      1.7.1
// @description  Simplify the process of taking the attendance in Jain University's LMS.
// @author       Jery
// @license      MIT
// @match        https://lms.futurense.com/mod/attendance/take.php
// @match        http://localhost:8080/22CSE306_AI22_%20Attendance%20Report.html
// @icon         https://www.nicepng.com/png/detail/270-2701205_jain-heritage-a-cambridge-school-kondapur-jain-university.png
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==


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
    attendance();
});

/***************************************************************
 * Add a dropdown menu to the right of the 'take
 * attendance' button for choosing attendance type.
 ***************************************************************/
let dropdown = document.createElement("select");
dropdown.id = "attendance-dropdown";
dropdown.title = "Choose whether to mark students whose\nUSN is entered as present or absent";

// Create the "Mark as Present" option and add it to the dropdown
let presentOption = document.createElement("option");
presentOption.value = "present";
presentOption.textContent = "Mark as Present";
dropdown.appendChild(presentOption);

// Create the "Mark as Absent" option and add it to the dropdown
let absentOption = document.createElement("option");
absentOption.value = "absent";
absentOption.textContent = "Mark as Absent";
dropdown.appendChild(absentOption);

// Style the dropdown menu
dropdown.style.marginLeft = "5px";

// Append the dropdown to the right of the attendance button
document.querySelector(".btn.btn-start").parentElement.appendChild(dropdown);

// Set the attendance type to the last selected value
if (GM_getValue("attendanceType") == "present") dropdown.value = "present";
else if (GM_getValue("attendanceType") == "absent") dropdown.value = "absent";

// Add an event listener to the dropdown
dropdown.addEventListener("change", function () {
    if (dropdown.value == "present") GM_setValue("attendanceType", "present");
    else if (dropdown.value == "absent") GM_setValue("attendanceType", "absent");
});


/***************************************************************
 * Main Function to handle attendance.
 * Shows a prompt for entering students USN number.
 * First marks everyone (who isnt marked yet) as ABSENT
 * and then marks the entered numbers as PRESENT.
 ***************************************************************/
function attendance() {
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