const http = require('http');
const fs = require('fs');
const path = require('path');

// Database In-Memory (Tidak butuh Firebase)
const sessions = {}; 

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css'
};

const server = http.createServer((req, res) => {
    // CORS (Bypass agar HP bisa nembak ke server lokal)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Endpoint: Simpan sesi (Operator click Generate)
    if (req.url === '/api/post-qr' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
             try {
                const data = JSON.parse(body);
                sessions[data.id] = { status: 'pending', ...data };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
             } catch(e) {
                res.writeHead(500);
                res.end("Internal Server Error");
             }
        });
        return;
    }

    // Endpoint: Cek Status (Operator Polling)
    if (req.url.startsWith('/api/status')) {
        const urlParams = new URL(req.url, 'http://localhost');
        const id = urlParams.searchParams.get('id');
        if (sessions[id]) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(sessions[id]));
        } else {
             res.writeHead(404);
             res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
    }

    // Endpoint: Update Status jadi Success (HP Scanner)
    if (req.url.startsWith('/api/scan')) {
        const urlParams = new URL(req.url, 'http://localhost');
        const id = urlParams.searchParams.get('id');
        if (sessions[id]) {
            sessions[id].status = 'success';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
             res.writeHead(404);
             res.end(JSON.stringify({ error: 'not found' }));
        }
        return;
    }

    // Serve HTML, CSS, JS
    let filePath = './' + (req.url === '/' ? 'index.html' : req.url);
    if(filePath.indexOf('?') !== -1) filePath = filePath.split('?')[0];

    // Mencegah baca file berbahaya (directory traversal)
    const baseDir = __dirname;
    const requestedPath = path.join(baseDir, filePath);
    if (!requestedPath.startsWith(baseDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('Not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });

});

server.listen(4005, '0.0.0.0', () => {
    console.log('✅ Zero-Config Server menyala di Port 4005');
});
