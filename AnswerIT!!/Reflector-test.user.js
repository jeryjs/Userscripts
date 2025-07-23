// ==UserScript==
// @name         Reflector WebRTC Host
// @namespace    https://github.com/jeryjs
// @version      0.3
// @description  WebRTC host for real-time page broadcasting
// @author       JeryJs
// @match        https://myanimelist.net/*
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

/** @type {{key: string, endpoint: string, enabled: boolean, lastConnectedTime?: number, lastOfferSdp?: string, sessionId?: number}} */
const reflector = GM_getValue('reflector', {
    key: 'test-broadcast-123',
    endpoint: 'http://172.20.230.22:4242/reflector',
    enabled: true,
    lastConnectedTime: 0,
    lastOfferSdp: null,
    sessionId: 0
});

function saveReflectorState() {
    try {
        GM_setValue('reflector', {
            ...reflector,
            lastConnectedTime: reflectorHost.lastConnectedTime,
            lastOfferSdp: reflectorHost.lastOfferSdp,
            sessionId: reflectorHost.sessionId
        });
        // Verify the save worked
        const saved = GM_getValue('reflector');
        if (saved && saved.lastConnectedTime !== reflectorHost.lastConnectedTime) {
            throw new Error('Save verification failed');
        }
    } catch (error) {
        console.log(`[HOST] Storage save failed: ${error.message}, continuing without persistence`);
        // Continue without persistence rather than crash
    }
}

