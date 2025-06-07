// config.js
// Store your API keys and configurations here.
// IMPORTANT: This file will be accessible in the browser. 
// For true security, API keys should be managed on a server.

const API_CONFIG = {
    // Make sure to replace "YOUR_ACTUAL_GEMINI_API_KEY" with your real Gemini API key.
    GOOGLE_API_KEY: "AIzaSyC4RwK4x692XDcHZikOaKfpxWHmIXm4kuM",

    // Add your Firebase configuration object here.
    // Replace the placeholder values with your actual Firebase project's configuration.
    FIREBASE_CONFIG: {
            apiKey: "AIzaSyCEpq8EAkEWbvxGab0wiW9qaYojUdVykyo", 
            authDomain: "chatiq-45203.firebaseapp.com",
            databaseURL: "https://chatiq-45203-default-rtdb.firebaseio.com",
            projectId: "chatiq-45203",
            storageBucket: "chatiq-45203.appspot.com",
            messagingSenderId: "642857846726",
            appId: "1:642857846726:web:f95990ff4f4c37971514c7",
            measurementId: "G-R135XXK005" // Optional, for Google Analytics
    }
    // Add other API keys here if needed in the future, e.g.:
    // SOME_OTHER_API_KEY: "YOUR_OTHER_KEY"
};

// If you intend to use these globally directly, you can also define them like this:
// window.MY_GEMINI_API_KEY = "YOUR_ACTUAL_GEMINI_API_KEY";
// window.MY_FIREBASE_CONFIG = { apiKey: "...", ... };
// However, using an object like API_CONFIG is generally cleaner.