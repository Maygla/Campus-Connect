// Firestore + Storage wrapper. Exposes window.CCDB with simple CRUD functions.
// Uses Firebase v9 modular SDK from CDN and safely initializes the app if not already initialized.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAV31IONxIXVSpXOhcZDOw4WTiclO8GC4g",
  authDomain: "fir-4companion.firebaseapp.com",
  projectId: "fir-4companion",
  storageBucket: "fir-4companion.firebasestorage.app",
  messagingSenderId: "753084648743",
  appId: "1:753084648743:web:641f84f8d78a498abe6d02",
  measurementId: "G-67W9N0E3ZH"
};

// initialize app only if not already initialized
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
const storage = getStorage(app);

// Helper: map Firestore doc snapshots to plain objects (include id)
function snapToArray(docsSnap) {
  return docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function toTimestampNow() {
  return serverTimestamp();
}



// ------- Access links -------
async function addAccessLink({ title, url, owner = null }) {
  if (!title || !url) throw new Error('title and url required');
  // owner may be null or an object { uid, name }
  const payload = {
    title,
    url,
    owner: owner ? { uid: owner.uid, name: owner.name || owner.email || null } : null,
    createdAt: toTimestampNow()
  };
  const docRef = await addDoc(collection(db, 'access'), payload);
  return { id: docRef.id, ...payload };
}
async function listAccessLinks() {
  const q = query(collection(db, 'access'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snapToArray(snap);
}
async function deleteAccessLink(id) {
  await deleteDoc(doc(db, 'access', id));
  return true;
}

// ------- Notes (files or drive links) -------
// Uploads file to Storage and metadata to Firestore.
// file: File object from input, driveLink: optional Google Drive URL, user: { uid, name } optional
async function uploadNote({ file, subject, title, owner, driveLink }) {
  const meta = {
    subject: subject || '',
    title: title || (file?.name || 'Untitled'),
    owner: owner ? { uid: owner.uid, name: owner.name || owner.email || null } : null,
    createdAt: toTimestampNow(),
    driveLink: driveLink || null
  };

  if (file) {
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/\s+/g, '_')}`;
    const path = `notes/${owner?.uid || 'anon'}/${safeName}`;
    const ref = storageRef(storage, path);

    // upload
    const uploadTask = await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref, file);
      task.on('state_changed', null, err => reject(err), () => resolve(task.snapshot));
    });

    const url = await getDownloadURL(ref);
    meta.filename = file.name;
    meta.storagePath = path;
    meta.url = url;
  }

  const docRef = await addDoc(collection(db, 'notes'), meta);
  return { id: docRef.id, ...meta };
}

async function listNotes(limit = 100) {
  const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snapToArray(snap);
}

async function deleteNote(id) {
  const d = await getDoc(doc(db, 'notes', id));
  if (!d.exists()) throw new Error('Note not found');
  const data = d.data();
  if (data.storagePath) {
    const fileRef = storageRef(storage, data.storagePath);
    try { await deleteObject(fileRef); } catch (e) { /* ignore if missing */ }
  }
  await deleteDoc(doc(db, 'notes', id));
  return true;
}
// ------- Forum posts -------
async function createPost({ author, topic, content }) {
  const p = { author, topic, content, replies: [], createdAt: toTimestampNow() };
  const docRef = await addDoc(collection(db, 'posts'), p);
  return { id: docRef.id, ...p };
}
async function listPosts() {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snapToArray(snap);
}
async function replyToPost(postId, { author, text }) {
  const docRef = doc(db, 'posts', postId);
  const d = await getDoc(docRef);
  if (!d.exists()) throw new Error('Post not found');
  const post = d.data();
  const replies = post.replies || [];
  replies.push({ id: `${Date.now()}`, author, text, createdAt: new Date() });
  await updateDoc(docRef, { replies });
  return true;
}
async function deletePost(id) {
  await deleteDoc(doc(db, 'posts', id));
  return true;
}

// ------- News -------
async function createNews({ title, tag, body, branch, author }) {
  const n = { 
    title, 
    tag, 
    body, 
    branch: branch || 'all',
    author: author || null, 
    createdAt: toTimestampNow() 
  };
  const docRef = await addDoc(collection(db, 'news'), n);
  return { id: docRef.id, ...n };
}
async function listNews() {
  const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snapToArray(snap);
}
async function deleteNews(id) {
  await deleteDoc(doc(db, 'news', id));
  return true;
}

// ------- Schedule / Events -------
async function createEvent({ title, date, time, type, branch }) {
  const e = { 
    title, 
    date, 
    time, 
    type,
    branch: branch || 'all',
    createdAt: toTimestampNow() 
  };
  const docRef = await addDoc(collection(db, 'schedule'), e);
  return { id: docRef.id, ...e };
}
async function listEvents() {
  const q = query(collection(db, 'schedule'), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snapToArray(snap);
}
async function deleteEvent(id) {
  await deleteDoc(doc(db, 'schedule', id));
  return true;
}

// Expose a simple API on window.CCDB
window.CCDB = {
  // access
  addAccessLink,
  listAccessLinks,
  deleteAccessLink,
  // notes
  uploadNote,
  listNotes,
  deleteNote,
  // posts
  createPost,
  listPosts,
  replyToPost,
  deletePost,
  // news
  createNews,
  listNews,
  deleteNews,
  // schedule
  createEvent,
  listEvents,
  deleteEvent,
  // low-level handles if you need them:
  _internal: { db, storage }
};


console.log('CCDB (Firestore) initialized');

