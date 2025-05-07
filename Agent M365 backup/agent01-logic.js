/**
 * AGENT 01 - Main Logic Module
 * Handles core application logic, UI updates, API calls, speech, etc.
 * Imports the Animation module for visualization control.
 */

// Import the animation module
import { Animation } from './agent01-animation.js';

// Import API rules and configuration
import { 
    API_CONFIG, 
    PROMPT_CONFIG, 
    API_RULES,
    loadRoutingPrompt,
    loadTechnicalPrompt,
    formatRoutingMessages,
    formatTechnicalMessages,
    parseRoutingResponse,
    callLlmApi,
    calculateTokenCount,
    processRoutingQuery
} from './AgentAPI-rules.js';

// =========================================================
// CONFIGURATION (Exported for Animation Module)
// =========================================================
export const CONFIG = {
    // Particle Visualization Settings (Used by Animation module)
    particles: {
        count: 40000,
        size: 0.02,
        sphereRadius: 1.5,
        cubeSize: 2.0,
        rotationSpeed: 0.0015,
        morphDuration: {
            standby: 2000,  // 2 seconds
            thinking: 1000  // 1 second
        },
        morphInterval: 10000, // 10 seconds in standby mode
        colors: {
            background: 0x1A1A1A,
            particles: 0x808080,
            glow: 0xFFFFFF,
            light: 0xFFFFFF,
            hover: 0x00F0FF // Cyan color for hover effect
        },
        lightIntensity: {
            standby: 0.5,
            thinking: 1.5
        },
        thinking: {
            waveAmplitude: 0.05,
            waveFrequencyStart: 1.0,
            waveFrequencyEnd: 2.0
        },
        hover: {
            radius: 0.25, // In world units
            duration: 1000 // How long the highlight lasts in ms
        }
    },

    // Animation Transitions
    transitions: {
        thinkingEnterDuration: 1500, // ms
        standbyEnterDuration: 2000,  // ms
    },

    // API Settings (Reference from API_CONFIG)
    api: API_CONFIG,

    // AI Settings
    ai: {
        temperature: API_CONFIG.defaultParameters.temperature,
        maxTokens: API_CONFIG.defaultParameters.maxTokens,
        topP: API_CONFIG.defaultParameters.topP,
        promptFile: PROMPT_CONFIG.routingPromptFile,
        defaultPrompt: "" // Empty - we'll use AppState.routingPrompt instead
    },

    // UI Settings
    ui: {
        messageAnimationDelay: 100,
        messageAnimationDuration: 300,
        thinkingIndicatorDelay: 500,
        scrollBehavior: 'smooth'
    },

    // Storage Keys
    storage: {
        prefix: API_CONFIG.storageKeys.prefix,
        keys: API_CONFIG.storageKeys
    },

    // Speech Settings
    speech: {
        ttsEnabled: true,
        sttEnabled: true
    }
};

// =========================================================
// STATE MANAGEMENT (Exported for Animation Module)
// =========================================================
export const AppState = {
    // API and Authentication
    apiKey: CONFIG.api.defaultApiKey,
    selectedModel: CONFIG.api.defaultModel,

    // Chat State
    chatHistory: [],
    isGenerating: false,
    currentMessage: null,
    abortController: null,
    lastError: null,

    // --- NEW STATES for Two-Phase Flow ---
    conversationPhase: 'routing', // 'routing' | 'technical_handoff' | 'technical_response'
    identifiedTechnology: null,   // Stores the name like 'ExchangeOnline'
    originalUserQuery: null,    // Stores the query that initiated the technical phase
    routingAgentOutputText: null, // Stores the text from the routing agent for context/display
    routingPrompt: null, // Store the loaded routing prompt content
    // --- END NEW STATES ---

    // Visualization State (Managed primarily by Animation module, but state lives here)
    visualizationState: {
        currentMode: "standby", // "standby" or "thinking"
        currentShape: "sphere", // "sphere" or "cube"
        morphProgress: 0, // 0 (sphere) to 0.5 (cube)
        rotationDirection: 1,
        glowIntensity: 0,
        waveFrequency: CONFIG.particles.thinking.waveFrequencyStart,
        lastMorphTime: 0,
        fpsCounter: { frames: 0, lastTime: 0, value: 0 },
        rotation: { x: 0, y: 0, isDragging: false, previousX: 0, previousY: 0, sensitivity: 0.01 },
        rotation4D: { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 },
    },

    // UI State
    isWelcomeScreenVisible: true,
    isSettingsPanelVisible: false,

    // Settings
    settings: {
        temperature: CONFIG.ai.temperature,
        maxTokens: CONFIG.ai.maxTokens,
        topP: CONFIG.ai.topP,
        ttsEnabled: CONFIG.speech.ttsEnabled
    },

    // Speech Recognition State
    speechRecognition: null,
    isRecording: false,
    availableVoices: [],

    // Mobile Detection
    isMobile: false
};

// =========================================================
// DOM ELEMENTS (Exported for Animation Module)
// =========================================================
export const DOM = {
    // Chat Interface
    chatMessages: document.getElementById('chat-messages'),
    userInput: document.getElementById('user-input'),
    sendButton: document.getElementById('send-button'),
    stopButton: document.getElementById('stop-button'),
    micButton: document.getElementById('mic-button'),
    inputContainer: document.getElementById('input-container'),
    thinkingIndicator: document.getElementById('thinking-indicator'),

    // Visualization Elements (Needed by Animation module)
    canvas: document.getElementById('canvas'),
    fpsCounter: document.getElementById('fps'),
    modeIndicator: document.getElementById('mode'),

    // Welcome Screen
    welcomeSplash: document.getElementById('welcome-splash'),
    welcomeButton: document.getElementById('welcome-button'),

    // Settings Panel
    settingsButton: document.getElementById('settings-button'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsBackdrop: document.getElementById('settings-backdrop'),
    modelSelector: document.getElementById('model-selector'),
    temperatureSlider: document.getElementById('temperature-slider'),
    temperatureValue: document.getElementById('temperature-value'),
    maxTokensInput: document.getElementById('max-tokens-input'),
    topPSlider: document.getElementById('top-p-slider'),
    topPValue: document.getElementById('top-p-value'),
    ttsEnabledCheckbox: document.getElementById('tts-enabled-checkbox'),
    clearChatButton: document.getElementById('clear-chat-button'),
    resetSettingsButton: document.getElementById('reset-settings-button'),

    // Status Bar
    statusBar: document.getElementById('status-bar'),
    statusText: document.getElementById('status-text'),
    statusDot: document.getElementById('status-dot'),
    tokenCount: document.getElementById('token-count')
};

// =========================================================
// INITIALIZATION
// =========================================================

/**
 * Initialize the app
 */
async function initializeApp() {
    try {
        console.log("Initializing Agent 01 Application...");
        
        // --- Initialize API Key and Settings ---
        loadSettings();
        loadChatHistory();
        loadSelectedModel();
        
        // --- Detect Mobile Devices ---
        detectMobileDevice();
        
        // --- Load Initial Prompt ---
        console.log("Loading routing prompt...");
        AppState.routingPrompt = await loadRoutingPrompt();
        console.log("Routing prompt loaded:", AppState.routingPrompt ? "Success" : "Failed");
        
        // --- Setup Event Listeners and UI ---
        setupEventListeners();
        initializeAnimation();
        initializeSpeechRecognition();
        initializeTextToSpeech();
        initializeVoices();
        
        // Update token count
        updateTokenCount();
        
        console.log("Application initialized successfully!");
    } catch (error) {
        console.error("Error initializing application:", error);
        updateStatusBar("Error initializing: " + error.message);
    }
}

/**
 * Load saved settings from local storage
 */
function loadSettings() {
    const storageKey = CONFIG.storage.prefix + CONFIG.storage.keys.settings;
    const savedSettings = localStorage.getItem(storageKey);
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            AppState.settings = { ...AppState.settings, ...parsed };
            console.log("Loaded settings:", AppState.settings);
        } catch (error) { console.error("Error loading settings:", error); }
    }
}

