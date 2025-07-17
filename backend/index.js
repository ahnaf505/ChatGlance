const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const WebSocket = require('ws');
const parser = require('./parse');
const db = require('./db');

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

function waitForOneMessage(ws) {
    return new Promise((resolve, reject) => {
        const onMessage = (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                resolve(parsed);
            } catch {
                resolve(data.toString()); // fallback to raw string
            } finally {
                ws.off('message', onMessage); // clean up listener
            }
        };

        ws.on('message', onMessage);
        ws.on('error', reject);
    });
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

// --- Dedicated WebSocket Server ---
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {

    ws.on('message', (message) => {
        message = message.toString();
        if (message.includes('process=')) {
            const folderid = message.slice(8);
            const result = {
                status: 'success', // status of parsing
                chatters: '', // amount of chatter
                topWordsPerUser: {}, // top 5 words per user
                range: {}, // range of date since start to last                
                timeBetweenMsg: [], // time between each reply
                topStartersPerUser: {}, // top message session starter used by each user
                totalSessionCount: 0, // total amount of chatting session
                messagesByEachUserCount: {}, // amount of messages sent by each user
                avgMessagePerSession: 0, // average amount of total messages sent by each chatting session
                minMessagePerSession: 0, // minimum amount of total messages sent by each chatting session
                maxMessagePerSession: 0, // maximum amount of total messages sent by each chatting session
                getTopEmojiPerUser: {}, // top emoji used by each user
                messagesSentPerDay: {} // messages sent each day
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
                        return parser.getResponseTimes(parsed, user).then(timemsg => {
                            result.timeBetweenMsg.push(timemsg);
                        });
                    });
                }
                // get most used conversation starter
                for (const user of chatters) {
                    const topstarted = parser.getTopSentenceStartersFuzzy(parsed, user, {
                        maxWords: 3,
                        minOccurrences: 2,
                        similarityThreshold: 0.8
                    });
                    result.topStartersPerUser[user] = topstarted;
                }

                const sessionamount = parser.getChatSessions(parsed).length;
                result.totalSessionCount = sessionamount;

                // amount of total messages sent by each user
                for (const user of chatters) {
                    const amount = parser.countMessagesByUser(parsed, user);
                    result.messagesByEachUserCount[user] = amount;
                }

                const sessionCounts = parser.getChatSessions(parsed).map(s => s.length);
                result.avgMessagePerSession = (parsed.length / sessionCounts.length).toFixed(2);
                result.minMessagePerSession = Math.min(...sessionCounts)
                result.maxMessagePerSession = Math.max(...sessionCounts)

                for (const user of chatters) {
                    const topEmoji = parser.getTopEmojiForUser(parsed, user);
                    result.getTopEmojiPerUser[user] = topEmoji;
                }

                const msgprday = parser.countMessagesPerDay(parsed);
                result.messagesSentPerDay = msgprday;
                (async () => {
                    try {
                        const sessionid = await db.generateUniqueSessionId();
                        await db.createStats(sessionid, result);

                        ws.send(JSON.stringify({ status: 'success' }));

                        const msg = await waitForOneMessage(ws);
                        if (msg === 'wheresummary') {
                            ws.send(sessionid);
                        }
                    } catch (err) {
                        ws.send(JSON.stringify({ status: 'error', message: err.message }));
                    }
                })();

                const deletePath = path.join(__dirname, 'tmp', folderid);
                fs.rmSync(deletePath, { recursive: true, force: true });


            } catch (err) {
                const errormsg = {
                    status: 'error',
                    message: '',
                };

                if (err.code === 'ENOENT') {
                    errormsg.message = 'Invalid file format';
                } else if (err.code === 'EACCES') {
                    errormsg.message = 'Permission denied';
                } else {
                    errormsg.message = err.message;
                }
                const deletePath = path.join(__dirname, 'tmp', folderid);
                fs.rmSync(deletePath, { recursive: true, force: true });

                ws.send(JSON.stringify(errormsg));
            }

        }
    });

});

console.log(`WebSocket server running at ws://localhost:${WS_PORT}`);

// createStats,
//  readStats,
//  updateStats,
//  deleteStats,
//  generateUniqueSessionId