# AnswerIT!! - Universal Tab Switch Detection Bypass & AI Answer Generator

This userscript enhances various platforms by disabling tab switch detection and providing an AI-powered answer generator. It allows users to navigate away from the assessment tab without triggering warnings and offers multiple AI models to assist in answering questions.

## Features

- **Tab Switch Detection Bypass**  
  Overrides browser visibility APIs and blocks events (e.g., "blur", "visibilitychange") so you can navigate without triggering warnings.

- **AI Answer Generator**  
  - Offers multiple AI models (Pro-Thinking, Flash-Thinking, Pro, Flash, Flash Lite) with distinct quality and request/quota parameters.
  - Generates answers in real-time while displaying response time.
  - Caches answers to speed up repeated queries.
  - Handles request failures gracefully—including custom messages for rate limiting (HTTP 429).

- **Custom Prompt Support**  
  Allows users to add custom instructions for the AI in a subtle, expandable text box.

- **Insert Response Feature**  
  - Inserts the generated response directly into the last focused input field.
  - Supports inserting selected text or the full response.

- **User-Friendly Setup**  
  Provides guided prompts for obtaining and entering your Google Gemini API key, ensuring even beginners know exactly what to do.

## How It Works

1. **Bypass Mechanism**  
   The script intercepts page events to keep the assessment running smoothly without triggering warnings even if you switch tabs or windows.

2. **AI Answer Generation**  
   - Click on one of the model buttons in the provided popup interface.
   - Follow a two-step process if you haven’t provided an API key yet:
     - First, read a brief explanation of what an API key is and obtain one from [Google's API key page](https://aistudio.google.com/app/apikey) if needed.
     - Second, paste your API key into the prompt.
   - Once configured, the script fetches the answer using the selected AI model and displays it along with the response time.
   - If you exceed the quota or send too many requests (HTTP 429), the script tells you to wait 60 seconds or choose another model.

3. **Custom Prompt and Insertion**  
   - Add custom instructions for the AI using the expandable text box.
   - Use the "Insert" button to insert the response into the last focused input field, avoiding detection of copy-pasting.

## Installation

Make sure you have a userscript manager installed (such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/get-it/)). Then install the script via the link below:

[![Install AnswerIT!! Script](https://img.shields.io/badge/Install-Now-brightgreen)](https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js)

## Setup Instructions

1. **Install a Userscript Manager**  
   Download and install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/get-it/) for your browser.

2. **Install the Script**  
   Click the installation link and confirm the installation in your userscript manager.
    - [Install AnswerIT!! Script](https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js)

3. **Configure Your API Key**

    - To use the AI Answer Generator, you'll need a Google Gemini API key. Here’s how to get one:

      - **Go to Google AI Studio:** Open your web browser and navigate to [Google AI Studio's API Key Page](https://aistudio.google.com/app/apikey).

      - **Sign In/Sign Up:** If you have a Google account, sign in. If not, you'll need to create one.

      - **Create a New API Key:** Once you're logged in, look for an option to "Create API key in new project". Click on it. If you've already created a project, you might see an option like "Get an API key".

      - **Copy Your API Key:** After creating the key, it will be displayed on the screen. Copy this key to your clipboard. It’s a long string of alphanumeric characters.

      - **Enter the API Key in the Script:** When you first use the AI Answer Generator, the script will prompt you to enter your API key. Paste the API key you copied from Google AI Studio into the prompt.

    - **Important Notes:**
      - Make sure you copy the API key exactly as it is provided. Even a small mistake can cause the script to fail.
      - Keep your API key secure. Do not share it with others or include it in public code repositories.

4. **Usage**  
   Navigate to any supported paltform's test page. The script automatically injects a popup interface where you can select an AI model, generate answers, and insert responses.

## Troubleshooting

- **API Key Problems:**  
  Make sure the API key is copied exactly. The script will prompt you until a valid key is provided.

- **Too Many Requests (429 Error):**  
  If you see an error indicating that you've exceeded the quota, wait 60 seconds or try a different AI model.

- **UI Not Appearing:**  
  The interface attaches to the page after a short delay. If it doesn't appear, try refreshing the page.

## License

This project is released under the [MIT License](https://opensource.org/licenses/MIT).

## Disclaimer

This script is provided for educational and research purposes only. It does not promote or endorse any malicious practices. Understanding how these techniques work is essential for developers to build robust security measures; therefore, this script serves as a proof-of-concept to illustrate one such method. Use it responsibly and ethically. Any misuse of this script is solely the responsibility of the user, and the developer disclaims any liability for adverse effects or consequences arising from its use. Please respect the terms of service of the supported platforms.