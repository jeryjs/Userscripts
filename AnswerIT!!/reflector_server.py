#!/usr/bin/env python3
import json
import os
import socket
from argparse import ArgumentParser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

data_store = {}

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        data = data_store.get(key, {})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_POST(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        length = int(self.headers.get('Content-Length', 0))
        data = json.loads(self.rfile.read(length))
        
        if key not in data_store:
            data_store[key] = {}
        
        if data['type'] == 'offer':
            data_store[key] = {'offer': data}
        elif data['type'] == 'answer':
            data_store[key]['answer'] = data
        elif data['type'] == 'ice':
            if 'ice' not in data_store[key]:
                data_store[key]['ice'] = []
            data_store[key]['ice'].append(data)
        
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'{"status": "ok"}')
    
    def do_DELETE(self):
        key = parse_qs(urlparse(self.path).query).get('key', [None])[0]
        if key in data_store:
            del data_store[key]
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'{"status": "ok"}')
        

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

                if request.method == 'POST':
                    data = request.get_json()
                    if key not in data_store:
                        data_store[key] = {}

                    if data['type'] == 'offer':
                        data_store[key] = {'offer': data}
                    elif data['type'] == 'answer':
                        data_store[key]['answer'] = data
                    elif data['type'] == 'ice':
                        if 'ice' not in data_store[key]:
                            data_store[key]['ice'] = []
                        data_store[key]['ice'].append(data)

                    response = jsonify({'status': 'ok'})
                elif request.method == 'DELETE':
                    if key in data_store:
                        del data_store[key]
                        response = jsonify({'status': 'ok'})
                    else:
                        response = jsonify({'status': 'not_found'})
                else:  # GET
                    data = data_store.get(key, {})
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
Reflector Server is running! 
In your AnswerIT Reflector configuration, set the endpoint as: 
    -\033[1;32m http://{local_ip}:{port}/reflector\033[0m
    ''')
    print(f"Routes:")
    print(f"  POST /reflector?key=YOUR_KEY - Store signaling data")
    print(f"  GET  /reflector?key=YOUR_KEY - Retrieve signaling data")
    print(f"  DELETE /reflector?key=YOUR_KEY - Delete signaling data")

    HTTPServer(('0.0.0.0', port), Handler).serve_forever()