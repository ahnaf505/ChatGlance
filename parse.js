const path = require('path');

function cleanChatLines(text) {
  const lines = text.split('\n');

  const systemIndicators = [
    '<media omitted>',
    'null',
    'this message was deleted',
    'you blocked this contact',
    'you unblocked this contact',
    'messages and calls are end-to-end encrypted',
    'disappearing messages',
    'this chat is with a business account',
    'security code for',
    'missed a call',
    'started a call',
    'changed their phone number',
    'changed their name',
    'deleted this message',
    'tap to',

  ];

  const userMessageRegex = /^\d{1,2}\/\d{1,2}\/\d{2}, \d{1,2}:\d{2}\s?[APMapm]{2} - .+?: .+/;

  return lines.filter(line => {
    if (!userMessageRegex.test(line)) return false;
    const lower = line.toLowerCase();
    return !systemIndicators.some(indicator => lower.includes(indicator));
  });
}

function parseChat(raw) {
  const cleaned = raw
    .replace(/\u202F/g, ' ')    .replace(/\r\n/g, '\n')    .replace(/ +/g, ' ');
  const entries = cleaned.split(/(?=^\d{1,2}\/\d{1,2}\/\d{2}, \d{1,2}:\d{2} ?[APap][Mm] - )/gm);


  const messages = [];

  const pattern = /^(\d{1,2})\/(\d{1,2})\/(\d{2}), (\d{1,2}):(\d{2}) ?([APap][Mm]) - ([^:]+):\s([\s\S]*)$/;

  for (const entry of entries) {
    const trimmed = entry.trim();
    const match = trimmed.match(pattern);
    if (match) {
      const [
        _, month, day, year, hourRaw, minute, ampmRaw, sender, message,
      ] = match;

      let hour = parseInt(hourRaw);
      const ampm = ampmRaw.toUpperCase();
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      const yearFull = 2000 + parseInt(year);
      const dateObj = new Date(Date.UTC(yearFull, parseInt(month) - 1, parseInt(day), hour, parseInt(minute)));

      messages.push({
        datetime: dateObj.toISOString(),
        sender: sender.trim(),
        message: message.trim(),
      });
    }
  }

  return messages;
}


function getTopWordsPerUser(parsedData, targetSender) {
  const wordCount = {};

  parsedData.forEach(entry => {
    if (entry.sender === targetSender) {
      const words = entry.message
        .toLowerCase()
        .replace(/[^\w\s]/g, '')        .split(/\s+/);
      words.forEach(word => {
        if (!word) return;        wordCount[word] = (wordCount[word] || 0) + 1;
      });
    }
  });

  return wordCount;
}

function getUniqueUsers(data) {
  const users = new Set();

  data.forEach(entry => {
    if (entry.sender) {
      users.add(entry.sender);
    }
  });

  return Array.from(users);
}

function getTop5Words(parsedData) {
  const entries = Object.entries(parsedData);

  if (entries.length <= 5) {
    return entries.map(([word]) => word);
  }  const grouped = {};
  for (const [word, count] of entries) {
    if (!grouped[count]) grouped[count] = [];
    grouped[count].push(word);
  }  const frequencies = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => b - a);

  const result = [];

  for (const freq of frequencies) {
    const words = grouped[freq];
    const remaining = 5 - result.length;

    if (words.length <= remaining) {
      result.push(...words);
    } else {      const shuffled = words.sort(() => Math.random() - 0.5);
      result.push(...shuffled.slice(0, remaining));
      break;
    }
  }

  return result;
}

function getChatRange(parsedData) {
  if (!parsedData.length) return null;

  const timestamps = parsedData
    .map(entry => new Date(entry.datetime))
    .sort((a, b) => a - b);

  const formatDate = date =>
    date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

  return {
    start: formatDate(timestamps[0]),
    end: formatDate(timestamps[timestamps.length - 1])
  };
}


