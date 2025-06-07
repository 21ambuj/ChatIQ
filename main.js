// main.js - Client-Side API Key Version

// --- IMPORTANT NOTE ON API KEY SECURITY ---
// This version is configured to read your API keys directly from a `config.js`
// file loaded in the browser. This is convenient for development but INSECURE
// for a live, public application.
//
// Do NOT deploy an application with this setup to production, as anyone can
// view your source code and steal your API keys. For deployment, you MUST use a
// backend endpoint to protect your keys.

// --- Firebase & API Configuration (from config.js) ---
// This script now expects a `config.js` file to be loaded BEFORE it, which defines
// a global `API_CONFIG` object like this:
//
// const API_CONFIG = {
//   FIREBASE_CONFIG: {
//     apiKey: "...",
//     authDomain: "...",
//     projectId: "...",
//     storageBucket: "...",
//     messagingSenderId: "...",
//     appId: "..."
//   },
//   GOOGLE_API_KEY: "..."
// };

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, writeBatch, doc, deleteDoc, updateDoc, getDoc, limit, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// Initialize Firebase and Gemini API from the global API_CONFIG object
let firebaseConfig = {};
let geminiApiUrl = '';

if (typeof API_CONFIG !== 'undefined') {
    // Load Firebase Config
    if (API_CONFIG.FIREBASE_CONFIG) {
        firebaseConfig = API_CONFIG.FIREBASE_CONFIG;
    } else {
        console.error("Firebase config is missing from API_CONFIG in config.js");
        showError("Firebase configuration is missing.");
    }

    // Load Gemini API Key
    if (API_CONFIG.GOOGLE_API_KEY) {
        geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_CONFIG.GOOGLE_API_KEY}`;
    } else {
        console.error("Google API key is missing from API_CONFIG in config.js");
        showError("Gemini API key is not configured.");
    }
} else {
    console.error("CRITICAL: `API_CONFIG` is not defined. Ensure `config.js` is loaded before this script.");
    showError("Configuration file is missing. The app cannot function.");
}


const appIdForPath = firebaseConfig.appId || 'default-app-id';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);


// --- DOM Element and State Variables ---
let chatBox, chatBoxWrapper, userInput, sendBtn, fileUploadBtn, fileInput, cameraBtn, voiceInputBtn,
    imagePreviewContainer, imagePreview, removeImageBtn, loadingIndicator, errorMessageDisplay,
    googleSignInBtnHeader, userDetailsHeaderDiv, userDisplayNameHeaderSpan, signOutBtnHeader,
    interactiveChatSection, alternativeVoiceSection, newChatBtn,
    cameraModal, videoPreviewModal, captureModalBtn, closeCameraModalBtn, sessionsListEl,
    chatHistoryToggleBtn, chatHistorySidebar, sidebarOverlay;

// State
let currentBase64Image = null, currentMimeType = null, mediaStream = null,
    speechRecognition = null, isRecording = false, currentUserId = null, activeSessionId = null;
let messagesUnsubscribe = null, sessionsUnsubscribe = null;

const conversationMemory = {
  shortTerm: [],
  longTerm: {},
  addMessage: function(sender, content) { this.shortTerm.push({ sender, content }); if (this.shortTerm.length > 20) this.shortTerm.shift(); },
  getContext: function() { return this.shortTerm.map(msg => `${msg.sender}: ${msg.content}`).join('\n'); },
  clearShortTerm: function() { this.shortTerm = []; },
  saveLongTerm: function(sessionId, key, value) { if (!this.longTerm[sessionId]) this.longTerm[sessionId] = {}; this.longTerm[sessionId][key] = value; },
  getLongTerm: function(sessionId, key) { return this.longTerm[sessionId]?.[key] || null; }
};

const botPersonaInstructions = `
SYSTEM GUIDELINES (Enhanced):
1. Maintain context. 2. For complex queries: provide key points with 🔑. 3. Verify facts.
4. Use structured responses. 5. Use analogies. 6. Be conversational. 7. Self-correct.
8. On 'who are you', 'your name', etc., respond only with "I am ChatIQ bot made by ChatIQ AI."
9. Adapt to user's language.`;


// --- Main Initialization on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    assignDomElements();
    initializeSpeechRecognition();
    setupEventListeners();
    setupAuthListener();
});

