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

        // 2. Add the initiating user query for this technology topic.
        // This ensures the first non-system message is from the user.
        if (originalQuery) {
            messages.push({ role: 'user', content: originalQuery });
        } else {
            console.error("Original user query is missing for technical formatting!");
            return null; // Cannot proceed without the query
        }

        // 3. Add subsequent conversation history with this specific technical specialist.
        // This history starts *after* the routing agent's message that identified the technology.
        let techRouterMessageFound = false;
        let lastAddedRole = 'user'; // Set because we just added the originalQuery

        for (const message of chatHistory) {
            if (!techRouterMessageFound) {
                // Look for the routing message that triggered the handoff to this specialist
                if (message.role === 'assistant' && message.content && message.content.includes(`[TECH_IDENTIFIED: ${identifiedTechnology}]`)) {
                    techRouterMessageFound = true;
                }
                continue; // Skip all messages up to and including the router's handoff message
            }

            // Now processing messages *after* the router's handoff.
            // These should be alternating assistant (specialist) responses and user (follow-up) messages.

            // Skip system messages, current placeholder, and greetings/errors in this part of history
            if ((currentMessage && message.id === currentMessage.id) ||
                message.isGreeting ||
                message.isError ||
                message.role === 'system') {
                continue;
            }

            // Add the message if it's from user or assistant and alternates correctly
            if ((message.role === 'user' || message.role === 'assistant') && message.role !== lastAddedRole) {
                // Ensure we don't re-add the originalQuery if it somehow appears again here
                if (message.role === 'user' && message.content === originalQuery) {
                    continue; // Skip if this is the original query (already added)
                }
                messages.push({ role: message.role, content: message.content });
                lastAddedRole = message.role;
            } else if (message.role === lastAddedRole) {
                // This indicates an issue with chatHistory or the logic, log it.
                // DeepSeek API will reject successive messages of the same role.
                console.warn(`FormatTechnicalMessages: Skipping message for API due to same role as last. Role: ${message.role}, Content: "${message.content.substring(0, 50)}..."`);
            }
        }

        console.log("Formatted Technical Messages for API:", messages.map(m => ({role: m.role, content: m.content.substring(0,70) + (m.content.length > 70 ? "..." : "")})));
        return messages;
    } catch (error) {
        console.error("Error formatting technical messages:", error);
        return null;
    }
}

/**
 * Parse the response from the routing agent.
 * Refined for more robust parsing, especially around the tag and explanation.
 */
