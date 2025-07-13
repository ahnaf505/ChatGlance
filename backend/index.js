const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');

const PORT = 3033;
const TMP_DIR = path.join(__dirname, 'tmp');

async function generateUniqueDir(baseDir) {
    while (true) {
        const dirName = crypto.randomBytes(8).toString('hex');
        const fullPath = path.join(baseDir, dirName);
        try {
            await fs.promises.access(fullPath);
            // Path exists, retry
        } catch (err) {
            // Path does not exist, safe to use
            await fs.promises.mkdir(fullPath, { recursive: true });
            return { dirName, fullPath };
        }
    }
}

const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
        try {
            // Ensure base tmp dir exists
            await fs.promises.mkdir(TMP_DIR, { recursive: true });

            const { dirName, fullPath } = await generateUniqueDir(TMP_DIR);
            const busboy = Busboy({ headers: req.headers });

            busboy.on('file', (fieldname, file, info) => {
                const { filename } = info;
                const savePath = path.join(fullPath, filename);
                const writeStream = fs.createWriteStream(savePath);
                file.pipe(writeStream);
            });

            busboy.on('finish', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ folder: dirName }));
            });

            req.pipe(busboy);
        } catch (err) {
            console.error('Upload error:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
