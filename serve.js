// Simple HTTPS server for local testing
// Run: node serve.js
// Then open: https://localhost:8443

const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8443;

// Generate self-signed certs with:
// openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout key.pem -out cert.pem -days 365

let sslOptions;
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
  };
} catch (e) {
  console.log('SSL certificates not found. Generating...');
  console.log('Run these commands first:');
  console.log('  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout key.pem -out cert.pem -days 365');
  console.log('\nOr just use Python:');
  console.log('  python3 -m http.server 8000');
  console.log('\nThen use ngrok for HTTPS:');
  console.log('  ngrok http 8000');
  process.exit(1);
}

const server = https.createServer(sslOptions, (req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  
  const contentType = contentTypes[ext] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ FaceHelper running at: https://localhost:${PORT}`);
  console.log('\n📱 On your phone:');
  console.log('   1. Open this URL in Safari/Chrome');
  console.log('   2. Accept the security warning (self-signed cert)');
  console.log('   3. Add to Home Screen for app-like experience\n');
});
