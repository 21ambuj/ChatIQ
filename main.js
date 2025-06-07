// main.js

// Firebase Configuration (Loaded from config.js)
let firebaseConfig = {};
if (typeof API_CONFIG !== 'undefined' && API_CONFIG.FIREBASE_CONFIG) {
    firebaseConfig = API_CONFIG.FIREBASE_CONFIG;
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
        console.error("CRITICAL: Firebase configuration in config.js is missing essential properties (apiKey, authDomain, projectId).");
        showError("Firebase configuration is incomplete. App functionality will be limited.");
        firebaseConfig = { apiKey: "", authDomain: "", projectId: "" };
    } else {
        console.log("Firebase configuration loaded successfully from config.js.");
    }
} else {
    console.error("CRITICAL: API_CONFIG or API_CONFIG.FIREBASE_CONFIG is not defined. Ensure config.js is loaded before this script and properly structured.");
    showError("Firebase configuration is missing. App functionality will be limited.");
    firebaseConfig = { apiKey: "", authDomain: "", projectId: "" };
}

// Firebase Imports
// CORRECTED: Added 'where' to the import list for Firestore queries.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, writeBatch, doc, deleteDoc, updateDoc, getDoc, limit, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

let app;
if (!getApps().length) { app = initializeApp(firebaseConfig); } else { app = getApp(); }
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
const appIdForPath = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';


// DOM Element Variables
let chatBox, chatBoxWrapper, userInput, sendBtn, fileUploadBtn, fileInput, cameraBtn, voiceInputBtn,
    imagePreviewContainer, imagePreview, removeImageBtn, loadingIndicator, errorMessageDisplay,
    googleSignInBtnHeader, userDetailsHeaderDiv, userDisplayNameHeaderSpan, signOutBtnHeader,
    interactiveChatSection, alternativeVoiceSection, swipeDownPromptElement, newChatBtn,
    signInPromptBelowVoiceBot, inlineSignInBtn, cameraModal, videoPreviewModal,
    captureModalBtn, closeCameraModalBtn, sessionsListEl, featuresSection, feedbackSection, appFooter,
    chatHistoryToggleBtn, chatHistorySidebar, sidebarOverlay;

// State Variables
let currentBase64Image = null, currentMimeType = null, mediaStream = null,
    speechRecognition = null, isRecording = false, currentUserId = null;

let activeSessionId = null;
let messagesUnsubscribe = null;
let sessionsUnsubscribe = null;

// API Configuration
let geminiApiUrl = '';
const placeholderGeminiKeyString = "YOUR_ACTUAL_GEMINI_API_KEY_PLACEHOLDER";
// CORRECTED: Added a placeholder for the training endpoint to prevent ReferenceError.
const YOUR_TRAINING_ENDPOINT = 'https://example.com/your-training-endpoint';


