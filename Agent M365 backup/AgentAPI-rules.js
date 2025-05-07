/**
 * AGENT API RULES Module
 * Handles API-related configuration, prompt management, conversation rules, and context.
 */

// =========================================================
// API CONFIGURATION
// =========================================================
export const API_CONFIG = {
    // API Endpoints
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    defaultApiKey: "sk-91906d08d98143fd99a45eef802fb2e5",
    
    // Model Configuration
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
    },
    
    // AI Parameter Defaults
    defaultParameters: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1.0
    },
    
    // Storage Keys
    storageKeys: {
        prefix: 'agent01_',
        apiKey: 'api_key',
        settings: 'settings',
        history: 'chat_history',
        model: 'selected_model'
    }
};

// =========================================================
// PROMPTS & CONTEXT MANAGEMENT
// =========================================================
export const PROMPT_CONFIG = {
    // Prompt File Paths
    routingPromptFile: 'AgentTechs/RoutingAgent.txt',
    technicalPromptBasePath: 'AgentTechs/',
    
    // Default system prompt (fallback)
    defaultSystemPrompt: "You are a helpful AI assistant.",
    defaultRoutingPrompt: "System: You are a helpful routing assistant. Error loading specific instructions.",
    
    // Conversation context settings
    contextManagement: {
        maxHistoryLimit: 100, // Maximum number of messages to retain in history
        maxTokensEstimate: 6000, // Estimated token limit for context
        preserveUserMessages: true // Always keep user messages when truncating
    }
};

// =========================================================
// API CONVERSATION RULES
// =========================================================
export const API_RULES = {
    // DeepSeek API Rules
    deepseek: {
        // Rule: First non-system message must be from user
        firstMessageMustBeUser: true,
        
        // Rule: Messages must alternate between user and assistant
        requireMessageAlternation: true,
        
        // Rule: Prefix mode is needed when the last message is from assistant
        needsPrefixModeForAssistantContinuation: true,
        
        // Rule: Maximum tokens per request
        maxTokensPerRequest: 8000,
        
        // Error handling & retry configuration
        errorHandling: {
            maxRetries: 3,
            retryDelayMs: 1000,
            retriableStatusCodes: [429, 500, 502, 503, 504]
        }
    }
};

// =========================================================
// PROMPT MANAGEMENT FUNCTIONS
// =========================================================

/**
 * Load routing prompt from file
 */
export async function loadRoutingPrompt() {
    console.log(`Attempting to load routing prompt from: ${PROMPT_CONFIG.routingPromptFile}`);

    try {
        // Use fetch as it works in the browser
        const response = await fetch(PROMPT_CONFIG.routingPromptFile);
        if (!response.ok) {
            throw new Error(`Failed to load routing prompt: ${response.status} ${response.statusText} (URL: ${response.url})`);
        }
        const promptText = await response.text();
        console.log("Routing prompt loaded successfully via fetch.");
        return promptText;
    } catch (error) {
        console.error("Error loading routing prompt via fetch:", error);
        return PROMPT_CONFIG.defaultRoutingPrompt; // Return fallback prompt
    }
}

/**
 * Load technical prompt for a specific technology
 */
export async function loadTechnicalPrompt(technologyName) {
    if (!technologyName) {
        console.error("Cannot load technical prompt without technology name.");
        return null;
    }

    const promptPath = `${PROMPT_CONFIG.technicalPromptBasePath}${technologyName}.txt`;
    console.log(`Attempting to load technical prompt from: ${promptPath}`);

    try {
        const response = await fetch(promptPath);
        if (!response.ok) {
            throw new Error(`Failed to load technical prompt '${promptPath}': ${response.status} ${response.statusText} (URL: ${response.url})`);
        }
        const promptText = await response.text();
        console.log(`Technical prompt for ${technologyName} loaded successfully via fetch.`);
        return promptText;
    } catch (error) {
        console.error("Error loading technical prompt:", error);
        return `System: Error loading specific instructions for ${technologyName}. Provide general troubleshooting steps based on the technology name only.`;
    }
}

// =========================================================
// MESSAGE FORMATTING FUNCTIONS
// =========================================================

/**
 * Format messages for the routing agent
 */
