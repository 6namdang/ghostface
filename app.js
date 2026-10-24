// ============================================
// FaceHelper - Face Recognition Assistant
// ============================================

// Global State
let video, canvas, ctx;
let enrollVideo;
let stream = null;
let enrollStream = null;
let isRecognizing = false;
let recognitionTimer = null;
let recognitionRunId = 0;
let faceMatcher = null;
let ttsEnabled = false;
let lastSpokenKey = '';
let lastFaceSeenAt = 0;
let currentMode = 'recognize';
let modelsReady = false;
let databaseReady = false;
let toastTimer = null;
let activeModalTrigger = null;
let cameraRequestId = 0;
let enrollCameraRequestId = 0;

// Enrollment State
let enrollmentPhotos = [];
let enrollmentDescriptors = [];
let isCapturing = false;
let isProcessingUploads = false;

// Database
const DB_NAME = 'FaceHelperDB';
const DB_VERSION = 1;
const STORE_NAME = 'people';
let db = null;

// Current editing/deleting person
let currentEditPerson = null;
let currentDeletePerson = null;

// ============================================
// Initialization
// ============================================

async function init() {
    setModelState('loading', 'AI starting');
    setModelControlsReady(false);
    updateLoadingProgress('Opening your private library…');
    revealApp();

    const storageTask = initializeStorage();
    const modelTask = (async () => {
        await registerServiceWorker();
        return loadModels();
    })();

    const [, modelResult] = await Promise.all([storageTask, modelTask]);
    modelsReady = modelResult;
    const operational = modelsReady && databaseReady;
    const modelLabel = !databaseReady ? 'Storage unavailable' : modelsReady ? 'AI ready' : 'AI unavailable';
    setModelState(operational ? 'ready' : 'error', modelLabel);
    setModelControlsReady(operational);
    updatePhotoCount();
}

async function initializeStorage() {
    try {
        await initDB();
        databaseReady = true;
        await updateGallery();
    } catch (error) {
        console.error('Database initialization failed:', error);
        showToast('Local storage could not be opened. Check browser privacy settings.');
    }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(window.location.protocol)) return false;

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const installingWorker = registration.installing || registration.waiting;
        if (installingWorker && installingWorker.state !== 'activated') {
            await Promise.race([
                new Promise((resolve) => {
                    installingWorker.addEventListener('statechange', () => {
                        if (['activated', 'redundant'].includes(installingWorker.state)) resolve();
                    });
                }),
                new Promise((resolve) => setTimeout(resolve, 5000))
            ]);
        }

        // On the first visit, wait for clients.claim() so face-api and its model
        // requests pass through the stable runtime model cache.
        await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
        if (!navigator.serviceWorker.controller) {
            await Promise.race([
                new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
                new Promise((resolve) => setTimeout(resolve, 2000))
            ]);
        }
        return Boolean(navigator.serviceWorker.controller);
    } catch (error) {
        console.error('Service worker registration failed:', error);
        return false;
    }
}

function revealApp() {
    const loadingScreen = document.getElementById('loading-screen');
    document.getElementById('app').classList.remove('hidden');
    loadingScreen.classList.add('is-hidden');
    loadingScreen.setAttribute('aria-hidden', 'true');
    setTimeout(() => { loadingScreen.hidden = true; }, 240);
}

function updateLoadingProgress(message) {
    document.getElementById('loading-progress').textContent = message;
}

function setModelState(state, label) {
    const status = document.getElementById('model-status');
    const statusLabel = document.getElementById('model-status-label');
    if (!status || !statusLabel) return;
    status.dataset.state = state;
    statusLabel.textContent = label;
}

function setModelControlsReady(ready) {
    const cameraButton = document.getElementById('recognition-camera-btn');
    if (cameraButton) cameraButton.disabled = !ready;
    setEnrollmentBusy(false);
}

function setButtonLabel(button, text) {
    if (!button) return;
    const label = button.querySelector(':scope > span:not(.button-icon):not(.toggle-switch)');
    if (label) label.textContent = text;
    else button.textContent = text;
}

// ============================================
// Database (IndexedDB)
// ============================================

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('name', 'name', { unique: false });
            }
        };
    });
}