if (typeof API_CONFIG !== 'undefined' && API_CONFIG.GOOGLE_API_KEY && API_CONFIG.GOOGLE_API_KEY.trim() !== "" && API_CONFIG.GOOGLE_API_KEY !== placeholderGeminiKeyString) {
    geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_CONFIG.GOOGLE_API_KEY}`;
    console.log("Gemini API Key loaded successfully from config.js.");
} else {
    let errorMessage = "CRITICAL: Gemini API key issue in config.js. AI chat functionality will not work.";
    if (typeof API_CONFIG === 'undefined') {
        errorMessage = "CRITICAL: API_CONFIG is not defined. Ensure config.js is loaded before this script.";
    } else if (!API_CONFIG.GOOGLE_API_KEY || API_CONFIG.GOOGLE_API_KEY.trim() === "") {
        errorMessage = "CRITICAL: API_CONFIG.GOOGLE_API_KEY is missing or empty in config.js.";
    } else if (API_CONFIG.GOOGLE_API_KEY === placeholderGeminiKeyString) {
        errorMessage = `CRITICAL: API_CONFIG.GOOGLE_API_KEY in config.js is still the placeholder value: "${placeholderGeminiKeyString}". Please replace it with your actual key.`;
    }
    console.error(errorMessage);
    showError("Gemini API key is not configured correctly. AI chat is disabled.");

    const userInputElOnInit = document.getElementById('userInput');
    const sendBtnElOnInit = document.getElementById('sendBtn');
    if(userInputElOnInit) userInputElOnInit.disabled = true;
    if(sendBtnElOnInit) sendBtnElOnInit.disabled = true;
}
// Enhanced Memory System
const conversationMemory = {
  shortTerm: [],
  longTerm: {},

  addMessage: function(sender, content) {
    this.shortTerm.push({ sender, content });
    if (this.shortTerm.length > 20) this.shortTerm.shift();
  },

  getContext: function() {
    return this.shortTerm.map(msg => `${msg.sender}: ${msg.content}`).join('\n');
  },

  clearShortTerm: function() {
      this.shortTerm = [];
  },

  saveLongTerm: function(sessionId, key, value) {
    if (!this.longTerm[sessionId]) this.longTerm[sessionId] = {};
    this.longTerm[sessionId][key] = value;
  },

  getLongTerm: function(sessionId, key) {
    return this.longTerm[sessionId]?.[key] || null;
  }
};

// Enhanced bot instructions
const botPersonaInstructions = `
SYSTEM GUIDELINES (Enhanced):
1. Maintain context from previous messages
2. For complex queries: provide 3-5 key points with 🔑 emoji
3. Verify facts before answering
4. Use structured responses for technical content
5. Include analogies for complex concepts
6. Maintain natural conversation flow
7. Self-correct if previous response was inaccurate
8. If the user asks common predefined questions (for example: who are you, what is your name, who made you), give only i am ChatIQ bot made by ChatIQ AI ,do not use any other thing.
9. Adapt to user's language preference
`;

// --- Utility Functions ---
function showError(messageText) {
    console.error("ChatIQ Error:", messageText);
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = messageText;
        errorElement.classList.remove('hidden');
        setTimeout(() => { errorElement.classList.add('hidden'); }, 5000);
    } else {
        console.warn("showError called before #errorMessage was available. Message:", messageText);
    }
}

// --- DOMContentLoaded: Initialize after page loads ---
document.addEventListener('DOMContentLoaded', () => {
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
    swipeDownPromptElement = document.getElementById('swipeDownPrompt');
    newChatBtn = document.getElementById('newChatBtn');
    signInPromptBelowVoiceBot = document.getElementById('signInPromptBelowVoiceBot');
    inlineSignInBtn = document.getElementById('inlineSignInBtn');
    cameraModal = document.getElementById('cameraModal');
    videoPreviewModal = document.getElementById('videoPreviewModal');
    captureModalBtn = document.getElementById('captureModalBtn');
    closeCameraModalBtn = document.getElementById('closeCameraModalBtn');
    sessionsListEl = document.getElementById('sessionsList');
    featuresSection = document.getElementById('featuresSection');
    feedbackSection = document.getElementById('feedbackSection');
    appFooter = document.getElementById('appFooter');
    chatHistoryToggleBtn = document.getElementById('chatHistoryToggleBtn');
    chatHistorySidebar = document.getElementById('chatHistorySidebar');
    sidebarOverlay = document.getElementById('sidebarOverlay');

    initializeSpeechRecognition();
    setupEventListeners();
    setupAuthListener();
    conversationMemory.clearShortTerm();
    conversationMemory.longTerm = {};
});

// --- Event Listener Setup ---
function setupEventListeners() {
    if(googleSignInBtnHeader) googleSignInBtnHeader.addEventListener('click', signInWithGoogle);
    if(signOutBtnHeader) signOutBtnHeader.addEventListener('click', signOutUser);
    if(newChatBtn) newChatBtn.addEventListener('click', startNewUnsavedChat);
    if(inlineSignInBtn) inlineSignInBtn.addEventListener('click', signInWithGoogle);

    if(sendBtn) sendBtn.addEventListener('click', handleSendMessageWrapper);
    if(userInput) userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessageWrapper(); }
    });
    if(fileUploadBtn) fileUploadBtn.addEventListener('click', () => { if(fileInput) fileInput.click(); });
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
async function signInWithGoogle() {
    if (!auth) { showError("Firebase Auth not available."); return; }
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); }
    catch (error) { console.error("Google Sign-In Error:", error); showError(`Sign-In Failed: ${error.message}`); }
}

async function signOutUser() {
    if (!auth) { showError("Firebase Auth not available."); return; }
    try {
        await signOut(auth);
        activeSessionId = null;
        sessionStorage.removeItem('activeChatIQSessionId'); // Clear stored session on sign out
        if(sessionsListEl) sessionsListEl.innerHTML = '';
        if(chatBox) chatBox.innerHTML = '';
    }
    catch (error) { console.error("Sign Out Error:", error); showError("Error signing out: " + error.message); }
}

function setupAuthListener() {
    if (!auth) {
        console.error("Firebase Auth not initialized for listener.");
        showError("Critical: Auth service not ready.");
        if(interactiveChatSection) { interactiveChatSection.style.display = 'none'; interactiveChatSection.classList.remove('flex-1'); }
        if(alternativeVoiceSection) alternativeVoiceSection.style.display = 'block';
        if(signInPromptBelowVoiceBot) signInPromptBelowVoiceBot.style.display = 'block';
        if(featuresSection) featuresSection.style.display = 'block';
        if(feedbackSection) feedbackSection.style.display = 'block';
        if(appFooter) appFooter.style.display = 'block';
        if(googleSignInBtnHeader) googleSignInBtnHeader.style.display = 'inline-block';
        if(userDetailsHeaderDiv) userDetailsHeaderDiv.style.display = 'none';
        if(newChatBtn) newChatBtn.style.display = 'none';
        if(chatHistoryToggleBtn) chatHistoryToggleBtn.style.display = 'none';
        if(chatHistorySidebar) {
             chatHistorySidebar.classList.add('sm:w-0', 'sm:p-0');
             chatHistorySidebar.classList.remove('sm:w-64', 'sm:p-3', 'sm:border-r', 'sm:border-slate-200');
             chatHistorySidebar.classList.add('-translate-x-full');
        }
        if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
        return;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            if(userDisplayNameHeaderSpan) userDisplayNameHeaderSpan.textContent = `Hi, ${user.displayName || user.email.split('@')[0] || 'User'}!`;
            if(googleSignInBtnHeader) googleSignInBtnHeader.style.display = 'none';
            if(newChatBtn) newChatBtn.style.display = 'inline-block';
            if(userDetailsHeaderDiv) userDetailsHeaderDiv.style.display = 'flex';

            if(interactiveChatSection) { interactiveChatSection.style.display = 'flex'; interactiveChatSection.classList.add('flex-1'); }
            if(alternativeVoiceSection) alternativeVoiceSection.style.display = 'none';
            if(signInPromptBelowVoiceBot) signInPromptBelowVoiceBot.style.display = 'none';
            if(featuresSection) featuresSection.style.display = 'none';
            if(feedbackSection) feedbackSection.style.display = 'none';
            if(appFooter) appFooter.style.display = 'none';

            if(swipeDownPromptElement) swipeDownPromptElement.style.display = 'inline-flex';
            if(chatHistorySidebar) {
                chatHistorySidebar.classList.remove('sm:w-0', 'sm:p-0');
                chatHistorySidebar.classList.add('sm:w-64', 'sm:p-3', 'sm:border-r', 'sm:border-slate-200');
            }
            if(chatHistoryToggleBtn) chatHistoryToggleBtn.style.display = 'block';

            loadChatSessions(); // Load existing sessions into history

            const restoredSessionId = sessionStorage.getItem('activeChatIQSessionId');
            if (restoredSessionId && restoredSessionId !== "TEMP_NEW_SESSION") {
                // Check if this session actually exists for the user before selecting
                const sessionDocRef = doc(db, `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${restoredSessionId}`);
                getDoc(sessionDocRef).then(docSnap => {
                    if (docSnap.exists()) {
                        console.log("Restoring active session from sessionStorage:", restoredSessionId);
                        selectSession(restoredSessionId);
                    } else {
                        console.log("Stored session ID not found in Firestore, starting new unsaved chat.");
                        sessionStorage.removeItem('activeChatIQSessionId'); // Clear invalid stored ID
                        startNewUnsavedChat();
                    }
                }).catch(error => {
                    console.error("Error checking stored session:", error);
                    startNewUnsavedChat();
                });
            } else {
                startNewUnsavedChat();
            }

        } else {
            currentUserId = null; activeSessionId = null;
            sessionStorage.removeItem('activeChatIQSessionId'); // Clear stored session on sign out
            if(userDisplayNameHeaderSpan) userDisplayNameHeaderSpan.textContent = '';
            if(googleSignInBtnHeader) googleSignInBtnHeader.style.display = 'inline-block';
            if(newChatBtn) newChatBtn.style.display = 'none';
            if(userDetailsHeaderDiv) userDetailsHeaderDiv.style.display = 'none';

            if(interactiveChatSection) { interactiveChatSection.style.display = 'none'; interactiveChatSection.classList.remove('flex-1'); }
            if(alternativeVoiceSection) alternativeVoiceSection.style.display = 'block';
            if(signInPromptBelowVoiceBot) signInPromptBelowVoiceBot.style.display = 'block';
            if(featuresSection) featuresSection.style.display = 'block';
            if(feedbackSection) feedbackSection.style.display = 'block';
            if(appFooter) appFooter.style.display = 'block';

            if(swipeDownPromptElement) swipeDownPromptElement.style.display = 'none';
            if(chatHistorySidebar) {
                chatHistorySidebar.classList.add('sm:w-0', 'sm:p-0');
                chatHistorySidebar.classList.remove('sm:w-64', 'sm:p-3', 'sm:border-r', 'sm:border-slate-200');
                chatHistorySidebar.classList.add('-translate-x-full');
            }
            if(chatHistoryToggleBtn) chatHistoryToggleBtn.style.display = 'none';
            if(sidebarOverlay) sidebarOverlay.classList.add('hidden');

            if(messagesUnsubscribe) messagesUnsubscribe();
            if(sessionsUnsubscribe) sessionsUnsubscribe();
            if(chatBox) chatBox.innerHTML = '<div class="text-center text-gray-500 p-4">Sign in to chat & see history.</div>';
            if(sessionsListEl) sessionsListEl.innerHTML = '';
        }
    });
}

// --- Chat Session Management ---
function startNewUnsavedChat() {
    activeSessionId = "TEMP_NEW_SESSION";
    sessionStorage.removeItem('activeChatIQSessionId'); // Clear any stored session ID
    conversationMemory.clearShortTerm(); // Clear memory for new chat
    if (chatBox) {
        chatBox.innerHTML = '';
        addMessageToChat("Hi! how can i help you today?", "bot");
    }
    if (sessionsListEl) {
        sessionsListEl.querySelectorAll('.session-item.active').forEach(item => {
            item.classList.remove('active', 'bg-blue-100', 'text-blue-700');
        });
    }
    console.log("UI prepared for new, unsaved chat. ActiveSessionId:", activeSessionId);
    if (chatHistorySidebar && !chatHistorySidebar.classList.contains('-translate-x-full') && window.innerWidth < 640) {
        chatHistorySidebar.classList.add('-translate-x-full');
        if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
    }
}

async function deleteSession(sessionIdToDelete) {
    if (!currentUserId || !db || !sessionIdToDelete) { showError("Cannot delete session."); return; }
    // Replaced window.confirm with a simple confirmation for this context.
    // In a real app, you would build a custom modal UI.
    const userConfirmed = confirm("Delete this chat session permanently?");
    if (!userConfirmed) return;

    try {
        const messagesPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToDelete}/messages`;
        const messagesQuery = query(collection(db, messagesPath));
        const messagesSnapshot = await getDocs(messagesQuery);
        const batch = writeBatch(db);
        messagesSnapshot.forEach(docMsg => { batch.delete(docMsg.ref); });
        await batch.commit();
        const sessionDocPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToDelete}`;
        await deleteDoc(doc(db, sessionDocPath));

        if (activeSessionId === sessionIdToDelete) {
            activeSessionId = null;
            sessionStorage.removeItem('activeChatIQSessionId');
            startNewUnsavedChat();
        }
        // loadChatSessions will refresh the list via its onSnapshot listener.
    } catch (error) { console.error(`Error deleting session ${sessionIdToDelete}:`, error); showError("Failed to delete chat: " + error.message); }
}

function loadChatSessions() {
    if (!currentUserId || !db || !sessionsListEl) {
        if (sessionsListEl) sessionsListEl.innerHTML = '<div class="text-xs text-gray-400 p-2 text-center">Sign in to see history.</div>';
        return;
    }
    if (sessionsUnsubscribe) sessionsUnsubscribe();
    const sessionsColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions`;
    const q = query(collection(db, sessionsColPath), orderBy("lastActivity", "desc"));
    sessionsUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!sessionsListEl) return;
        sessionsListEl.innerHTML = '';

        if (snapshot.empty) {
            sessionsListEl.innerHTML = '<div class="text-xs text-gray-400 p-2 text-center">No chat history yet.</div>';
            if (activeSessionId !== "TEMP_NEW_SESSION") {
                startNewUnsavedChat();
            }
            return;
        }

        snapshot.forEach((docSnap) => {
            const session = docSnap.data(); const sessionId = docSnap.id;
            const item = document.createElement('div');
            item.dataset.sessionId = sessionId;
            item.classList.add('session-item', 'p-2', 'rounded-md', 'cursor-pointer', 'text-sm', 'text-slate-700', 'flex', 'justify-between', 'items-center', 'hover:bg-slate-200');

            if (sessionId === activeSessionId && activeSessionId !== "TEMP_NEW_SESSION") {
                 item.classList.add('active', 'bg-blue-100', 'text-blue-700');
            }
            const titleSpan = document.createElement('span');
            titleSpan.textContent = session.title || `Chat ${session.createdAt?.toDate().toLocaleDateString() || ''}`;
            titleSpan.classList.add('truncate', 'flex-1', 'mr-2'); item.appendChild(titleSpan);
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.classList.add('text-red-400', 'hover:text-red-600', 'font-bold', 'px-2', 'py-1', 'rounded', 'hover:bg-red-100');
            deleteBtn.title = "Delete session"; deleteBtn.onclick = (e) => { e.stopPropagation(); deleteSession(sessionId); };
            item.appendChild(deleteBtn); item.onclick = () => selectSession(sessionId);
            sessionsListEl.appendChild(item);
        });
    }, (error) => {
        console.error("Error loading chat sessions:", error); showError("Could not load chat sessions: " + error.message);
        if (sessionsListEl) sessionsListEl.innerHTML = '<div class="text-xs text-red-500 p-2 text-center">Error loading history.</div>';
    });
}