export function formatRoutingMessages(routingPrompt, chatHistory, currentMessage, originalUserQuery) {
    try {
        const messages = [];
        
        // Add system message (routing prompt)
        if (routingPrompt) {
            messages.push({ role: 'system', content: routingPrompt });
        } else {
            console.warn("Routing prompt not loaded!");
            messages.push({ role: 'system', content: PROMPT_CONFIG.defaultSystemPrompt });
        }

        // Find user messages in chat history
        const userMessages = chatHistory.filter(message => 
            message.role === 'user' && 
            (!currentMessage || message.id !== currentMessage.id)
        );
        
        // If there are no user messages, use originalUserQuery
        if (userMessages.length === 0) {
            if (originalUserQuery) {
                messages.push({ role: 'user', content: originalUserQuery });
            } else {
                console.error("No user messages found for API request!");
                return null;
            }
            return messages; // Early return with just system + user
        } 
        
        // Add relevant conversation history
        let assistantResponded = false;
        let lastUserMessageIndex = -1;
        
        for (let i = 0; i < chatHistory.length; i++) {
            const message = chatHistory[i];
            
            // Skip current placeholder, greetings and errors
            if ((currentMessage && message.id === currentMessage.id) || 
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

        console.log("Formatted Routing Messages:", messages);
        return messages;
    } catch (error) {
        console.error("Error formatting routing messages:", error);
        return null;
    }
}

/**
 * Format messages for the technical agent
 */
export function formatTechnicalMessages(technicalPrompt, originalQuery, routingContext, chatHistory, currentMessage, identifiedTechnology) {
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
        for (let i = 0; i < chatHistory.length; i++) {
            const message = chatHistory[i];
            
            // Skip system messages, current placeholder, greetings and errors
            if (message.role === 'system' || 
                (currentMessage && message.id === currentMessage.id) || 
                message.isGreeting || 
                message.isError) {
                continue;
            }
            
            // First look for the routing message that identified the technology
            if (!foundTechStart && message.role === 'assistant' && 
                message.content.includes(`[TECH_IDENTIFIED: ${identifiedTechnology}]`)) {
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

        console.log("Formatted Technical Messages:", messages.map(m => `${m.role}: ${m.content.substring(0, 30)}...`));
        return messages;
    } catch (error) {
        console.error("Error formatting technical messages:", error);
        return null;
    }
}

/**
 * Parse the response from the routing agent
 */
export function parseRoutingResponse(responseText) {
    // Expecting format like "[TECH_IDENTIFIED: ExchangeOnline] Transferring you to the Exchange specialist..."
    // Or "[SCOPING_QUESTION] Could you please specify..."

    if (!responseText) {
        return {
            isTechIdentified: false,
            technologyName: null,
            cleanExplanation: "Error: Empty response received.",
            isScopingQuestion: false
        };
    }

    const techMatch = responseText.match(/^\[TECH_IDENTIFIED:\s*([^\]]+)\]\s*(.*)/s);
    if (techMatch) {
        const techName = techMatch[1].trim();
        const explanation = techMatch[2].trim() || `Identified technology: ${techName}. Preparing detailed information...`; // Fallback explanation
        return {
            isTechIdentified: true,
            technologyName: techName,
            cleanExplanation: explanation, // Text AFTER the tag
            explanation: explanation, // Keep for backward compatibility
            isScopingQuestion: false
        };
    }

    // Check for scoping question if prompt uses a specific format for it
    const scopeMatch = responseText.match(/^\[SCOPING_QUESTION\]\s*(.*)/s);
    if (scopeMatch) {
        return {
            isTechIdentified: false,
            technologyName: null,
            cleanExplanation: scopeMatch[1].trim(), // Text AFTER the tag
            explanation: scopeMatch[1].trim(), // Keep for backward compatibility
            isScopingQuestion: true
        };
    }

    // Default: Assume it's a simple response or scoping question without specific tag
    return {
        isTechIdentified: false,
        technologyName: null,
        cleanExplanation: responseText, // The whole text is the explanation/question
        explanation: responseText, // Keep for backward compatibility
        isScopingQuestion: false // Assume not a scoping question if tag is missing
    };
}

/**
 * Process a routing query and make a decision about the next action
 * This function orchestrates the entire routing decision process:
 * 1. Format messages for the routing agent
 * 2. Call the LLM API
 * 3. Parse the response
 * 4. Determine the next action based on the parsed response
 *
 * @param {string} routingPrompt - The prompt for the routing agent
 * @param {Array} chatHistory - The conversation history
 * @param {Object} currentMessage - The current message being processed
 * @param {string} originalUserQuery - The original user query
 * @param {string} apiKey - The API key for the LLM
 * @param {string} selectedModel - The selected model
 * @param {Object} settings - The settings for the API call
 * @param {AbortController} abortController - The abort controller for the API call
 * @returns {Object} An object with the next action to take:
 *   - status: 'success' or 'error'
 *   - action: 'handoff', 'ask', or 'error'
 *   - technology: The identified technology (if action is 'handoff')
 *   - explanation: The explanation or question from the agent
 *   - rawResponse: The raw response from the LLM
 */
export async function processRoutingQuery(
    routingPrompt, 
    chatHistory, 
    currentMessage, 
    originalUserQuery,
    apiKey,
    selectedModel,
    settings,
    abortController
) {
    try {
        // 1. Format messages for routing
        const messages = formatRoutingMessages(
            routingPrompt, 
            chatHistory, 
            currentMessage,
            originalUserQuery
        );
        
        if (!messages) {
            return {
                status: 'error',
                action: 'error',
                message: 'Failed to format messages for routing.',
                rawResponse: null
            };
        }

        // 2. Call the LLM API
        const rawResponse = await callLlmApi(
            messages, 
            apiKey, 
            selectedModel, 
            settings, 
            abortController
        );

        // 3. Parse the response
        const { isTechIdentified, technologyName, cleanExplanation } = parseRoutingResponse(rawResponse);

        // 4. Determine the next action based on the parsed response
        if (isTechIdentified && technologyName) {
            // Technology identified - handoff to technical agent
            return {
                status: 'success',
                action: 'handoff',
                technology: technologyName,
                explanation: cleanExplanation, // Use clean explanation for UI
                rawResponse: rawResponse  // Keep raw response for history
            };
        } else {
            // Scoping question or simple response - ask user for more info
            return {
                status: 'success',
                action: 'ask',
                explanation: cleanExplanation, // Use clean explanation for UI
                rawResponse: rawResponse  // Keep raw response for history
            };
        }
    } catch (error) {
        // Handle errors
        console.error("Error in processRoutingQuery:", error);
        return {
            status: 'error',
            action: 'error',
            message: error.message || "Unknown error in routing process",
            rawResponse: null
        };
    }
}

/**
 * Call LLM API
 */
export async function callLlmApi(messages, apiKey, selectedModel, settings, abortController) {
    if (!messages || !messages.length) {
        throw new Error("No messages to send to API");
    }
    
    console.log("API call - Full messages:", messages);
    
    // Get model-specific endpoint
    let endpoint, headers, body;
    
    // Use provided abort controller
    const signal = abortController.signal;
    
    // Configure model-specific settings
    if (selectedModel.startsWith('deepseek')) {
        endpoint = API_CONFIG.baseUrl;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        
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
            model: API_CONFIG.models[selectedModel]?.modelName || selectedModel,
            messages: messages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            top_p: settings.topP,
            stream: true,
            // Enable prefix completion mode if the last message is from assistant
            prefix_mode: needsPrefixMode
        });
        
        console.log("Using prefix mode:", needsPrefixMode);
    } else {
        throw new Error(`Unsupported model: ${selectedModel}`);
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
                                    // Use imported updateCurrentMessage function
                                    if (window.updateCurrentMessage) {
                                        window.updateCurrentMessage(fullText);
                                    }
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
 * Calculate token count for history
 */
export function calculateTokenCount(routingPrompt, chatHistory) {
    if (typeof tokenizer !== 'undefined' && typeof tokenizer.encode === 'function') {
        try {
            // Create a temporary messages array similar to what we'd send to API
            const messages = [];
            
            // Add system message (routing prompt) if available
            if (routingPrompt) {
                messages.push({ role: 'system', content: routingPrompt });
            }
            
            // Add chat history
            chatHistory.forEach(m => {
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
    if (routingPrompt) words += (routingPrompt.match(/\S+/g) || []).length;
    
    chatHistory.forEach(m => {
        if ((m.role === 'user' || m.role === 'assistant') && !m.isError) {
            words += (m.content.match(/\S+/g) || []).length;
        }
    });
    
    return Math.round(words * 1.3); // Rough approximation of tokens from words
} 