/**
 * Helper function to remove routing tags from text for display.
 */
function cleanRoutingTags(text) {
    if (typeof text !== 'string') return text;
    // Remove [TECH_IDENTIFIED:...] and [SCOPING_QUESTION] tags
    return text.replace(/^\[(?:TECH_IDENTIFIED|SCOPING_QUESTION)[^\]]*\]\s*/, '').trim();
}

/**
 * Load chat history from local storage
 */
function loadChatHistory() {
    const storageKey = CONFIG.storage.prefix + CONFIG.storage.keys.history;
    const savedHistory = localStorage.getItem(storageKey);
    if (savedHistory) {
        try {
            AppState.chatHistory = JSON.parse(savedHistory);
            AppState.chatHistory.forEach(message => {
                if (message.role !== 'system') {
                    let displayContent = message.content;
                    // Clean assistant messages before displaying
                    if (message.role === 'assistant' && !message.isError) {
                        displayContent = cleanRoutingTags(message.content);
                    }
                    // Add the potentially cleaned message to the chat UI
                    UI.addMessageToChat(displayContent, message.role, message.id, message.isError);
                }
            });
            console.log(`Loaded ${AppState.chatHistory.length} messages from history.`);
            UI.scrollToBottom();
        } catch (error) {
            console.error("Error loading chat history:", error);
            AppState.chatHistory = [];
        }
    }
}

/**
 * Load selected model from local storage
 */
function loadSelectedModel() {
    const storageKey = CONFIG.storage.prefix + CONFIG.storage.keys.model;
    const savedModel = localStorage.getItem(storageKey);
    if (savedModel && DOM.modelSelector.querySelector(`option[value="${savedModel}"]`)) {
        AppState.selectedModel = savedModel;
    }
    DOM.modelSelector.value = AppState.selectedModel;
}

/**
 * Set up event listeners for all interactive elements
 */
function setupEventListeners() {
    DOM.sendButton.addEventListener('click', handleSendMessage);
    DOM.userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } });
    DOM.userInput.addEventListener('input', () => { DOM.sendButton.disabled = DOM.userInput.value.trim() === '' || AppState.isGenerating; });
    DOM.stopButton.addEventListener('click', handleStopGeneration);
    DOM.welcomeButton.addEventListener('click', handleWelcome);
    DOM.settingsButton.addEventListener('click', toggleSettingsPanel);
    DOM.settingsBackdrop.addEventListener('click', toggleSettingsPanel);
    DOM.modelSelector.addEventListener('change', handleModelChange);
    DOM.temperatureSlider.addEventListener('input', handleTemperatureChange);
    DOM.maxTokensInput.addEventListener('change', handleMaxTokensChange);
    DOM.topPSlider.addEventListener('input', handleTopPChange);
    DOM.ttsEnabledCheckbox.addEventListener('change', handleTtsToggle);
    DOM.clearChatButton.addEventListener('click', handleClearChat);
    DOM.resetSettingsButton.addEventListener('click', handleResetSettings);
    DOM.micButton.addEventListener('click', handleMicButtonClick);
    DOM.chatMessages.addEventListener('click', handleMessageActions);

    // Add orientation change event for mobile devices
    window.addEventListener('orientationchange', function() {
        // Small delay to allow browser to complete orientation change
        setTimeout(() => {
            if (Animation && typeof Animation.handleResize === 'function') {
                Animation.handleResize();
            }
            // Ensure scrolling to bottom after orientation change
            if (DOM.chatMessages) {
                DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
            }
        }, 300);
    });
}