function saveToDB(person) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(person);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updateInDB(person) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(person);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function deleteFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============================================
// Model Loading
// ============================================

async function loadFaceApiLibrary() {
    if (typeof faceapi !== 'undefined') return;

    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Face recognition library did not load'));
        document.head.append(script);
    });
}

async function loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

    try {
        await loadFaceApiLibrary();
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log('Models loaded successfully');
        return true;
    } catch (error) {
        console.error('Error loading models:', error);
        showToast('Face recognition could not start. Check your connection and reload.');
        return false;
    }
}

// ============================================
// Camera Management
// ============================================

async function startCamera() {
    const requestId = ++cameraRequestId;
    try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 960 },
                height: { ideal: 720 }
            },
            audio: false
        });

        if (requestId !== cameraRequestId || currentMode !== 'recognize') {
            cameraStream.getTracks().forEach((track) => track.stop());
            return false;
        }
        stream = cameraStream;
        video = document.getElementById('video');
        video.srcObject = stream;
        await waitForVideo(video);
        await video.play();

        canvas = document.getElementById('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx = canvas.getContext('2d');

        // Match the stage to the real camera ratio so the detection boxes line
        // up without stretching or cropping the video.
        document.getElementById('recognition-camera').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        updateCameraStatus(true);
        return true;
    } catch (error) {
        console.error('Camera error:', error);
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
        updateCameraStatus(false);
        return false;
    }
}

async function stopCamera(targetStream = stream) {
    if (targetStream) {
        targetStream.getTracks().forEach(track => track.stop());
        if (targetStream === stream) {
            stream = null;
            if (video) video.srcObject = null;
            updateCameraStatus(false);
        } else {
            enrollStream = null;
        }
    }
}

async function toggleCamera() {
    if (!modelsReady) {
        showToast('Face recognition is still starting. Please wait a moment.');
        return;
    }

    const cameraButton = document.getElementById('recognition-camera-btn');
    cameraButton.disabled = true;

    if (stream) {
        stopRecognition();
        await stopCamera();
        showRecognitionCameraOff();
        cameraButton.disabled = false;
        return;
    }

    setButtonLabel(cameraButton, 'Opening camera…');
    updateRecognitionResult('searching', 'Starting camera', 'Waiting for camera permission.');
    const started = await startCamera();

    if (!started) {
        showRecognitionCameraOff();
        updateRecognitionResult('error', 'Camera unavailable', 'Allow camera access in your browser settings, then try again.');
        cameraButton.disabled = false;
        return;
    }

    document.getElementById('recognition-camera').classList.remove('camera-off');
    document.getElementById('recognition-placeholder').classList.add('hidden');
    document.getElementById('camera-live-badge').classList.remove('hidden');
    setButtonLabel(cameraButton, 'Stop camera');
    cameraButton.disabled = false;
    await startRecognition();
}

