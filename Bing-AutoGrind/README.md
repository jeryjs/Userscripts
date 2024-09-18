# AutoGrind: Intelligent Bing Rewards Auto-Grinder
 
AutoGrind is a powerful and mobile-friendly browser user script designed to automate the process of earning Bing Rewards. By intelligently searching for random words extracted from current search results and auto-clicking unclaimed daily points, AutoGrind maximizes your rewards with minimal effort.

[![Install AutoGrind](https://img.shields.io/badge/Install-Now-brightgreen)](https://greasyfork.org/en/scripts/498482-autogrind-intelligent-bing-rewards-auto-grinder)


## Features

- **Automated Searches**: Automatically performs searches on Bing using dynamically extracted words from search results.
- **Daily Points Collection**: Auto-clicks to claim unclaimed daily points from your rewards dashboard.
- **Customizable Settings**: Offers a range of settings to tailor the script's behavior to your needs, including maximum searches, timeout intervals, and more.
- **Cooldown Management**: Includes an option to manage cooldown restrictions imposed by Bing, ensuring continuous operation without triggering anti-bot measures.
- **Simulate Real Browsing**: Simulates real human search behavior by opening random links from search results, potentially improving rewards and reducing the chance of restrictions.

## Installation

1. **Install a User Script Manager**: First, you need to have a user script manager installed in your browser.
    - [Tampermonkey](https://www.tampermonkey.net/) or [ViolentMonkey](https://violentmonkey.github.io/get-it/) are recommended.
2. **Install AutoGrind**: Navigate to the [AutoGrind script page](https://greasyfork.org/en/scripts/498482-autogrind-intelligent-bing-rewards-auto-grinder) and click on the "Install" button. Your user script manager should prompt you to install the script.
3. **Enable the Script**: Ensure the script is enabled in your user script manager's dashboard.

## Usage

After installation, visit [Bing.com](https://www.bing.com/search) or your Bing Rewards dashboard. You'll notice an auto-search icon and a settings icon added to the page. Click on the auto-search icon to start earning rewards automatically or the settings icon to configure the script.

## Configuration

AutoGrind comes with several configurable options:

- **Max Searches**: Set the maximum number of searches to perform.
- **Timeout**: Adjust the timeout between searches.
- **Under Cooldown**: Enable if facing cooldown restrictions.
- **Open Random Links**: Enable to open random links from search results.

These settings can be adjusted via the settings overlay, which can be accessed by clicking the settings icon.

## Protip: 

    The script can detect a special "&form=STARTSCRIPT" parameter in the url which triggers the auto search process automatically.
    You can use this to your advantage by setting up a program like Python or AHK (or even the task scheduler) to auto run the script.

Here's a demo of how to do this with Task Scheduler: https://imgur.com/B3PnBb8

And here's an example written in [AHK](https://www.autohotkey.com/):

```autohotkey
    ; BING-REWARDS
    RunBingRewards(paths) {
        SplashTextOn, 250, 25, Bing Rewards, Running Bing Rewards...
        ; Just fill in some random search terms to better randomize searches
        searchTerms := ["japan", "cat", "dog", "novels", "anime", "movies", "food", "marvel", "china", "noodles"]
        query := "https://www.bing.com/search?q="
        ; Generates a random string of 1-5 words randomly
        Random, loopCount, 1, 5
        Loop % loopCount {
            Random, randomIndex, 1, searchTerms.Length()
            randomString := searchTerms[randomIndex]
            query .= randomString . "%20"
        }
        query .= "&form=STARTSCRIPT"
        ; Run each browser and navigate to the generated search url.
        for index, path in paths {
            Run, %path% %query%
        }
        SplashTextOff
    }
    browsers := [".\imports\Microsoft Edge Beta.lnk", ".\imports\Microsoft Edge Dev.lnk", ".\imports\Microsoft Edge.lnk"]
    !b::RunBingRewards(browsers)
```

## Contributing

Contributions are welcome! If you have improvements or bug fixes, please [fork the repository](https://github.com/jeryjs/Userscripts/blob/main/Bing-AutoGrind) and submit a pull request.

## License

AutoGrind is open-source software licensed under the MIT License. See the LICENSE file for more details.

## Disclaimer

This script is intended for educational purposes only. Use it responsibly and at your own risk. The author is not responsible for any potential consequences of using this script.