// =========================================================
// UI MODULE
// =========================================================
const UI = {
    addMessageToChat: function(text, role, messageId = null, isError = false) {
        const id = messageId || `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user' : 'ai'}-message`;
        messageDiv.id = id;
        if (isError) messageDiv.classList.add('error-message');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (role === 'assistant' && !text && !isError) {
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'typing-animation';
            thinkingDiv.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
            contentDiv.appendChild(thinkingDiv);
        } else {
            this.renderMarkdown(contentDiv, text);
        }

        if (role === 'assistant' && !isError) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            actionsDiv.innerHTML = `
                <button class="message-action-button copy-button" title="Copy Text">📋</button>
                <button class="message-action-button tts-button" title="Read Aloud">🔊</button>
                <button class="message-action-button regenerate-button" title="Regenerate Response">🔄</button>
            `;
            messageDiv.appendChild(actionsDiv);
        }

        messageDiv.appendChild(contentDiv);
        DOM.chatMessages.appendChild(messageDiv);

        requestAnimationFrame(() => {
            setTimeout(() => { messageDiv.classList.add('visible'); }, CONFIG.ui.messageAnimationDelay);
        });

        this.scrollToBottom();
        if (text) setTimeout(() => { this.highlightCode(contentDiv); }, CONFIG.ui.messageAnimationDuration);

        return { element: messageDiv, content: contentDiv, id: id };
    },

    updateAIMessage: function(messageId, text) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        const contentElement = messageElement.querySelector('.message-content');
        if (!contentElement) return;
        const typingIndicator = contentElement.querySelector('.typing-animation');
        if (typingIndicator) typingIndicator.remove();

        requestAnimationFrame(() => {
            this.renderMarkdown(contentElement, text + '▌');
            this.scrollToBottom();
        });
    },

    finalizeAIMessage: function(messageId, text, isError = false, showTransition = false, techName = '') {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        const contentElement = messageElement.querySelector('.message-content');
        if (!contentElement) return;
        const indicator = contentElement.querySelector('.typing-animation');
        if (indicator) indicator.remove();

        let cleanText = text.replace(/▌$/, ''); // Remove trailing cursor if present

        // Render the main text first
        this.renderMarkdown(contentElement, cleanText);
        
        // Add Transition Indicator if needed
        if (showTransition && techName && !isError) {
            // Use the CSS class for transition indicator
            contentElement.insertAdjacentHTML('beforeend', `
                <div class="tech-transfer-indicator">
                    Handing off to ${techName} specialist...
                </div>
            `);
        }

        messageElement.classList.toggle('error-message', isError);

        // Update or add message actions (copy, tts, regenerate)
        let actionsDiv = messageElement.querySelector('.message-actions');
        if (isError && actionsDiv) {
            actionsDiv.remove();
        } else if (!isError && !actionsDiv && messageElement.classList.contains('ai-message')) {
            // Add actions (Regenerate might need disabling/rethinking for routing messages)
            actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            actionsDiv.innerHTML = `
                <button class="message-action-button copy-button" title="Copy Text">📋</button>
                <button class="message-action-button tts-button" title="Read Aloud">🔊</button>
                ${AppState.conversationPhase !== 'technical_handoff' ? '<button class="message-action-button regenerate-button" title="Regenerate Response">🔄</button>' : ''}
            `; // Conditionally show regenerate
            messageElement.appendChild(actionsDiv);
        }

        this.highlightCode(contentElement);
        this.scrollToBottom();

        // Speak only the main text, not the transition indicator
        if (AppState.settings.ttsEnabled && !isError && cleanText) {
            const textToSpeak = cleanText.trim(); // Just speak the main text
            speakText(textToSpeak);
        }
    },

    renderMarkdown: function(element, text) {
        if (!element) return;
        if (text === null || text === undefined) text = '';
        try {
            const dirtyHtml = marked.parse(text, { breaks: true, gfm: true });
            const cleanHtml = dirtyHtml.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
            element.innerHTML = cleanHtml;
        } catch (error) {
            console.error("Error rendering markdown:", error);
            element.textContent = text;
        }
    },

    highlightCode: function(element) {
        if (typeof hljs === 'undefined' || !element) return;
        try {
            element.querySelectorAll('pre code').forEach(block => {
                if (!block.classList.contains('hljs')) hljs.highlightElement(block);
                const pre = block.parentElement;
                if (pre && !pre.querySelector('.copy-code-button')) {
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-code-button';
                    copyButton.textContent = 'Copy';
                    copyButton.title = 'Copy code';
                    pre.appendChild(copyButton);
                }
            });
        } catch (error) { console.warn("Error during syntax highlighting:", error); }
    },

    scrollToBottom: function() {
        DOM.chatMessages.scrollTo({ top: DOM.chatMessages.scrollHeight, behavior: CONFIG.ui.scrollBehavior });
    },

    setThinkingState: function(isThinking, statusMessage = null) {
        AppState.isGenerating = isThinking;
        AppState.lastError = isThinking ? null : AppState.lastError;

        DOM.userInput.disabled = isThinking || AppState.isRecording;
        DOM.inputContainer.classList.toggle('thinking', isThinking);
        DOM.stopButton.classList.toggle('hidden', !isThinking);
        DOM.sendButton.classList.toggle('hidden', isThinking);
        DOM.micButton.classList.toggle('hidden', isThinking);
        DOM.settingsButton.disabled = isThinking;

        if (!isThinking) {
            DOM.sendButton.disabled = AppState.isRecording || DOM.userInput.value.trim() === '';
            DOM.micButton.disabled = AppState.isRecording || !AppState.speechRecognition;
        } else {
            DOM.sendButton.disabled = true;
            DOM.micButton.disabled = true;
        }

        DOM.settingsButton.disabled = isThinking;

        if (isThinking) Animation.enterThinkingMode();
        else Animation.enterStandbyMode();

        updateStatusBar(statusMessage);

        if (!isThinking && !AppState.isRecording && !AppState.isSettingsPanelVisible) {
            DOM.userInput.focus();
        }
    },

    updateStatusBar: function(message = null) {
        if (!DOM.statusText) return;
        
        const statusModes = {
            thinking: {
                text: message || "Thinking...",
                class: "thinking"
            },
            error: {
                text: message || "Error",
                class: "error"
            },
            recording: {
                text: message || "Listening...",
                class: "recording"
            },
            ready: {
                text: message || "Ready",
                class: ""
            }
        };
        
        let mode = "ready";
        if (AppState.isGenerating) mode = "thinking";
        else if (AppState.lastError) mode = "error";
        else if (AppState.isRecording) mode = "recording";
        
        // Apply status
        DOM.statusText.textContent = statusModes[mode].text;
        
        // Remove all classes and add the current one
        DOM.statusBar.classList.remove("thinking", "error", "recording");
        if (statusModes[mode].class) {
            DOM.statusBar.classList.add(statusModes[mode].class);
        }
    },

    updateSettingsUI: function() {
        DOM.temperatureSlider.value = AppState.settings.temperature;
        DOM.temperatureValue.textContent = AppState.settings.temperature.toFixed(1);
        DOM.maxTokensInput.value = AppState.settings.maxTokens;
        DOM.topPSlider.value = AppState.settings.topP;
        DOM.topPValue.textContent = AppState.settings.topP.toFixed(1);
        DOM.ttsEnabledCheckbox.checked = AppState.settings.ttsEnabled;
        DOM.ttsEnabledCheckbox.disabled = !('speechSynthesis' in window);
        DOM.modelSelector.value = AppState.selectedModel;
    },

    updateTokenCount: function() {
        const count = getTokenCount();
        DOM.tokenCount.textContent = `Tokens: ${count}`;
    },

    updateMicButtonState: function() {
        DOM.micButton.classList.toggle('recording', AppState.isRecording);
        DOM.micButton.title = AppState.isRecording ? 'Stop Recording' : 'Start Voice Input';
        DOM.sendButton.disabled = AppState.isRecording || AppState.isGenerating || DOM.userInput.value.trim() === '';
        DOM.userInput.disabled = AppState.isRecording || AppState.isGenerating;
        DOM.micButton.disabled = AppState.isGenerating || !AppState.speechRecognition;
    }
};