function showRecognitionCameraOff() {
    const cameraContainer = document.getElementById('recognition-camera');
    cameraContainer.classList.add('camera-off');
    cameraContainer.style.removeProperty('aspect-ratio');
    document.getElementById('recognition-placeholder').classList.remove('hidden');
    document.getElementById('camera-live-badge').classList.add('hidden');
    setButtonLabel(document.getElementById('recognition-camera-btn'), 'Start camera');
    updateRecognitionResult('idle', 'Camera is off', 'Start the camera to begin recognizing faces.');
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function updateCameraStatus(active) {
    const liveBadge = document.getElementById('camera-live-badge');
    if (liveBadge) liveBadge.classList.toggle('hidden', !active);
}

// ============================================
// Mode Switching
// ============================================

function switchMode(mode) {
    if (!['recognize', 'enroll', 'gallery'].includes(mode)) return;
    currentMode = mode;

    document.querySelectorAll('.mode-toggle button').forEach((button) => {
        const selected = button.dataset.mode === mode;
        button.classList.toggle('active', selected);
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    ['recognize', 'enroll', 'gallery'].forEach((name) => {
        document.getElementById(`${name}-mode`).classList.toggle('hidden', name !== mode);
    });

    // Only one camera stream should be active at a time.
    if (mode !== 'recognize') {
        cameraRequestId += 1;
        if (stream) {
            stopRecognition();
            stopCamera();
            showRecognitionCameraOff();
        }
    }

    if (mode !== 'enroll') closeEnrollCamera();

    if (mode === 'enroll') startEnrollmentMode();
    else if (mode === 'gallery') updateGallery();

    const titles = {
        recognize: 'Recognize — FaceHelper',
        enroll: 'Add a person — FaceHelper',
        gallery: 'Your people — FaceHelper'
    };
    document.title = titles[mode];
    window.scrollTo({ top: 0, behavior: 'auto' });
}

// ============================================
// Recognition Mode
// ============================================

async function startRecognition() {
    if (!stream) return;

    updateRecognitionResult('searching', 'Looking for a face', 'Keep the camera steady and use good lighting.');

    try {
        const people = await getAllFromDB();
        if (!stream) return;

        if (people.length === 0) {
            faceMatcher = null;
            updateRecognitionResult('empty', 'No people added yet', 'Add someone first, then return here to recognize them.');
            return;
        }

        const labeledDescriptors = people.map(person => new faceapi.LabeledFaceDescriptors(
            person.name,
            person.descriptors.map(descriptor => new Float32Array(descriptor))
        ));
        faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    } catch (error) {
        console.error('Could not prepare recognition:', error);
        updateRecognitionResult('error', 'Recognition unavailable', 'Could not read the saved people on this device.');
        return;
    }

    isRecognizing = true;
    const runId = ++recognitionRunId;
    runRecognitionLoop(runId);
}

async function runRecognitionLoop(runId) {
    if (!isRecognizing || runId !== recognitionRunId || !stream || !video) return;

    try {
        const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

        if (!isRecognizing || runId !== recognitionRunId) return;

        if (detections.length === 0) {
            if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (Date.now() - lastFaceSeenAt > 3000) lastSpokenKey = '';
            updateRecognitionResult('no-face', 'No face in view', 'Move closer and face the camera.');
        } else {
            lastFaceSeenAt = Date.now();
            processDetections(detections);
        }
    } catch (error) {
        if (isRecognizing && runId === recognitionRunId) {
            console.error('Recognition error:', error);
            updateRecognitionResult('error', 'Could not scan this frame', 'Hold the device steady while the camera retries.');
        }
    } finally {
        // Schedule the next scan only after this one finishes. The previous
        // setInterval implementation could stack model runs and cause lag.
        if (isRecognizing && runId === recognitionRunId) {
            recognitionTimer = setTimeout(() => runRecognitionLoop(runId), 300);
        }
    }
}

function stopRecognition() {
    isRecognizing = false;
    recognitionRunId += 1;
    faceMatcher = null;
    lastSpokenKey = '';
    lastFaceSeenAt = 0;
    if (recognitionTimer) {
        clearTimeout(recognitionTimer);
        recognitionTimer = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function processDetections(detections) {
    if (!faceMatcher) return;

    const results = detections.map(detection => faceMatcher.findBestMatch(detection.descriptor));
    const displayNames = results.map(result => result.label === 'unknown' ? 'Unknown' : result.label);
    const knownNames = [...new Set(results
        .filter(result => result.label !== 'unknown')
        .map(result => result.label))];
    const unknownCount = results.filter(result => result.label === 'unknown').length;

    if (knownNames.length === 0) {
        updateRecognitionResult(
            'unknown',
            results.length === 1 ? 'Unknown person' : `${results.length} unknown people`,
            'No close match was found in your gallery.'
        );
    } else {
        const detail = unknownCount > 0
            ? `${knownNames.length} recognized, ${unknownCount} unknown.`
            : knownNames.length === 1 ? 'Match found.' : `${knownNames.length} people recognized.`;
        updateRecognitionResult('match', displayNames.join(' • '), detail);
        announceRecognizedNames(knownNames);
    }

    drawDetections(detections, results);
}

function updateRecognitionResult(state, title, detail) {
    const card = document.getElementById('recognition-result-card');
    const label = document.getElementById('recognition-result-label');
    const titleElement = document.getElementById('recognition-result');
    const detailElement = document.getElementById('recognition-result-detail');
    if (!card || !label || !titleElement || !detailElement) return;

    const labels = {
        idle: 'Ready',
        searching: 'Scanning',
        'no-face': 'Scanning',
        match: 'Recognized',
        unknown: 'No match',
        empty: 'Setup needed',
        error: 'Problem'
    };

    const nextLabel = labels[state] || 'Status';
    if (card.dataset.state === state
        && label.textContent === nextLabel
        && titleElement.textContent === title
        && detailElement.textContent === detail) return;

    card.dataset.state = state;
    label.textContent = nextLabel;
    titleElement.textContent = title;
    detailElement.textContent = detail;
}

function announceRecognizedNames(names) {
    if (!ttsEnabled || names.length === 0) return;
    const key = names.slice().sort().join('|');
    if (key === lastSpokenKey) return;

    lastSpokenKey = key;
    speakNames(names);
}

function drawDetections(detections, results) {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 16px sans-serif';
    ctx.textBaseline = 'middle';

    detections.forEach((detection, index) => {
        const box = detection.detection.box;
        const result = results[index];
        const label = result.label === 'unknown' ? 'Unknown' : result.label;
        const color = result.label === 'unknown' ? '#ed8936' : '#48bb78';
        // The preview is mirrored like a selfie camera, so mirror only the
        // horizontal box coordinate while keeping label text readable.
        const x = canvas.width - box.x - box.width;
        const labelWidth = ctx.measureText(label).width + 20;
        const labelHeight = 30;
        const labelX = Math.max(0, Math.min(x, canvas.width - labelWidth));
        const labelY = Math.max(0, box.y - labelHeight);

        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(x, box.y, box.width, box.height);
        ctx.fillStyle = color;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.fillStyle = 'white';
        ctx.fillText(label, labelX + 10, labelY + labelHeight / 2);
    });
}

// ============================================
// Text-to-Speech
// ============================================

function toggleTTS() {
    ttsEnabled = !ttsEnabled;

    const button = document.getElementById('audio-toggle-btn');
    const label = document.getElementById('audio-toggle-label');
    button.classList.toggle('active', ttsEnabled);
    button.setAttribute('aria-pressed', String(ttsEnabled));
    label.textContent = ttsEnabled ? 'Audio on' : 'Audio off';

    if (ttsEnabled) {
        // Allow the current person to be announced immediately after audio is
        // turned on, even if they were already visible.
        lastSpokenKey = '';
        showToast('Audio announcements on');
    } else {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        showToast('Audio announcements off');
    }
}

function speakNames(names) {
    if ('speechSynthesis' in window && ttsEnabled) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const text = names.join(', ');
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    }
}

// ============================================
// Enrollment Mode
// ============================================

function startEnrollmentMode() {
    renderEnrollmentPhotos();
    updatePhotoCount();
    setEnrollmentBusy(false);
    setEnrollmentMessage('', '');
}

async function openEnrollCamera() {
    if (!modelsReady) {
        setEnrollmentMessage('Face recognition is still starting. Please wait a moment.', 'error');
        return;
    }
    if (enrollStream || isCapturing || isProcessingUploads) return;
    const requestId = ++enrollCameraRequestId;

    const panel = document.getElementById('camera-panel');
    const placeholder = document.getElementById('camera-placeholder');
    const captureButton = document.getElementById('capture-btn');
    panel.classList.remove('hidden');
    placeholder.textContent = 'Opening camera…';
    placeholder.classList.remove('hidden');
    captureButton.disabled = true;
    setEnrollmentBusy(true);

    try {
        // Some mobile browsers cannot open a second stream at the same time.
        if (stream) {
            stopRecognition();
            await stopCamera();
            showRecognitionCameraOff();
        }

        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 960 },
                height: { ideal: 720 }
            },
            audio: false
        });

        if (requestId !== enrollCameraRequestId || currentMode !== 'enroll') {
            cameraStream.getTracks().forEach((track) => track.stop());
            return;
        }
        enrollStream = cameraStream;
        enrollVideo = document.getElementById('enroll-video');
        enrollVideo.srcObject = enrollStream;
        await waitForVideo(enrollVideo);
        await enrollVideo.play();
        placeholder.classList.add('hidden');
        setEnrollmentMessage('Camera ready. Center one face and take a photo.', '');
    } catch (error) {
        console.error('Enrollment camera error:', error);
        closeEnrollCamera();
        setEnrollmentMessage('Could not open the camera. Check camera permission, or upload a photo instead.', 'error');
    } finally {
        setEnrollmentBusy(false);
    }
}