function getResponseTimes(parsedData, targetUser) {
  let lastMessageTime = null;
  let lastSender = null;
  let lastMessage = null;

  const aiChecks = [];  const sorted = parsedData.slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const currentTime = new Date(entry.datetime);

    if (entry.sender === targetUser) {
      if (lastSender && lastSender !== targetUser && lastMessageTime && lastMessage) {
        const diffMin = (currentTime - lastMessageTime) / 60000;        aiChecks.push(diffMin);
      }
    }

    lastMessageTime = currentTime;
    lastSender = entry.sender;
    lastMessage = entry.message;
  }  return Promise.all(aiChecks).then(results => {
    const responseTimes = results.filter(r => r !== null);

    if (responseTimes.length === 0) {
      return {
        user: targetUser,
        fastest: null,
        slowest: null,
        average: null,
        summary: `${targetUser} has no recorded replies.`
      };
    }
    const fastest = Math.min(...responseTimes);
    const slowest = Math.max(...responseTimes);
    const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    return {
      user: targetUser,
      fastestMinutes: fastest,
      slowestMinutes: slowest,
      averageMinutes: average,
      summary: `${targetUser} - Fastest: ${formatTime(fastest)}, Slowest: ${formatTime(slowest)}, Average: ${formatTime(average)} (${responseTimes.length} replies)`
    };
  });
}function formatTime(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}


function getTopSentenceStartersFuzzy(parsedData, targetUser, options = {}) {
  const maxWords = options.maxWords || 8;
  const minOccurrences = options.minOccurrences || 2;
  const similarityThreshold = options.similarityThreshold || 0.85;

  const starters = [];

  parsedData.forEach(entry => {
    if (entry.sender !== targetUser) return;

    const words = entry.message.trim().toLowerCase().split(/\s+/).slice(0, maxWords);
    if (words.length === 0) return;

    starters.push({
      starter: words.join(' '),
      full: entry.message.trim()
    });
  });

  const groups = [];

  for (const { starter, full } of starters) {
    let matched = false;

    for (const group of groups) {
      if (stringSimilarity(starter, group.key) >= similarityThreshold) {
        group.count++;
        group.sentences.push(full);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({
        key: starter,
        count: 1,
        sentences: [full]
      });
    }
  }

  const top = groups
    .filter(g => g.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)[0];

  return top ? top.sentences[0] : null;
}function stringSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(c => setB.has(c)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function getChatSessions(parsedData, sessionGapMinutes = 120) {
  if (!parsedData.length) return [];

  const sessions = [];
  let currentSession = [parsedData[0]];

  for (let i = 1; i < parsedData.length; i++) {
    const prev = new Date(parsedData[i - 1].datetime);
    const curr = new Date(parsedData[i].datetime);
    const diffMin = (curr - prev) / 60000;

    if (diffMin <= sessionGapMinutes) {
      currentSession.push(parsedData[i]);
    } else {
      sessions.push(currentSession);
      currentSession = [parsedData[i]];
    }
  }  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  return sessions;
}

function countMessagesPerDay(parsedData) {
  const counts = {};

  for (const entry of parsedData) {
    const date = new Date(entry.datetime).toISOString().split('T')[0];    counts[date] = (counts[date] || 0) + 1;
  }

  const result = Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return result;
}

function countMessagesByUser(parsedMessages, targetUser) {
  let count = 0;

  for (const entry of parsedMessages) {
    if (entry.sender === targetUser) {
      count++;
    }
  }

  return count;
}

function getTotalMessagesPerSession(parsedMessages, sessionGapMinutes = 120) {
  const sessions = getChatSessions(parsedMessages, sessionGapMinutes);
  return sessions.map(session => session.length);
}

function getTopEmojiForUser(parsedMessages, targetSender) {
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  const emojiCount = {};

  for (const { sender, message } of parsedMessages) {
    if (sender !== targetSender || !message) continue;

    const emojis = message.match(emojiRegex);
    if (!emojis) continue;

    for (const emoji of emojis) {
      emojiCount[emoji] = (emojiCount[emoji] || 0) + 1;
    }
  }

  if (Object.keys(emojiCount).length === 0) return null;

  const max = Math.max(...Object.values(emojiCount));

  const topEmojis = Object.entries(emojiCount)
    .filter(([_, count]) => count === max)
    .map(([emoji]) => emoji);

  return topEmojis[Math.floor(Math.random() * topEmojis.length)];
}



module.exports = {
  parseChat,
  getTopWordsPerUser,
  cleanChatLines,
  getUniqueUsers,
  getTop5Words,
  getChatRange,
  getResponseTimes,
  formatTime,
  getTopSentenceStartersFuzzy,
  getChatSessions,
  countMessagesByUser,
  getTotalMessagesPerSession,
  getTopEmojiForUser,
  countMessagesPerDay,
};