function selectSession(sessionId) {
    if (!sessionId) { console.warn("selectSession: undefined sessionId."); return; }
    if (sessionId === "TEMP_NEW_SESSION") {
        startNewUnsavedChat();
        return;
    }

    if (activeSessionId === sessionId && chatBox && chatBox.innerHTML && !chatBox.innerHTML.includes('Loading chat...')) {
        if (chatHistorySidebar && !chatHistorySidebar.classList.contains('-translate-x-full') && window.innerWidth < 640) {
            chatHistorySidebar.classList.add('-translate-x-full');
            if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
        }
        return;
    }

    activeSessionId = sessionId;
    sessionStorage.setItem('activeChatIQSessionId', activeSessionId);
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (chatBox) chatBox.innerHTML = '<div class="text-center text-gray-400 p-4">Loading chat...</div>';
    loadChatHistory(activeSessionId);

    if (sessionsListEl) {
        sessionsListEl.querySelectorAll('.session-item').forEach(item => {
            const isCurrentItemActive = item.dataset.sessionId === sessionId;
            item.classList.toggle('active', isCurrentItemActive);
            item.classList.toggle('bg-blue-100', isCurrentItemActive);
            item.classList.toggle('text-blue-700', isCurrentItemActive);
        });
    }
    if (chatHistorySidebar && !chatHistorySidebar.classList.contains('-translate-x-full') && window.innerWidth < 640) {
        chatHistorySidebar.classList.add('-translate-x-full');
        if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
    }
    // CORRECTED: Removed incorrect call to conversationMemory.addMessage.
    // The memory is now rebuilt in loadChatHistory.
}

