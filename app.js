// ============================================
// FaceHelper - Face Recognition Assistant
// ============================================

// Global State
let video, canvas, ctx;
let enrollVideo, enrollCanvas, enrollCtx;
let stream = null;
let enrollStream = null;
let isRecognizing = false;
let recognitionInterval = null;
let ttsEnabled = false;
let currentMode = 'recognize';

// Enrollment State
let enrollmentPhotos = [];
let enrollmentDescriptors = [];

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

async function startCamera(targetVideo = 'video') {
    try {
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (targetVideo === 'video') {
            stream = mediaStream;
            video = document.getElementById('video');
            video.srcObject = stream;
            
            video.onloadedmetadata = () => {
                canvas = document.getElementById('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx = canvas.getContext('2d');
            };
            
            updateCameraStatus(true);
        } else {
            enrollStream = mediaStream;
            enrollVideo = document.getElementById('enroll-video');
            enrollVideo.srcObject = stream;
            
            enrollVideo.onloadedmetadata = () => {
                enrollCanvas = document.getElementById('enroll-canvas');
                enrollCanvas.width = enrollVideo.videoWidth;
                enrollCanvas.height = enrollVideo.videoHeight;
                enrollCtx = enrollCanvas.getContext('2d');
            };
        }
        
        return true;
    } catch (error) {
        console.error('Camera error:', error);
        showToast('Camera access denied. Please enable camera permissions.');
        return false;
    }
}

async function stopCamera(targetStream = stream) {
    if (targetStream) {
        targetStream.getTracks().forEach(track => track.stop());
        if (targetStream === stream) {
            stream = null;
            updateCameraStatus(false);
        } else {
            enrollStream = null;
        }
    }
}

async function toggleCamera() {
    if (stream) {
        await stopCamera();
        stopRecognition();
        document.querySelector('.overlay-btn.secondary').textContent = '📷 Start Camera';
    } else {
        const started = await startCamera();
        if (started) {
            startRecognition();
            document.querySelector('.overlay-btn.secondary').textContent = '📷 Stop Camera';
        }
    }
}

function updateCameraStatus(active) {
    const statusDot = document.getElementById('camera-status');
    const statusText = document.getElementById('camera-status-text');
    
    if (active) {
        statusDot.classList.remove('inactive');
        statusText.textContent = 'Camera Active';
    } else {
        statusDot.classList.add('inactive');
        statusText.textContent = 'Camera Off';
    }
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
    
    // Handle mode-specific logic
    if (mode === 'recognize') {
        // Camera handled by toggle button
    } else if (mode === 'enroll') {
        startEnrollmentMode();
    } else if (mode === 'gallery') {
        updateGallery();
    }
}

// ============================================
// Recognition Mode
// ============================================

function startRecognition() {
    if (!stream) return;
    
    isRecognizing = true;
    recognitionInterval = setInterval(async () => {
        if (!isRecognizing || !video) return;
        
        try {
            const detections = await faceapi.detectAllFaces(
                video,
                new faceapi.TinyFaceDetectorOptions()
            )
            .withFaceLandmarks()
            .withFaceDescriptors();
            
            if (detections.length > 0) {
                await processDetections(detections);
            } else {
                document.getElementById('recognition-result').textContent = 'No face detected';
            }
        } catch (error) {
            console.error('Recognition error:', error);
        }
    }, 500);
}

function stopRecognition() {
    isRecognizing = false;
    if (recognitionInterval) {
        clearInterval(recognitionInterval);
        recognitionInterval = null;
    }
}

async function processDetections(detections) {
    const people = await getAllFromDB();
    
    if (people.length === 0) {
        document.getElementById('recognition-result').textContent = 'No people enrolled yet';
        return;
    }
    
    // Build labeled face descriptors
    const labeledDescriptors = people.map(person => {
        return new faceapi.LabeledFaceDescriptors(
            person.name,
            person.descriptors.map(d => new Float32Array(d))
        );
    });
    
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    
    // Match detected faces
    const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor));
    
    // Get unique names
    const names = results.map(r => r.toString()).join(', ');
    const displayNames = results.map(r => {
        if (r.label === 'unknown') {
            return 'Unknown';
        }
        return r.label;
    });
    
    // Display result
    const resultText = displayNames.join(' • ');
    document.getElementById('recognition-result').textContent = resultText;
    
    // Speak if TTS enabled
    if (ttsEnabled && displayNames.length > 0) {
        speakNames(displayNames);
    }
    
    // Draw on canvas
    drawDetections(detections, results);
}

