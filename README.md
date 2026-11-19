# 🚗 Car Jam Bot — WebADB + Gemini AI Vision Automation

A **100% client-side, zero-install** web app that automates the mobile game **"Car Jam: Traffic Puzzle Match Parking Escape"** using WebUSB + WebADB for phone control and Google Gemini Vision AI for game analysis.

> **No Python. No ADB install. No server.** Just open in Chrome, plug in your phone, and play.

---

## 🎯 Features

- **WebUSB + WebADB**: Control your Android phone directly from Chrome/Edge — no ADB installation needed
- **Gemini Vision AI**: Uses Google's free `gemini-2.5-flash` model to analyze screenshots and decide moves
- **3 Play Modes**:
  - **Non-Stop Auto**: Plays continuously until lives run out or you stop it
  - **Custom Chapter Limit**: Plays N chapters then pauses for permission
  - **Safe Permission Mode**: Asks permission every 5 levels and after each chapter
- **Smart Ad Handling**: Detects and auto-closes ads, handles Play Store redirects
- **Live Dashboard**: Real-time screenshot preview with tap markers + AI reasoning log
- **Dark Mode UI**: Clean, modern interface

---

## 📋 Prerequisites

1. **Google Chrome or Microsoft Edge** (WebUSB requires a Chromium-based browser)
2. **Android phone** with **USB Debugging enabled**:
   - Go to `Settings → About Phone → Tap "Build Number" 7 times` to enable Developer Options
   - Go to `Settings → Developer Options → Enable "USB Debugging"`
3. **USB cable** to connect your phone to your PC
4. **Free Google Gemini API Key**: Get one at [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## 🚀 Quick Start (Use Pre-built Version)

If you're using the GitHub Pages hosted version, just visit the URL and follow the in-app instructions.

---

## 🛠️ Build & Deploy

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/car-jam-bot.git
cd car-jam-bot

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev

# 4. Open in Chrome/Edge
# Visit http://localhost:5173
```

### Build for Production

```bash
# Build static files to dist/
npm run build

# Preview the build locally
npm run preview
```

### Deploy to GitHub Pages

#### Option A: Manual Deploy

```bash
# Build and deploy to gh-pages branch
npm run deploy
```

#### Option B: GitHub Actions (Automatic)

1. Push your code to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. The included workflow (`.github/workflows/deploy.yml`) will automatically build and deploy on push to `main`

Create the workflow file:

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: ['main']

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

## 📱 How to Use

1. **Open the app** in Chrome or Edge
2. **Connect your phone** via USB and click **"Connect Phone (WebUSB)"**
3. **Allow USB debugging** on your phone when prompted
4. **Enter your Gemini API key** (saved to localStorage for next time)
5. **Set your current Chapter, Level, and Lives**
6. **Choose a Play Mode**:
   - 🔄 **Non-Stop Auto**: One-click, plays until you stop it
   - 📊 **Custom Chapter Limit**: Plays N chapters, then pauses
   - 🛡️ **Safe Mode**: Pauses every 5 levels and after each chapter
7. **Click Start Bot** and watch the AI play!

### Controls

| Button | Action |
|--------|--------|
| ▶️ Start Bot | Begin automation |
| ⏸️ Pause | Pause the bot (can resume) |
| 🛑 Emergency Stop | Immediately stop all automation |
| ✅ Continue | Resume after a permission pause |

---

## 🧠 How It Works

```
┌─────────────┐    screencap -p     ┌──────────────┐
│   Android    │◄───────────────────►│   WebADB     │
│   Phone      │    input tap X Y    │   (Browser)  │
└─────────────┘                      └──────┬───────┘
                                            │
                                     screenshot (PNG)
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │  Gemini 2.5  │
                                     │  Flash API   │
                                     │  (Vision)    │
                                     └──────┬───────┘
                                            │
                                      JSON response
                                   {action, tapX, tapY}
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │  Bot Engine   │
                                     │  (Game Logic) │
                                     └──────────────┘
```

1. **Screenshot**: Captures the phone screen via `screencap -p` through WebADB
2. **AI Analysis**: Sends the screenshot + game context to Gemini Vision API
3. **Action**: Executes the AI's recommended tap via `input tap X Y` through WebADB
4. **Loop**: Repeats with the last 2 screenshots for context-aware decision making

---

## 🎮 Game Logic

### Chapter/Level Formula
- Chapter 1 = 15 levels
- Chapter 2 = 20 levels
- Chapter 3 = 25 levels
- Formula: `levels_in_chapter = 15 + (chapter - 1) × 5`

### Car Matching Rules
- Match **3 cars of the same color** in parking slots
- Only tap **unblocked** cars (front/left/right path clear, or showing eye icon)
- **Never** tap a car that can only exit from behind
- Barricades alternate: open → close → open after each match

### Ad Handling
- Detects ads (countdown timers, Skip/X/Close buttons)
- Waits for countdown, then taps close button
- If redirected to Play Store, presses Back and relaunches the game

---

## ⚠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| "WebUSB not supported" | Use Chrome or Edge (not Firefox/Safari) |
| Phone not appearing in picker | Enable USB Debugging, try a different cable |
| "Access denied" on phone | Accept the USB debugging prompt on your phone |
| Gemini API errors | Check your API key, ensure you haven't exceeded free tier limits |
| Bot not recognizing game state | Ensure the game is open and visible on screen |
| Screenshots are blank | Try restarting the USB connection |

---

## 📄 License

MIT License - Use at your own risk. This project is for educational purposes.

---

## 🙏 Credits

- [WebADB (@yume-chan/adb)](https://github.com/nicknameisrequired/webadb) — WebUSB ADB implementation
- [Google Gemini API](https://ai.google.dev/) — Vision AI model
- [Vite](https://vitejs.dev/) — Build tool