export function parseRoutingResponse(responseText) {
    if (typeof responseText !== 'string' || !responseText.trim()) {
        // console.log("parseRoutingResponse: Empty or non-string input");
        return {
            isTechIdentified: false,
            technologyName: null,
            cleanExplanation: responseText || "Error: Empty response received.", // Return original or error
            isScopingQuestion: false,
            parsingAttemptedTag: false
        };
    }

    // Work with a version of the responseText that has leading/trailing whitespace removed.
    const trimmedResponse = responseText.trim();

    const techTagPrefix = "[TECH_IDENTIFIED:";
    const techTagSuffix = "]"; // Expected suffix for the technology name part of the tag
    
    const scopeTagExact = "[SCOPING_QUESTION]"; // The exact tag for scoping questions

    if (trimmedResponse.startsWith(techTagPrefix)) {
        // console.log("parseRoutingResponse: Tech tag prefix detected");
        const prefixEndIndex = techTagPrefix.length;
        const suffixStartIndexInTrimmed = trimmedResponse.indexOf(techTagSuffix, prefixEndIndex);

        if (suffixStartIndexInTrimmed > prefixEndIndex) { // Found ']' after "[TECH_IDENTIFIED:"
            const techNameCandidate = trimmedResponse.substring(prefixEndIndex, suffixStartIndexInTrimmed).trim();
            // console.log(`parseRoutingResponse: techNameCandidate: '${techNameCandidate}'`);

            if (techNameCandidate) { // Technology name extracted and is not empty
                const explanation = trimmedResponse.substring(suffixStartIndexInTrimmed + techTagSuffix.length).trim();
                // console.log(`parseRoutingResponse: Tech identified. Name: '${techNameCandidate}', Explanation: '${explanation.substring(0,50)}...'`);
                return {
                    isTechIdentified: true,
                    technologyName: techNameCandidate,
                    cleanExplanation: explanation || `Identified technology: ${techNameCandidate}. Preparing detailed information...`,
                    isScopingQuestion: false,
                    parsingAttemptedTag: true
                };
            } else {
                // console.log("parseRoutingResponse: techNameCandidate was empty after trim. Malformed tag.");
            }
        } else {
            // console.log("parseRoutingResponse: Tech tag suffix ']' not found correctly after prefix. Malformed tag.");
        }
        // If tag is malformed, fall through and return original full responseText
        return {
            isTechIdentified: false,
            technologyName: null,
            cleanExplanation: responseText, // Use original, untrimmed responseText if parse fails here
            isScopingQuestion: false,
            parsingAttemptedTag: true 
        };

    } else if (trimmedResponse.startsWith(scopeTagExact)) {
        // console.log("parseRoutingResponse: Scope tag detected");
        const explanation = trimmedResponse.substring(scopeTagExact.length).trim();
        // console.log(`parseRoutingResponse: Scoping question. Explanation: '${explanation.substring(0,50)}...'`);
        return {
            isTechIdentified: false,
            technologyName: null,
            cleanExplanation: explanation || "Please provide more details.",
            isScopingQuestion: true,
            parsingAttemptedTag: true
        };
    }

    // console.log("parseRoutingResponse: No recognized tag prefix.");
    // Default: No recognized tag.
    return {
        isTechIdentified: false,
        technologyName: null,
        cleanExplanation: responseText, // Use original, untrimmed responseText
        isScopingQuestion: false,
        parsingAttemptedTag: false
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
 * Validates and corrects message sequence for DeepSeek API requirements
 * 1. Ensures first non-system message is from 'user'
 * 2. Ensures strictly alternating user/assistant messages
 */
function validateDeepSeekMessages(messages) {
    if (!messages || messages.length === 0) {
        console.error("Empty messages array provided to validateDeepSeekMessages");
        return messages;
    }

    console.log("Validating message sequence for DeepSeek API...");
    
    // Make a deep copy to avoid modifying the original
    const result = JSON.parse(JSON.stringify(messages));
    let hasChanges = false;
    
    // Find the index of the first non-system message
    let firstNonSystemIndex = result.findIndex(msg => msg.role !== 'system');
    
    // If no non-system messages, nothing to fix
    if (firstNonSystemIndex === -1) {
        console.warn("No non-system messages found in the sequence");
        return result;
    }
    
    // Fix 1: Ensure first non-system message is from user
    if (result[firstNonSystemIndex].role !== 'user') {
        console.warn("First non-system message must be from user, fixing...");
        // If it's an assistant message, we need to insert a user message before it
        result.splice(firstNonSystemIndex, 0, {
            role: 'user',
            content: 'Please assist me with this context.'
        });
        hasChanges = true;
        firstNonSystemIndex++; // Adjust index after insertion
    }
    
    // Fix 2: Ensure messages alternate between user and assistant
    for (let i = firstNonSystemIndex + 1; i < result.length; i++) {
        const prevRole = result[i-1].role;
        const currentRole = result[i].role;
        
        // Skip system messages
        if (currentRole === 'system') {
            continue;
        }
        
        // Check if current message has same role as previous non-system message
        if (currentRole === prevRole) {
            console.warn(`Found consecutive ${currentRole} messages at positions ${i-1} and ${i}, fixing...`);
            
            // Insert an appropriate message to fix alternation
            const fixRole = currentRole === 'user' ? 'assistant' : 'user';
            const fixContent = fixRole === 'user' 
                ? 'Please continue.' 
                : 'I understand. Let me assist with that.';
            
            result.splice(i, 0, {
                role: fixRole,
                content: fixContent
            });
            
            hasChanges = true;
            i++; // Skip the inserted message in next iteration
        }
    }
    
    if (hasChanges) {
        console.log("Fixed DeepSeek message sequence:");
        result.forEach((msg, idx) => {
            console.log(`Message[${idx}]: role=${msg.role}, content=${msg.content.substring(0, 30)}...`);
        });
    } else {
        console.log("Message sequence already valid for DeepSeek API");
    }
    
    return result;
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
        
        // Add message validation and auto-correction for DeepSeek API
        // This will automatically fix common issues with message sequence
        const validatedMessages = validateDeepSeekMessages(messages);
        
        // Check if the last message is from assistant - in that case use prefix mode
        const needsPrefixMode = validatedMessages.length > 0 && validatedMessages[validatedMessages.length - 1].role === 'assistant';
        
        // Verify that the first non-system message is from a user
        let foundNonSystemMessage = false;
        for (let i = 0; i < validatedMessages.length; i++) {
            if (validatedMessages[i].role !== 'system') {
                foundNonSystemMessage = true;
                if (validatedMessages[i].role !== 'user') {
                    console.error("Error: First non-system message must be from user");
                    throw new Error("First non-system message must be from user. This is required by the DeepSeek API.");
                }
                break;
            }
        }
        
        body = JSON.stringify({
            model: API_CONFIG.models[selectedModel]?.modelName || selectedModel,
            messages: validatedMessages,
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