# FaceHelper PWA - Project Structure

```
ghostface/
├── index.html              # Semantic app shell and views
├── styles.css             # Responsive design system and component styles
├── app.js                  # Core application and interaction logic
├── sw.js                   # Service Worker for offline support
├── manifest.json           # PWA manifest
├── package.json            # Project metadata
├── README.md               # User documentation
├── DEPLOYMENT.md           # Deployment guide
├── PROJECT_STRUCTURE.md    # This file
├── start.sh                # Quick start script
├── serve.js                # HTTPS server (optional)
├── generate-icons.html     # Browser-based icon preview tool
├── scripts/
│   └── generate_icons.py  # Dependency-free PNG icon generator
├── .gitignore             # Git ignore patterns
└── icons/                 # App icons folder
    ├── icon-192.svg       # App icon (SVG)
    ├── icon-512.svg       # Large app icon (SVG)
    ├── icon-72.png        # (Generate from SVG)
    ├── icon-96.png        # (Generate from SVG)
    ├── icon-128.png       # (Generate from SVG)
    ├── icon-144.png       # (Generate from SVG)
    ├── icon-152.png       # (Generate from SVG)
    ├── icon-192.png       # (Generate from SVG)
    ├── icon-384.png       # (Generate from SVG)
    └── icon-512.png       # (Generate from SVG)
```

## File Descriptions

### Core Files

**index.html**
- Semantic application shell and three task-focused views
- Accessible navigation, statuses, dialogs, and controls
- PWA metadata and optimized resource hints

**styles.css**
- Cached, responsive design system with no web-font dependency
- Desktop, tablet, compact-phone, landscape, safe-area, reduced-motion, and high-contrast behavior
- Shared controls, surfaces, camera, enrollment, gallery, dialog, and feedback components

**app.js**
- Complete application logic
- Face detection and recognition using face-api.js
- IndexedDB database for storing people
- Camera management for both modes
- Text-to-speech functionality
- Event handlers and UI updates
- Modular functions for easy maintenance

**sw.js** (74 lines)
- Service Worker
- Caches app and models for offline use
- Handles fetch events
- Clean up old caches on activation

**manifest.json** (63 lines)
- PWA manifest
- App metadata (name, colors, icons)
- Installation requirements
- Display mode: standalone (native-like)

### Documentation

**README.md** (133 lines)
- User-facing documentation
- Features and how it works
- Installation instructions for iOS/Android
- Privacy information
- Tips for best results

**DEPLOYMENT.md** (212 lines)
- Deployment guide for various platforms
- Local testing instructions
- HTTPS requirement explanation
- Icon generation methods
- Troubleshooting common issues

### Tools

**start.sh**
- Quick start script
- Detects available server (Python or Node)
- Starts local development server

**serve.js**
- HTTPS server for local testing
- Self-signed certificate support
- Useful for mobile testing

**generate-icons.html**
- Browser-based icon generator
- Creates PNG icons from SVG
- Right-click to save each size

## Key Features Implemented

### Recognition Mode
- Real-time face detection using TinyFaceDetector
- Face recognition with 128-dimensional embeddings
- Multiple face detection simultaneously
- Visual feedback with face boxes and labels
- Configurable distance threshold (currently 0.6; validate before production use)

### Enrollment Mode
- Camera-based photo capture
- Name input field
- Photo counter (3-20 photos per person)
- Descriptor storage for matching
- Visual feedback during capture

### Gallery Management
- View all enrolled people
- Edit person names
- Delete people with confirmation
- Photo count display
- Empty state when no people enrolled

### Audio Feedback
- Text-to-speech integration
- Toggle on/off
- Speaks recognized names
- Non-blocking operation

### Data Management
- IndexedDB for local storage
- No server required
- Privacy-first approach
- Export/import capability (future enhancement)

### PWA Features
- Installable on iOS and Android
- Offline support (after first load)
- Native-like experience
- Home screen icon
- Standalone display mode

## Technology Choices

### Why Vanilla JavaScript?
- No build step required
- Faster initial load
- Simpler deployment
- Sufficient for single-purpose app
- Easy to understand and modify

### Why face-api.js?
- Browser-based face descriptors run entirely on the device
- Runs entirely in browser
- No server/API needed
- Good accuracy/performance balance
- Active maintenance

### Why IndexedDB?
- Stores binary data (face embeddings)
- Larger capacity than localStorage
- Better performance for structured data
- Built into all modern browsers
- No external dependencies

## Browser Compatibility

Tested and working on:
- ✅ Chrome 70+ (Android)
- ✅ Safari 12+ (iOS)
- ✅ Firefox 63+
- ✅ Edge 79+

Requires:
- Camera access (getUserMedia API)
- IndexedDB support
- Service Worker support
- WebGL (for TensorFlow.js)

## Performance

- **Initial Load**: 7MB models (10-30 seconds on 3G)
- **Cached Load**: < 1 second
- **Recognition Speed**: ~500ms per frame
- **Memory Usage**: ~100-150MB RAM
- **Battery**: Continuous camera use drains battery

## Security & Privacy

- ✅ All data stored locally
- ✅ No network requests (after model load)
- ✅ No analytics/tracking
- ✅ No account required
- ✅ Privacy-oriented local storage and processing
- ⚠️ Legal obligations vary by jurisdiction and use case
- ⚠️ Get consent before enrolling others

## Future Enhancements

Potential improvements:
- [ ] Export/import face gallery
- [ ] Multiple galleries/profiles
- [ ] Confidence percentage display
- [ ] Adjustable recognition threshold
- [ ] Face grouping during enrollment
- [ ] Dark mode toggle
- [ ] Wake lock to prevent sleep
- [ ] Voice commands
- [ ] Apple Watch companion
- [ ] Android Wear companion

## Maintenance

To update models:
1. Change MODEL_URL in app.js
2. Update version in sw.js CACHE_NAME
3. Users will get new models on next load

To update app:
1. Modify files as needed
2. Update version in package.json
3. Deploy - service worker handles caching

## Support

For issues or questions:
- Check README.md for user guide
- Check DEPLOYMENT.md for deployment issues
- Open GitHub issue for bugs
- Review app.js comments for technical details
