#!/usr/bin/env python3
import json
import os
import socket
import time
from argparse import ArgumentParser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

class SignalingServer:
    def __init__(self):
        self.data_store = {}
        self.last_cleanup = time.time()
    
    def cleanup_old_sessions(self):
        """Remove sessions older than 10 minutes - called on each request"""
        current_time = time.time()
        # Only run cleanup every 60 seconds
        if current_time - self.last_cleanup < 60:
            return
            
        cutoff_time = current_time - 600  # 10 minutes
        expired_keys = []
        
        for key, session in self.data_store.items():
            # Check if session has an offer with timestamp
            if 'offer' in session:
                offer_time = session.get('_created', 0)
                if offer_time == 0:
                    # Add timestamp to existing sessions without one
                    session['_created'] = current_time
                elif offer_time < cutoff_time:
                    expired_keys.append(key)
        
        # Remove expired sessions
        for key in expired_keys:
            del self.data_store[key]
            
        self.last_cleanup = current_time
        if expired_keys:
            print(f"Cleaned up {len(expired_keys)} expired sessions")
    
    def handle_request(self, method, key, data=None):
        # Trigger cleanup on every request (but throttled internally)
        self.cleanup_old_sessions()
        
        if method == 'POST' and data:
            self.data_store.setdefault(key, {})
            
            if data['type'] == 'offer':
                # Only host can set offers - clear everything for fresh start
                self.data_store[key] = {
                    'offer': data,
                    '_created': time.time()  # Add timestamp for cleanup
                }
            elif data['type'] == 'answer':
                self.data_store[key]['answer'] = data
            elif data['type'] == 'ice':
                ice_list = self.data_store[key].setdefault('ice', [])
                # Handle both single candidate and batch
                if 'candidates' in data:
                    ice_list.extend({'candidate': c} for c in data['candidates'])
                else:
                    ice_list.append(data)
            
            return {'status': 'ok'}
        
        elif method == 'GET':
            return self.data_store.get(key, {})
        
        elif method == 'DELETE':
            # Only allow deleting specific parts, not the whole session
            if key in self.data_store:
                # Don't delete offer - only host controls that
                self.data_store[key].pop('answer', None)
                self.data_store[key]['ice'] = []
                return {'status': 'ok'}
            return {'status': 'not_found'}
        
        return {'status': 'error'}

signal = SignalingServer()

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        result = signal.handle_request('GET', key)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
    
    def do_POST(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        length = int(self.headers.get('Content-Length', 0))
        data = json.loads(self.rfile.read(length))
        result = signal.handle_request('POST', key, data)
        
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
    
    def do_DELETE(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        result = signal.handle_request('DELETE', key)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())


if os.environ.get('PYTHONANYWHERE_SITE'):
    try:
        from flask import request, jsonify

        def add_reflector_routes(app):
            @app.route('/reflector', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
            def reflector():
                if request.method == 'OPTIONS':
                    response = jsonify({})
                    response.headers['Access-Control-Allow-Origin'] = '*'
                    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
                    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
                    return response

                key = request.args.get('key')
                data = request.get_json() if request.method == 'POST' else None
                result = signal.handle_request(request.method, key, data)
                
                response = jsonify(result)
                response.headers['Access-Control-Allow-Origin'] = '*'
                return response
    except ImportError:
        pass


if __name__ == '__main__':
    banner = f"\033[1;35m{'-'*66}" + r"""
   _____                                      .______________._._.
  /  _  \   ____   ________  _  __ ___________|   \__    ___/| | |
 /  /_\  \ /    \ /  ___/\ \/ \/ // __ \_  __ \   | |    |   | | |
/    |    \   |  \\___ \  \     /\  ___/|  | \/   | |    |    \|\|
\____|__  /___|  /____  >  \/\_/  \___  >__|  |___| |____|    ____ 
        \/     \/     \/              \/                      \/\/
""" + f"{'-'*66}\033[0m\n"

    parser = ArgumentParser()
    parser.add_argument('--port', '-p', default=4242, type=int)
    args = parser.parse_args()
    
    port = args.port

    # Get local IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = 'your-ip-address'

    print(banner)
    print(f'''\033[1;36m
Reflector Signaling Server is running! 
In your AnswerIT Reflector configuration, set the endpoint as: 
    -\033[1;32m http://{local_ip}:{port}/reflector\033[0m
    ''')
    print(f"Routes:")
    print(f"  POST /reflector?key=YOUR_KEY - Store signaling data")
    print(f"  GET  /reflector?key=YOUR_KEY - Retrieve signaling data")
    print(f"  DELETE /reflector?key=YOUR_KEY - Delete signaling data")

    HTTPServer(('0.0.0.0', port), Handler).serve_forever()