const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const WebSocket = require('ws');
const parser = require('./parse'); // Assuming this is custom

const HTTP_PORT = 3033;
const WS_PORT = 3034;
const TMP_DIR = path.join(__dirname, 'tmp');

// Utility: Generate unique directory
async function generateUniqueDir(baseDir) {
    while (true) {
        const dirName = crypto.randomBytes(8).toString('hex');
        const fullPath = path.join(baseDir, dirName);
        try {
            await fs.promises.access(fullPath);
        } catch (err) {
            await fs.promises.mkdir(fullPath, { recursive: true });
            return { dirName, fullPath };
        }
    }
}

// --- HTTP Server for Uploads ---
const httpServer = http.createServer(async (req, res) => {
    // CORS
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
            await fs.promises.mkdir(TMP_DIR, { recursive: true });
            const { dirName, fullPath } = await generateUniqueDir(TMP_DIR);
            const busboy = Busboy({ headers: req.headers });

            busboy.on('file', (fieldname, file, info) => {
                const savePath = path.join(fullPath, "chats.txt");
                file.pipe(fs.createWriteStream(savePath));
            });

            busboy.on('finish', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ folder: dirName }));
            });

            req.pipe(busboy);
        } catch (err) {
            console.error('Upload error:', err);
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
});

// --- Dedicated WebSocket Server ---
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
        message = message.toString();
        if (message.includes('process=')) {
            const folderid = message.slice(8);
            console.log('Received processing request for folderid:', folderid);
            const result = {
                status: 'success', // status of parsing
                chatters: '', // amount of chatter
                topWordsPerUser: {}, // top 5 words per user
                range: {} // range of date since start to last                
            };
            try {
                const filepath = path.join(__dirname, 'tmp', folderid, 'chats.txt');
                const fileContent = fs.readFileSync(filepath, 'utf8');
                const cleanedChat = parser.cleanChatLines(fileContent).join('\n');
                const parsed = parser.parseChat(cleanedChat);
                const qcheck = JSON.stringify(parsed);
                if (qcheck === '[]') {
                    throw new Error("Not a valid whatsapp chat log");
                }
                const chatters = parser.getUniqueUsers(parsed)
                if (chatters.length > 2) {
                    throw new Error("Not a valid personal whatsapp chat");
                }
                result.chatters = chatters;
                const amountofchatters = chatters.length;
                for (const user of chatters) {
                    const wordcount = parser.getTopWordsPerUser(parsed, user);
                    const top5 = parser.getTop5Words(wordcount);
                    result.topWordsPerUser[user] = top5;
                }
                const range = parser.getChatRange(parsed)
                result.range = range;
                let chain = Promise.resolve();
                for (const user of chatters) {
                    chain = chain.then(() => {
                        return parser.getResponseTimes(parsed, user).then(result => {
                            console.log(result); // Logs resolved result
                        });
                    });
                }

            } catch (err) {
                const errormsg = {
                    status: 'error',
                    message: err.message,
                };
                ws.send(JSON.stringify(errormsg));
                console.log(err)
            }
            console.log(result) // DEBUG LINE - REMOVE ON PROD
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

console.log(`WebSocket server running at ws://localhost:${WS_PORT}`);