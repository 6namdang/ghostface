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
    updateLoadingProgress('Initializing database...');
    await initDB();
    
    updateLoadingProgress('Loading face detection models...');
    await loadModels();
    
    updateLoadingProgress('Ready!');
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
        updateGallery();
    }, 500);
}

function updateLoadingProgress(message) {
    document.getElementById('loading-progress').textContent = message;
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

async function loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
    
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        console.log('Models loaded successfully');
    } catch (error) {
        console.error('Error loading models:', error);
        showToast('Failed to load models. Please refresh.');
    }
}

// ============================================
// Camera Management
// ============================================

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 960 },
                height: { ideal: 720 }
            },
            audio: false
        });

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
    const cameraButton = document.getElementById('recognition-camera-btn');
    cameraButton.disabled = true;

    if (stream) {
        stopRecognition();
        await stopCamera();
        showRecognitionCameraOff();
        cameraButton.disabled = false;
        return;
    }

    cameraButton.textContent = 'Opening camera…';
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
    cameraButton.textContent = 'Stop camera';
    cameraButton.disabled = false;
    await startRecognition();
}

function showRecognitionCameraOff() {
    const cameraContainer = document.getElementById('recognition-camera');
    cameraContainer.classList.add('camera-off');
    cameraContainer.style.removeProperty('aspect-ratio');
    document.getElementById('recognition-placeholder').classList.remove('hidden');
    document.getElementById('camera-live-badge').classList.add('hidden');
    document.getElementById('recognition-camera-btn').textContent = 'Start camera';
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
    currentMode = mode;
    
    // Update buttons
    document.querySelectorAll('.mode-toggle button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');
    
    // Hide all modes
    document.getElementById('recognize-mode').classList.add('hidden');
    document.getElementById('enroll-mode').classList.add('hidden');
    document.getElementById('gallery-mode').classList.add('hidden');
    
    // Show selected mode
    document.getElementById(`${mode}-mode`).classList.remove('hidden');
    
    // Only one camera stream should be active at a time. Releasing the
    // recognition camera here prevents a blank enrollment preview on mobile.
    if (mode !== 'recognize' && stream) {
        stopRecognition();
        stopCamera();
        showRecognitionCameraOff();
    }
    
    if (mode !== 'enroll') {
        closeEnrollCamera();
    }

    // Handle mode-specific logic
    if (mode === 'enroll') {
        startEnrollmentMode();
    } else if (mode === 'gallery') {
        updateGallery();
    }
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

    card.dataset.state = state;
    label.textContent = labels[state] || 'Status';
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
    if (enrollStream || isCapturing || isProcessingUploads) return;

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

        enrollStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 960 },
                height: { ideal: 720 }
            },
            audio: false
        });

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
    grid.innerHTML = enrollmentPhotos.map((photo, index) => `
        <div class="accepted-photo">
            <img src="${photo}" alt="Added photo ${index + 1}">
            <button type="button" class="remove-photo" onclick="removeEnrollmentPhoto(${index})" aria-label="Remove photo ${index + 1}">×</button>
        </div>
    `).join('');
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
        button.disabled = isBusy || atLimit;
    });
    updateEnrollmentControls();
}

function updateEnrollmentControls() {
    const captureButton = document.getElementById('capture-btn');
    if (!captureButton) return;

    const busy = isCapturing || isProcessingUploads;
    const atLimit = enrollmentDescriptors.length >= 20;
    captureButton.disabled = busy || atLimit || !enrollStream;
    captureButton.textContent = isCapturing ? 'Adding photo…' : 'Take photo';
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
    document.getElementById('photo-count').textContent = count;
    document.getElementById('photo-progress').style.width = `${Math.min(100, (count / 3) * 100)}%`;
    document.getElementById('photo-guidance').textContent = count >= 3
        ? 'Ready to save. More varied photos can improve recognition.'
        : `Add ${3 - count} more photo${3 - count === 1 ? '' : 's'} to continue.`;
    
    const saveBtn = document.getElementById('save-person-btn');
    const nameInput = document.getElementById('person-name');
    saveBtn.disabled = enrollmentDescriptors.length < 3 || !nameInput.value.trim();
}

// Enable save button when name is entered
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('person-name');
    if (nameInput) {
        nameInput.addEventListener('input', updatePhotoCount);
    }
});

async function savePerson() {
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
    const people = await getAllFromDB();
    const galleryContent = document.getElementById('gallery-content');
    
    if (people.length === 0) {
        galleryContent.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
                <h3>No People Enrolled</h3>
                <p>Add people to get started with face recognition</p>
                <button class="btn btn-primary" onclick="switchMode('enroll')" style="max-width: 300px;">
                    ➕ Add Your First Person
                </button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="gallery-grid">';
    
    people.forEach(person => {
        const initials = person.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        html += `
            <div class="person-card" onclick="viewPerson(${person.id})">
                <div class="person-avatar">${initials}</div>
                <h3>${person.name}</h3>
                <p>${person.photoCount} photos</p>
                <div class="person-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); editPerson(${person.id})">Edit</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deletePerson(${person.id}, '${person.name}')">Delete</button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    galleryContent.innerHTML = html;
}

function viewPerson(id) {
    // Could show detailed view
    console.log('View person:', id);
}

// ============================================
// Edit Person
// ============================================

async function editPerson(id) {
    const people = await getAllFromDB();
    currentEditPerson = people.find(p => p.id === id);
    
    if (!currentEditPerson) {
        showToast('Person not found');
        return;
    }
    
    document.getElementById('edit-name').value = currentEditPerson.name;
    document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
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
        currentEditPerson.name = newName;
        await updateInDB(currentEditPerson);
        showToast('Person updated successfully');
        closeEditModal();
        updateGallery();
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
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
    currentDeletePerson = null;
}

async function confirmDelete() {
    if (!currentDeletePerson) return;
    
    try {
        await deleteFromDB(currentDeletePerson);
        showToast('Person deleted successfully');
        closeDeleteModal();
        updateGallery();
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
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================
// Initialize App
// ============================================

window.addEventListener('load', init);

// Register the service worker (offline support + Android "Install app").
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.error('Service worker registration failed:', error);
        });
    });
}

// Handle page visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden && stream) {
        // Page is hidden, could pause recognition
    } else if (!document.hidden && stream && isRecognizing) {
        // Page is visible again
    }
});
