#!/usr/bin/env python3
"""
Reflector Server - WebRTC Signaling Relay for WebRTC offer/answer/ICE exchange using key-based channels.
Minimal server using only Python stdlib. (cuz its a pain to write another shell script for supporting devices that dont have Flask installed)
"""

import json
import time
import os
import ssl
import socket
from argparse import ArgumentParser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

class SignalingData:
    def __init__(self):
        self.channels = {}
        self.ttl = 3600
    
    def set_data(self, key, data):
        if not key or not isinstance(data, dict) or 'type' not in data:
            return False
        
        if key not in self.channels:
            self.channels[key] = {'offer': None, 'answer': None, 'ice': [], 'timestamp': time.time()}
        
        channel = self.channels[key]
        data_type = data['type']
        
        if data_type == 'offer':
            # New offer invalidates old answer and ICE candidates
            channel['offer'] = data
            channel['answer'] = None  # Clear old answer
            channel['ice'] = []       # Clear old ICE candidates
        elif data_type == 'answer':
            # Only accept answer if we have a current offer
            if channel['offer']:
                channel['answer'] = data
                channel['ice'] = []   # Clear old ICE candidates for fresh session
        elif data_type in ['ice', 'candidate']:
            # Only accept ICE if we have both offer and answer
            if channel['offer'] and channel['answer']:
                channel['ice'].append(data)
                if len(channel['ice']) > 10:  # Keep only 10 most recent ICE candidates
                    channel['ice'] = channel['ice'][-10:]
        
        channel['timestamp'] = time.time()
        return True
    
    def get_data(self, key):
        if not key or key not in self.channels:
            return None
        
        # Cleanup expired
        if time.time() - self.channels[key]['timestamp'] > self.ttl:
            del self.channels[key]
            return None
        
        return self.channels[key]

signaling_store = SignalingData()

class ReflectorHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        path = urlparse(self.path).path
        query = parse_qs(urlparse(self.path).query)
        
        if path == '/reflector':
            key = query.get('key', [None])[0]
            data = signaling_store.get_data(key)
            self.send_json_response(data)
        else:
            self.send_error(404)
    
    def do_POST(self):
        path = urlparse(self.path).path
        query = parse_qs(urlparse(self.path).query)
        
        if path == '/reflector':
            key = query.get('key', [None])[0]
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                raw_data = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(raw_data)
                
                if signaling_store.set_data(key, data):
                    self.send_json_response({'status': 'ok'})
                else:
                    self.send_error(400)
            except:
                self.send_error(400)
        else:
            self.send_error(404)
    
    def send_json_response(self, data):
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except:
            pass

def run_server(port, handler_class):
    HTTPServer(('0.0.0.0', port), handler_class).serve_forever()

if os.environ.get('PYTHONANYWHERE_SITE'):
    try:
        from flask import request, jsonify
        
        def add_reflector_routes(app):
            @app.route('/reflector', methods=['GET', 'POST', 'OPTIONS'])
            def reflector():
                if request.method == 'OPTIONS':
                    response = jsonify({})
                    response.headers['Access-Control-Allow-Origin'] = '*'
                    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
                    return response
                
                key = request.args.get('key')
                
                if request.method == 'POST':
                    data = request.get_json()
                    if signaling_store.set_data(key, data):
                        response = jsonify({'status': 'ok'})
                    else:
                        response = jsonify({'error': 'failed'})
                        response.status_code = 400
                else:  # GET
                    data = signaling_store.get_data(key)
                    response = jsonify(data)
                
                response.headers['Access-Control-Allow-Origin'] = '*'
                return response
    except ImportError:
        pass
    
    
if __name__ == '__main__':
    banner = f"{'-'*66}\n" + r"""\033[1;35m
   _____                                      .______________._._.
  /  _  \   ____   ________  _  __ ___________|   \__    ___/| | |
 /  /_\  \ /    \ /  ___/\ \/ \/ // __ \_  __ \   | |    |   | | |
/    |    \   |  \\___ \  \     /\  ___/|  | \/   | |    |    \|\|
\____|__  /___|  /____  >  \/\_/  \___  >__|  |___| |____|    ____ 
        \/     \/     \/              \/                      \/\/
""" + f"{'-'*66}\n"

    parser = ArgumentParser()
    # parser.add_argument('--certfile', '-c', default=os.environ.get('SSL_CERT_FILE', './reflector_cert.pem'))
    parser.add_argument('--certfile', '-c', default='')
    # parser.add_argument('--keyfile', '-k', default=os.environ.get('SSL_KEY_FILE', './reflector_key.pem'))
    parser.add_argument('--keyfile', '-k', default='')
    parser.add_argument('--port', '-p', default=4242, type=int)
    args = parser.parse_args()
    
    certfile = args.certfile
    keyfile = args.keyfile
    port = args.port

    # Get local IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = 'your-ip-address'

    protocol = "https" if os.path.exists(certfile) and os.path.exists(keyfile) else "http"
    print(banner)
    print(f'''\033[1;36m
Reflector Server is running! 
In your AnswerIT Reflector configuration, set the endpoint as: 
    -\033[1;32m {protocol}://{local_ip}:{port}/reflector\033[0m
    ''')
    print(f"Routes:")
    print(f"  POST /reflector?key=YOUR_KEY - Store signaling data")
    print(f"  GET  /reflector?key=YOUR_KEY - Retrieve signaling data\n")

    run_server(port, ReflectorHandler)