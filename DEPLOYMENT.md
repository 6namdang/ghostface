# Deployment Guide for FaceHelper PWA

## Quick Start (Local Testing)

### Option 1: Python (Simplest)
```bash
cd /projects/sandbox/ghostface
python3 -m http.server 8000
```
Then open: http://localhost:8000

### Option 2: Node.js
```bash
cd /projects/sandbox/ghostface
npx http-server -p 3000
```
Then open: http://localhost:3000

### Option 3: VS Code Live Server
If you have VS Code with Live Server extension, right-click `index.html` and select "Open with Live Server"

## Important: HTTPS Requirement

**Camera access requires HTTPS on mobile devices!** For testing on your phone:

### Option 1: Use a Tunneling Service (Recommended for Testing)

#### Using ngrok:
```bash
# Install ngrok: https://ngrok.com/
ngrok http 8000
```
This gives you a public HTTPS URL like `https://abc123.ngrok.io`

#### Using localtunnel:
```bash
npx localtunnel --port 8000
```

### Option 2: Deploy to a Hosting Service

## Deployment Options

### 1. Netlify (Easiest - Drag & Drop)

1. Go to https://app.netlify.com/drop
2. Drag the entire `ghostface` folder onto the page
3. Get instant HTTPS URL like `https://random-name.netlify.app`
4. Done! Open on your phone and "Add to Home Screen"

### 2. Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd /projects/sandbox/ghostface
vercel

# Follow prompts - that's it!
```

### 3. GitHub Pages

```bash
# Initialize git (if not already)
cd /projects/sandbox/ghostface
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/facehelper.git
git push -u origin main

# Enable GitHub Pages in repo Settings > Pages
# Select source: main branch, root folder
# Your site will be at: https://YOUR_USERNAME.github.io/facehelper/
```

### 4. Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting

# Deploy
firebase deploy
```

### 5. Surge.sh (Quick Static Hosting)

```bash
# Install Surge
npm install -g surge

# Deploy
cd /projects/sandbox/ghostface
surge

# Follow prompts - get a URL like https://random-name.surge.sh
```

## App Icons

The PNG icons in `icons/` are committed and referenced by `manifest.json`. To regenerate them after changing the design, run (standard library only, no installs):

```bash
python3 scripts/generate_icons.py
```

This writes the rounded `icon-<size>.png` files, the full-bleed `icon-maskable-192/512.png` (for Android adaptive icons), and `apple-touch-icon.png` (180x180, for iOS).

## Testing on Mobile

### iOS (iPhone/iPad)
1. Open Safari
2. Navigate to your deployed URL (must be HTTPS)
3. Tap Share button (square with arrow)
4. Tap "Add to Home Screen"
5. Name it "FaceHelper" and tap Add
6. The app will appear on your home screen!

### Android
1. Open Chrome
2. Navigate to your deployed URL (must be HTTPS)
3. Chrome may show a popup to install - tap Install
4. Or: Menu (three dots) > "Add to Home screen" or "Install app"
5. The app will be installed like a native app!

## Environment Requirements

- **Node.js**: 14+ (for http-server, npx, etc.)
- **Python**: 3.x (for simple server)
- **Browser**: 
  - Chrome 70+ (Android)
  - Safari 12+ (iOS)
  - Firefox 63+
  - Edge 79+

## Common Issues

### "Camera access denied"
- Make sure you're using HTTPS (required on mobile)
- Check browser permissions
- Try in a different browser

### "Models failed to load"
- Check internet connection
- Models are loaded from CDN on first use
- Should be cached after first load

### "Face not detected"
- Ensure good lighting
- Face the camera directly
- Hold phone steady
- Move closer/further from camera

### "Install/Add to Home Screen not showing"
- Must visit the site at least twice
- Must be on HTTPS
- Check if PWA criteria met:
  - manifest.json present
  - Service worker registered
  - HTTPS enabled
  - Icons available

## Performance Tips

1. **First Load**: Models download (~7MB) - may take 10-30 seconds on slow connections
2. **Subsequent Loads**: Models cached - instant startup
3. **Recognition Speed**: ~500ms per frame on modern phones
4. **Battery**: Continuous camera use drains battery - plug in for extended use

## Security & Privacy

- ✅ All face data stored locally in IndexedDB
- ✅ No server-side processing
- ✅ No analytics or tracking
- ✅ Works offline after first load
- ⚠️ Face embeddings are biometric data - handle responsibly
- ⚠️ Get consent before enrolling other people

## License

MIT - Free to use, modify, and distribute.
