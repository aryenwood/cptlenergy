#!/usr/bin/env python3
"""
Capital Energy — Local Dev Server
Serves the app at http://localhost:3000
Handles proper MIME types for PWA (sw.js, manifest.json, etc.)
"""

import http.server
import socketserver
import os
import sys

PORT = 3000
DIR  = os.path.dirname(os.path.abspath(__file__))

class PWAHandler(http.server.SimpleHTTPRequestHandler):
    # Extra MIME types for PWA assets
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js':       'application/javascript',
        '.mjs':      'application/javascript',
        '.json':     'application/json',
        '.webmanifest': 'application/manifest+json',
        '.css':      'text/css',
        '.html':     'text/html; charset=utf-8',
        '.png':      'image/png',
        '.jpg':      'image/jpeg',
        '.jpeg':     'image/jpeg',
        '.svg':      'image/svg+xml',
        '.pdf':      'application/pdf',
        '.woff2':    'font/woff2',
        '.woff':     'font/woff',
    }

    def end_headers(self):
        # Required for service worker scope
        self.send_header('Service-Worker-Allowed', '/')
        # Allow sw.js to be served with correct headers
        if self.path.endswith('sw.js'):
            self.send_header('Cache-Control', 'no-cache')
        # CORS for local dev
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Clean log output
        print(f"  {self.address_string()} → {format % args}")

def run():
    os.chdir(DIR)
    with socketserver.TCPServer(('', PORT), PWAHandler) as httpd:
        httpd.allow_reuse_address = True
        print(f"\n  ┌─────────────────────────────────────────┐")
        print(f"  │  Capital Energy — LIVE APP              │")
        print(f"  │  http://localhost:{PORT}                   │")
        print(f"  │  Ctrl+C to stop                         │")
        print(f"  └─────────────────────────────────────────┘\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Server stopped.")
            sys.exit(0)

if __name__ == '__main__':
    run()
