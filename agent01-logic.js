/**
 * AGENT 01 - Main Logic Module
 * Handles core application logic, UI updates, API calls, speech, etc.
 * Imports the Animation module for visualization control.
 */

// Import the animation module
import { Animation } from './agent01-animation.js';

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

    // API Settings
    api: {
        baseUrl: "https://api.deepseek.com/v1/chat/completions",
        defaultApiKey: "sk-91906d08d98143fd99a45eef802fb2e5",
        defaultModel: "deepseek-reasoner",
        models: {
            "deepseek-reasoner": {
                id: "deepseek-chat",
                modelName: "deepseek-reasoner"
            },
            "deepseek-chat": {
                id: "deepseek-chat",
                modelName: "deepseek-chat"
            }
        }
    },

    // AI Settings
    ai: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1.0,
        promptFile: "../AgentTechs/RoutingAgent.txt",
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
        prefix: 'agent01_',
        keys: {
            apiKey: 'api_key',
            settings: 'settings',
            history: 'chat_history',
            model: 'selected_model'
        }
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
    apiKeyInput: document.getElementById('api-key-input'),
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
    // First, detect mobile devices for appropriate handling
    AppState.isMobile = window.innerWidth < 768;
    
    // Initialize UI components
    UI.updateSettingsUI();
    
    // Initialize Config with appropriate defaults
    // Adjust settings for mobile if needed
    if (AppState.isMobile) {
        // Reduce particle count on mobile for better performance
        CONFIG.particles.count = Math.min(CONFIG.particles.count, 20000);
        // Set smaller initial size for particles on mobile
        CONFIG.particles.size = 0.018;
    }
    
    // Load previous settings
    loadSettings();
    loadChatHistory();
    loadSelectedModel();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize visualization
    if (!AppState.isMobile) {
        // On desktop, initialize animation immediately
        initializeAnimation();
    } else {
        // On mobile, delay animation initialization for better initial load
        setTimeout(initializeAnimation, 500);
    }
    
    // Initialize speech recognition and TTS
    initializeSpeechRecognition();
    initializeTextToSpeech();
    
    // Load the routing prompt
    await loadRoutingPrompt();
    
    // Set status to ready
    updateStatusBar("Ready");
    
    console.log("App initialized");
}

/**
 * Load routing prompt from file
 */