function assignDomElements() {
    chatBox = document.getElementById('chatBox');
    chatBoxWrapper = document.getElementById('chatBoxWrapper');
    userInput = document.getElementById('userInput');
    sendBtn = document.getElementById('sendBtn');
    fileUploadBtn = document.getElementById('fileUploadBtn');
    fileInput = document.getElementById('fileInput');
    cameraBtn = document.getElementById('cameraBtn');
    voiceInputBtn = document.getElementById('voiceInputBtn');
    imagePreviewContainer = document.getElementById('imagePreviewContainer');
    imagePreview = document.getElementById('imagePreview');
    removeImageBtn = document.getElementById('removeImageBtn');
    loadingIndicator = document.getElementById('loadingIndicator');
    errorMessageDisplay = document.getElementById('errorMessage');
    googleSignInBtnHeader = document.getElementById('googleSignInBtnHeader');
    userDetailsHeaderDiv = document.getElementById('userDetailsHeader');
    userDisplayNameHeaderSpan = document.getElementById('userDisplayNameHeader');
    signOutBtnHeader = document.getElementById('signOutBtnHeader');
    interactiveChatSection = document.getElementById('interactiveChatSection');
    alternativeVoiceSection = document.getElementById('alternativeVoiceSection');
    newChatBtn = document.getElementById('newChatBtn');
    cameraModal = document.getElementById('cameraModal');
    videoPreviewModal = document.getElementById('videoPreviewModal');
    captureModalBtn = document.getElementById('captureModalBtn');
    closeCameraModalBtn = document.getElementById('closeCameraModalBtn');
    sessionsListEl = document.getElementById('sessionsList');
    chatHistoryToggleBtn = document.getElementById('chatHistoryToggleBtn');
    chatHistorySidebar = document.getElementById('chatHistorySidebar');
    sidebarOverlay = document.getElementById('sidebarOverlay');
}


// --- Event Listener Setup ---
function setupEventListeners() {
    if(googleSignInBtnHeader) googleSignInBtnHeader.addEventListener('click', signInWithGoogle);
    if(signOutBtnHeader) signOutBtnHeader.addEventListener('click', signOutUser);
    if(newChatBtn) newChatBtn.addEventListener('click', startNewUnsavedChat);
    if(sendBtn) sendBtn.addEventListener('click', handleSendMessageWrapper);
    if(userInput) userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessageWrapper(); }
    });
    if(fileUploadBtn) fileUploadBtn.addEventListener('click', () => fileInput?.click());
    if(fileInput) fileInput.addEventListener('change', handleFileSelect);
    if(removeImageBtn) removeImageBtn.addEventListener('click', removeImagePreview);
    if(cameraBtn) cameraBtn.addEventListener('click', openCameraModal);
    if(captureModalBtn) captureModalBtn.addEventListener('click', captureImageFromModal);
    if(closeCameraModalBtn) closeCameraModalBtn.addEventListener('click', closeCameraModalAndStream);
    if(voiceInputBtn) voiceInputBtn.addEventListener('click', toggleVoiceInput);

    if (chatHistoryToggleBtn && chatHistorySidebar && sidebarOverlay) {
        chatHistoryToggleBtn.addEventListener('click', () => {
            chatHistorySidebar.classList.toggle('-translate-x-full');
            sidebarOverlay.classList.toggle('hidden');
        });
        sidebarOverlay.addEventListener('click', () => {
            chatHistorySidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('hidden');
        });
    }
}

// --- Firebase Authentication ---
function setupAuthListener() {
    if (!auth) {
        console.error("Firebase Auth not initialized.");
        updateUIToLoggedOutState();
        return;
    }
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            console.debug("User is authenticated with UID:", currentUserId);
            updateUIToLoggedInState(user);
            loadUserSessionsAndData();
        } else {
            console.debug("No user signed in, attempting anonymous sign-in.");
            signInAnonymously(auth).catch(error => {
                console.error("Anonymous sign-in failed:", error);
                updateUIToLoggedOutState();
            });
        }
    });
}

