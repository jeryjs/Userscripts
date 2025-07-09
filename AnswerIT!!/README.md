# AnswerIT!! - Universal Tab Switch Detection Bypass & AI Answer Generator

This userscript enhances various learning platforms by disabling tab switch detection and providing an AI-powered answer generator. It allows users to navigate away from assessment tabs without triggering warnings and offers multiple AI models to assist in answering questions with a modern, intuitive interface.

## ✨ Features

### 🚫 **Tab Switch Detection Bypass**  
Overrides browser visibility APIs and blocks events (e.g., "blur", "visibilitychange") so you can navigate away from assessment tabs without triggering warnings or penalties.

### 🤖 **AI Answer Generator**  
- **Multiple AI Models**: Choose from Pro-Thinking, Flash-Thinking, Pro, Flash, and Flash Lite models with distinct quality and performance characteristics
- **Real-time Streaming**: Watch answers generate in real-time with live response time tracking
- **Smart Caching**: Automatically caches answers to speed up repeated queries and reduce API usage
- **Graceful Error Handling**: Handles request failures, rate limiting (HTTP 429), and network issues with helpful messages
- **Auto-Run Mode**: Optionally generate answers automatically when questions change

### 🎛️ **Advanced Interface**
- **Modern Popup UI**: Sleek, responsive interface with light/dark themes and opacity controls
- **Flexible Positioning**: Snap to screen edges or float anywhere with drag-and-drop
- **Smart Resizing**: Adjustable popup size with persistent state across sessions
- **Custom Prompts**: Add personalized instructions for the AI in an expandable text area
- **Direct Insertion**: Insert responses directly into input fields with intelligent detection

### 🔧 **Easy Setup & Configuration**
- **Modern Setup Page**: Beautiful, responsive configuration interface with step-by-step guidance
- **Cross-Platform Compatibility**: Automatically detects Mac/Windows for correct keyboard shortcuts
- **Visual API Testing**: Test your API key with instant validation and feedback
- **Persistent Settings**: All preferences saved automatically across browser sessions

## 🌐 Supported Platforms

AnswerIT!! works seamlessly with popular learning and assessment platforms. The configuration page displays all supported sites with their favicons for easy identification.

## 📥 Installation

