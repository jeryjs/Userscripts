// ==UserScript==
// @name         Reflector WebRTC Host
// @namespace    https://github.com/jeryjs
// @version      0.6
// @description  WebRTC host for real-time page broadcasting
// @author       JeryJs
// @match        https://myanimelist.net/*
// @match        https://leetcode.com/*
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

const reflector = {
    key: 'test-broadcast-123',
    endpoint: 'http://192.168.5.146:4242/reflector',
    hotkey: {key: 'r', ctrl: false, shift: false, alt: true }   // mac: Alt -> Option
};

const host = {
    /** @type {RTCPeerConnection} */
    pc: null,
    /** @type {RTCDataChannel} */
    channel: null,
    interval: null,
    setStatus(text) {
        const statuses = { '* connecting': '#fa0', '● connected': '#0f0', '○ disconnected': '#fa0', '✕ error': '#f00', '⚠ warning': '#ff0', '↻ restarting': '#0af' };
        text = Object.keys(statuses).find(t => t.includes(text)) || text;
        if(!text.includes('connecting')) console.debug('Reflector Host', 'Status:', text);
        let statusElm = document.querySelector('div[title^="AnswerIT Reflector Status:"]');
        if (!statusElm) {
            statusElm = document.createElement('div');
            statusElm.style.cssText = `position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.1);color:${statuses[text]} ;padding:4px 8px;border-radius:12px;font:10px monospace;z-index:10010;opacity:0.7;pointer-events:auto;transition:width 0.2s;overflow:hidden;white-space:nowrap;width:10px;`;
            statusElm.onmouseenter = () => { statusElm.style.width = '80px'; statusElm.textContent = text; };
            statusElm.onmouseleave = () => { statusElm.style.width = '10px'; statusElm.textContent = text[0]; };
            document.body.appendChild(statusElm);
        }
        statusElm.textContent = text[0];
        statusElm.title = "AnswerIT Reflector Status: " + text;
        statusElm.style.color = statuses[text] || '#000';
        statusElm.style.opacity = '0.5';
        setTimeout(() => statusElm && (statusElm.style.opacity = '0.2'), 3000);
    },
    
    async startBroadcast() {
        this.setStatus('connecting');
        
        // Cleanup
        if (this.interval) clearInterval(this.interval);
        if (this.pc) this.pc.close();
        
        try {
            // Setup WebRTC
            this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });
            this.channel = this.pc.createDataChannel('broadcast');
            
            this.channel.onopen = () => {
                this.setStatus('connected');
                this.broadcast();
            };
            
            this.channel.onclose = () => {
                this.setStatus('disconnected');
                setTimeout(() => this.startBroadcast(), 3000);
            };
            
            this.pc.onicecandidate = e => e.candidate && this.sendSignal({
                type: 'ice', candidate: e.candidate
            });
            
            // Create and send offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.sendSignal({ type: 'offer', sdp: offer.sdp });
            console.log('🛜', 'New offer sent:');
            
            // Poll for answer
            this.pollAnswer();
            
        } catch (e) {
            this.setStatus('✕');
            setTimeout(() => this.startBroadcast(), 5000);
        }
    },
    
    async pollAnswer() {
        try {
            this.setStatus('connecting', 'polling for answer...');
            const data = await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`).then(r=> r.json());            
            if (data?.answer?.type === 'answer') {
                await this.pc.setRemoteDescription(data.answer);
                if (data.ice) for (const ice of data.ice) await this.pc.addIceCandidate(ice.candidate);
                return; // Stop polling once answer is found
            } else setTimeout(() => this.pollAnswer(), 2000);
        } catch (e) { 
            setTimeout(() => this.pollAnswer(), 5000);
        }
    },
    
    broadcast() {
        this.interval = setInterval(() => {
            if (this.channel?.readyState === 'open') {
                try {
                    const body = document.body.cloneNode(true);
                    body.querySelectorAll('script, style, .ad, [class*="ad"]').forEach(el => el.remove());
                    
                    this.channel.send(JSON.stringify({
                        url: location.href,
                        title: document.title,
                        body: body.innerHTML.slice(0, 64000), // Simple truncation
                        timestamp: Date.now()
                    }));
                } catch (e) {
                    if (e.message.includes('queue')) {
                        this.setStatus('warning');
                        setTimeout(() => this.startBroadcast(), 2000);
                    }
                }
            }
        }, 1000);
    },
    
    async sendSignal(data) {
        await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
};

// Hotkey restart (Alt+R)
document.addEventListener('keydown', e => {
    const k = reflector.hotkey;
    if ( e.key.toLowerCase() === k.key.toLowerCase() && e.ctrlKey === !!k.ctrl && e.shiftKey === !!k.shift && e.altKey === !!k.alt) {
        e.preventDefault();
        host.setStatus('restarting');
        setTimeout(() => host.startBroadcast(), 500);
    }
});

host.startBroadcast();