async function loadRoutingPrompt() {
    // CORRECTED PATH for web deployment (relative to Agent01.html)
    const promptFile = 'AgentTechs/RoutingAgent.txt';
    console.log(`Attempting to load routing prompt from: ${promptFile}`); // Log the path being used

    try {
        // Use fetch as it works in the browser
        const response = await fetch(promptFile);
        if (!response.ok) {
            // Log detailed error if fetch fails
            throw new Error(`Failed to load routing prompt: ${response.status} ${response.statusText} (URL: ${response.url})`);
        }
        AppState.routingPrompt = await response.text(); // Store in AppState
        console.log("Routing prompt loaded successfully into AppState via fetch.");
        return true;
    } catch (error) {
        // Log the error and use a basic fallback
        console.error("Error loading routing prompt via fetch:", error);
        AppState.routingPrompt = "System: You are a helpful routing assistant. Error loading specific instructions."; // Basic fallback
        // Display an error to the user in the UI if possible, or just log it
        // For simplicity here, we just log and use fallback.
        return false;
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
    const apiStorageKey = CONFIG.storage.prefix + CONFIG.storage.keys.apiKey;
    const savedApiKey = localStorage.getItem(apiStorageKey);
    if (savedApiKey) AppState.apiKey = savedApiKey;
    else console.log("Using default API key.");
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
                    UI.addMessageToChat(message.content, message.role, message.id, message.isError);
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
    DOM.apiKeyInput.addEventListener('change', handleApiKeyChange);
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
        DOM.apiKeyInput.value = AppState.apiKey;
        DOM.modelSelector.value = AppState.selectedModel;
    },

    updateTokenCount: function() {
        const count = calculateTokenCount();
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
async function callLlmApi(messages) {
    if (!messages || !messages.length) {
        throw new Error("No messages to send to API");
    }
    
    // Log full message sequence for debugging
    console.log("API call - Full messages:", messages);
    
    // Get model-specific endpoint
    let endpoint, headers, body;
    
    // Create new abort controller for this request
    AppState.abortController = new AbortController();
    const signal = AppState.abortController.signal;
    
    // Configure model-specific settings
    if (AppState.selectedModel.startsWith('deepseek')) {
        endpoint = CONFIG.api.baseUrl;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AppState.apiKey}` };
        
        // Check if the last message is from assistant - in that case use prefix mode
        const needsPrefixMode = messages.length > 0 && messages[messages.length - 1].role === 'assistant';
        
        // Verify that the first non-system message is from a user
        let foundNonSystemMessage = false;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role !== 'system') {
                foundNonSystemMessage = true;
                if (messages[i].role !== 'user') {
                    console.error("Error: First non-system message must be from user");
                    throw new Error("First non-system message must be from user. This is required by the DeepSeek API.");
                }
                break;
            }
        }
        
        body = JSON.stringify({
            model: CONFIG.api.models[AppState.selectedModel]?.modelName || AppState.selectedModel,
            messages: messages,
            temperature: AppState.settings.temperature,
            max_tokens: AppState.settings.maxTokens,
            top_p: AppState.settings.topP,
            stream: true,
            // Enable prefix completion mode if the last message is from assistant
            prefix_mode: needsPrefixMode
        });
        
        console.log("Using prefix mode:", needsPrefixMode);
    } else {
        throw new Error(`Unsupported model: ${AppState.selectedModel}`);
    }
    
    // Make API request with streaming
    try {
        console.log("Sending API request to:", endpoint);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: body,
            signal: signal
        });

        if (!response.ok) {
            let errorMessage = `API error ${response.status}`;
            try {
                const errorData = await response.json();
                console.error("API error details:", errorData);
                if (errorData.error && typeof errorData.error === 'object') {
                    errorMessage = `API error: ${errorData.error.message || JSON.stringify(errorData.error)}`;
                } else if (errorData.error) {
                    errorMessage = `API error: ${errorData.error}`;
                } else {
                    errorMessage = `API error ${response.status}: ${JSON.stringify(errorData)}`;
                }
            } catch (e) {
                console.error("Could not parse error response:", e);
                errorMessage = `API error ${response.status}: Could not parse error details`;
            }
            throw new Error(errorMessage);
        }

        if (!response.body) {
            throw new Error("Response body is null (streaming not supported)");
        }

        const reader = response.body.getReader();
        let fullText = '';
        let tempBuffer = '';
        let streamStarted = false;

        try {
            console.log("Starting to read streaming response...");
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log("Stream completed");
                    break;
                }

                // Handle chunk
                const chunk = new TextDecoder().decode(value);
                tempBuffer += chunk;

                let lines = tempBuffer.split('\n');
                tempBuffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const eventData = line.slice(6); // Remove "data: "
                        
                        if (eventData === '[DONE]') {
                            console.log("Received [DONE] event");
                            continue;
                        }

                        try {
                            const event = JSON.parse(eventData);
                            
                            if (event.choices && event.choices[0]) {
                                if (!streamStarted) {
                                    console.log("First content received");
                                    streamStarted = true;
                                }
                                const delta = event.choices[0].delta?.content || '';
                                if (delta) {
                                    fullText += delta;
                                    updateCurrentMessage(fullText);
                                }
                            }
                        } catch (jsonError) {
                            console.warn("Error parsing stream event:", jsonError, eventData);
                        }
                    }
                }
            }
        } catch (readError) {
            console.error("Error reading stream:", readError);
            if (signal.aborted) {
                console.log("Stream was deliberately aborted");
                fullText += "\n*(Generation stopped)*";
                return fullText;
            }
            throw readError;
        }

        console.log("Streaming completed successfully, returning full text");
        return fullText;
    } catch (error) {
        console.error("Error in API call:", error);
        if (signal.aborted) {
            return "*(Generation stopped)*";
        }
        throw error;
    }
}

/**
 * Update the current streaming message
 */
function updateCurrentMessage(text) {
    if (AppState.currentMessage) {
        UI.updateAIMessage(AppState.currentMessage.id, text);
    }
}

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
        
        DOM.userInput.focus();
    }, 1000);
}

function handleModelChange() {
    AppState.selectedModel = DOM.modelSelector.value;
    saveSelectedModel();
    updateStatusBar();
}

function handleApiKeyChange() {
    AppState.apiKey = DOM.apiKeyInput.value;
    saveApiKey();
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

function saveApiKey() {
    const key = CONFIG.storage.prefix + CONFIG.storage.keys.apiKey;
    try { localStorage.setItem(key, AppState.apiKey); }
    catch (error) { console.error("Error saving API key:", error); }
}

function saveSelectedModel() {
    const key = CONFIG.storage.prefix + CONFIG.storage.keys.model;
    try { localStorage.setItem(key, AppState.selectedModel); }
    catch (error) { console.error("Error saving selected model:", error); }
}

function updateStatusBar(message = null) { UI.updateStatusBar(message); }

function updateTokenCount() { UI.updateTokenCount(); }

/**
 * Calculate token count for history
 */
function calculateTokenCount() {
    if (typeof tokenizer !== 'undefined' && typeof tokenizer.encode === 'function') {
        try {
            // Create a temporary messages array similar to what we'd send to API
            const messages = [];
            
            // Add system message (routing prompt) if available
            if (AppState.routingPrompt) {
                messages.push({ role: 'system', content: AppState.routingPrompt });
            }
            
            // Add chat history
            AppState.chatHistory.forEach(m => {
                if ((m.role === 'user' || m.role === 'assistant') && !m.isError) {
                    messages.push({ role: m.role, content: m.content });
                }
            });
            
            if (!messages.length) return 0;
            
            let count = 0;
            messages.forEach(m => { 
                count += tokenizer.encode(m.role).length + tokenizer.encode(m.content).length + 4; 
            });
            return count;
        } catch (error) { 
            console.warn("Tokenizer error:", error); 
        }
    }
    
    // Fallback using word count estimation
    let words = 0;
    if (AppState.routingPrompt) words += (AppState.routingPrompt.match(/\S+/g) || []).length;
    
    AppState.chatHistory.forEach(m => {
        if ((m.role === 'user' || m.role === 'assistant') && !m.isError) {
            words += (m.content.match(/\S+/g) || []).length;
        }
    });
    
    return Math.round(words * 1.3); // Rough approximation of tokens from words
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
    document.querySelectorAll('#send-button, #mic-button, #stop-button, #settings-button, #welcome-button, .settings-button')
        .forEach(button => button.addEventListener('mousedown', createRipple));
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
 * Load technical prompt for a specific technology
 */
async function loadTechnicalPrompt(technologyName) {
    if (!technologyName) {
        console.error("Cannot load technical prompt without technology name.");
        return null; // Return null or a default error prompt
    }

    // CORRECTED PATH for web deployment (relative to Agent01.html)
    const promptPath = `AgentTechs/${technologyName}.txt`;
    console.log(`Attempting to load technical prompt from: ${promptPath}`); // Log the path

    try {
        const response = await fetch(promptPath);
        if (!response.ok) {
            // Throw an error with details if the specific tech file isn't found or fetch fails
            throw new Error(`Failed to load technical prompt '${promptPath}': ${response.status} ${response.statusText} (URL: ${response.url})`);
        }
        const promptText = await response.text();
        console.log(`Technical prompt for ${technologyName} loaded successfully via fetch.`);
        return promptText; // Return the loaded prompt text
    } catch (error) {
        console.error("Error loading technical prompt:", error);
        // Return a generic error prompt indicating the specific file failed
        return `System: Error loading specific instructions for ${technologyName}. Provide general troubleshooting steps based on the technology name only.`;
    }
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
        const messages = formatRoutingMessages(); // Use specific formatter
        if (!messages) throw new Error("Failed to format messages for routing.");

        const response = await callLlmApi(messages); // Call API

        // --- Crucial Step: Parse the response ---
        const { isTechIdentified, technologyName, explanation } = parseRoutingResponse(response);

        if (isTechIdentified && technologyName) {
            // Technology Found - Proceed to Handoff
            AppState.identifiedTechnology = technologyName;
            AppState.routingAgentOutputText = explanation; // Store the explanation part
            AppState.conversationPhase = 'technical_handoff';

            // Finalize the Routing message WITH the transition indicator
            UI.finalizeAIMessage(aiMessageId, explanation, false, true, technologyName); // Add new args for transition

            // Add routing response to history (important for context if needed later)
            AppState.chatHistory.push({ role: 'assistant', content: response, id: aiMessageId }); // Store raw response
            saveChatHistory();

            // Trigger the Technical Agent (don't wait for user input)
            // Add a small delay for the user to see the transition message
            setTimeout(() => {
                executeTechnicalPhase();
            }, 500); // 500ms delay

        } else {
            // Scoping Question or simple response - Finalize normally
            UI.finalizeAIMessage(aiMessageId, response, false); // Finalize routing message
            AppState.chatHistory.push({ role: 'assistant', content: response, id: aiMessageId });
            saveChatHistory();
            UI.setThinkingState(false); // Stop thinking indicator
            AppState.conversationPhase = 'routing'; // Ready for user's next input
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
 * Parse the response from the routing agent
 */
function parseRoutingResponse(responseText) {
    // Expecting format like "[TECH_IDENTIFIED: ExchangeOnline] Transferring you to the Exchange specialist..."
    // Or "[SCOPING_QUESTION] Could you please specify..."

    const techMatch = responseText.match(/^\[TECH_IDENTIFIED:\s*([^\]]+)\]\s*(.*)/s);
    if (techMatch) {
        return {
            isTechIdentified: true,
            technologyName: techMatch[1].trim(),
            explanation: techMatch[2].trim() || `Identified technology: ${techMatch[1].trim()}. Preparing detailed information...` // Fallback explanation
        };
    }

    // Check for scoping question if prompt uses a specific format for it
    const scopeMatch = responseText.match(/^\[SCOPING_QUESTION\]\s*(.*)/s);
    if (scopeMatch) {
        return {
            isTechIdentified: false,
            technologyName: null,
            explanation: scopeMatch[1].trim() // Extract just the question part
        };
    }

    // Default: Assume it's a simple response or scoping question without specific tag
    return {
        isTechIdentified: false,
        technologyName: null,
        explanation: responseText // The whole text is the explanation/question
    };
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
        const technicalPrompt = await loadTechnicalPrompt(AppState.identifiedTechnology);
        if (!technicalPrompt) {
            throw new Error(`Could not load instructions for ${AppState.identifiedTechnology}.`);
        }
        console.log(`Technical prompt loaded successfully`);

        // Create a simple two-message sequence: system prompt + user query
        // This ensures we always satisfy the DeepSeek API requirement
        const simplifiedMessages = [
            { role: 'system', content: technicalPrompt },
            { role: 'user', content: AppState.originalUserQuery }
        ];

        // Add context about previous interactions if this is a follow-up question
        if (AppState.chatHistory.some(m => m.role === 'assistant' && 
                                        !m.isGreeting && 
                                        !m.isError && 
                                        m.id !== AppState.currentMessage.id)) {
            // Get only the most recent exchange between user and specialist
            // Summarize previous exchanges to keep context compact
            let contextSummary = "Previous conversation context:\n";
            
            // Find all assistant messages after the routing phase
            const specialistMessages = AppState.chatHistory.filter(m => 
                m.role === 'assistant' && 
                !m.isGreeting && 
                !m.isError && 
                m.id !== AppState.currentMessage.id);
            
            if (specialistMessages.length > 0) {
                // Add the most recent specialist message as context
                const lastSpecialistMessage = specialistMessages[specialistMessages.length - 1];
                contextSummary += `Last specialist response: ${lastSpecialistMessage.content}\n\n`;
                
                // Update the user query with context
                simplifiedMessages[1].content = 
                    `Follow-up question for ${AppState.identifiedTechnology} specialist. Previous specialist advice was provided.\n\nMy question: ${AppState.originalUserQuery}`;
            }
            
            // Enrich the system prompt with the context summary
            simplifiedMessages[0].content += `\n\n${contextSummary}`;
        }

        console.log("Simplified Technical Messages:", simplifiedMessages);
        console.log("Calling API with technical messages...");
        
        try {
            response = await callLlmApi(simplifiedMessages); // Call API with simplified messages
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
 * Format messages for the routing agent
 */
function formatRoutingMessages() {
    try {
        const messages = [];
        
        // Add system message (routing prompt)
        if (AppState.routingPrompt) {
            messages.push({ role: 'system', content: AppState.routingPrompt });
        } else {
            console.warn("Routing prompt not loaded!");
            messages.push({ role: 'system', content: "You are a helpful routing assistant." });
        }

        // Find user messages in chat history
        const userMessages = AppState.chatHistory.filter(message => 
            message.role === 'user' && 
            (!AppState.currentMessage || message.id !== AppState.currentMessage.id)
        );
        
        // If there are no user messages, use originalUserQuery
        if (userMessages.length === 0) {
            if (AppState.originalUserQuery) {
                messages.push({ role: 'user', content: AppState.originalUserQuery });
            } else {
                console.error("No user messages found for API request!");
                return null;
            }
            return messages; // Early return with just system + user
        } 
        
        // Add relevant conversation history
        let assistantResponded = false;
        let lastUserMessageIndex = -1;
        
        for (let i = 0; i < AppState.chatHistory.length; i++) {
            const message = AppState.chatHistory[i];
            
            // Skip current placeholder, greetings and errors
            if ((AppState.currentMessage && message.id === AppState.currentMessage.id) || 
                message.isGreeting || 
                message.isError) {
                continue;
            }
            
            if (message.role === 'user') {
                lastUserMessageIndex = messages.length;
                messages.push({ role: 'user', content: message.content });
            } else if (message.role === 'assistant') {
                messages.push({ role: 'assistant', content: message.content });
                assistantResponded = true;
            }
        }
        
        // If the last message is not a user message, remove the last assistant message
        // and ensure last user message is included
        if (assistantResponded && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            // Remove the last assistant message to ensure last message is from user
            messages.pop();
            
            // If we have no messages or no user message, add the most recent user message
            if (messages.length === 0 || !messages.some(m => m.role === 'user')) {
                const lastUserMessage = userMessages[userMessages.length - 1];
                messages.push({ role: 'user', content: lastUserMessage.content });
            }
        }

        console.log("Formatted Routing Messages:", messages); // Debug log
        return messages;
    } catch (error) {
        console.error("Error formatting routing messages:", error);
        return null;
    }
}

/**
 * Format messages for the technical agent
 */
function formatTechnicalMessages(technicalPrompt, originalQuery, routingContext) {
    try {
        const messages = [];
        
        // Add system message (technical prompt) with routing context included
        if (technicalPrompt) {
            let systemContent = technicalPrompt;
            
            // Add routing context to the system message if available
            if (routingContext) {
                systemContent += `\n\nContext from routing agent: ${routingContext}`;
            }
            
            messages.push({ role: 'system', content: systemContent });
        } else {
            console.warn("Technical prompt is missing!");
            messages.push({ role: 'system', content: "Provide detailed technical steps." });
        }

        // Find the conversation history with this technology specialist
        let relevantHistory = [];
        
        // Get messages after we identified the technology
        let foundTechStart = false;
        let lastMessageWasFromUser = false;
        
        // 1. Look for the routing message that identified the technology
        for (let i = 0; i < AppState.chatHistory.length; i++) {
            const message = AppState.chatHistory[i];
            
            // Skip system messages, current placeholder, greetings and errors
            if (message.role === 'system' || 
                (AppState.currentMessage && message.id === AppState.currentMessage.id) || 
                message.isGreeting || 
                message.isError) {
                continue;
            }
            
            // First look for the routing message that identified the technology
            if (!foundTechStart && message.role === 'assistant' && 
                message.content.includes(`[TECH_IDENTIFIED: ${AppState.identifiedTechnology}]`)) {
                foundTechStart = true;
                continue; // Skip the routing message itself
            }
            
            // Once we've found the tech start, include all subsequent messages
            if (foundTechStart) {
                relevantHistory.push({ role: message.role, content: message.content });
                lastMessageWasFromUser = message.role === 'user';
            }
        }
        
        // If we have history, process it to ensure proper alternation
        let processedHistory = [];
        if (relevantHistory.length > 0) {
            let lastRole = null;
            
            for (const msg of relevantHistory) {
                // Skip consecutive messages with the same role
                if (lastRole !== msg.role) {
                    processedHistory.push(msg);
                    lastRole = msg.role;
                }
            }
        }
        
        // Add conversation history before adding the current query
        // but only if it ends with an assistant message
        if (processedHistory.length > 0) {
            if (processedHistory[processedHistory.length - 1].role === 'assistant') {
                messages.push(...processedHistory);
                lastMessageWasFromUser = false;
            } else {
                // If history ends with user, only include up to the last assistant message
                let trimmedHistory = [];
                for (let i = 0; i < processedHistory.length - 1; i++) {
                    trimmedHistory.push(processedHistory[i]);
                }
                if (trimmedHistory.length > 0) {
                    messages.push(...trimmedHistory);
                    lastMessageWasFromUser = false;
                }
            }
        }
        
        // Finally, add the current user query
        if (originalQuery) {
            messages.push({ role: 'user', content: originalQuery });
        } else {
            console.error("Original user query is missing for technical formatting!");
            return null; // Cannot proceed without the query
        }

        // Log the final formatted messages for debugging
        console.log("Formatted Technical Messages:", messages.map(m => `${m.role}: ${m.content.substring(0, 30)}...`));
        return messages;
    } catch (error) {
        console.error("Error formatting technical messages:", error);
        return null;
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
