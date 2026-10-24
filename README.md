# FaceHelper - Face Recognition Assistant 🧠

A Progressive Web App designed to help people with prosopagnosia (face blindness) recognize the people in their lives using real-time face recognition.

## Features ✨

- **Real-time Face Recognition**: Uses camera to identify people instantly
- **Easy Enrollment**: Add people with just a few photos (5-10 recommended)
- **Audio Feedback**: Optional text-to-speech to announce names
- **Privacy-First**: All data stored locally on device - nothing uploaded to servers
- **Offline Capable**: Works without internet after initial load
- **Cross-Platform**: Install on iPhone and Android as a native app

## How It Works 🔬

1. **Enrollment Mode**: Capture 3-20 photos of a person from different angles and lighting conditions
2. **Recognition Mode**: Point your camera at someone and see their name displayed in real-time
3. **Gallery Management**: View, edit, and delete enrolled people

## Technology Stack 🛠️

- **Frontend**: Vanilla JavaScript (no framework needed for this single-purpose app)
- **Face Detection**: [@vladmandic/face-api](https://github.com/vladmandic/face-api) (ArcFace-style recognition via TensorFlow.js)
- **Storage**: IndexedDB (browser-based local storage)
- **PWA**: Service Worker for offline support
- **Models**: TinyFaceDetector + FaceLandmark68 + FaceRecognition (7MB total)

## Installation 📱

### On iPhone (iOS 12+)
1. Open Safari and navigate to the app URL
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" in the top right corner
5. The app will appear on your home screen like a native app

### On Android
1. Open Chrome and navigate to the app URL
2. Tap the menu button (three dots)
3. Tap "Add to Home screen" or "Install app"
4. The app will be installed like a native app

## Privacy & Security 🔒

- **All processing happens on your device** - no data is sent to any server
- **Face embeddings are stored locally** in your browser's IndexedDB
- **No account required** - it's a personal tool
- **Consent recommended** - if storing other people's biometric data, get their permission (required by law in some jurisdictions like Illinois BIPA and EU GDPR)

## Recognition Threshold

The app uses a conservative matching threshold (0.6 distance) to minimize false positives. It's better to say "Unknown" than to confidently misidentify someone.

## Tips for Best Results 💡

### During Enrollment
- Capture 5-10 photos per person
- Vary angles (front, left, right)
- Different lighting conditions
- With/without glasses, different hairstyles
- Natural expressions (smiling, neutral)

### During Recognition
- Good lighting improves accuracy
- Face the camera directly when possible
- Hold the phone steady
- Be patient - recognition takes ~500ms

## Known Limitations

- Pretrained models may have varying accuracy across different skin tones, ages, and genders
- Extreme angles or poor lighting can reduce recognition accuracy
- Side profiles may not be recognized as well as frontal faces
- Face coverings (masks, heavy makeup) may prevent recognition

## Development & Deployment

### Local Development
Simply open `index.html` in a browser. For camera access, you'll need to serve via HTTPS or localhost:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

### Deployment
Deploy to any static hosting service (Netlify, Vercel, GitHub Pages, etc.):

1. **Netlify Drop**: Drag the folder to https://app.netlify.com/drop
2. **Vercel**: Run `vercel` in the project directory
3. **GitHub Pages**: Push to `gh-pages` branch

**Note**: HTTPS is required for camera access on mobile devices.

## Model Information

The app uses three models loaded from CDN:
- **TinyFaceDetector** (~5KB): Fast face detection
- **FaceLandmark68Net** (~350KB): 68 facial landmark points
- **FaceRecognitionNet** (~6.3MB): 128-dimensional face embedding

Total download: ~7MB (cached for offline use)

## Browser Support

- ✅ Chrome 70+ (Android)
- ✅ Safari 12+ (iOS)
- ✅ Firefox 63+
- ✅ Edge 79+

## License

MIT License - Feel free to use and modify for your needs.

## Acknowledgments

- [face-api.js](https://github.com/justadudewhohacks/face-api.js) by Vladimir Mandic
- TensorFlow.js team
- Inspired by the needs of the prosopagnosia community

## Support

For issues or feature requests, please open a GitHub issue.

---

**Important**: This is an assistive tool, not a medical device. It's designed to help, not replace human judgment. Always verify important identifications through other means.
