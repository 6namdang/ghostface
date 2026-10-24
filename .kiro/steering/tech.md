# FaceHelper technical guidance

## Current stack

- Semantic HTML, a standalone CSS design system, and vanilla JavaScript; no build step or frontend framework.
- `@vladmandic/face-api` 1.7.12 via TensorFlow.js.
- Tiny Face Detector for detection, 68-point face landmarks for alignment, and face-api's dlib-style 128-dimensional face descriptor model for matching. Do not describe the current model as ArcFace.
- IndexedDB (`FaceHelperDB`, `people` store) for local names and face descriptors.
- A service worker for the offline app shell and version-pinned model caching.
- Static deployment on Vercel over HTTPS, which is required for mobile camera access.

## Architecture constraints

- Keep inference in the browser and preserve the no-backend privacy model unless a future requirement explicitly changes it.
- Keep recognition model-backed controls disabled until storage and models are ready.
- Serialize live inference; never overlap model runs.
- Keep release-specific app assets and stable model assets in separate caches so UI upgrades do not evict large model files.
- Version CSS and JavaScript URLs whenever cached application assets change.
- Treat stored names as untrusted data. Render them with `textContent` or equivalent DOM APIs, never HTML interpolation.
- Preserve the DOM IDs consumed by `app.js`, or update markup and callers atomically.