// =========================================================
// API MODULE
// =========================================================
/**
 * Call LLM API
 */
function updateCurrentMessage(text) {
    if (AppState.currentMessage) {
        AppState.currentMessage.content = text;
        UI.updateAIMessage(AppState.currentMessage.id, text);
    }
}

// Expose updateCurrentMessage globally for the API module to use
window.updateCurrentMessage = updateCurrentMessage;

// =========================================================
// SPEECH MODULE
// =========================================================
function initializeSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) {
        console.warn("Speech Recognition not supported.");
        DOM.micButton.disabled = true;
        DOM.micButton.title = "Speech recognition not supported";
        CONFIG.speech.sttEnabled = false; return;
    }
    try {
        AppState.speechRecognition = new SpeechRecognition();
        AppState.speechRecognition.continuous = false;
        AppState.speechRecognition.interimResults = true;
        AppState.speechRecognition.lang = 'en-US';

        AppState.speechRecognition.onstart = handleSpeechStart;
        AppState.speechRecognition.onresult = handleSpeechResult;
        AppState.speechRecognition.onerror = handleSpeechError;
        AppState.speechRecognition.onend = handleSpeechEnd;

        DOM.micButton.disabled = false;
        CONFIG.speech.sttEnabled = true;
        console.log("Speech recognition initialized");
    } catch (error) {
        console.error("Error initializing speech recognition:", error);
        DOM.micButton.disabled = true;
        DOM.micButton.title = "Error initializing speech recognition";
        CONFIG.speech.sttEnabled = false;
    }
}

function startSpeechRecognition() {
    if (!CONFIG.speech.sttEnabled || AppState.isRecording || AppState.isGenerating || !AppState.speechRecognition) return;
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
            try { AppState.speechRecognition.start(); }
            catch (error) {
                console.error("Error starting speech recognition:", error);
                updateStatusBar("Error starting recognition");
                AppState.isRecording = false; UI.updateMicButtonState(); updateStatusBar();
            }
        })
        .catch(err => {
            console.error("Microphone access denied or error:", err);
            updateStatusBar("Microphone access needed");
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                DOM.micButton.disabled = true; DOM.micButton.title = "Microphone access denied"; CONFIG.speech.sttEnabled = false;
            }
            AppState.isRecording = false; UI.updateMicButtonState(); updateStatusBar();
        });
}

function stopSpeechRecognition(statusMessage = null) {
    if (!AppState.isRecording || !AppState.speechRecognition) return;
    console.log("Stopping speech recognition...");
    try { if (AppState.isRecording) AppState.speechRecognition.stop(); }
    catch (error) { console.warn("Error stopping speech recognition:", error); }
    AppState.isRecording = false;
    UI.updateMicButtonState();
    DOM.userInput.placeholder = "Type your message...";
    updateStatusBar(statusMessage);
    DOM.sendButton.disabled = DOM.userInput.value.trim() === '' || AppState.isGenerating;
    DOM.userInput.disabled = AppState.isGenerating;
    if (!AppState.isGenerating && !AppState.isSettingsPanelVisible) DOM.userInput.focus();
}

function initializeTextToSpeech() {
    if ('speechSynthesis' in window) {
        const loadVoices = () => {
            AppState.availableVoices = window.speechSynthesis.getVoices();
            if (AppState.availableVoices.length > 0) console.log(`Loaded ${AppState.availableVoices.length} voices.`);
            else console.log("Waiting for voices...");
        };
        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = loadVoices;
        console.log("Text-to-speech initialized.");
        DOM.ttsEnabledCheckbox.disabled = false;
    } else {
        console.warn("Text-to-speech not supported.");
        DOM.ttsEnabledCheckbox.disabled = true;
        DOM.ttsEnabledCheckbox.checked = false;
        AppState.settings.ttsEnabled = false;
        CONFIG.speech.ttsEnabled = false;
    }
}

