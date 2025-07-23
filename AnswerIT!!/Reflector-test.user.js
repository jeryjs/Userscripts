// ==UserScript==
// @name         Reflector WebRTC Host
// @namespace    https://github.com/jeryjs
// @version      0.4
// @description  WebRTC host for real-time page broadcasting
// @author       JeryJs
// @match        https://myanimelist.net/*
// @match        https://leetcode.com/*
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

const reflector = {
    key: 'test-broadcast-123',
    endpoint: 'http://172.20.230.22:4242/reflector',
    hotkey: {key: 'r', ctrl: false, shift: false, alt: true }   // mac: Alt -> Option
};

const host = {
    /** @type {RTCPeerConnection} */
    pc: null,
    /** @type {RTCDataChannel} */
    channel: null,
    sessionId: Date.now(),
    broadcastInterval: null,
    lastBufferCheck: 0,
    reconnectTimeout: null,
    pollTimeout: null,
    isReconnecting: false,
    
    cleanup() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.stopBroadcast();
        this.isReconnecting = false;
    },
    
    async init() {
        // Prevent multiple concurrent reconnection attempts
        if (this.isReconnecting) {
            console.log('[HOST] Already reconnecting, skipping...');
            return;
        }
        
        this.cleanup(); // Stop all previous operations
        this.isReconnecting = true;
        
        console.log(`[HOST] Starting session ${this.sessionId}`);
        
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });
        this.channel = this.pc.createDataChannel('broadcast');
        
        this.channel.onopen = () => {
            console.log('[HOST] Connected, starting broadcast');
            this.isReconnecting = false; // Reset reconnection flag
            this.startBroadcast();
        };
        
        this.channel.onclose = () => {
            console.log('[HOST] Channel closed, scheduling reconnect...');
            this.stopBroadcast();
            if (!this.isReconnecting) {
                this.reconnectTimeout = setTimeout(() => this.init(), 3000); // 3 second delay
            }
        };

        this.channel.onerror = e => {
            console.log(`[HOST] Channel error, scheduling reconnect...`);
            this.stopBroadcast();
            if (!this.isReconnecting) {
                this.reconnectTimeout = setTimeout(() => this.init(), 2000); // 2 second delay
            }
        };
        
        // Monitor connection state
        this.pc.onconnectionstatechange = () => {
            console.log(`[HOST] Connection state: ${this.pc.connectionState}`);
            if (this.pc.connectionState === 'connected') {
                this.isReconnecting = false; // Reset reconnection flag
            } else if ((this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') && !this.isReconnecting) {
                console.log('[HOST] Connection lost, scheduling reconnect...');
                this.stopBroadcast();
                this.reconnectTimeout = setTimeout(() => this.init(), 5000); // 5 second delay for failed connections
            }
        };
        
        this.pc.onicecandidate = e => e.candidate && this.sendSignal({
            type: 'ice', candidate: e.candidate
        });
        
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.sendSignal({ type: 'offer', sdp: offer.sdp });
        
        this.pollForAnswer();
    },
    
    stopBroadcast() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
            this.broadcastInterval = null;
            console.log('[HOST] Stopped broadcasting');
        }
    },
    
    startBroadcast() {
        this.stopBroadcast(); // Ensure no duplicate intervals
        
        this.broadcastInterval = setInterval(() => {
            if (this.channel?.readyState === 'open') {
                // Monitor buffer health - if it's consistently full, client likely disconnected
                const bufferAmount = this.channel.bufferedAmount;
                
                if (bufferAmount > 256 * 1024) { // 256KB threshold
                    console.log(`[HOST] Buffer full (${bufferAmount} bytes), checking connection health...`);
                    
                    // If buffer has been full for too long, assume client disconnected
                    if (this.lastBufferCheck === 0) {
                        this.lastBufferCheck = Date.now();
                    } else if (Date.now() - this.lastBufferCheck > 10000) { // 10 seconds
                        console.log('[HOST] Buffer full for too long, client likely disconnected. Restarting...');
                        this.stopBroadcast();
                        if (!this.isReconnecting) {
                            this.reconnectTimeout = setTimeout(() => this.init(), 3000);
                        }
                        return;
                    }
                    return; // Skip this frame
                } else {
                    this.lastBufferCheck = 0; // Reset buffer check timer
                }
                
                try {
                    const body = document.body.cloneNode(true);
                    body.querySelectorAll(`
                        script, iframe, object, embed, noscript,
                        style, link[rel="stylesheet"],
                        .ad, .advertisement, .ads, [class*="ad-"],
                        .sidebar, .footer, .header, .navigation,
                        img[src*="banner"], img[src*="ad"],
                        [style*="display: none"], [style*="visibility: hidden"]
                    `).forEach(el => el.remove());
                    
                    const fullMessage = JSON.stringify({
                        url: location.href,
                        title: document.title,
                        body: body.innerHTML,
                        timestamp: Date.now()
                    });
                    
                    // Send in chunks if too large
                    const maxChunk = 256000; // 256KB chunks (much larger)
                    if (fullMessage.length > maxChunk) {
                        const id = Date.now();
                        const chunks = Math.ceil(fullMessage.length / maxChunk);
                        
                        for (let i = 0; i < chunks; i++) {
                            const chunk = fullMessage.slice(i * maxChunk, (i + 1) * maxChunk);
                            this.channel.send(JSON.stringify({
                                type: 'chunk',
                                id: id,
                                part: i + 1,
                                total: chunks,
                                data: chunk
                            }));
                        }
                        console.log(`[HOST] Sent ${chunks} chunks`);
                    } else {
                        this.channel.send(fullMessage);
                    }
                } catch (e) {
                    console.log('[HOST] Broadcast error:', e.message);
                    if (e.message.includes('send queue is full')) {
                        console.log('[HOST] Send queue full - will restart connection');
                        this.stopBroadcast();
                        if (!this.isReconnecting) {
                            this.reconnectTimeout = setTimeout(() => this.init(), 3000);
                        }
                    }
                }
            } else {
                console.log(`[HOST] Channel not open (${this.channel?.readyState}), stopping broadcast`);
                this.stopBroadcast();
            }
        }, 500);
    },
    
    async sendSignal(data) {
        await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    
    async pollForAnswer() {
        if (this.pollTimeout) clearTimeout(this.pollTimeout); // Clear any existing timeout
        
        try {
            const response = await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`);
            const data = await response.json();
            
            if (data?.answer?.type === 'answer' && this.pc.signalingState === 'have-local-offer') {
                await this.pc.setRemoteDescription(data.answer);
                this.isReconnecting = false; // Reset reconnection flag on successful answer
                if (data.ice) {
                    for (const ice of data.ice) {
                        await this.pc.addIceCandidate(ice.candidate);
                    }
                }
            } else {
                this.pollTimeout = setTimeout(() => this.pollForAnswer(), 2000); // Slower polling
            }
        } catch (error) {
            this.pollTimeout = setTimeout(() => this.pollForAnswer(), 5000); // Much slower on error
        }
    }
};

host.init();