function waitForVideo(videoElement) {
    if (videoElement.readyState >= 2 && videoElement.videoWidth) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Camera timed out')), 10000);
        videoElement.addEventListener('loadedmetadata', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

function closeEnrollCamera() {
    enrollCameraRequestId += 1;
    if (enrollStream) {
        enrollStream.getTracks().forEach(track => track.stop());
        enrollStream = null;
    }

    if (enrollVideo) {
        enrollVideo.srcObject = null;
    }

    const panel = document.getElementById('camera-panel');
    if (panel) panel.classList.add('hidden');
    updateEnrollmentControls();
}

function openPhotoPicker() {
    if (isCapturing || isProcessingUploads) return;
    document.getElementById('photo-upload').click();
}

async function handlePhotoUpload(event) {
    if (!modelsReady) {
        setEnrollmentMessage('Face recognition is still starting. Please wait a moment.', 'error');
        event.target.value = '';
        return;
    }
    const input = event.target;
    const remaining = 20 - enrollmentDescriptors.length;
    const files = Array.from(input.files || []).slice(0, remaining);
    input.value = '';

    if (files.length === 0) {
        if (remaining === 0) setEnrollmentMessage('You can add up to 20 photos.', 'error');
        return;
    }

    isProcessingUploads = true;
    setEnrollmentBusy(true);
    let added = 0;
    let rejected = 0;

    try {
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            setEnrollmentMessage(`Checking photo ${index + 1} of ${files.length}…`, '');

            if (!file.type.startsWith('image/')) {
                rejected += 1;
                continue;
            }

            try {
                const imageCanvas = await fileToCanvas(file);
                await addEnrollmentPhoto(imageCanvas);
                added += 1;
            } catch (error) {
                console.warn(`Rejected ${file.name}:`, error.message);
                rejected += 1;
            }
        }

        if (added > 0 && rejected === 0) {
            setEnrollmentMessage(`${added} photo${added === 1 ? '' : 's'} added.`, 'success');
        } else if (added > 0) {
            setEnrollmentMessage(`${added} added; ${rejected} skipped because each photo must contain exactly one clear face.`, 'success');
        } else {
            setEnrollmentMessage('No photos were added. Choose a clear image containing exactly one face.', 'error');
        }
    } finally {
        isProcessingUploads = false;
        setEnrollmentBusy(false);
    }
}

async function fileToCanvas(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('Could not read image'));
            element.src = objectUrl;
        });
        return resizeToCanvas(image, 1280);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function resizeToCanvas(source, maxSize) {
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sourceWidth * scale));
    output.height = Math.max(1, Math.round(sourceHeight * scale));
    output.getContext('2d').drawImage(source, 0, 0, output.width, output.height);
    return output;
}