async function signInWithGoogle() {
    if (!auth) { showError("Firebase Auth not available."); return; }
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        showError(`Sign-In Failed: ${error.message}`);
    }
}

async function signOutUser() {
    if (!auth) { showError("Firebase Auth not available."); return; }
    try {
        await signOut(auth);
        console.debug("User signed out successfully.");
    } catch (error) {
        console.error("Sign Out Error:", error);
        showError("Error signing out: " + error.message);
    }
}

// --- UI Update Functions ---
function updateUIToLoggedInState(user) {
    if(userDisplayNameHeaderSpan) userDisplayNameHeaderSpan.textContent = `Hi, ${user.displayName || 'User'}!`;
    if(googleSignInBtnHeader) googleSignInBtnHeader.style.display = 'none';
    if(newChatBtn) newChatBtn.style.display = 'inline-block';
    if(userDetailsHeaderDiv) userDetailsHeaderDiv.style.display = 'flex';
    if(interactiveChatSection) { interactiveChatSection.style.display = 'flex'; interactiveChatSection.classList.add('flex-1'); }
    if(alternativeVoiceSection) alternativeVoiceSection.style.display = 'none';
    if(chatHistoryToggleBtn) chatHistoryToggleBtn.style.display = 'block';
    if(chatHistorySidebar) {
        chatHistorySidebar.classList.remove('sm:w-0', 'sm:p-0');
        chatHistorySidebar.classList.add('sm:w-64', 'sm:p-3', 'sm:border-r', 'sm:border-slate-200');
    }
}

function updateUIToLoggedOutState() {
    currentUserId = null; activeSessionId = null;
    if(userDisplayNameHeaderSpan) userDisplayNameHeaderSpan.textContent = '';
    if(googleSignInBtnHeader) googleSignInBtnHeader.style.display = 'inline-block';
    if(newChatBtn) newChatBtn.style.display = 'none';
    if(userDetailsHeaderDiv) userDetailsHeaderDiv.style.display = 'none';
    if(interactiveChatSection) { interactiveChatSection.style.display = 'none'; interactiveChatSection.classList.remove('flex-1'); }
    if(alternativeVoiceSection) alternativeVoiceSection.style.display = 'block';
    if(chatHistoryToggleBtn) chatHistoryToggleBtn.style.display = 'none';
    if(chatHistorySidebar) {
        chatHistorySidebar.classList.add('sm:w-0', 'sm:p-0', '-translate-x-full');
        chatHistorySidebar.classList.remove('sm:w-64', 'sm:p-3', 'sm:border-r', 'sm:border-slate-200');
    }
    if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
    if(messagesUnsubscribe) messagesUnsubscribe();
    if(sessionsUnsubscribe) sessionsUnsubscribe();
    if(chatBox) chatBox.innerHTML = '<div class="text-center text-gray-500 p-4">Please sign in to chat.</div>';
    if(sessionsListEl) sessionsListEl.innerHTML = '';
}

function loadUserSessionsAndData() {
    loadChatSessions();
    const restoredSessionId = sessionStorage.getItem('activeChatIQSessionId');
    if (restoredSessionId && restoredSessionId !== "TEMP_NEW_SESSION") {
        const sessionDocRef = doc(db, `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${restoredSessionId}`);
        getDoc(sessionDocRef).then(docSnap => {
            if (docSnap.exists()) {
                selectSession(restoredSessionId);
            } else {
                sessionStorage.removeItem('activeChatIQSessionId');
                startNewUnsavedChat();
            }
        });
    } else {
        startNewUnsavedChat();
    }
}

// --- Chat Session Management ---
function startNewUnsavedChat() {
    activeSessionId = "TEMP_NEW_SESSION";
    sessionStorage.removeItem('activeChatIQSessionId');
    conversationMemory.clearShortTerm();
    if (chatBox) {
        chatBox.innerHTML = '';
        addMessageToChat("Hi! How can I help you today?", "bot");
    }
    if (sessionsListEl) {
        sessionsListEl.querySelectorAll('.session-item.active').forEach(item => {
            item.classList.remove('active', 'bg-blue-100', 'text-blue-700');
        });
    }
    if (chatHistorySidebar?.classList.contains('-translate-x-full') === false && window.innerWidth < 640) {
        chatHistorySidebar.classList.add('-translate-x-full');
        sidebarOverlay?.classList.add('hidden');
    }
}

