#!/usr/bin/env python3
import json
import time
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

if __name__ == '__main__':
    print("Reflector Server running on port 4242")
    HTTPServer(('0.0.0.0', 4242), Handler).serve_forever()