async function saveMessageToFirestore(messageData) {
    if (!currentUserId) { showError("Cannot save message: Not signed in."); return null; }
    if (!db) { showError("Cannot save message: DB not available."); return null; }

    let sessionToSaveToId = activeSessionId;
    let messageId = null;

    if (activeSessionId === "TEMP_NEW_SESSION") {
        const firstMessageContent = messageData.type === 'text' ? messageData.content : "Chat with image";
        let newSessionName = "New Chat";
        if (firstMessageContent) {
            newSessionName = firstMessageContent.substring(0, 35) + (firstMessageContent.length > 35 ? '...' : '');
        }

        try {
            const sessionsColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions`;
            const sessionRef = await addDoc(collection(db, sessionsColPath), {
                title: newSessionName,
                createdAt: serverTimestamp(),
                lastActivity: serverTimestamp()
            });
            activeSessionId = sessionRef.id;
            sessionToSaveToId = activeSessionId;
            sessionStorage.setItem('activeChatIQSessionId', activeSessionId);
            console.log("New session created in Firestore with ID:", activeSessionId, "and title:", newSessionName);
            if (messagesUnsubscribe) messagesUnsubscribe();
            loadChatHistory(activeSessionId);
        } catch (error) {
            console.error("Error creating new session in Firestore:", error);
            showError("Could not save message: failed to create new session.");
            return null;
        }
    }

    if (!sessionToSaveToId || sessionToSaveToId === "TEMP_NEW_SESSION") {
        showError("Cannot save message: No valid active session ID.");
        return null;
    }

    try {
        const messagesColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionToSaveToId}/messages`;
        const docRef = await addDoc(collection(db, messagesColPath), { ...messageData, userId: currentUserId, timestamp: serverTimestamp() });
        messageId = docRef.id;

        const sessionDocRef = doc(db, `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionToSaveToId}`);
        await updateDoc(sessionDocRef, { lastActivity: serverTimestamp() });
    } catch (error) {
        console.error("Error saving message to Firestore messages subcollection:", error);
        showError("Error saving message: " + error.message);
    }
    return messageId;
}


function loadChatHistory(sessionIdToLoad) {
    if (!db || !chatBoxWrapper || !sessionIdToLoad || !currentUserId || sessionIdToLoad === "TEMP_NEW_SESSION") {
        if (sessionIdToLoad === "TEMP_NEW_SESSION" && chatBox) {
            if (!chatBox.innerHTML.includes("Hi! How can i help you today?")) {
                 addMessageToChat("Hi! How can i help you today?.", "bot");
            }
        } else if (chatBox) {
            chatBox.innerHTML = '<div class="text-center text-gray-500 p-4">Select a chat or start a new one.</div>';
        }
        console.warn("loadChatHistory: Prerequisites not met or trying to load TEMP session. Session ID:", sessionIdToLoad);
        return;
    }
    if (messagesUnsubscribe) messagesUnsubscribe();
    const messagesColPath = `artifacts/${appIdForPath}/users/${currentUserId}/sessions/${sessionIdToLoad}/messages`;
    const q = query(collection(db, messagesColPath), orderBy("timestamp", "asc"));
    if(chatBox) chatBox.innerHTML = '';

    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!chatBox || !chatBoxWrapper) return;
        if(chatBox) chatBox.innerHTML = '';
        conversationMemory.clearShortTerm(); // Rebuild memory for this session
        let msgCount = 0;
        snapshot.forEach((docMsg) => {
            msgCount++;
            const msg = docMsg.data();
            const messageId = docMsg.id;

            // Add to UI
            if (msg.type === 'image') {
                addImageToChatLog(msg.content, msg.mimeType, msg.sender);
            } else {
                // CORRECTED: Pass the messageId to addMessageToChat
                addMessageToChat(msg.content, msg.sender, messageId);
            }

            // Add to short-term memory for context
            conversationMemory.addMessage(msg.sender, msg.type === 'image' ? '[Image]' : msg.content);
        });
        if (msgCount === 0 && !snapshot.metadata.hasPendingWrites && activeSessionId !== "TEMP_NEW_SESSION") {
             addMessageToChat("This chat is empty. Send a message to start!", "bot");
        }
        if(chatBoxWrapper) chatBoxWrapper.scrollTop = chatBoxWrapper.scrollHeight;
    }, (error) => {
        console.error(`Error loading messages for ${sessionIdToLoad}:`, error);
        showError("Failed to load messages: " + error.message);
        if (chatBox) chatBox.innerHTML = `<div class="text-center text-red-500 p-4">Error loading messages for this chat.</div>`;
    });
}