async function deleteSession(sessionIdToDelete) {
    if (!currentUserId || !sessionIdToDelete) { showError("Cannot delete session."); return; }
    // NOTE: This now deletes directly. For a better user experience,
    // you should build a custom modal dialog to ask for confirmation.
    try {
        const messagesPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToDelete}/messages`;
        const messagesQuery = query(collection(db, messagesPath));
        const messagesSnapshot = await getDocs(messagesQuery);
        const batch = writeBatch(db);
        messagesSnapshot.forEach(docMsg => batch.delete(docMsg.ref));
        await batch.commit();

        const sessionDocPath = doc(db, `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToDelete}`);
        await deleteDoc(sessionDocPath);

        if (activeSessionId === sessionIdToDelete) {
            startNewUnsavedChat();
        }
    } catch (error) {
        console.error(`Error deleting session ${sessionIdToDelete}:`, error);
        showError("Failed to delete chat: " + error.message);
    }
}

function loadChatSessions() {
    if (!currentUserId || !sessionsListEl) return;
    if (sessionsUnsubscribe) sessionsUnsubscribe();

    const sessionsColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions`;
    const q = query(collection(db, sessionsColPath), orderBy("lastActivity", "desc"));

    sessionsUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!sessionsListEl) return;
        sessionsListEl.innerHTML = snapshot.empty ? '<div class="text-xs text-gray-400 p-2 text-center">No chat history.</div>' : '';
        snapshot.forEach((docSnap) => {
            const session = docSnap.data();
            const sessionId = docSnap.id;
            const item = document.createElement('div');
            item.dataset.sessionId = sessionId;
            item.className = `session-item p-2 rounded-md cursor-pointer text-sm text-slate-700 flex justify-between items-center hover:bg-slate-200 ${sessionId === activeSessionId ? 'active bg-blue-100 text-blue-700' : ''}`;
            item.innerHTML = `
                <span class="truncate flex-1 mr-2">${session.title || `Chat ${session.createdAt?.toDate().toLocaleDateString() || ''}`}</span>
                <button title="Delete session" class="delete-session-btn text-red-400 hover:text-red-600 font-bold px-2 py-1 rounded hover:bg-red-100">&times;</button>
            `;
            item.querySelector('.delete-session-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteSession(sessionId); });
            item.addEventListener('click', () => selectSession(sessionId));
            sessionsListEl.appendChild(item);
        });
    }, (error) => {
        console.error("Error loading chat sessions:", error);
    });
}

function selectSession(sessionId) {
    if (!sessionId || activeSessionId === sessionId) return;
    activeSessionId = sessionId;
    sessionStorage.setItem('activeChatIQSessionId', activeSessionId);
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (chatBox) chatBox.innerHTML = '<div class="text-center text-gray-400 p-4">Loading chat...</div>';
    loadChatHistory(activeSessionId);
    if (sessionsListEl) {
        sessionsListEl.querySelectorAll('.session-item').forEach(item => {
            item.classList.toggle('active', item.dataset.sessionId === sessionId);
            item.classList.toggle('bg-blue-100', item.dataset.sessionId === sessionId);
            item.classList.toggle('text-blue-700', item.dataset.sessionId === sessionId);
        });
    }
}

