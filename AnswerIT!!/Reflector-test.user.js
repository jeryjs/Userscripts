// ==UserScript==
// @name         Reflector WebRTC Host
// @namespace    https://github.com/jeryjs
// @version      0.3
// @description  WebRTC host for real-time page broadcasting
// @author       JeryJs
// @match        https://myanimelist.net/*
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

const reflector = {
    key: 'test-broadcast-123',
    endpoint: 'http://172.20.230.22:4242/reflector',
    enabled: false
};

const reflectorHost = {
    /**@type {RTCPeerConnection} */
    pc: null,
    channel: null,
    connected: false,
    lastOfferSdp: null,  // Track offer SDP to detect changes
    sessionId: 0,        // Track session changes
    
    async init() {
        this.sessionId++;
        this.log(`Starting session ${this.sessionId}`);
        
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });        
        this.channel = this.pc.createDataChannel('broadcast', { ordered: false });
        this.channel.onopen = () => {
            this.log('Data channel opened');
            this.connected = true;
            this.startBroadcast();
        };
        this.channel.onclose = () => {
            this.connected = false;
            this.log('Channel closed, attempting ICE restart...');
            this.attemptReconnection();
        };
        
        this.pc.onicecandidate = e => e.candidate && this.sendSignal({
            type: 'ice', candidate: e.candidate
        });
        
        // Add connection state monitoring with smarter reconnection
        this.pc.onconnectionstatechange = () => {
            this.log(`Connection state: ${this.pc.connectionState}`);
            if (this.pc.connectionState === 'failed') {
                this.log('Connection failed, attempting ICE restart...');
                this.attemptReconnection();
            } else if (this.pc.connectionState === 'connected') {
                this.log('Connection restored!');
            }
        };
        this.pc.oniceconnectionstatechange = () => {
            this.log(`ICE connection state: ${this.pc.iceConnectionState}`);
            if (this.pc.iceConnectionState === 'disconnected') {
                this.log('ICE disconnected, will attempt reconnection...');
            } else if (this.pc.iceConnectionState === 'failed') {
                this.log('ICE failed, attempting restart...');
                this.attemptReconnection();
            }
        };
        
        await this.createOffer();
        this.pollForAnswer();
    },
    
    async createOffer() {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // Only send if offer SDP changed (new session or network change)
        if (offer.sdp !== this.lastOfferSdp) {
            this.lastOfferSdp = offer.sdp;
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
        if (this.connected) return;
        
        const response = await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`);
        const data = await response.json();
        
        if (data?.answer?.type === 'answer') {
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
            setTimeout(() => this.pollForAnswer(), 5000);  // Slower polling
        }
    },
    
    async attemptReconnection() {
        try {
            this.log('Attempting ICE restart (fast reconnection)...');
            
            // ICE restart - much faster than full session recreation
            const offer = await this.pc.createOffer({ iceRestart: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal({ type: 'offer', sdp: offer.sdp });
            this.lastOfferSdp = offer.sdp;
            
            this.log('ICE restart offer sent');
            this.pollForAnswer();
            
        } catch (error) {
            this.log(`ICE restart failed: ${error.message}, doing full restart...`);
            // Fallback to full session recreation after 2 seconds
            setTimeout(() => this.init(), 2000);
        }
    },
    
    log(msg) {
        console.log(`[HOST] ${msg}`);
    },
    
    startBroadcast() {
        setInterval(() => {
            if (this.channel?.readyState === 'open') {
                // Clean HTML by removing scripts and dangerous elements
                const cleanBody = document.body.cloneNode(true);
                cleanBody.querySelectorAll('script, iframe, object, embed').forEach(el => el.remove());
                
                this.channel.send(JSON.stringify({
                    url: location.href,
                    title: document.title,
                    body: cleanBody.innerHTML,
                    timestamp: Date.now()
                }));
            }
        }, 200);
    }
};

// if (location.search.includes('host'))
    reflectorHost.init();

unsafeWindow.reflectorHost = reflectorHost;