// CORRECTED: Added optional messageId parameter
function addMessageToChat(text, sender, messageId = null) {
    if (!chatBox || !chatBoxWrapper) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('flex', sender === 'user' ? 'justify-end' : 'justify-start', 'w-full', 'py-1');
    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add(sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot');

    const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/gm;
    let lastIndex = 0;
    const contentFragment = document.createDocumentFragment();

    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            contentFragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        const [fullMatch, lang, codeContent] = match;
        const codeContainer = document.createElement('div');
        codeContainer.classList.add('code-block-container', 'relative');
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');
        if (lang) codeElement.classList.add(`language-${lang}`);
        codeElement.textContent = codeContent.trim();
        preElement.appendChild(codeElement);
        codeContainer.appendChild(preElement);
        const copyButton = document.createElement('button');
        copyButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg><span class="ml-1">Copy</span>`;
        copyButton.classList.add('absolute', 'top-2', 'right-2', 'bg-slate-700', 'hover:bg-slate-600', 'text-white', 'text-xs', 'font-semibold', 'py-1', 'px-2', 'rounded-md', 'opacity-75', 'hover:opacity-100', 'transition-opacity', 'flex', 'items-center', 'z-10');
        copyButton.title = "Copy code";
        copyButton.addEventListener('click', () => {
            const codeToCopy = codeElement.textContent;
            const tempTextArea = document.createElement('textarea');
            tempTextArea.value = codeToCopy;
            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            try {
                document.execCommand('copy');
                copyButton.innerHTML = `<svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg><span class="ml-1 text-green-400">Copied!</span>`;
                setTimeout(() => {
                    copyButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg><span class="ml-1">Copy</span>`;
                }, 2000);
            } catch (err) { console.error('Failed to copy: ', err); showError("Failed to copy code."); }
            document.body.removeChild(tempTextArea);
        });
        codeContainer.appendChild(copyButton);
        contentFragment.appendChild(codeContainer);
        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) { contentFragment.appendChild(document.createTextNode(text.substring(lastIndex))); }
    bubbleDiv.appendChild(contentFragment);

    // Add feedback buttons if it's a bot message with an ID from Firestore
    if (sender === 'bot' && messageId) {
      const feedbackButtons = addFeedbackButtons(messageId, text);
      bubbleDiv.appendChild(feedbackButtons);
    }

    messageDiv.appendChild(bubbleDiv);
    chatBox.appendChild(messageDiv);
    if(chatBoxWrapper) chatBoxWrapper.scrollTop = chatBoxWrapper.scrollHeight;
}


