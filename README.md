# CourseCraft

**Turn a folder course videos into your own course website that runs on your computer.**

CourseCraft is a better way to watch video courses you've downloaded than a plain media player. Point it at a folder, and it builds an organized course page with sections, lessons, progress tracking, subtitles, a searchable transcript, notes and a built-in code viewer. All of this runs in your browser.

Everything runs **locally**. Nothing is uploaded, no account is needed, and your files stay where they are.

---

## Features

- 📚 **Course library**: add as many courses as you like. Each one is just a folder.
- 🗂️ **Automatic organization**: subfolders become sections, videos become lessons, and they're sorted by the numbers in their names. Clutter like `- coursedownloader.net` is removed from titles.
- ▶️ **Better video player**: speed control (0.5× to 3×), keyboard shortcuts, theater mode, and autoplay of the next lesson.
- ⏯️ **Resume anywhere**: it remembers where you stopped in every video.
- ✅ **Progress tracking**: lessons are marked complete when you finish them (or tick them yourself), with progress bars for each section and course.
- 💬 **Subtitles and transcript**: `.vtt` and `.srt` subtitles show on the video, plus a searchable transcript. Click any line to jump to that moment.
- 📝 **Notes for each lesson**: add timestamps you can click to jump back.
- 💻 **Code viewer**: source code folders that come with the course open in a viewer with a file tree and syntax highlighting.
- 📦 **Built-in unzip**: unpack course zip files from inside the app. This includes LZMA zips, which Windows' "Extract All" can't open.
- 🌗 **Light and dark mode**.

---

## What you need

- **[Node.js](https://nodejs.org)** version 18 or newer. Download the "LTS" version and install it with the default options.
- A modern browser (Chrome, Edge, Firefox or Brave).
- Some course videos on your computer.

> CourseCraft has **no other dependencies**, so you don't need to run `npm install`.

---

## Install

**Option A: download the zip (easiest)**
1. At the top of this page, click the green **Code** button, then **Download ZIP**.
2. Unzip it somewhere you'll keep it, for example `D:\CourseCraft` or `Documents\CourseCraft`.

**Option B: with Git**
```bash
git clone https://github.com/Mbalhakim/CourseCraft.git
```

---

## Launch it

### Windows
Double-click **`Start CourseCraft.bat`**.

A black window opens, and then your browser opens at **http://localhost:4321**.
**Keep the black window open while you watch.** Close it when you're done to stop CourseCraft.

### Mac / Linux
Open a terminal in the CourseCraft folder and run:
```bash
node server.js
```
Your browser opens at **http://localhost:4321**. Press `Ctrl+C` in the terminal to stop.

---

## Add your first course

1. Click **Add a course**.
2. Click **Browse…** to pick the course folder (Windows), or paste its path, for example `D:\Java-course`.
3. Click **Add course**.

**Got a folder that holds several courses?** Tick **"This folder holds several courses"**, and each subfolder is added as its own course.

**Course still zipped?** The course page shows a banner saying **"N zip files haven't been unpacked yet."** Click **Unpack all**. The original zips are kept, and you can delete them yourself afterwards. Keep the CourseCraft window open until unpacking finishes.

### How to organize your folders

CourseCraft works with almost any layout, but this one gives the best result:

```
D:\Java-course\                        ← add this folder with "several courses" ticked
├── Part 1 - Fundamentals\             ← course
│   ├── 1. Getting Started\            ← section
│   │   ├── 1- Introduction.mp4        ← lesson
│   │   ├── 1- Introduction.vtt        ← its subtitles (same name as the video)
│   │   └── Source Code\               ← shows under "Files & code"
│   └── 2. Types\
│       └── ...
└── Part 2 - OOP\                      ← another course
    └── ...
```

- **Numbers at the start of names** set the order (`1-`, `2.`, `10-` sort correctly).
- **Subtitles** need the same name as their video: `Lesson.mp4` with `Lesson.vtt` or `Lesson.srt`. `Lesson.en.vtt` also works.
- **Folders with no videos** (source code, exercises) show under the **Files & code** tab and open in the code viewer.
- Supported video types: `.mp4`, `.webm`, `.m4v`, `.mov`, `.mkv`. MP4 works best everywhere.

---

## Keyboard shortcuts (in the player)

| Action | Keys |
| --- | --- |
| Play / pause | `Space` or `K` |
| Back / forward 10 seconds | `J` / `L` |
| Back / forward 5 seconds | `←` / `→` |
| Volume | `↑` / `↓` |
| Slower / faster | `<` / `>` |
| Jump to 0%–90% | `0`–`9` |
| Previous / next lesson | `P` / `N` |
| Mark lesson complete | `D` |
| Captions on/off | `C` |
| Theater mode | `T` |
| Fullscreen | `F` |
| Mute | `M` |
| Show all shortcuts | `?` |

---

## Your data

Your progress, notes and course list are saved in the **`data\`** folder inside CourseCraft. They are **not** stored in the course folders.

- **Moved a course folder?** On the home page, click the course's **⋯** menu, then **Change folder location**. Your progress is kept.
- **Updating CourseCraft?** Keep your `data\` folder and replace everything else.
- **Backing up?** Copy the `data\` folder.

---

## Troubleshooting

**"Node.js is not installed"**: install it from [nodejs.org](https://nodejs.org), then restart your computer (or sign out and back in) and try again.

**The browser didn't open**: open **http://localhost:4321** yourself.

**Port 4321 is already in use**: CourseCraft is probably already running, so just open the address above. To use another port on Windows, run `set PORT=5000 && node server.js`.

**Windows says it can't extract a zip**: many course zips use LZMA compression, which Windows' "Extract All" doesn't support. Use CourseCraft's **Unpack** button instead (or [7-Zip](https://www.7-zip.org)).

**A video won't play**: the browser may not support that video format. MP4 (H.264) works everywhere. Some `.mkv` files only play in Chrome or Edge.

**New files don't show up**: click **Rescan** on the course page.

---

## Privacy

CourseCraft only listens on `127.0.0.1`, so other devices on your network can't reach it. It never connects to the internet. Your videos are only read from your disk, and are never copied or uploaded.

> CourseCraft does not include any course content. Only use it with courses you have the right to use.