function speakText(text) {
    if (!AppState.settings.ttsEnabled || !text || !window.speechSynthesis || AppState.isRecording) return;
    if (window.speechSynthesis.speaking) cancelSpeech();

    const cleanText = text
        .replace(/```[\s\S]*?```/g, ' Code block. ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
        .replace(/!\[.*?\]\(.*?\)/g, ' Image. ').replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
        .replace(/#{1,6}\s/g, '').replace(/(\r\n|\n|\r)/gm, " ").replace(/<[^>]*>/g, '').trim();

    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    let voice = AppState.availableVoices.find(v => v.name === 'Google US English' && v.localService) ||
                AppState.availableVoices.find(v => v.lang === 'en-US' && v.localService) ||
                AppState.availableVoices.find(v => v.name.includes('English') && v.name.includes('United States')) || // Broader match
                AppState.availableVoices.find(v => v.lang === 'en-US') ||
                AppState.availableVoices.find(v => v.lang.startsWith('en'));
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    else { utterance.lang = 'en-US'; console.warn("Preferred TTS voice not found."); }
    utterance.onerror = (event) => { console.error("Speech synthesis error:", event.error); updateStatusBar("TTS Error"); };
    window.speechSynthesis.speak(utterance);
}

function cancelSpeech() {
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
}

// =========================================================
// EVENT HANDLERS
// =========================================================
/**
 * Handle sending a message
 */
async function handleSendMessage() {
    const messageText = DOM.userInput.value.trim();
    if (!messageText || AppState.isGenerating || AppState.isRecording) return;

    cancelSpeech();
    if (AppState.isRecording) stopSpeechRecognition();
    DOM.userInput.value = '';
    DOM.sendButton.disabled = true;

    // Store the user query
    const userMessageId = `msg-${Date.now()}-user`;
    UI.addMessageToChat(messageText, 'user', userMessageId);
    AppState.chatHistory.push({ role: 'user', content: messageText, id: userMessageId });
    saveChatHistory();
    UI.updateTokenCount();
    
    // Check if we're already in a technical conversation
    if (AppState.conversationPhase === 'technical_response' && AppState.identifiedTechnology) {
        // Continue with the same technology specialist
        AppState.originalUserQuery = messageText; // Update with the follow-up query
        await executeTechnicalPhase(); // Execute technical phase with the existing specialist
    } else {
        // Reset state for a new routing sequence
        AppState.conversationPhase = 'routing';
        AppState.identifiedTechnology = null;
        AppState.routingAgentOutputText = null;
        AppState.originalUserQuery = messageText; // Store the query initiating this sequence
        
        // Start the Routing Agent process
        await executeRoutingPhase();
    }
}

function handleStopGeneration() {
    if (AppState.abortController && AppState.isGenerating) {
        console.log("Stopping generation...");
        AppState.abortController.abort();
        UI.updateStatusBar("Stopping generation...");
    } else {
        console.log("No active generation to stop.");
        UI.setThinkingState(false);
    }
}

/**
 * Handle clearing the chat
 */
function handleClearChat() {
    if (AppState.isGenerating) return; // Don't clear during generation
    if (confirm("Are you sure you want to clear the chat history?")) {
        // Clear UI
        DOM.chatMessages.innerHTML = '';
        
        // Clear state
        AppState.chatHistory = [];
        AppState.isGenerating = false;
        AppState.currentMessage = null;
        AppState.lastError = null;
        
        // Reset two-phase flow state
        AppState.conversationPhase = 'routing';
        AppState.identifiedTechnology = null;
        AppState.originalUserQuery = null;
        AppState.routingAgentOutputText = null;
        
        // Save empty history & update UI
        saveChatHistory();
        UI.updateTokenCount();
        updateStatusBar();
        
        // Return focus to input if appropriate
        if (!AppState.isRecording && !AppState.isSettingsPanelVisible) DOM.userInput.focus();
    }
}

/**
 * Handle welcome button click
 */
function handleWelcome() {
    // Clear chat history IMMEDIATELY before any animations
    cancelSpeech();
    if (AppState.isRecording) stopSpeechRecognition();
    
    // Reset state for new conversation
    AppState.chatHistory = [];
    AppState.isGenerating = false;
    AppState.currentMessage = null;
    AppState.lastError = null;
    
    // Reset two-phase flow state
    AppState.conversationPhase = 'routing';
    AppState.identifiedTechnology = null;
    AppState.originalUserQuery = null;
    AppState.routingAgentOutputText = null;
    
    // Update UI
    DOM.chatMessages.innerHTML = '';
    
    // Now handle the welcome animation
    DOM.welcomeSplash.classList.add('hidden');
    setTimeout(() => {
        AppState.isWelcomeScreenVisible = false;
        DOM.welcomeSplash.style.display = 'none';
        
        // Add greeting message (marked as system greeting to avoid API issues)
        const greeting = "Hello! I'm Agent 01, your AI assistant. How can I help you today?";
        const msg = UI.addMessageToChat(greeting, 'assistant');
        AppState.chatHistory.push({ 
            role: 'assistant', 
            content: greeting, 
            id: msg.id,
            isGreeting: true // Mark as greeting to exclude from API calls
        });
        saveChatHistory();
        UI.updateTokenCount();
        
        // Only set focus on desktop devices to prevent mobile keyboard from appearing
        if (!AppState.isMobile) {
            DOM.userInput.focus();
        }
    }, 1000);
}

function handleModelChange() {
    AppState.selectedModel = DOM.modelSelector.value;
    saveSelectedModel();
    updateStatusBar();
}

function handleTemperatureChange() {
    AppState.settings.temperature = parseFloat(DOM.temperatureSlider.value);
    DOM.temperatureValue.textContent = AppState.settings.temperature.toFixed(1);
    saveSettings();
}

function handleMaxTokensChange() {
    let value = parseInt(DOM.maxTokensInput.value, 10);
    const min = parseInt(DOM.maxTokensInput.min, 10);
    const max = parseInt(DOM.maxTokensInput.max, 10);
    if (isNaN(value) || value < min) value = min;
    if (value > max) value = max;
    DOM.maxTokensInput.value = value;
    AppState.settings.maxTokens = value;
    saveSettings();
}

function handleTopPChange() {
    AppState.settings.topP = parseFloat(DOM.topPSlider.value);
    DOM.topPValue.textContent = AppState.settings.topP.toFixed(1);
    saveSettings();
}

function handleTtsToggle() {
    AppState.settings.ttsEnabled = DOM.ttsEnabledCheckbox.checked;
    saveSettings();
    if (!AppState.settings.ttsEnabled) cancelSpeech();
}

function handleMicButtonClick() {
    if (!CONFIG.speech.sttEnabled) { alert("Speech recognition not supported/enabled."); return; }
    if (AppState.isRecording) stopSpeechRecognition();
    else if (!AppState.isGenerating) startSpeechRecognition();
}

function handleMessageActions(event) {
    const button = event.target.closest('.message-action-button, .copy-code-button');
    if (!button) return;
    const messageElement = button.closest('.message');
    const messageId = messageElement?.id;
    if (!messageId && !button.classList.contains('copy-code-button')) return; // Need ID unless copying code

    if (button.classList.contains('copy-button')) handleCopyMessage(messageId);
    else if (button.classList.contains('regenerate-button')) handleRegenerateMessage(messageId);
    else if (button.classList.contains('tts-button')) handleSpeakMessage(messageId);
    else if (button.classList.contains('copy-code-button')) handleCopyCode(button);
}

function handleCopyMessage(messageId) {
    const messageElement = document.getElementById(messageId);
    if (!messageElement) return;
    const contentElement = messageElement.querySelector('.message-content');
    const textToCopy = contentElement?.innerText || contentElement?.textContent || '';
    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy.trim())
            .then(() => visualFeedback(messageElement.querySelector('.copy-button'), '✓', 'Copied!'))
            .catch(err => { console.error("Copy failed:", err); alert("Copy failed."); });
    }
}

function handleCopyCode(button) {
    const pre = button.closest('pre');
    const code = pre?.querySelector('code');
    if (code) {
        navigator.clipboard.writeText(code.textContent || '')
            .then(() => visualFeedback(button, '✓ Copied', 'Copied!', true))
            .catch(err => { console.error("Copy code failed:", err); alert("Copy code failed."); });
    }
}

/**
 * Handle regenerating a message
 */