async function capturePhoto() {
    if (!enrollVideo || !enrollStream || enrollVideo.readyState < 2) {
        setEnrollmentMessage('The camera is not ready yet.', 'error');
        return;
    }

    if (isCapturing || isProcessingUploads) return;
    if (enrollmentDescriptors.length >= 20) {
        setEnrollmentMessage('You can add up to 20 photos.', 'error');
        return;
    }

    isCapturing = true;
    setEnrollmentBusy(true);
    setEnrollmentMessage('Checking the photo…', '');

    try {
        const photo = resizeToCanvas(enrollVideo, 1280);
        await addEnrollmentPhoto(photo, true);
        triggerCaptureFlash();
        setEnrollmentMessage('Photo added. Change the angle slightly before taking another.', 'success');
    } catch (error) {
        setEnrollmentMessage(error.message, 'error');
    } finally {
        isCapturing = false;
        setEnrollmentBusy(false);
    }
}

async function addEnrollmentPhoto(source, mirrorThumbnail = false) {
    const detections = await faceapi.detectAllFaces(
        source,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })
    )
    .withFaceLandmarks()
    .withFaceDescriptors();

    if (detections.length === 0) {
        throw new Error('No face found. Use a clear, well-lit photo and try again.');
    }
    if (detections.length > 1) {
        throw new Error('More than one face found. Use a photo with only one person.');
    }

    enrollmentDescriptors.push(Array.from(detections[0].descriptor));
    enrollmentPhotos.push(createThumbnail(source, mirrorThumbnail));
    renderEnrollmentPhotos();
    updatePhotoCount();
}