const reflectorHost = {
    /**@type {RTCPeerConnection} */
    pc: null,
    channel: null,
    lastConnectedTime: reflector.lastConnectedTime || 0,  // Load from storage
    lastOfferSdp: reflector.lastOfferSdp || null,         // Load from storage
    sessionId: reflector.sessionId || 0,                  // Load from storage
    isRunning: true,       // Global control flag
    reconnectAttempts: 0,  // Track consecutive failures
    broadcastInterval: null,  // Track broadcast interval
    
    get isRecentlyConnected() {
        // Validate timestamp to prevent corrupted data issues
        const now = Date.now();
        const lastConnection = this.lastConnectedTime;
        
        // Check for invalid timestamps (future dates, negative values, etc.)
        if (!lastConnection || lastConnection <= 0 || lastConnection > now) {
            this.log(`Invalid timestamp detected: ${lastConnection}, resetting...`);
            this.lastConnectedTime = 0;
            return false;
        }
        
        const timeDiff = now - lastConnection;
        return timeDiff > 0 && timeDiff < 45000; // 45 seconds
    },
    
    async init() {
        if (!this.isRunning) return; // Safety check
        
        const timeSinceLastConnection = Date.now() - this.lastConnectedTime;
        
        // Prevent runaway session creation
        if (this.reconnectAttempts > 5) {
            this.log(`Too many reconnect attempts (${this.reconnectAttempts}), pausing for 30s...`);
            setTimeout(() => {
                this.reconnectAttempts = 0;
                this.init();
            }, 30000);
            return;
        }
        
        this.log(`Init called. Session: ${this.sessionId}, Last connected: ${timeSinceLastConnection}ms ago, Recent: ${this.isRecentlyConnected}, Attempts: ${this.reconnectAttempts}`);
        
        // On page navigation, this.pc will be null but we might have recent connection data
        if (this.isRecentlyConnected) {
            if (this.pc) {
                // Existing RTCPeerConnection, try ICE restart
                this.log('Recent connection detected, attempting fast reconnection...');
                return this.attemptReconnection();
            } else {
                // Page navigation case - we had recent connection but need new RTCPeerConnection
                this.log('Recent connection detected after page navigation, reusing session ID...');
                // Don't increment session ID, just recreate connection with existing session
            }
        } else {
            // Truly new session - either first time or connection was too old
            this.sessionId++;
            this.log('Creating completely new session');
        }
        
        this.log(`Starting session ${this.sessionId} (${this.isRecentlyConnected ? 'continued' : 'new'})`);
        
        if (this.pc) {
            this.pc.close(); // Clean up old connection if any
        }
        
        try {
            await this.createNewSession();
        } catch (error) {
            this.log(`Session creation failed: ${error.message}, retrying...`);
            this.scheduleRetry();
        }
    },
    
    async createNewSession() {
        
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });        
        this.channel = this.pc.createDataChannel('broadcast', { 
            ordered: false,
            maxRetransmits: 0  // Don't retransmit, just drop old data
        });
        this.channel.onopen = () => {
            this.log('Data channel opened');
            this.lastConnectedTime = Date.now(); // Update connection timestamp
            this.reconnectAttempts = 0; // Reset failure count
            saveReflectorState(); // Persist state
            this.startBroadcast();
        };
        this.channel.onclose = () => {
            this.log('Channel closed, will attempt reconnection...');
            this.stopBroadcast(); // Stop broadcasting when channel closes
            this.scheduleRetry();
        };
        this.channel.onerror = (error) => {
            this.log(`Data channel error: ${error.type || error} - ${error.error?.message || 'no details'}`);
            console.error('WebRTC Data Channel Error Details:', error);
            this.stopBroadcast();
            
            // Try to restart connection after data channel error
            setTimeout(() => {
                if (this.connectionState !== 'connected') {
                    this.log('Attempting reconnect after data channel error...');
                    this.reconnect();
                }
            }, 2000);
        };
        
        this.pc.onicecandidate = e => e.candidate && this.sendSignal({
            type: 'ice', candidate: e.candidate
        });
        
        // Add connection state monitoring with immortal reconnection
        this.pc.onconnectionstatechange = () => {
            this.log(`Connection state: ${this.pc.connectionState}`);
            if (this.pc.connectionState === 'connected') {
                this.lastConnectedTime = Date.now(); // Update on successful connection
                this.reconnectAttempts = 0; // Reset failure count
                saveReflectorState(); // Persist state
                this.log('Connection established!');
            } else if (this.pc.connectionState === 'failed') {
                this.log('Connection failed, scheduling retry...');
                this.scheduleRetry();
            }
        };
        this.pc.oniceconnectionstatechange = () => {
            this.log(`ICE connection state: ${this.pc.iceConnectionState}`);
            if (this.pc.iceConnectionState === 'connected') {
                this.lastConnectedTime = Date.now(); // Update on ICE success too
                this.reconnectAttempts = 0; // Reset failure count
                saveReflectorState(); // Persist state
            } else if (this.pc.iceConnectionState === 'failed') {
                this.log('ICE failed, scheduling retry...');
                this.scheduleRetry();
            }
        };
        
        await this.createOffer();
        this.pollForAnswer();
    },
    
    scheduleRetry() {
        if (!this.isRunning) return;
        
        this.reconnectAttempts++;
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (max)
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.log(`Retry #${this.reconnectAttempts} in ${delay/1000}s...`);
        setTimeout(() => {
            if (this.isRunning) {
                this.init();
            }
        }, delay);
    },
    
    async createOffer() {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // Only send if offer SDP changed (new session or network change)
        if (offer.sdp !== this.lastOfferSdp) {
            this.lastOfferSdp = offer.sdp;
            saveReflectorState(); // Persist new offer
            await this.sendSignal({ type: 'offer', sdp: offer.sdp });
            this.log('New offer sent');
        }
    },
    
    async sendSignal(data) {
        await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    
    async pollForAnswer() {
        if (!this.isRunning) return;
        
        if (this.channel?.readyState === 'open') return; // Check channel state instead
        
        try {
            const response = await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`);
            const data = await response.json();
            
            if (data?.answer?.type === 'answer') {
                // Check if we're in the right state to receive an answer
                if (this.pc.signalingState === 'have-local-offer') {
                    await this.pc.setRemoteDescription(data.answer);
                    this.log('Answer received, processing ICE candidates...');
                    
                    // Process any pending ICE candidates
                    if (data.ice && data.ice.length > 0) {
                        for (const iceData of data.ice) {
                            if (iceData.candidate) {
                                await this.pc.addIceCandidate(iceData.candidate);
                            }
                        }
                    }
                } else {
                    this.log(`Wrong signaling state for answer: ${this.pc.signalingState}, ignoring...`);
                    // Clear stale answer from server
                    await this.sendSignal({ type: 'clear_answer' });
                    setTimeout(() => this.pollForAnswer(), 2000);
                }
            } else {
                setTimeout(() => this.pollForAnswer(), 5000);  // Continue polling
            }
        } catch (error) {
            this.log(`Polling error: ${error.message}, retrying...`);
            setTimeout(() => this.pollForAnswer(), 10000); // Longer delay on error
        }
    },
    
    async attemptReconnection() {
        const timeSinceLastConnection = Date.now() - this.lastConnectedTime;
        this.log(`Attempting reconnection (${Math.round(timeSinceLastConnection/1000)}s since last connection)`);
        
        if (timeSinceLastConnection > 60000) { // 60 seconds - too old for reliable reconnection
            this.log('Connection too old, starting fresh session...');
            this.lastConnectedTime = 0; // Reset timestamp
            saveReflectorState(); // Persist reset
            return this.init(); // Start fresh
        }
        
        try {
            this.log('Attempting ICE restart (fast reconnection)...');
            
            // ICE restart - much faster than full session recreation
            const offer = await this.pc.createOffer({ iceRestart: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal({ type: 'offer', sdp: offer.sdp });
            this.lastOfferSdp = offer.sdp;
            saveReflectorState(); // Persist ICE restart offer
            
            this.log('ICE restart offer sent');
            this.pollForAnswer();
            
            // Give ICE restart some time, then fallback if needed
            setTimeout(() => {
                if (this.channel?.readyState !== 'open') {
                    this.log('ICE restart failed, starting fresh session...');
                    this.lastConnectedTime = 0; // Reset timestamp to force new session
                    saveReflectorState();
                    this.init();
                }
            }, 10000); // 10 second timeout for ICE restart
            
        } catch (error) {
            this.log(`ICE restart failed: ${error.message}, starting fresh session...`);
            this.lastConnectedTime = 0; // Reset timestamp to force new session
            saveReflectorState();
            this.init();
        }
    },
    
    log(msg) {
        console.log(`[HOST] ${msg}`);
    },
    
    startBroadcast() {
        // Clear any existing broadcast interval
        this.stopBroadcast();
        
        this.broadcastInterval = setInterval(() => {
            if (this.channel?.readyState === 'open') {
                try {
                    // Clean HTML by removing scripts and dangerous elements
                    const cleanBody = document.body.cloneNode(true);
                    
                    // More aggressive cleaning for large pages
                    cleanBody.querySelectorAll(`
                        script, iframe, object, embed, noscript,
                        style, link[rel="stylesheet"],
                        .ad, .advertisement, .ads, [class*="ad-"],
                        .sidebar, .footer, .header, .navigation,
                        img[src*="banner"], img[src*="ad"],
                        [style*="display: none"], [style*="visibility: hidden"]
                    `).forEach(el => {
                        try {
                            el.remove();
                        } catch (e) {
                            // Ignore removal errors
                        }
                    });
                    
                    // Remove large data attributes and inline styles
                    cleanBody.querySelectorAll('*').forEach(el => {
                        try {
                            // Remove data attributes
                            Array.from(el.attributes).forEach(attr => {
                                try {
                                    if (attr.name.startsWith('data-') || attr.name === 'style') {
                                        el.removeAttribute(attr.name);
                                    }
                                } catch (e) {
                                    // Ignore attribute removal errors
                                }
                            });
                            
                            // Keep only essential attributes
                            const keepAttrs = ['class', 'id', 'href', 'src', 'alt', 'title'];
                            Array.from(el.attributes).forEach(attr => {
                                try {
                                    if (!keepAttrs.includes(attr.name)) {
                                        el.removeAttribute(attr.name);
                                    }
                                } catch (e) {
                                    // Ignore attribute removal errors
                                }
                            });
                        } catch (e) {
                            // Ignore element processing errors
                        }
                    });
                    
                    let htmlContent = cleanBody.innerHTML;
                    
                    // Further compress if still too large
                    if (htmlContent.length > 200000) { // 200KB
                        try {
                            // Extract just the main content area
                            const mainContent = cleanBody.querySelector('main, #content, .content, .main, article') 
                                || cleanBody.querySelector('.container, .wrapper, #main');
                            
                            if (mainContent) {
                                htmlContent = mainContent.innerHTML;
                                this.log(`Using main content area (${htmlContent.length} bytes)`);
                            }
                        } catch (e) {
                            this.log(`Main content extraction failed: ${e.message}`);
                        }
                    }
                    
                    // Final size check and compression
                    if (htmlContent.length > 150000) { // 150KB
                        try {
                            // Truncate and add indication
                            htmlContent = htmlContent.substring(0, 150000) + 
                                '<div style="padding:20px;background:#222;color:#fff;text-align:center;">📄 Content truncated due to size limits</div>';
                            this.log(`Content truncated to 150KB`);
                        } catch (e) {
                            this.log(`Content truncation failed: ${e.message}`);
                            // Fallback to simple truncation
                            htmlContent = htmlContent.substring(0, 100000);
                        }
                    }
                    
                    const data = JSON.stringify({
                        url: location.href,
                        title: document.title || 'Unknown Page',
                        body: htmlContent || '<div>Content processing failed</div>',
                        timestamp: Date.now()
                    });
                    
                    // Validate JSON and size
                    if (!data || data === '{}' || data.length < 10) {
                        this.log('Invalid data structure, skipping frame...');
                        return;
                    }
                    
                    // Final check
                    if (data.length > 262144) { // 256KB limit
                        this.log(`Data still too large (${data.length} bytes), using fallback...`);
                        
                        // Fallback: send just basic page info
                        const fallbackData = JSON.stringify({
                            url: location.href,
                            title: document.title || 'Unknown Page',
                            body: '<div style="padding:40px;text-align:center;background:#f5f5f5;color:#333;"><h2>Page Too Large</h2><p>This page contains too much content to display in real-time.</p><p>Current URL: ' + location.href + '</p></div>',
                            timestamp: Date.now()
                        });
                        
                        this.channel.send(fallbackData);
                        return;
                    }
                    
                    this.channel.send(data);
                } catch (error) {
                    this.log(`Broadcast error: ${error.message}`);
                    
                    // Try sending a simple error message instead of crashing
                    try {
                        const errorData = JSON.stringify({
                            url: location.href,
                            title: 'Broadcast Error',
                            body: '<div style="padding:40px;text-align:center;background:#ffe6e6;color:#d63031;"><h2>⚠️ Broadcast Error</h2><p>' + error.message + '</p></div>',
                            timestamp: Date.now()
                        });
                        this.channel.send(errorData);
                    } catch (e) {
                        // If even error message fails, stop broadcasting
                        this.log('Error message send failed, stopping broadcast');
                        this.stopBroadcast();
                    }
                    
                    // If send fails consistently, stop broadcasting
                    if (error.name === 'OperationError' || this.channel?.readyState !== 'open') {
                        this.log('Channel appears broken, stopping broadcast');
                        this.stopBroadcast();
                    }
                }
            } else {
                // Channel not open, stop broadcasting
                this.stopBroadcast();
            }
        }, 200);
        
        this.log('Started broadcasting');
    },
    
    stopBroadcast() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
            this.broadcastInterval = null;
            this.log('Stopped broadcasting');
        }
    }
};

if (reflector.enabled) {
    reflectorHost.init();
}

unsafeWindow.reflectorHost = reflectorHost;