async function saveMessageToFirestore(messageData) {
    if (!currentUserId) { return null; }
    let sessionToSaveToId = activeSessionId;
    let messageId = null;

    if (activeSessionId === "TEMP_NEW_SESSION") {
        const firstMsg = messageData.content.substring(0, 35);
        try {
            const sessionsColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions`;
            const sessionRef = await addDoc(collection(db, sessionsColPath), {
                title: firstMsg + (messageData.content.length > 35 ? '...' : ''),
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });
            activeSessionId = sessionRef.id;
            sessionToSaveToId = activeSessionId;
            sessionStorage.setItem('activeChatIQSessionId', activeSessionId);
            loadChatHistory(activeSessionId);
        } catch (error) {
            console.error("Error creating new session:", error);
            showError("Could not start a new chat.");
            return null;
        }
    }

    try {
        const messagesColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionToSaveToId}/messages`;
        const docRef = await addDoc(collection(db, messagesColPath), { ...messageData, timestamp: serverTimestamp() });
        messageId = docRef.id;
        const sessionDocRef = doc(db, `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionToSaveToId}`);
        await updateDoc(sessionDocRef, { lastActivity: serverTimestamp() });
    } catch (error) {
        console.error("Error saving message:", error);
    }
    return messageId;
}

function loadChatHistory(sessionIdToLoad) {
    if (!currentUserId || !sessionIdToLoad || sessionIdToLoad === "TEMP_NEW_SESSION") return;
    if (messagesUnsubscribe) messagesUnsubscribe();

    const messagesColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToLoad}/messages`;
    const q = query(collection(db, messagesColPath), orderBy("timestamp", "asc"));

    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!chatBox || !chatBoxWrapper) return;
        chatBox.innerHTML = '';
        conversationMemory.clearShortTerm();
        snapshot.forEach((docMsg) => {
            const msg = docMsg.data();
            const messageId = docMsg.id;
            if (msg.type === 'image') addImageToChatLog(msg.content, msg.mimeType, msg.sender);
            else addMessageToChat(msg.content, msg.sender, messageId);
            conversationMemory.addMessage(msg.sender, msg.type === 'image' ? '[Image]' : msg.content);
        });
        if (snapshot.empty) addMessageToChat("This chat is empty. Send a message to start!", "bot");
        chatBoxWrapper.scrollTop = chatBoxWrapper.scrollHeight;
    });
}

// --- Chat UI, Message Sending, and Media Functions ---
function addMessageToChat(text, sender, messageId = null) {
    if (!chatBox) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex w-full py-1 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot';
    bubbleDiv.textContent = text; // Simplified for now, can add back code block handling if needed

    if (sender === 'bot' && messageId) {
      const feedbackButtons = addFeedbackButtons(messageId, text);
      bubbleDiv.appendChild(feedbackButtons);
    }

    messageDiv.appendChild(bubbleDiv);
    chatBox.appendChild(messageDiv);
    chatBoxWrapper.scrollTop = chatBoxWrapper.scrollHeight;
}

function addImageToChatLog(base64, mime, sender) { /* ... same as before ... */ }
function handleSendMessageWrapper() {
    if (!currentUserId) {
        showError("Please sign in to send messages.");
        return;
    }
    handleSendMessage();
}

async function handleSendMessage() {
    const textContent = userInput.value.trim();
    const imageBase64 = currentBase64Image;
    const imageMimeType = currentMimeType;

    if (!textContent && !imageBase64) return;
    if (userInput) userInput.value = '';
    removeImagePreview();

    if (imageBase64) await saveMessageToFirestore({ sender: 'user', type: 'image', content: imageBase64, mimeType: imageMimeType });
    if (textContent) await saveMessageToFirestore({ sender: 'user', type: 'text', content: textContent });

    if (activeSessionId === "TEMP_NEW_SESSION") await new Promise(r => setTimeout(r, 200));
    if (activeSessionId === "TEMP_NEW_SESSION") { showError("Could not start a new chat."); return; }

    showLoading(true);

    try {
        const contents = conversationMemory.shortTerm.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const lastContent = contents[contents.length - 1];
        lastContent.parts[0].text = `${botPersonaInstructions}\n\nUSER QUERY:\n${textContent || '(Analyze the image)'}`;
        if (imageBase64 && imageMimeType) {
            lastContent.parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const payload = { contents };
        const botResponseText = await callGeminiAPI(payload);

        await saveMessageToFirestore({ sender: 'bot', type: 'text', content: botResponseText });
        speakResponse(botResponseText);
    } catch (error) {
        console.error('Error in handleSendMessage:', error);
        await saveMessageToFirestore({ sender: 'bot', type: 'text', content: "Sorry, an error occurred." });
    } finally {
        showLoading(false);
    }
}

async function callGeminiAPI(payload) {
    if (!geminiApiUrl) {
        return "AI service is not configured. Please check your config.js file.";
    }
    try {
        const resp = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const errorBody = await resp.json().catch(() => ({ error: { message: "Unknown API error." }}));
            console.error("Gemini API Error:", errorBody);
            return `Error from AI service: ${errorBody.error.message}`;
        }
        const data = await resp.json();
        // Extract the text from the response
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            return data.candidates[0].content.parts[0].text;
        } else {
            return "Sorry, I received an empty response from the AI.";
        }
    } catch (error) {
        console.error("Failed to call Gemini API:", error);
        return "Failed to connect to the AI service.";
    }
}


// --- Utility, Speech, and Feedback Functions ---
function showLoading(isLoading) { if(loadingIndicator) loadingIndicator.classList.toggle('hidden', !isLoading); }
function showError(messageText) {
    if (!errorMessageDisplay) return;
    errorMessageDisplay.textContent = messageText;
    errorMessageDisplay.classList.remove('hidden');
    setTimeout(() => errorMessageDisplay.classList.add('hidden'), 5000);
}

// ... the rest of your functions (initializeSpeechRecognition, speakResponse, etc.) remain largely the same ...
// They are included here for completeness.

function initializeSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
        speechRecognition = new SR(); speechRecognition.continuous = false; speechRecognition.lang = 'en-US';
        speechRecognition.interimResults = false; speechRecognition.maxAlternatives = 1;
        speechRecognition.onresult = (e) => { const r = e.results[0][0].transcript.trim(); if(userInput)userInput.value=r; stopRecording(); if(r)handleSendMessageWrapper(); else showError("Voice input empty.");};
        speechRecognition.onerror = (e) => { let m=`Speech error: ${e.error}.`; if(e.error==='no-speech')m="No speech."; else if(e.error==='audio-capture')m="Mic error."; else if(e.error==='not-allowed')m="Mic denied."; else if(e.error==='language-not-supported')m=`Lang '${speechRecognition.lang}' not supported.`; showError(m); stopRecording();};
        speechRecognition.onend = () => { if (isRecording) stopRecording(); };
    } else { if(voiceInputBtn) voiceInputBtn.disabled = true; showError('Voice input not supported.'); }
}

async function speakResponse(textToSpeak) {
    if('speechSynthesis' in window) window.speechSynthesis.cancel();
    let langCode = 'en-US'; if(/[\u0900-\u097F]/.test(textToSpeak)) langCode = 'hi-IN';
    if('speechSynthesis' in window){
        const utterance = new SpeechSynthesisUtterance(textToSpeak); utterance.lang = langCode;
        try {
            let voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                await new Promise(resolve => window.speechSynthesis.onvoiceschanged = resolve);
                voices = window.speechSynthesis.getVoices();
            }
            if(voices.length > 0){ const voice = voices.find(v => v.lang === langCode); if(voice) utterance.voice = voice;}
        } catch(e) { console.warn("Could not set voices for TTS:", e); }
        window.speechSynthesis.speak(utterance);
    } else console.warn('Browser SpeechSynthesis not available.');
}

function toggleVoiceInput(){ if(!speechRecognition){ showError('Voice input unavailable.'); return; } if(isRecording) stopRecording(); else startRecording();}
function startRecording() {
    if (!speechRecognition) { showError("Speech recognition not ready."); return; }
    try {
        if(userInput) userInput.value = ""; if('speechSynthesis' in window) window.speechSynthesis.cancel();
        speechRecognition.start(); isRecording = true;
        if(voiceInputBtn) { voiceInputBtn.classList.add('recording'); voiceInputBtn.title = "Stop Recording"; }
    } catch(e){
        if(e.name === 'InvalidStateError'){ stopRecording(); }
        else { showError("Voice recording error: " + e.message); isRecording = false; if(voiceInputBtn) { voiceInputBtn.classList.remove('recording'); voiceInputBtn.title = "Voice Input"; }}
    }
}
function stopRecording(){
    if(speechRecognition && isRecording) { try { speechRecognition.stop(); } catch (e) { console.warn("Error stopping speech recognition:", e.message); }}
    isRecording = false; if(voiceInputBtn) { voiceInputBtn.classList.remove('recording'); voiceInputBtn.title = "Voice Input"; }
}

function handleFileSelect(e){
    const f=e.target.files[0]; if(f&&f.type.startsWith('image/')){ closeCameraModalAndStream();
    const r=new FileReader(); r.onload=(ev)=>{if(imagePreview)imagePreview.src=ev.target.result; currentBase64Image=ev.target.result.split(',')[1]; currentMimeType=f.type; if(imagePreviewContainer)imagePreviewContainer.classList.remove('hidden');}; r.readAsDataURL(f);
    } else if(f){ showError("Please select an image file."); if(fileInput)fileInput.value=null;}
}
function removeImagePreview(){ if(imagePreview)imagePreview.src='#'; if(imagePreviewContainer)imagePreviewContainer.classList.add('hidden'); currentBase64Image=null; currentMimeType=null; if(fileInput)fileInput.value=null; }
async function openCameraModal() {
    removeImagePreview(); if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if(videoPreviewModal) videoPreviewModal.srcObject = mediaStream; if(cameraModal) { cameraModal.classList.remove('hidden'); cameraModal.classList.add('flex'); }}
    catch (err) { showError("Camera error: " + err.message);}} else { showError("Camera API not supported.");}}
function closeCameraModalAndStream() { if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; } if(videoPreviewModal) videoPreviewModal.srcObject = null; if(cameraModal) {cameraModal.classList.add('hidden'); cameraModal.classList.remove('flex');}}
function captureImageFromModal() {
    if (!mediaStream || !videoPreviewModal || !videoPreviewModal.videoWidth) { showError("Camera not ready."); return; }
    const canv = document.createElement('canvas'); canv.width=videoPreviewModal.videoWidth; canv.height=videoPreviewModal.videoHeight; const ctx=canv.getContext('2d');
    if (!ctx) { showError("Canvas context error."); return; } ctx.drawImage(videoPreviewModal,0,0,canv.width,canv.height);
    const dUrl=canv.toDataURL('image/png'); if(imagePreview)imagePreview.src=dUrl; currentBase64Image=dUrl.split(',')[1]; currentMimeType='image/png';
    if(imagePreviewContainer)imagePreviewContainer.classList.remove('hidden'); closeCameraModalAndStream(); showError("Image captured!");
}
function containsVulgar(t){if(!t)return false; const V=["badword","offensive"];return V.some(b=>t.toLowerCase().includes(b));}

let welcomeSpeechInProgress = false;
function speakWelcomeMessageInternal(text) {
    if ('speechSynthesis' in window) {
        if (welcomeSpeechInProgress && window.speechSynthesis.speaking) { return; }
        const msg = new SpeechSynthesisUtterance(text);
        welcomeSpeechInProgress = true;
        msg.onstart = () => { welcomeSpeechInProgress = true; };
        msg.onend = () => { welcomeSpeechInProgress = false; };
        msg.onerror = () => { welcomeSpeechInProgress = false; };
        window.speechSynthesis.speak(msg);
    }
}
function speakWelcomeMessage() {
    speakWelcomeMessageInternal("welcome...... ,Please sign in to explore");
}
function speakWelcomeMessageOnHover() {
    if ('speechSynthesis' in window && !window.speechSynthesis.speaking && !welcomeSpeechInProgress) {
         speakWelcomeMessageInternal("welcome...... ,Please sign in to explore");
    }
}
window.speakWelcomeMessage = speakWelcomeMessage;
window.speakWelcomeMessageOnHover = speakWelcomeMessageOnHover;

function startListeningAdapter() {
    const chatSect = document.getElementById('interactiveChatSection'); const signInB = document.getElementById('googleSignInBtnHeader');
    if (currentUserId && chatSect) { chatSect.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(() => { if(userInput)userInput.focus({preventScroll:true}); toggleVoiceInput();},300);}
    else if (signInB && signInB.style.display !== 'none') signInB.click(); else showError("Please sign in to use voice chat.");
}
window.startListeningAdapter = startListeningAdapter;

async function verifyAndEnhanceResponse(apiResponse, userQuery) {
    let responseText = "Sorry, I couldn't process that.";

    if (apiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = apiResponse.candidates[0].content.parts[0].text;

        // Verification step for factual queries
        if (requiresVerification(userQuery)) {
            const verificationPrompt = `
            Please verify the following statement for accuracy and completeness based on your knowledge. If it is inaccurate, provide a corrected and improved response. If it is accurate, just repeat the original response.
            USER QUERY: ${userQuery}
            RESPONSE: ${responseText}
            `;
            const verifiedResponse = await callGeminiAPI([{
                role: "user",
                parts: [{ text: verificationPrompt }]
            }]);
            if (verifiedResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
                responseText = verifiedResponse.candidates[0].content.parts[0].text;
            }
        }
    }
    return responseText;
}

function extractKeyPoints(responseText) {
    const keyPointRegex = /(🔑 [^\n]+(\n|$))/g;
    const matches = responseText.match(keyPointRegex);
    if (matches && matches.length > 0) {
        return "KEY POINTS:\n" + matches.join('').trim();
    }
    return null;
}

function requiresVerification(query) {
    const verifyKeywords = [
        'fact', 'statistic', 'number', 'historical', 'scientific',
        'medical', 'technical', 'figure', 'data', 'research'
    ];
    return verifyKeywords.some(kw => query.toLowerCase().includes(kw));
}

async function callGeminiAPI(contents) {
    const payload = { contents };
    const response = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return response.json();
}

// --- Feedback System ---
function addFeedbackButtons(messageId, content) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'feedback-buttons flex space-x-2 mt-2 opacity-60 hover:opacity-100 transition-opacity';

    const helpfulBtn = document.createElement('button');
    helpfulBtn.innerHTML = '👍';
    helpfulBtn.title = "Helpful";
    helpfulBtn.className = 'text-xs p-1 bg-slate-200 hover:bg-green-200 text-slate-600 hover:text-green-800 rounded-full';
    helpfulBtn.onclick = (e) => {
        recordFeedback(messageId, 'helpful', content);
        e.target.closest('.feedback-buttons').innerHTML = '<span class="text-xs text-green-700">Thanks for the feedback!</span>';
    };

    const inaccurateBtn = document.createElement('button');
    inaccurateBtn.innerHTML = '👎';
    inaccurateBtn.title = "Inaccurate";
    inaccurateBtn.className = 'text-xs p-1 bg-slate-200 hover:bg-red-200 text-slate-600 hover:text-red-800 rounded-full';
    inaccurateBtn.onclick = (e) => {
        recordFeedback(messageId, 'inaccurate', content);
        e.target.closest('.feedback-buttons').innerHTML = '<span class="text-xs text-red-700">Thanks, we\'ll review this.</span>';
    };

    feedbackDiv.appendChild(helpfulBtn);
    feedbackDiv.appendChild(inaccurateBtn);

    return feedbackDiv;
}

async function recordFeedback(messageId, feedbackType, content) {
    if (!currentUserId) return;

    try {
        const feedbackPath = `artifacts/${appIdForPath}/feedback`;
        await addDoc(collection(db, feedbackPath), {
            userId: currentUserId,
            sessionId: activeSessionId,
            messageId,
            feedbackType,
            content,
            timestamp: serverTimestamp()
        });
        if (feedbackType === 'inaccurate') {
            conversationMemory.saveLongTerm(activeSessionId, `correction-${messageId}`, content);
        }
    } catch (error) {
        console.error("Error saving feedback:", error);
    }
}

async function processFeedback() {
    console.log("Checking for feedback to process...");
    const feedbackPath = `artifacts/${appIdForPath}/feedback`;
    const q = query(collection(db, feedbackPath),
        where("timestamp", ">", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    const snapshot = await getDocs(q);
    const feedbackData = [];
    snapshot.forEach(doc => {
        feedbackData.push(doc.data());
    });

    if (feedbackData.length > 0) {
        console.log(`Sending ${feedbackData.length} feedback items to training pipeline.`);
        // In a real application, you would send this data to your actual endpoint.
        // await fetch(YOUR_TRAINING_ENDPOINT, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(feedbackData)
        // });
    } else {
        console.log("No new feedback to process.");
    }
}

// Run weekly
setInterval(processFeedback, 7 * 24 * 60 * 60 * 1000);