function createThumbnail(source, mirror) {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const size = Math.min(sourceWidth, sourceHeight);
    const output = document.createElement('canvas');
    output.width = 240;
    output.height = 240;
    const outputContext = output.getContext('2d');

    if (mirror) {
        outputContext.translate(output.width, 0);
        outputContext.scale(-1, 1);
    }

    outputContext.drawImage(
        source,
        (sourceWidth - size) / 2,
        (sourceHeight - size) / 2,
        size,
        size,
        0,
        0,
        output.width,
        output.height
    );
    return output.toDataURL('image/jpeg', 0.78);
}

function removeEnrollmentPhoto(index) {
    if (isCapturing || isProcessingUploads) return;
    enrollmentPhotos.splice(index, 1);
    enrollmentDescriptors.splice(index, 1);
    renderEnrollmentPhotos();
    updatePhotoCount();
    setEnrollmentBusy(false);
    setEnrollmentMessage('Photo removed.', '');
}

function renderEnrollmentPhotos() {
    const section = document.getElementById('accepted-photos');
    const grid = document.getElementById('accepted-photo-grid');
    if (!section || !grid) return;

    section.classList.toggle('hidden', enrollmentPhotos.length === 0);
    grid.replaceChildren();

    enrollmentPhotos.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'accepted-photo';

        const image = document.createElement('img');
        image.src = photo;
        image.alt = `Added photo ${index + 1}`;
        image.decoding = 'async';

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'remove-photo';
        removeButton.setAttribute('aria-label', `Remove photo ${index + 1}`);
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => removeEnrollmentPhoto(index));

        item.append(image, removeButton);
        grid.append(item);
    });
}

function setEnrollmentMessage(message, type) {
    const element = document.getElementById('enrollment-message');
    if (!element) return;
    element.textContent = message;
    element.classList.remove('success', 'error');
    element.classList.toggle('hidden', !message);
    if (type) element.classList.add(type);
}

function setEnrollmentBusy(isBusy) {
    const atLimit = enrollmentDescriptors.length >= 20;
    document.querySelectorAll('.source-option').forEach(button => {
        button.disabled = !modelsReady || isBusy || atLimit;
    });
    updateEnrollmentControls();
    updatePhotoCount();
}

function updateEnrollmentControls() {
    const captureButton = document.getElementById('capture-btn');
    if (!captureButton) return;

    const busy = isCapturing || isProcessingUploads;
    const atLimit = enrollmentDescriptors.length >= 20;
    captureButton.disabled = !modelsReady || busy || atLimit || !enrollStream;
    setButtonLabel(captureButton, isCapturing ? 'Adding photo…' : 'Take photo');
}

function triggerCaptureFlash() {
    const flash = document.getElementById('capture-flash');
    if (!flash) return;
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
}

function updatePhotoCount() {
    const count = enrollmentPhotos.length;
    const photoCount = document.getElementById('photo-count');
    const progress = document.getElementById('photo-progress');
    const progressTrack = document.getElementById('photo-progress-track');
    const acceptedCount = document.getElementById('accepted-photo-count');
    if (photoCount) photoCount.textContent = count;
    if (acceptedCount) acceptedCount.textContent = count;
    if (progress) progress.style.width = `${Math.min(100, (count / 3) * 100)}%`;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(Math.min(3, count)));
    document.getElementById('photo-guidance').textContent = count >= 3
        ? 'Ready to save. More varied photos can improve recognition.'
        : `Add ${3 - count} more photo${3 - count === 1 ? '' : 's'} to continue.`;

    const saveBtn = document.getElementById('save-person-btn');
    const nameInput = document.getElementById('person-name');
    if (saveBtn && nameInput) {
        saveBtn.disabled = !databaseReady || isCapturing || isProcessingUploads || enrollmentDescriptors.length < 3 || !nameInput.value.trim();
    }
}