function drawDetections(detections, results) {
    if (!ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    detections.forEach((detection, i) => {
        const box = detection.detection.box;
        const result = results[i];
        
        // Draw box
        ctx.strokeStyle = result.label === 'unknown' ? '#f56565' : '#48bb78';
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw label
        const label = result.label === 'unknown' ? 'Unknown' : result.label;
        ctx.fillStyle = result.label === 'unknown' ? '#f56565' : '#48bb78';
        ctx.fillRect(box.x, box.y - 30, ctx.measureText(label).width + 10, 30);
        
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.fillText(label, box.x + 5, box.y - 10);
    });
}

// ============================================
// Text-to-Speech
// ============================================

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    
    const statusDot = document.getElementById('tts-status');
    const statusText = document.getElementById('tts-status-text');
    
    if (ttsEnabled) {
        statusDot.classList.remove('inactive');
        statusText.textContent = 'On';
        showToast('Audio enabled');
    } else {
        statusDot.classList.add('inactive');
        statusText.textContent = 'Off';
        showToast('Audio disabled');
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

async function startEnrollmentMode() {
    // Reset state
    enrollmentPhotos = [];
    enrollmentDescriptors = [];
    updatePhotoCount();
    
    // Start camera if not already
    if (!enrollStream) {
        await startEnrollCamera();
    }
}

async function startEnrollCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        enrollStream = await navigator.mediaDevices.getUserMedia(constraints);
        enrollVideo = document.getElementById('enroll-video');
        enrollVideo.srcObject = enrollStream;
        
        enrollVideo.onloadedmetadata = () => {
            enrollCanvas = document.getElementById('enroll-canvas');
            enrollCanvas.width = enrollVideo.videoWidth;
            enrollCanvas.height = enrollVideo.videoHeight;
            enrollCtx = enrollCanvas.getContext('2d');
        };
    } catch (error) {
        console.error('Enrollment camera error:', error);
        showToast('Camera access required for enrollment');
    }
}

async function capturePhoto() {
    if (!enrollVideo || !enrollStream) {
        showToast('Please start camera first');
        return;
    }
    
    if (enrollmentDescriptors.length >= 20) {
        showToast('Maximum 20 photos per person');
        return;
    }
    
    try {
        // Detect face
        const detection = await faceapi.detectSingleFace(
            enrollVideo,
            new faceapi.TinyFaceDetectorOptions()
        )
        .withFaceLandmarks()
        .withFaceDescriptor();
        
        if (!detection) {
            showToast('No face detected. Please try again.');
            return;
        }
        
        // Store descriptor
        enrollmentDescriptors.push(Array.from(detection.descriptor));
        
        // Capture image (optional, for visual feedback)
        enrollCtx.drawImage(enrollVideo, 0, 0);
        const imageData = enrollCanvas.toDataURL('image/jpeg', 0.7);
        enrollmentPhotos.push(imageData);
        
        updatePhotoCount();
        showToast(`Photo ${enrollmentPhotos.length} captured`);
        
        // Flash effect
        enrollCanvas.style.opacity = '0';
        setTimeout(() => {
            enrollCanvas.style.opacity = '1';
        }, 100);
        
    } catch (error) {
        console.error('Capture error:', error);
        showToast('Failed to capture photo');
    }
}

function updatePhotoCount() {
    document.getElementById('photo-count').textContent = enrollmentPhotos.length;
    
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
        showToast('Please capture at least 3 photos');
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
        
        // Reset form
        document.getElementById('person-name').value = '';
        enrollmentPhotos = [];
        enrollmentDescriptors = [];
        updatePhotoCount();
        updateGallery();
        
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

// Handle page visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden && stream) {
        // Page is hidden, could pause recognition
    } else if (!document.hidden && stream && isRecognizing) {
        // Page is visible again
    }
});
