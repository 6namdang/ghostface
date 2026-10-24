#!/bin/bash
echo "✅ Verifying FaceHelper PWA scaffold..."
echo ""

files=(
  "index.html"
  "app.js"
  "sw.js"
  "manifest.json"
  "package.json"
  "README.md"
  "DEPLOYMENT.md"
  "QUICKSTART.md"
  "PROJECT_STRUCTURE.md"
  "start.sh"
  "serve.js"
  "generate-icons.html"
  ".gitignore"
  "icons/icon-192.svg"
  "icons/icon-512.svg"
)

all_good=true

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    size=$(du -h "$file" | cut -f1)
    echo "  ✅ $file ($size)"
  else
    echo "  ❌ $file (missing)"
    all_good=false
  fi
done

echo ""
if [ "$all_good" = true ]; then
  echo "🎉 All files present! Ready to deploy."
  echo ""
  echo "Next steps:"
  echo "  1. Start server: python3 -m http.server 8000"
  echo "  2. Open: http://localhost:8000"
  echo "  3. Deploy: See DEPLOYMENT.md"
else
  echo "❌ Some files missing. Check the output above."
fi
