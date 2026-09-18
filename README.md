# 🏋️‍♂️ IronTrack UK - Progressive Overload Gym Tracker

> A professional, mobile-friendly gym weight and progressive overload web application. 
> Runs 100% client-side with persistent JSON local storage, Europe/London timezone, Chart.js progress graphs, and in-browser camera OCR weight detection.

---

## 📁 Which Files to Put into Your GitHub Repository

To launch your own website on **GitHub Pages**, put these core files in your repository:

| File | Purpose | Why it matters |
| :--- | :--- | :--- |
| **`index.html`** | Main entry page | Automatically loaded by GitHub Pages at your live URL |
| **`style.css`** | Website stylesheet | **Edit this file directly to customise the theme, colors, and fonts!** |
| **`app.js`** | Application logic | LocalStorage persistence, UK clock, Chart.js graphs, and Camera OCR |
| **`README.md`** | Documentation | Guide for your team/friends on how to use and deploy |
| **`gym-tracker-single.html`** *(Optional)* | 1-file standalone version | Contains all CSS + JS inline in a single file for instant offline use |

---

## 🚀 How to Launch an Individual Website for Each Person (Free on GitHub Pages)

Each person in your group can have their own personal, private or public website with their own workouts saved on their own device!

Follow these 4 simple steps for each person:

### Step 1: Create Your GitHub Repository
1. Go to [github.com/new](https://github.com/new) (sign up for a free GitHub account if you don't have one).
2. Name the repository whatever you like (e.g. `my-gym-tracker` or `workout-tracker`).
3. Set visibility to **Public** (GitHub Pages is completely free for public repos).
4. Leave other options blank and click **Create repository**.

### Step 2: Upload the Files
**Option A — Directly in the Web Browser (No Git required):**
1. On your new repository page, click **uploading an existing file**.
2. Drag and drop `index.html`, `style.css`, `app.js`, and `README.md` into the box.
3. Click the green **Commit changes** button at the bottom.

**Option B — Using Git in Terminal / PowerShell:**
```bash
git init
git add index.html style.css app.js README.md
git commit -m "Initial commit: IronTrack UK"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. In your GitHub repository, click on the **Settings** tab at the top.
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Set the branch to **`main`** and folder to **`/(root)`**, then click **Save**.
5. Wait 30 to 60 seconds and refresh the page. GitHub will show a banner with your live link:
   ```
   https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/
   ```

### Step 4: Add to Your Phone's Home Screen (iOS & Android)
Open your live GitHub link on your mobile phone:
- **iPhone (Safari)**: Tap the **Share** button (box with arrow) &rarr; scroll down &rarr; tap **Add to Home Screen**.
- **Android (Chrome)**: Tap the **Three Dots Menu** &rarr; tap **Add to Home Screen** (or **Install App**).
- The app will now launch full-screen like a native app with zero browser address bars!

---

## 🎨 How to Customise the Website Style in `style.css`

You can edit `style.css` directly in GitHub or any code editor! At the very top of `style.css`, you will find the `:root` section with simple color variables:

```css
:root {
  /* --- THEME COLORS (Edit these to personalise your website!) --- */
  --bg-base: #080c14;               /* Deep gym background */
  --bg-card: #121c2e;               /* Exercise card background */
  
  /* --- ACCENT COLORS --- */
  --accent-primary: #00e5ff;        /* Main button & graph color */
  --accent-secondary: #00f59b;      /* Overload badges & success indicators */
}
```

### Quick Accent Color Ideas:
- **Neon Electric Cyan (Default)**: `--accent-primary: #00e5ff;`
- **Cyber Lime / Green**: `--accent-primary: #00f59b;`
- **Flame Orange**: `--accent-primary: #ff5722;`
- **Crimson Red**: `--accent-primary: #f43f5e;`
- **Royal Gold**: `--accent-primary: #eab308;`
- **Electric Violet**: `--accent-primary: #a855f7;`

To edit directly on GitHub without downloading anything:
1. Open `style.css` on your GitHub repository page.
2. Click the **Pencil icon** (Edit this file) in the top right.
3. Change any color hex codes in the `:root` block.
4. Click **Commit changes**. Your live GitHub Pages site will automatically update in 1 minute!

---

## 📱 Portable Offline Single-File Mode (`gym-tracker-single.html`)

If you want a 100% self-contained file with all CSS and JavaScript bundled inside:
- You can double-click `gym-tracker-single.html` to open it locally in Chrome, Safari, Edge, or Firefox without any internet server.
- Or rename `gym-tracker-single.html` to `index.html` if you want a single-file repository on GitHub Pages.

---

## ✨ Features Included

- 💾 **Persistent JSON LocalStorage**: All workouts are saved instantly with full error handling. Never lose your numbers after restarting your phone or computer.
- 🎯 **Clean Slate**: Starts completely empty with 0 pre-loaded exercises. Build your personal machine library.
- 📈 **Progressive Overload Calculation**: Automatically suggests your next weight target (`last weight + overload increment`). Appears only after logging your first session.
- ⚙️ **User-Configurable Overload Pace**: Type any increment in Settings (e.g. 1 kg, 2.5 kg, 5 kg).
- 🇬🇧 **Europe/London Timezone**: Real-time UK clock handling GMT and BST. The date indicator updates dynamically each day.
- 📊 **Chart.js Progression Graphs**: Renders interactive weight-over-time curves for each exercise after your first session (pinned from cdnjs).
- 📷 **Camera / Photo Weight OCR**: Snap a photo of a weight stack or plate; Tesseract.js (pinned from cdnjs) detects the numbers and auto-fills your weight field.
- 📦 **JSON Backup & Restore**: 1-click export of your workout history as a portable `.json` file and instant restore.