function setupUIEvents() {
    document.querySelectorAll('.mode-toggle [data-mode]').forEach((button) => {
        button.addEventListener('click', () => switchMode(button.dataset.mode));
    });

    document.getElementById('recognition-camera-btn').addEventListener('click', toggleCamera);
    document.getElementById('audio-toggle-btn').addEventListener('click', toggleTTS);
    document.getElementById('open-camera-btn').addEventListener('click', openEnrollCamera);
    document.getElementById('open-upload-btn').addEventListener('click', openPhotoPicker);
    document.getElementById('photo-upload').addEventListener('change', handlePhotoUpload);
    document.getElementById('close-enroll-camera-btn').addEventListener('click', closeEnrollCamera);
    document.getElementById('capture-btn').addEventListener('click', capturePhoto);
    document.getElementById('save-person-btn').addEventListener('click', savePerson);
    document.getElementById('gallery-add-btn').addEventListener('click', () => switchMode('enroll'));
    document.getElementById('person-name').addEventListener('input', updatePhotoCount);

    document.getElementById('edit-close-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-save-btn').addEventListener('click', updatePerson);
    document.getElementById('delete-close-btn').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            if (overlay.id === 'edit-modal') closeEditModal();
            else closeDeleteModal();
        });
    });

    document.getElementById('edit-name').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') updatePerson();
    });
    document.addEventListener('keydown', handleDialogKeydown);
}

document.addEventListener('DOMContentLoaded', setupUIEvents);

async function savePerson() {
    if (!databaseReady || isCapturing || isProcessingUploads) return;
    const name = document.getElementById('person-name').value.trim();
    
    if (!name) {
        showToast('Please enter a name');
        return;
    }
    
    if (enrollmentDescriptors.length < 3) {
        setEnrollmentMessage('Add at least 3 photos before saving.', 'error');
        return;
    }
    
    try {
        const person = {
            name: name,
            descriptors: enrollmentDescriptors,
            photoCount: enrollmentPhotos.length,
            createdAt: new Date().toISOString()
        };
        
        await saveToDB(person);
        showToast(`${name} saved successfully!`);
        
        // Reset the draft and return to the gallery.
        document.getElementById('person-name').value = '';
        enrollmentPhotos = [];
        enrollmentDescriptors = [];
        renderEnrollmentPhotos();
        updatePhotoCount();
        closeEnrollCamera();
        switchMode('gallery');
        
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save person');
    }
}

// ============================================
// Gallery Mode
// ============================================

async function updateGallery() {
    const galleryContent = document.getElementById('gallery-content');
    const galleryCount = document.getElementById('gallery-count');
    if (!galleryContent || !databaseReady) return;

    try {
        const people = await getAllFromDB();
        if (galleryCount) galleryCount.textContent = people.length;
        galleryContent.replaceChildren();

        if (people.length === 0) {
            galleryContent.append(createEmptyGallery());
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'gallery-grid';
        people
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((person) => grid.append(createPersonCard(person)));
        galleryContent.append(grid);
    } catch (error) {
        console.error('Gallery load error:', error);
        showToast('Could not load people stored on this device.');
    }
}

function createEmptyGallery() {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const icon = document.createElement('span');
    icon.className = 'empty-state-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6"/></svg>';

    const title = document.createElement('h2');
    title.textContent = 'Build your people library';
    const copy = document.createElement('p');
    copy.textContent = 'Add someone with a few clear photos. Their recognition profile stays private on this device.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.textContent = 'Add your first person';
    button.addEventListener('click', () => switchMode('enroll'));

    empty.append(icon, title, copy, button);
    return empty;
}

function createPersonCard(person) {
    const card = document.createElement('article');
    card.className = 'person-card';
    card.dataset.personId = String(person.id);

    const head = document.createElement('div');
    head.className = 'person-card-head';
    const avatar = document.createElement('div');
    avatar.className = 'person-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = person.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || '?';

    const details = document.createElement('div');
    details.className = 'person-details';
    const title = document.createElement('h3');
    title.textContent = person.name;
    const metadata = document.createElement('p');
    metadata.textContent = `${person.photoCount} face sample${person.photoCount === 1 ? '' : 's'}`;
    details.append(title, metadata);
    head.append(avatar, details);

    const actions = document.createElement('div');
    actions.className = 'person-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-btn';
    editButton.textContent = 'Edit name';
    editButton.addEventListener('click', () => editPerson(person.id));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-btn';
    deleteButton.setAttribute('aria-label', `Delete ${person.name}`);
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 14h10l1-14"/></svg>';
    deleteButton.addEventListener('click', () => deletePerson(person.id, person.name));

    actions.append(editButton, deleteButton);
    card.append(head, actions);
    return card;
}

// ============================================
// Edit Person
// ============================================

function openModal(id, focusTargetId) {
    const overlay = document.getElementById(id);
    activeModalTrigger = document.activeElement;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
        const target = document.getElementById(focusTargetId) || overlay.querySelector('.modal');
        target.focus();
        if (target instanceof HTMLInputElement) target.select();
    });
}

