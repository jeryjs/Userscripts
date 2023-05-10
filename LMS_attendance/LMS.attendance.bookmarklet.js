javascript: (function () {
    let startButton = document.createElement("button");
    startButton.innerHTML = "Start taking attendance";
    startButton.type = "button";
    startButton.className = "btn btn-start"

    startButton.style.position = "inherit";
    startButton.style.color = "#fff";
    startButton.style.backgroundColor = "#6c757d";
    startButton.style.transition = "color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out";

    startButton.addEventListener("mouseenter", function () {
        startButton.style.backgroundColor = "#5c636a";
        startButton.style.borderColor = "#565e64";
    });

    startButton.addEventListener("mouseleave", function () {
        startButton.style.backgroundColor = "6c757d";
        startButton.style.borderColor = "inherit";
    });

    document.querySelector(".btn.btn-secondary").parentElement.appendChild(startButton);

    startButton.addEventListener("click", function () {
        attendance();
    });

    function attendance() {
        document.querySelector("td.cell.c4 [name='setallstatus-select']").value = "unselected";
        document.querySelector("td.cell.c6 input[name='setallstatuses']").checked = true;

        let stop = false;

        let loop = () => {
            if (stop) return;
          let usn = prompt("Enter the USN (or enter a non-numeric value to end)");
          if (isNaN(usn)) {
              stop = true;
          } else {
            usn = usn.trim().toString().padStart(3, '0')
            let rows = document.querySelectorAll("table tr");
            for (let i = 3; i < rows.length; i++) {
                let cells = rows[i].querySelectorAll("td");
              if (cells.length > 0 && cells[3].textContent.endsWith(usn)) {
                  cells[6].querySelector("input").checked = true;
                        showToast("Marked USN " + usn + " as present.")
                        break;
                    }
                    else {
                        showToast("No student with USN " + usn + " found.")
                    }
                }
            }
            setTimeout(loop, 0);
        };
        loop();
    }

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
})();