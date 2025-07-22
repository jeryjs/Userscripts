# AnswerIT!! - Universal Tab Switch Detection Bypass & AI Answer Generator

This userscript enhances learning platforms by disabling tab switch detection and providing a multi-provider AI answer generator. It lets you navigate away from assessment tabs without triggering warnings and offers a modern, intuitive interface to generate answers using Gemini, OpenAI, or Anthropic models.

## ✨ Features

### 🚫 Tab Switch Detection Bypass
- Neutralizes browser visibility APIs and blocks events (e.g., "blur", "visibilitychange") so you can safely switch tabs during assessments.

### 🤖 Multi-Provider AI Answer Generator
- **Multiple AI Providers**: Use Google Gemini (free), OpenAI (GPT-4o), or Anthropic (Claude) models
- **Real-time Streaming**: See answers generate live (see note below for Tampermonkey)
- **Smart Caching**: Answers are cached for instant reuse
- **Graceful Error Handling**: Handles API/network issues with clear feedback
- **Auto-Run Mode**: Optionally generate answers automatically when questions change

### 🎛️ Modern Interface
- **Popup UI**: Responsive, themeable popup with drag, resize, and snap
- **Step-by-Step Setup**: Tabbed configuration for each provider, instant API key testing
- **Direct Insertion**: Insert answers into input fields with one click
- **Custom Prompts**: Add your own instructions for the AI

### 🔧 Easy Setup & Configuration
- **Tabbed Setup Page**: Configure Gemini, OpenAI, or Anthropic keys in a single place
- **Visual API Testing**: Test each key with instant feedback
- **Persistent Settings**: Preferences and keys are saved locally

## 🌐 Supported Platforms

Works seamlessly with popular learning and assessment platforms. The configuration page displays all supported sites with their favicons.

## 📥 Installation

1. **Install a Userscript Manager**
   - [Violentmonkey](https://violentmonkey.github.io/get-it/) (Recommended)
   - [Tampermonkey](https://www.tampermonkey.net/) (Popular, but see note below)
2. **Install AnswerIT!!**
   - [Install Script](https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js)
3. **Configure Your Settings**
   - You'll be guided through the setup page to enter your API keys and preferences.
        - [Configuration Page](https://jeryjs.github.io/Userscripts/AnswerIT!!/configure.html)

> **Note:**
> - **Tampermonkey Bug:** Due to a known bug in Tampermonkey on Chromium browsers, model responses will not stream in real-time (you'll only see the final answer after generation). For full streaming support, use **Violentmonkey**.

## ⚙️ Configuration

### 🔑 API Key Setup
- **Gemini (Free):** [Get Key](https://aistudio.google.com/app/apikey)
- **OpenAI (Paid):** [Get Key](https://platform.openai.com/api-keys)
- **Anthropic (Paid):** [Get Key](https://console.anthropic.com/account/keys)

Enter your keys in the tabbed setup page. Each provider can be tested and saved individually. All settings are stored locally in your browser.

### 🎨 Preferences
- **Hotkey**: Default is `Alt + A` (Windows/Linux) or `Cmd + A` (Mac)
- **Theme**: Light, dark, or auto
- **Editable Output**: Optionally edit AI output before inserting

## 🚀 How It Works

1. **Detection Bypass**: Neutralizes tab-switch detection on supported platforms
2. **Question Detection**: Finds and processes questions (text, images, code)
3. **Model Selection**: Choose Gemini, OpenAI, or Anthropic
4. **Streaming Response**: (If supported) See answers as they generate
5. **Direct Insertion**: Insert answers with one click

## 🛠️ Troubleshooting

- **API Key Issues**: Double-check for typos, extra spaces, or expired keys
- **Streaming Not Working**: Use Violentmonkey for real-time streaming (see note above)
- **UI Not Appearing**: Refresh the page, check supported sites, or ensure your userscript manager is enabled
- **Other Issues**: [Report on GitHub](https://github.com/jeryjs/Userscripts/issues/new?title=[AnswerIT!!])

## 🛡️ Privacy & Security
- **Local Storage**: All keys and settings are stored only in your browser
- **No Data Collection**: No personal data is sent to any server
- **Open Source**: Review the code on GitHub

## 📄 License

This project is released under the [MIT License](https://opensource.org/licenses/MIT).

## ⚠️ Disclaimer

This script is provided for **educational and research purposes only**. It serves as a proof-of-concept to illustrate browser automation techniques and AI integration patterns. 

**Important Notes:**
- Understanding these techniques helps developers build more robust security measures
- Use responsibly and ethically in accordance with your institution's policies
- Respect the terms of service of the platforms you use
- The developer disclaims liability for any misuse or consequences arising from use

**Academic Integrity:** This tool should be used to supplement learning, not replace it. Always prioritize understanding concepts over simply obtaining answers.


---

**Tip:** For the best experience, use [Violentmonkey](https://violentmonkey.github.io/get-it/) on Chromium browsers.
