const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const parser = require('./parse');
const db = require('./db');

const HTTP_PORT = BACKEND_PORT;

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

async function processChat(folderid) {
    const result = {
        status: 'success',
        chatters: '',
        topWordsPerUser: {},
        range: {},
        timeBetweenMsg: [],
        topStartersPerUser: {},
        totalSessionCount: 0,
        messagesByEachUserCount: {},
        avgMessagePerSession: 0,
        minMessagePerSession: 0,
        maxMessagePerSession: 0,
        getTopEmojiPerUser: {},
        messagesSentPerDay: {}
    };

    const deletePath = path.join(__dirname, 'tmp', folderid);

    try {
        const filepath = path.join(__dirname, 'tmp', folderid, 'chats.txt');
        const fileContent = fs.readFileSync(filepath, 'utf8');
        const cleanedChat = parser.cleanChatLines(fileContent).join('\n');
        const parsed = parser.parseChat(cleanedChat);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("Not a valid whatsapp chat log");
        }

        const chatters = parser.getUniqueUsers(parsed);
        if (chatters.length > 2) {
            throw new Error("Not a valid personal whatsapp chat");
        }

        result.chatters = chatters;

        for (const user of chatters) {
            const wordcount = parser.getTopWordsPerUser(parsed, user);
            result.topWordsPerUser[user] = parser.getTop5Words(wordcount);
        }

        result.range = parser.getChatRange(parsed);

        for (const user of chatters) {
            const timemsg = await parser.getResponseTimes(parsed, user);
            result.timeBetweenMsg.push(timemsg);
        }

        for (const user of chatters) {
            result.topStartersPerUser[user] = parser.getTopSentenceStartersFuzzy(parsed, user, {
                maxWords: 3,
                minOccurrences: 2,
                similarityThreshold: 0.8
            });
        }

        const sessions = parser.getChatSessions(parsed);
        result.totalSessionCount = sessions.length;
        result.avgMessagePerSession = (parsed.length / sessions.length).toFixed(2);
        result.minMessagePerSession = Math.min(...sessions.map(s => s.length));
        result.maxMessagePerSession = Math.max(...sessions.map(s => s.length));

        for (const user of chatters) {
            result.messagesByEachUserCount[user] = parser.countMessagesByUser(parsed, user);
            result.getTopEmojiPerUser[user] = parser.getTopEmojiForUser(parsed, user);
        }

        result.messagesSentPerDay = parser.countMessagesPerDay(parsed);

        const sessionid = await db.generateUniqueSessionId();
        await db.createStats(sessionid, result);

        fs.rmSync(deletePath, { recursive: true, force: true });

        return JSON.stringify({ status: 'success', id: sessionid });

    } catch (err) {
        fs.rmSync(deletePath, { recursive: true, force: true });

        return JSON.stringify({
            status: 'error',
            message: err.code === 'ENOENT' ? 'Invalid file format' :
                     err.code === 'EACCES' ? 'Permission denied' :
                     err.message
        });
    }
}

// --- HTTP Server for Uploads ---
const httpServer = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

            const savePath = path.join(fullPath, "chats.txt");
            const writeStream = fs.createWriteStream(savePath);

            busboy.on('file', (fieldname, file, info) => {
                file.pipe(writeStream);
            });

            busboy.on('finish', async () => {
                try {
                    await new Promise(resolve => writeStream.on('finish', resolve));
                    const data = await processChat(dirName);
                    res.end(data);
                } catch (err) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });

            req.pipe(busboy);

        } catch (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    } else if (req.method === 'POST' && req.url === '/summary') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString(); // expecting plain text ID
        });

        req.on('end', async () => {
            const id = body.trim();

            if (!id) {
                res.writeHead(400);
                res.end('Missing session ID');
                return;
            }

            try {
                const data = await db.readStats(id);
                if (data) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } else {
                    res.writeHead(404);
                    res.end('Session not found');
                }
            } catch (err) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        });

    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
});