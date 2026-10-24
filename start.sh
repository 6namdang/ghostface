#!/bin/bash

# FaceHelper Quick Start Script

echo "🧠 FaceHelper - Face Recognition PWA"
echo "====================================="
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "✅ Starting server with Python..."
    echo ""
    echo "📱 Open in your browser:"
    echo "   http://localhost:8000"
    echo ""
    echo "💡 For mobile testing, use ngrok:"
    echo "   ngrok http 8000"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ Starting server with Python..."
    echo ""
    echo "📱 Open in your browser:"
    echo "   http://localhost:8000"
    echo ""
    python -m http.server 8000
elif command -v npx &> /dev/null; then
    echo "✅ Starting server with npx http-server..."
    echo ""
    echo "📱 Open in your browser:"
    echo "   http://localhost:8080"
    echo ""
    npx http-server -p 8080
else
    echo "❌ Error: No suitable server found."
    echo ""
    echo "Please install one of the following:"
    echo "  - Python 3: https://python.org"
    echo "  - Node.js: https://nodejs.org"
    exit 1
fi