async function handleRegenerateMessage(messageId) {
    if (AppState.isGenerating || AppState.isRecording) return;
    if (!messageId) return;

    // Find the message in the history
    const messageIndex = AppState.chatHistory.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
        console.error("Message ID not found in history:", messageId);
        return;
    }

    // Make sure it's an assistant message
    const message = AppState.chatHistory[messageIndex];
    if (message.role !== 'assistant') {
        console.error("Cannot regenerate non-assistant message");
        return;
    }

    // Remove this and all subsequent messages
    const removedMessages = AppState.chatHistory.splice(messageIndex);
    
    // Get the corresponding DOM elements
    const messageElements = removedMessages.map(m => document.getElementById(m.id)).filter(el => el);
    
    // Remove the elements with animation
    for (const el of messageElements) {
        el.style.opacity = '0';
        el.style.maxHeight = '0';
        el.style.overflow = 'hidden';
        el.style.margin = '0';
        el.style.padding = '0';
    }
    
    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Remove from DOM
    for (const el of messageElements) {
        el.remove();
    }
    
    // Update token count with reduced history
    UI.updateTokenCount();
    saveChatHistory();
    
    // Check if there's at least one user message remaining
    const lastUserMessageIndex = AppState.chatHistory.map(m => m.role).lastIndexOf('user');
    if (lastUserMessageIndex === -1) {
        console.warn("No user messages found in history after regeneration");
        return;
    }
    
    // Get the last user message
    const lastUserMessage = AppState.chatHistory[lastUserMessageIndex];
    const lastUserMessageContent = lastUserMessage.content;
    
    // Reset the phase to routing and clear tech state
    AppState.conversationPhase = 'routing';
    AppState.identifiedTechnology = null;
    AppState.originalUserQuery = lastUserMessageContent; // Use the last user message
    AppState.routingAgentOutputText = null;
    
    // Start the routing process again
    await executeRoutingPhase();
}

function handleSpeakMessage(messageId) {
    if (!AppState.settings.ttsEnabled) { alert("TTS disabled."); return; }
    if (!('speechSynthesis' in window)) { alert("TTS not supported."); return; }
    const ttsButton = document.querySelector(`#${messageId} .tts-button`);
    if (window.speechSynthesis.speaking) {
        cancelSpeech();
        if (ttsButton) { ttsButton.innerHTML = '🔊'; ttsButton.title = 'Read Aloud'; }
        return;
    }
    const messageElement = document.getElementById(messageId);
    if (!messageElement) return;
    const contentElement = messageElement.querySelector('.message-content');
    const textToSpeak = contentElement?.innerText || contentElement?.textContent || '';
    if (textToSpeak.trim()) {
        if (ttsButton) { ttsButton.innerHTML = '⏹️'; ttsButton.title = 'Stop Speaking'; }
        speakText(textToSpeak.trim());
        const checkSpeechInterval = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
                clearInterval(checkSpeechInterval);
                if (ttsButton) { ttsButton.innerHTML = '🔊'; ttsButton.title = 'Read Aloud'; }
            }
        }, 250);
    }
}

// Speech Recognition Handlers
function handleSpeechStart() {
    console.log("Speech recognition started.");
    AppState.isRecording = true;
    UI.updateMicButtonState();
    UI.updateStatusBar("Listening...");
    cancelSpeech();
    DOM.userInput.placeholder = "Listening...";
    DOM.userInput.value = "";
    DOM.sendButton.disabled = true;
}

function handleSpeechResult(event) {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript + ' ';
        else interim += transcript;
    }
    DOM.userInput.value = final.trim() || interim;
    DOM.sendButton.disabled = DOM.userInput.value.trim() === '' || AppState.isGenerating;
}

function handleSpeechError(event) {
    console.error("Speech recognition error:", event.error, event.message);
    let msg = "Speech error";
    switch (event.error) {
        case 'no-speech': msg = "No speech detected"; break;
        case 'audio-capture': msg = "Mic error"; break;
        case 'not-allowed': msg = "Mic access denied"; DOM.micButton.disabled = true; DOM.micButton.title = "Mic access denied"; CONFIG.speech.sttEnabled = false; break;
        case 'aborted': msg = "Recognition stopped"; break;
        case 'network': msg = "Network error"; break;
        case 'service-not-allowed': msg = "Service disabled"; break;
    }
    // onend usually handles state reset, just update status here
    updateStatusBar(`Error: ${msg}`);
}

function handleSpeechEnd() {
    console.log("Speech recognition ended.");
    // Ensure state is reset if ended unexpectedly or normally
    if (AppState.isRecording) {
        stopSpeechRecognition(); // This ensures UI updates and state reset
    }
}

// Settings Panel Handler
function toggleSettingsPanel() {
    AppState.isSettingsPanelVisible = !AppState.isSettingsPanelVisible;
    DOM.settingsPanel.classList.toggle('visible', AppState.isSettingsPanelVisible);
    DOM.settingsBackdrop.classList.toggle('visible', AppState.isSettingsPanelVisible);
    document.body.style.overflow = AppState.isSettingsPanelVisible ? 'hidden' : '';
    if (AppState.isSettingsPanelVisible) DOM.modelSelector.focus();
    else {
        if (!AppState.isGenerating && !AppState.isRecording) DOM.userInput.focus();
        updateStatusBar(); UI.updateTokenCount();
    }
}

// =========================================================
// UTILITY FUNCTIONS
// =========================================================
function formatMessagesForApi() {
    try {
        const messages = [];
        if (CONFIG.ai.defaultPrompt) messages.push({ role: 'system', content: CONFIG.ai.defaultPrompt });
        AppState.chatHistory.forEach(message => {
            if ((message.role === 'user' || message.role === 'assistant') && !message.isError) {
                messages.push({ role: message.role, content: message.content });
            } else if (message.role === 'user') { // Include user messages even if they led to an error
                messages.push({ role: message.role, content: message.content });
            }
        });
        if (messages.length === (CONFIG.ai.defaultPrompt ? 1 : 0)) {
            // This is okay if it's the very first message after clearing chat
            // console.warn("Formatting messages resulted in only system prompt (or empty).");
        }
        return messages;
    } catch (error) { console.error("Error formatting messages:", error); return null; }
}

function saveChatHistory() {
    const key = CONFIG.storage.prefix + CONFIG.storage.keys.history;
    try {
        const historyToSave = AppState.chatHistory.slice(-100); // Limit history size
        localStorage.setItem(key, JSON.stringify(historyToSave));
    } catch (error) { console.error("Error saving chat history:", error); }
}

function saveSettings() {
    const key = CONFIG.storage.prefix + CONFIG.storage.keys.settings;
    try { localStorage.setItem(key, JSON.stringify(AppState.settings)); }
    catch (error) { console.error("Error saving settings:", error); }
}

function saveSelectedModel() {
    const key = CONFIG.storage.prefix + CONFIG.storage.keys.model;
    try { localStorage.setItem(key, AppState.selectedModel); }
    catch (error) { console.error("Error saving selected model:", error); }
}

