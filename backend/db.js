const { initializeApp } = require('firebase/app');
const {
  getFirestore, doc, setDoc, getDoc,
  updateDoc, deleteDoc
} = require('firebase/firestore');

// Initialize Firebase using client config (ENV variables or inline)
const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId,
  measurementId: process.env.measurementId
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION = 'chatStats';

// Create or overwrite a document
async function createStats(id, data) {
  await setDoc(doc(db, COLLECTION, id), data);
  return { id, created: true };
}

// Read document data
async function readStats(id) {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

// Update specific fields
async function updateStats(id, updates) {
  await updateDoc(doc(db, COLLECTION, id), updates);
  return { id, updated: true };
}

// Delete document
async function deleteStats(id) {
  await deleteDoc(doc(db, COLLECTION, id));
  return { id, deleted: true };
}

// Generate a unique alphanumeric session ID and ensure it's not in Firestore
async function generateUniqueSessionId(length = 10) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  function randomId() {
    return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
  }

  let sessionId;
  let exists = true;

  // Retry until we get a truly unique ID
  while (exists) {
    sessionId = randomId();
    const ref = doc(db, COLLECTION, sessionId);
    const snap = await getDoc(ref);
    exists = snap.exists();
  }

  return sessionId;
}

module.exports = {
  createStats,
  readStats,
  updateStats,
  deleteStats,
  generateUniqueSessionId
};