function closeModal(id, restoreFocus = true) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (restoreFocus && activeModalTrigger instanceof HTMLElement) activeModalTrigger.focus();
    activeModalTrigger = null;
}

function handleDialogKeydown(event) {
    const overlay = document.querySelector('.modal-overlay.active');
    if (!overlay) return;

    if (event.key === 'Escape') {
        if (overlay.id === 'edit-modal') closeEditModal();
        else closeDeleteModal();
        return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

async function editPerson(id) {
    const people = await getAllFromDB();
    currentEditPerson = people.find((person) => person.id === id);

    if (!currentEditPerson) {
        showToast('Person not found');
        return;
    }

    document.getElementById('edit-name').value = currentEditPerson.name;
    openModal('edit-modal', 'edit-name');
}

function closeEditModal(restoreFocus = true) {
    if (document.getElementById('edit-modal').classList.contains('active')) closeModal('edit-modal', restoreFocus);
    currentEditPerson = null;
}

async function updatePerson() {
    if (!currentEditPerson) return;
    
    const newName = document.getElementById('edit-name').value.trim();
    
    if (!newName) {
        showToast('Please enter a name');
        return;
    }
    
    try {
        const personId = currentEditPerson.id;
        currentEditPerson.name = newName;
        await updateInDB(currentEditPerson);
        closeEditModal(false);
        await updateGallery();
        const replacement = document.querySelector(`.person-card[data-person-id="${personId}"] .edit-btn`);
        (replacement || document.getElementById('gallery-add-btn')).focus();
        showToast('Person updated successfully');
    } catch (error) {
        console.error('Update error:', error);
        showToast('Failed to update person');
    }
}

// ============================================
// Delete Person
// ============================================

function deletePerson(id, name) {
    currentDeletePerson = id;
    document.getElementById('delete-person-name').textContent = name;
    openModal('delete-modal', 'delete-cancel-btn');
}

function closeDeleteModal(restoreFocus = true) {
    if (document.getElementById('delete-modal').classList.contains('active')) closeModal('delete-modal', restoreFocus);
    currentDeletePerson = null;
}

async function confirmDelete() {
    if (!currentDeletePerson) return;
    
    try {
        await deleteFromDB(currentDeletePerson);
        closeDeleteModal(false);
        await updateGallery();
        document.getElementById('gallery-add-btn').focus();
        showToast('Person deleted successfully');
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete person');
    }
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

// ============================================
// Initialize App
// ============================================

document.addEventListener('DOMContentLoaded', init, { once: true });

function shutdownCameraSessions() {
    cameraRequestId += 1;
    enrollCameraRequestId += 1;
    stopRecognition();
    if (stream) stopCamera();
    showRecognitionCameraOff();
    closeEnrollCamera();
}

// Release cameras when the app is backgrounded to protect privacy and battery.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) shutdownCameraSessions();
});

window.addEventListener('pagehide', shutdownCameraSessions);