function updateStatusBar(message = null) { UI.updateStatusBar(message); }

function updateTokenCount() { UI.updateTokenCount(); }

/**
 * Get token count for the current conversation
 */
function getTokenCount() {
    return calculateTokenCount(AppState.routingPrompt, AppState.chatHistory);
}

function initializeAnimation() {
    function checkWebGL() { /* ... */ return true; } // Simplified for brevity
    if (checkWebGL() && typeof THREE !== 'undefined' && typeof anime !== 'undefined') {
        Animation.initialize(); // Call initialize from the imported module
    } else {
        console.error("WebGL or required libraries missing. Visualization disabled.");
        if (DOM.canvas) DOM.canvas.style.display = 'none';
        if (DOM.info) DOM.info.textContent = "Vis disabled";
    }
}

function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement("span");
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    ripple.classList.add("ripple");
    const existing = button.querySelector(".ripple");
    if (existing) existing.remove();
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => { if (ripple.parentElement) ripple.remove(); });
}

function addRippleEffectListeners() {
    // Select all buttons that should have ripple effect
    const buttons = document.querySelectorAll('#send-button, #mic-button, #stop-button, #settings-button, #welcome-button, .settings-button');
    
    // Add mousedown event for desktop
    buttons.forEach(button => button.addEventListener('mousedown', createRipple));
    
    // Add touchstart event for mobile with passive flag to improve scrolling performance
    buttons.forEach(button => button.addEventListener('touchstart', createRipple, { passive: true }));
}

function visualFeedback(element, text, title, isCodeButton = false) {
    if (!element) return;
    const originalContent = element.innerHTML;
    const originalTitle = element.title;
    const originalBg = element.style.backgroundColor;
    const originalColor = element.style.color;

    element.innerHTML = text;
    element.title = title;
    if (isCodeButton) {
        element.style.backgroundColor = '#00f0ff';
        element.style.color = '#1A1A1A';
    } else {
        element.style.color = '#00f0ff';
    }

    setTimeout(() => {
        element.innerHTML = originalContent;
        element.title = originalTitle;
        element.style.backgroundColor = originalBg;
        element.style.color = originalColor;
    }, 1500);
}

/**
 * Execute the routing phase of the conversation
 */
async function executeRoutingPhase() {
    const aiMessageId = `msg-${Date.now()}-router`;
    AppState.currentMessage = UI.addMessageToChat('', 'assistant', aiMessageId); // Placeholder
    UI.setThinkingState(true, "Routing query..."); // Update status
    AppState.lastError = null;
    AppState.conversationPhase = 'routing'; // Explicitly set phase

    try {
        // Create new abort controller for this request
        AppState.abortController = new AbortController();
        
        // Call the processRoutingQuery function from AgentAPI-rules.js
        const routingResult = await processRoutingQuery(
            AppState.routingPrompt,
            AppState.chatHistory,
            AppState.currentMessage,
            AppState.originalUserQuery,
            AppState.apiKey,
            AppState.selectedModel,
            AppState.settings,
            AppState.abortController
        );

        // Handle the result based on the action field
        switch (routingResult.action) {
            case 'handoff':
                // Technology Found - Proceed to Handoff
                AppState.identifiedTechnology = routingResult.technology;
                AppState.routingAgentOutputText = routingResult.explanation;
                AppState.conversationPhase = 'technical_handoff';

                // Finalize the Routing message WITH the transition indicator
                UI.finalizeAIMessage(aiMessageId, routingResult.explanation, false, true, routingResult.technology);

                // Add routing response to history
                AppState.chatHistory.push({ 
                    role: 'assistant', 
                    content: routingResult.rawResponse, 
                    id: aiMessageId 
                });
                saveChatHistory();

                // Trigger the Technical Agent with a small delay
                setTimeout(() => {
                    executeTechnicalPhase();
                }, 500);
                break;

            case 'ask':
                // Scoping Question or simple response - Finalize normally
                UI.finalizeAIMessage(aiMessageId, routingResult.explanation, false);
                AppState.chatHistory.push({ 
                    role: 'assistant', 
                    content: routingResult.rawResponse, 
                    id: aiMessageId 
                });
                saveChatHistory();
                UI.setThinkingState(false); // Stop thinking indicator
                AppState.conversationPhase = 'routing'; // Ready for user's next input
                break;

            case 'error':
                // Handle error
                const errorMessage = routingResult.message || "Routing error.";
                AppState.lastError = errorMessage;
                UI.finalizeAIMessage(aiMessageId, `Error: ${errorMessage}`, true);
                AppState.chatHistory.push({ 
                    role: 'assistant', 
                    content: `Error: ${errorMessage}`, 
                    id: aiMessageId, 
                    isError: true 
                });
                saveChatHistory();
                UI.setThinkingState(false, `Error: ${errorMessage.substring(0, 50)}...`);
                AppState.conversationPhase = 'routing'; // Reset phase on error
                break;

            default:
                // Unexpected result
                console.error("Unexpected routing result action:", routingResult.action);
                AppState.lastError = "Unexpected routing result";
                UI.finalizeAIMessage(aiMessageId, "Error: Unexpected routing result", true);
                AppState.chatHistory.push({ 
                    role: 'assistant', 
                    content: "Error: Unexpected routing result", 
                    id: aiMessageId, 
                    isError: true 
                });
                saveChatHistory();
                UI.setThinkingState(false, "Error: Unexpected routing result");
                AppState.conversationPhase = 'routing'; // Reset phase
                break;
        }

    } catch (error) {
        console.error("Error during routing phase:", error);
        const errorMessage = error.message || "Routing error.";
        AppState.lastError = errorMessage;
        UI.finalizeAIMessage(aiMessageId, `Error: ${errorMessage}`, true);
        AppState.chatHistory.push({ role: 'assistant', content: `Error: ${errorMessage}`, id: aiMessageId, isError: true });
        saveChatHistory();
        UI.setThinkingState(false, `Error: ${errorMessage.substring(0, 50)}...`);
        AppState.conversationPhase = 'routing'; // Reset phase on error
    } finally {
        AppState.currentMessage = null; // Clear current streaming message ID
        UI.updateTokenCount();
        // Re-enable input ONLY if waiting for user (i.e., scoping question was asked)
        if (AppState.conversationPhase === 'routing' && !AppState.isGenerating) {
             DOM.userInput.disabled = false;
             DOM.sendButton.disabled = DOM.userInput.value.trim() === '';
             if (!AppState.isRecording && !AppState.isSettingsPanelVisible) DOM.userInput.focus();
        }
    }
}