### **Step 1: Install a Userscript Manager**
Choose one of these popular userscript managers:
- **[Violentmonkey](https://violentmonkey.github.io/get-it/)** (Recommended – Open source, Chrome, Firefox, Edge, Safari)
- **[Tampermonkey](https://www.tampermonkey.net/)** (Popular alternative)

### **Step 2: Install AnswerIT!!**
Click the button below to install the script:

[![Install AnswerIT!! Script](https://img.shields.io/badge/Install-Now-brightgreen?style=for-the-badge&logo=javascript)](https://github.com/jeryjs/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js)

### **Step 3: Configure Your Settings**
After installation, you'll be guided through the setup process to configure your API key and preferences.

## ⚙️ Configuration

### **🔑 Getting Your Free API Key**

1. **Visit Google AI Studio**: Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Sign In**: Use your Google account (create one if needed)
3. **Create API Key**: Click "Create API key in new project"
4. **Copy Your Key**: Save the generated key (it's a long alphanumeric string starting with "AIza")
5. **Enter in AnswerIT!!**: The script will prompt you for the key when first used to generate answers.
    - You can also enter the key [here in the configuration page](https://jeryjs.github.io/Userscripts/AnswerIT!!/configure.html).

### **🎨 Setup Page**
Access the modern configuration interface through:
- **First-time setup**: Automatically prompted when API key is needed
- **Menu command**: Right-click the Violentmonkey icon → AnswerIT!! → "🪟 Open Setup Page"
- **Direct link**: [Configuration Page](https://jeryjs.github.io/Userscripts/AnswerIT!!/configure.html)

The setup page includes:
- **Step-by-step guidance** for getting your API key
- **API key validation** with instant testing
- **Preference configuration** (hotkeys, themes, auto-run)
- **Platform overview** showing all supported sites

### **⌨️ Hotkeys & Controls**
- **Default**: `Alt + A` (Windows/Linux) or `Cmd + A` (Mac) to toggle popup
- **Customizable**: Change hotkey in preferences or via menu commands
- **Mouse Controls**: Drag to reposition, resize from edges, right-click for options

## 🚀 How It Works

### **Detection Bypass**
The script intercepts and neutralizes common tab-switching detection methods used by assessment platforms, allowing you to:
- Switch between browser tabs safely
- Use other applications without triggering warnings
- Take breaks without losing progress
- Research answers in separate tabs

### **AI Integration**
1. **Question Detection**: Automatically identifies questions on supported platforms
2. **Content Analysis**: Processes text, images, and code from the question
3. **Model Selection**: Choose the best AI model for your specific needs
4. **Response Generation**: Streams answers in real-time with metadata
5. **Smart Insertion**: Directly insert answers into form fields

### **Answer Flow**
```
Question Detected → Model Selected → API Request → Streaming Response → Cache Storage → Direct Insertion
```

## 🎯 Usage Guide

### **Basic Usage**
1. **Navigate** to any supported assessment platform
2. **Press** your configured hotkey (default: Alt+A) to open the popup
3. **Select** an AI model based on your needs:
   - **Flash Lite**: Fastest responses, basic accuracy
   - **Flash**: Good balance of speed and quality
   - **Pro**: Higher accuracy, more detailed responses
   - **Thinking Models**: Advanced reasoning capabilities
4. **Review** the generated answer
5. **Insert** directly into the answer field using the Insert button

### **Advanced Features**
- **Custom Prompts**: Add specific instructions (e.g., "Explain in simple terms")
- **Auto-Run**: Enable automatic answer generation when questions change
- **Theme Control**: Switch between light and dark modes
- **Opacity Adjustment**: Make popup semi-transparent to see content behind
- **Caching**: Previously answered questions load instantly from cache

## 🔧 Troubleshooting

### **Common Issues**

**❌ API Key Problems**
- Ensure the key is copied exactly (no extra spaces and match the case)
- Verify the key is active at [Google AI Studio](https://aistudio.google.com/app/apikey)
- Check that billing is enabled if you exceed free tier limits

**❌ Too Many Requests (429 Error)**
- Wait 60 seconds before trying again
- Switch to a different AI model temporarily
- Change to a new API Key from another account
- Consider upgrading your Google AI Studio plan

**❌ UI Not Appearing**
- Refresh the page and wait for content to load
- Check that the site is in the supported platforms list
- Verify Violentmonkey is enabled for the site

**❌ Detection Issues**
- Some platforms may update their detection methods
- Try refreshing the page or restarting your browser
- Report issues on GitHub for quick fixes

### **Getting Help**
- **GitHub Issues**: [Report bugs or request features](https://github.com/jeryjs/Userscripts/issues/new?title=[AnswerIT!!]%20&body=**Describe%20the%20issue:**%0A%0A**Steps%20to%20reproduce:**%0A%0A**Expected%20behavior:**%0A%0A**Environment:**%0A-%20Browser:%0A-%20OS:%0A)
- **Console Logs**: Check browser console for detailed error information

## 📊 Model Comparison

| Model | Speed | Accuracy | Use Case |
|-------|-------|----------|----------|
| **Flash Lite** | ⚡⚡⚡ | ⭐⭐ | Quick factual questions |
| **Flash** | ⚡⚡ | ⭐⭐⭐ | General questions, balanced performance |
| **Flash-Thinking** | ⚡⚡ | ⭐⭐⭐⭐ | Logic puzzles, reasoning tasks |
| **Pro-Thinking** | ⚡ | ⭐⭐⭐⭐⭐ | Advanced analysis, critical thinking |

## 🛡️ Privacy & Security

- **Local Storage**: API keys and settings stored locally in your browser
- **No Data Collection**: No personal information sent to external servers
- **Direct API Communication**: Connects directly to Google's Gemini API
- **Open Source**: Full source code available for review on GitHub

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