function addImageToChatLog(base64, mime, sender) {
    if (!chatBox || !chatBoxWrapper) return; const div = document.createElement('div');
    div.classList.add('flex', sender === 'user' ? 'justify-end' : 'justify-start', 'w-full', 'my-1');
    const bubble = document.createElement('div'); bubble.classList.add('image-chat-bubble');
    bubble.style.backgroundColor = sender === 'user' ? '#DBEAFE' : '#F0FDF4'; // Adjusted bot color slightly
    const img = document.createElement('img'); img.src = `data:${mime};base64,${base64}`;
    img.alt = sender === 'user' ? "User image" : "Bot image";
    bubble.appendChild(img); div.appendChild(bubble); chatBox.appendChild(div); chatBoxWrapper.scrollTop = chatBoxWrapper.scrollHeight;
}

function showLoading(isLoading) { if(!loadingIndicator) return; loadingIndicator.classList.toggle('hidden', !isLoading); }

async function handleSendMessageWrapper() {
    if (!userInput || !chatBoxWrapper ) { showError("Chat not ready."); return; }
    if (!currentUserId ) {
        showError("Please sign in to send messages.");
        return;
    }
    await handleSendMessage();
}

async function handleSendMessage() {
    const textContent = userInput.value.trim();
    const imageBase64 = currentBase64Image;
    const imageMimeType = currentMimeType;

    if (!textContent && !imageBase64) { showError("Please type, speak, or upload an image."); return; }
    if (!currentUserId) { showError("Not signed in. Cannot send message."); return; }

    // Save user message(s) to Firestore first.
    // This will create a new session if one doesn't exist.
    if (imageBase64 && imageMimeType) {
        await saveMessageToFirestore({ sender: 'user', type: 'image', content: imageBase64, mimeType: imageMimeType });
    }
    if (textContent) {
        await saveMessageToFirestore({ sender: 'user', type: 'text', content: textContent });
    }

    // Give Firestore a moment to process the new session creation if it happened.
    if (activeSessionId === "TEMP_NEW_SESSION") {
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (activeSessionId === "TEMP_NEW_SESSION") {
        console.error("handleSendMessage: Session creation failed or is taking too long. Aborting API call.");
        showError("Could not start a new chat session. Please try again.");
        return;
    }

    if(userInput) userInput.value = '';
    removeImagePreview();
    showLoading(true);

    if (textContent && containsVulgar(textContent)) {
        const VULGAR_MSG = "Inappropriate language detected.";
        await saveMessageToFirestore({ sender: 'bot', type: 'text', content: VULGAR_MSG });
        showLoading(false); speakResponse(VULGAR_MSG); return;
    }

    // CORRECTED: The API call and response handling logic has been fixed and streamlined.
    try {
        let conversationHistoryContents = [];

        // Use the conversationMemory which is already synced with the current chat history
        const memoryContext = conversationMemory.getContext();

        // The API `contents` format expects alternating user/model roles.
        // We'll build this from our short-term memory.
        conversationMemory.shortTerm.forEach(msg => {
            conversationHistoryContents.push({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.sender === 'user' ? msg.content : msg.content }]
            });
        });

        // Construct the current user message with text and image parts
        let currentUserMessageParts = [];
        const promptText = `${botPersonaInstructions}\n\nUSER QUERY:\n${textContent || '(No text provided, please analyze the image below and respond accordingly.)'}`;
        currentUserMessageParts.push({ text: promptText });

        if (imageBase64 && imageMimeType) {
            currentUserMessageParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const finalContentsForApi = [...conversationHistoryContents, { role: "user", parts: currentUserMessageParts }];
        const payload = { contents: finalContentsForApi };

        if (!geminiApiUrl) { showError("Gemini API URL not configured. Check API key."); showLoading(false); return; }

        const resp = await fetch(geminiApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

        let botResponseText = "";

        if (!resp.ok) {
            const errD = await resp.json().catch(()=>({error:{message:"API error/parse fail"}}));
            botResponseText = `API Error (${resp.status}): ${errD.error?.message || resp.statusText || "Unknown"}`;
            if (resp.status === 429) botResponseText = "API limit hit. Try later.";
        } else {
            const res = await resp.json();
            let rawResponseText = "";
            if (res.candidates?.[0]?.content?.parts?.[0]?.text) {
                rawResponseText = res.candidates[0].content.parts[0].text;
            } else if (res.promptFeedback?.blockReason) {
                rawResponseText = `Blocked due to: ${res.promptFeedback.blockReason}.`;
            } else if (res.candidates?.[0]?.finishReason && res.candidates[0].finishReason !== "STOP") {
                rawResponseText = `AI response stopped unexpectedly. Reason: ${res.candidates[0].finishReason}.`;
            } else {
                 rawResponseText = "I'm sorry, I couldn't generate a response. Please try again.";
            }

            // Verify and enhance the response
            botResponseText = await verifyAndEnhanceResponse({ candidates: [{ content: { parts: [{ text: rawResponseText }] } }] }, textContent);

            // Extract key points and add follow-up prompts from the final text
            const keyPoints = extractKeyPoints(botResponseText);
            if (keyPoints) {
                botResponseText = keyPoints + "\n\n" + botResponseText;
            }
            addFollowUpPrompts(botResponseText);
        }

        if (currentUserId && activeSessionId && activeSessionId !== "TEMP_NEW_SESSION") {
            await saveMessageToFirestore({ sender: 'bot', type: 'text', content: botResponseText });
        } else {
            console.error("Session became invalid or was temporary before saving bot response. Displaying in UI only.");
            addMessageToChat(botResponseText, 'bot');
        }
        speakResponse(botResponseText);

    } catch (error) {
        let detailedErrorMessage;
        if (error instanceof ReferenceError) {
            detailedErrorMessage = `Programming error: ${error.message}. Check imports or variable names.`;
        } else if (error && error.message) {
            detailedErrorMessage = `API error: ${error.message}`;
        } else if (typeof error === 'string') {
            detailedErrorMessage = `API error: ${error}`;
        } else {
            detailedErrorMessage = "An unexpected error occurred. Please check the console.";
        }
        console.error('Full error object in handleSendMessage catch:', error);
        showError(detailedErrorMessage);
        if (currentUserId && activeSessionId && activeSessionId !== "TEMP_NEW_SESSION") {
            await saveMessageToFirestore({ sender: 'bot', type: 'text', content: detailedErrorMessage });
        } else {
            addMessageToChat(detailedErrorMessage, 'bot');
        }
    } finally {
        showLoading(false);
    }
}


function addFollowUpPrompts(response) {
  const prompts = detectFollowUpOpportunities(response);
  if (prompts.length > 0) {
    const promptContainer = document.createElement('div');
    promptContainer.className = 'follow-up-prompts mt-3';

    prompts.forEach(prompt => {
      const btn = document.createElement('button');
      btn.textContent = prompt;
      btn.className = 'text-sm px-3 py-1 bg-blue-100 text-blue-800 rounded-full mr-2 mb-2 hover:bg-blue-200';
      btn.onclick = () => {
        if(userInput) userInput.value = prompt;
        handleSendMessageWrapper();
      };
      promptContainer.appendChild(btn);
    });

    const messageDiv = document.createElement('div');
    messageDiv.className = 'w-full py-2 flex justify-start';
    messageDiv.appendChild(promptContainer);
    if (chatBox) chatBox.appendChild(messageDiv);
  }
}

function detectFollowUpOpportunities(response) {
  const prompts = [];
  if (response.includes('step by step') || response.match(/\d\./)) {
    prompts.push('Explain the first step in more detail.');
  }
  if (response.includes('options are') || response.includes('several ways')) {
    prompts.push('Which option do you recommend and why?');
  }
  if (response.includes('for example') || response.includes('such as')) {
    prompts.push('Can you give me another example?');
  }
  if (response.includes('advantages') || response.includes('benefits')) {
    prompts.push('What are the potential drawbacks?');
  }
  return [...new Set(prompts)].slice(0, 3); // Unique prompts, max 3
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