/**
 * Execute the technical phase of the conversation
 */
async function executeTechnicalPhase() {
    if (!AppState.identifiedTechnology || !AppState.originalUserQuery) {
        console.error("Missing technology or original query for technical phase.");
        UI.setThinkingState(false, "Internal error: Missing context.");
        AppState.conversationPhase = 'routing'; // Reset
        return;
    }

    const techAiMessageId = `msg-${Date.now()}-tech`;
    AppState.currentMessage = UI.addMessageToChat('', 'assistant', techAiMessageId); // Placeholder for tech response
    UI.setThinkingState(true, `Consulting ${AppState.identifiedTechnology} specialist...`); // Update status
    AppState.lastError = null;
    AppState.conversationPhase = 'technical_response'; // Update phase
    let response = null;

    try {
        console.log(`Loading technical prompt for ${AppState.identifiedTechnology}...`);
        // Use imported function to load technical prompt
        const technicalPrompt = await loadTechnicalPrompt(AppState.identifiedTechnology);
        if (!technicalPrompt) {
            throw new Error(`Could not load instructions for ${AppState.identifiedTechnology}.`);
        }
        console.log(`Technical prompt loaded successfully`);

        // Create new abort controller for this request
        AppState.abortController = new AbortController();
        
        // Use imported function to format messages for technical phase
        const messages = formatTechnicalMessages(
            technicalPrompt,
            AppState.originalUserQuery,
            AppState.routingAgentOutputText,
            AppState.chatHistory,
            AppState.currentMessage,
            AppState.identifiedTechnology
        );
        
        if (!messages) {
            throw new Error("Failed to format messages for technical phase.");
        }

        console.log("Technical Messages Ready:", messages.length, "messages");
        
        try {
            // Use imported function to call API
            response = await callLlmApi(
                messages, 
                AppState.apiKey, 
                AppState.selectedModel, 
                AppState.settings,
                AppState.abortController
            );
            
            console.log("API response received successfully");
            
            if (!response || response.trim() === '') {
                throw new Error("Empty response received from API");
            }
            
            UI.finalizeAIMessage(techAiMessageId, response, false); // Finalize the technical message
            AppState.chatHistory.push({ role: 'assistant', content: response, id: techAiMessageId });
            saveChatHistory();
            
        } catch (apiError) {
            console.error("API call failed:", apiError);
            // Rethrow to be caught by the outer try-catch
            throw apiError;
        }
        
        UI.setThinkingState(false); // End thinking state
        
        // Keep the technical phase and context alive for follow-up questions
        // Don't reset conversationPhase, identifiedTechnology, or routingAgentOutputText

    } catch (error) {
        console.error("Error during technical phase:", error);
        const errorMessage = error.message || "Technical agent error.";
        AppState.lastError = errorMessage;
        
        // Ensure we update the UI with the error
        UI.finalizeAIMessage(techAiMessageId, `Error: ${errorMessage}`, true);
        AppState.chatHistory.push({ role: 'assistant', content: `Error: ${errorMessage}`, id: techAiMessageId, isError: true });
        saveChatHistory();
        UI.setThinkingState(false, `Error: ${errorMessage.substring(0, 50)}...`);
        
        // Reset conversationPhase on error
        AppState.conversationPhase = 'routing';
        AppState.identifiedTechnology = null;
        AppState.originalUserQuery = null;
        AppState.routingAgentOutputText = null;
    } finally {
        AppState.currentMessage = null;
        // Reset only originalUserQuery as it was consumed in this response
        AppState.originalUserQuery = null;
        UI.updateTokenCount();
        // Re-enable input for the next query
        DOM.userInput.disabled = false;
        DOM.sendButton.disabled = DOM.userInput.value.trim() === '';
        if (!AppState.isRecording && !AppState.isSettingsPanelVisible) DOM.userInput.focus();
    }
}

/**
 * Handle resetting settings to defaults
 */
function handleResetSettings() {
    if (confirm("Reset AI parameters and TTS setting to defaults? (API Key/Model unchanged)")) {
        console.log("Resetting settings...");
        AppState.settings = {
            temperature: CONFIG.ai.temperature,
            maxTokens: CONFIG.ai.maxTokens,
            topP: CONFIG.ai.topP,
            ttsEnabled: CONFIG.speech.ttsEnabled
        };
        UI.updateSettingsUI();
        saveSettings();
        alert("Settings reset.");
    }
}

// =========================================================
// APPLICATION START
// =========================================================
// Use DOMContentLoaded to ensure HTML is parsed, then run initializeApp
document.addEventListener('DOMContentLoaded', initializeApp);
/**
 * Initialize text-to-speech voices
 */
function initializeVoices() {
    // Check if speech synthesis is available
    if (!window.speechSynthesis) {
        console.warn("Speech synthesis not supported in this browser");
        return;
    }
    
    // Initial load of available voices
    const loadVoicesWhenAvailable = () => {
        AppState.availableVoices = window.speechSynthesis.getVoices();
        console.log(`Loaded ${AppState.availableVoices.length} voices.`);
    };
    
    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoicesWhenAvailable;
    }
    
    // Try immediate load for browsers that load voices synchronously
    loadVoicesWhenAvailable();
}

// --- Detect Mobile Device ---
function detectMobileDevice() {
    // Check if device is mobile based on user agent
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileByUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    
    // Also check by screen size
    const isMobileBySize = window.innerWidth <= 768;
    
    // Set mobile state
    AppState.isMobile = isMobileByUA || isMobileBySize;
    
    // Add class to body for CSS targeting
    if (AppState.isMobile) {
        document.body.classList.add('mobile-device');
        
        // Adjust UI for mobile
        adjustUIForMobile();
    }
    
    console.log("Device detection:", AppState.isMobile ? "Mobile" : "Desktop");
}

// --- Adjust UI for Mobile ---
function adjustUIForMobile() {
    if (!AppState.isMobile) return;
    
    // Focus handling improvements for mobile
    if (DOM.userInput) {
        // Prevent auto-zoom on input focus for iOS
        DOM.userInput.style.fontSize = '16px';
        
        // Improve scroll behavior when virtual keyboard appears
        DOM.userInput.addEventListener('focus', () => {
            // Small delay to let virtual keyboard appear
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
                if (DOM.chatMessages) {
                    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
                }
            }, 300);
        }, { passive: true }); // Add passive flag to improve scrolling performance
    }
}
