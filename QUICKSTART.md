# ⚡ Quick Start Guide

## 1. Start the App (Choose One)

### Option A: Python (Recommended)
```bash
cd /projects/sandbox/ghostface
python3 -m http.server 8000
```

### Option B: Quick Start Script
```bash
cd /projects/sandbox/ghostface
./start.sh
```

### Option C: Node.js
```bash
cd /projects/sandbox/ghostface
npx http-server -p 3000
```

## 2. Open in Browser

Desktop: http://localhost:8000

## 3. Deploy for Mobile (Required for Camera)

### Fastest: Netlify Drop
1. Go to https://app.netlify.com/drop
2. Drag the `ghostface` folder
3. Get instant HTTPS URL ✅

### Or: Use ngrok for local testing
```bash
# In one terminal
python3 -m http.server 8000

# In another terminal
ngrok http 8000
```
Then open the HTTPS URL on your phone!

## 4. Install as App

### iOS
1. Open Safari
2. Go to your HTTPS URL
3. Tap Share → "Add to Home Screen"

### Android
1. Open Chrome
2. Go to your HTTPS URL
3. Tap menu → "Add to Home screen"

## 5. Use the App

### Add People
1. Tap "Add Person"
2. Enter name
3. Capture 5-10 photos
4. Tap "Save Person"

### Recognize Faces
1. Tap "Recognize"
2. Tap "Start Camera"
3. Point at a face
4. See the name displayed!

## 🎯 That's it! You're ready to go.

For detailed documentation, see:
- README.md - User guide
- DEPLOYMENT.md - Deployment options
- PROJECT_STRUCTURE.md - Technical details
