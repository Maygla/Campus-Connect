// Main UI logic — now Firestore-aware. If window.CCDB is present this will use Firestore/storage.
// If CCDB is not present (no Firebase configured), falls back to localStorage.

document.addEventListener('DOMContentLoaded', () => {
  // Basic tabbing (unchanged)
  const tabs = document.querySelectorAll('#tabs li');
  const tabSections = document.querySelectorAll('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const name = t.dataset.tab;
    tabSections.forEach(s => s.classList.toggle('active', s.id === name));
  }));

  // Determine whether CCDB (Firestore) is available
  const hasDB = !!(window.CCDB && window.CCDB.listNotes);
  if (!hasDB) console.info('CCDB not available — falling back to localStorage');

  // Helper wrappers: if CCDB present use it; else localStorage
  const NOTES_KEY = 'cc_notes_v1';
  const POSTS_KEY = 'cc_posts_v1';
  const NEWS_KEY = 'cc_news_v1';
  const SCHEDULE_KEY = 'cc_schedule_v1';
  const ACCESS_KEY = 'cc_access_v1';

  // LocalStorage helpers (fallback)
  const lsLoad = key => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
  };
  const lsSave = (key, data) => localStorage.setItem(key, JSON.stringify(data));

  /* ========= Access Links ========= */
const PERSONAL_ACCESS_KEY = 'cc_personal_access_v1'; // fallback for unsigned users / no DB
const accessLinksEl = document.getElementById('accessLinks');
async function renderAccess() {
  // fetch global + personal from Firestore (if available)
  let allLinks = [];
  let personalLocal = lsLoad(PERSONAL_ACCESS_KEY); // local personal fallback

  if (hasDB) {
    try {
      allLinks = await window.CCDB.listAccessLinks(); // returns both global (owner==null) and personal (owner set)
    } catch (e) {
      console.error('Failed to load access links from DB', e);
      allLinks = [];
    }
  } else {
    // fallback: use stored shared links key if present otherwise seed defaults
    let links = lsLoad(ACCESS_KEY);
    if (links.length === 0) {
      links = [
        { title: 'University Portal', url: 'https://portal.example.edu', createdAt: Date.now(), owner: null },
        { title: 'Attendance System', url: 'https://attendance.example.edu', createdAt: Date.now(), owner: null },
        { title: 'Library', url: 'https://library.example.edu', createdAt: Date.now(), owner: null },
        { title: 'Placement Cell', url: 'https://placements.example.edu', createdAt: Date.now(), owner: null }
      ];
      lsSave(ACCESS_KEY, links);
    }
    // adapt format to expected object shape
    allLinks = links.map(l => ({ title: l.title, url: l.url, owner: l.owner || null }));
  }

  // separate global (owner == null) and personal (owner.uid matches current user)
  const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
  const globalLinks = allLinks.filter(l => !l.owner);
  let personalLinks = [];

  if (hasDB) {
    if (user) {
      personalLinks = allLinks.filter(l => l.owner && l.owner.uid === user.uid);
    } else {
      // user not signed in: try local personal entries
      personalLinks = personalLocal || [];
    }
  } else {
    // no DB: personal entries stored locally
    personalLinks = personalLocal || [];
  }

  // Build HTML: global first, then personal
  const globalHtml = globalLinks.map(l => `<a href="${escapeHtml(l.url)}" target="_blank">${escapeHtml(l.title)}</a>`).join('');
  let personalHtml = '';
  if (personalLinks.length === 0) {
    personalHtml = `<div class="item muted">No personal links. Add one below.</div>`;
  } else {
    personalHtml = personalLinks.map((l, idx) => {
      // if stored locally it may not have id; use idx as fallback
      const idAttr = l.id ? `data-id="${l.id}"` : `data-local-idx="${idx}"`;
      return `<div class="item" style="display:flex;justify-content:space-between;align-items:center">
                <a href="${escapeHtml(l.url)}" target="_blank">${escapeHtml(l.title)}</a>
                <div style="display:flex;gap:8px;">
                  <button ${idAttr} class="delete-personal" style="background:#ef4444">Delete</button>
                </div>
              </div>`;
    }).join('');
  }

  // Replace accessLinks area with structured sections and Add button
  accessLinksEl.innerHTML = `
    <div class="card-grid" style="grid-template-columns:1fr;">
      <div class="card" style="padding:10px;">
        <strong>Quick Links</strong>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${globalHtml}</div>
      </div>
      <div class="card" style="padding:10px;">
        <strong>Your Links</strong>
        <div id="personalLinksContainer" style="margin-top:8px">${personalHtml}</div>
        <div style="margin-top:10px">
          <button id="addAccessBtn">+ Add Link</button>
        </div>
      </div>
    </div>
  `;

  // wire delete for personal links
  const deleteButtons = accessLinksEl.querySelectorAll('button.delete-personal');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // two cases: Firestore doc (data-id) or local personal (data-local-idx)
      const id = btn.getAttribute('data-id');
      const localIdx = btn.getAttribute('data-local-idx');
      if (id && hasDB) {
        // double-check ownership: only allow deleting if owner matches current user
        if (!user) { alert('Sign in to delete this personal link'); return; }
        // find doc to ensure owner matches - optimistic UI assumes it was shown because owner==user
        try {
          await window.CCDB.deleteAccessLink(id);
          renderAccess();
        } catch (err) {
          console.error('Failed to delete personal access link', err);
          alert('Failed to delete link: ' + (err.message || err));
        }
      } else if (localIdx != null) {
        // remove from local personal array
        const arr = lsLoad(PERSONAL_ACCESS_KEY);
        arr.splice(Number(localIdx), 1);
        lsSave(PERSONAL_ACCESS_KEY, arr);
        renderAccess();
      } else {
        alert('Cannot delete this link');
      }
    });
  });

  // wire Add button
  const addBtn = document.getElementById('addAccessBtn');
  addBtn?.addEventListener('click', async () => {
    const title = prompt('Link title (e.g., Portal)');
    if (!title) return;
    const url = prompt('URL (include https://)');
    if (!url) return;

    // If DB available and user signed in => store as personal in Firestore (owner set)
    if (hasDB && user) {
      try {
        await window.CCDB.addAccessLink({ title, url, owner: { uid: user.uid, name: user.name || user.email } });
        renderAccess();
        return;
      } catch (err) {
        console.error('Failed to create personal link in Firestore', err);
        alert('Failed to add link: ' + (err.message || err));
        return;
      }
    }

    // Otherwise store personal link locally so visible only in this browser
    const arr = lsLoad(PERSONAL_ACCESS_KEY);
    arr.unshift({ title, url, added: Date.now() });
    lsSave(PERSONAL_ACCESS_KEY, arr);
    renderAccess();
  });
}
  renderAccess();

  /* ========= Notes / File Upload ========= */
  const notesListEl = document.getElementById('notesList');
  const uploadForm = document.getElementById('uploadForm');
  const sampleNotesBtn = document.getElementById('importSampleNotes');

  async function renderNotes() {
    if (hasDB) {
      const notes = await window.CCDB.listNotes();
      if (!notes.length) {
        notesListEl.innerHTML = `<div class="item">No notes yet. Upload using the form above.</div>`;
        return;
      }
      notesListEl.innerHTML = notes.map((n, idx) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> <small>(${escapeHtml(n.subject||'')})</small>
          <div class="muted">${n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
          <div class="row" style="margin-top:8px">
            <a class="btn-download" data-id="${n.id}" href="${n.url}" target="_blank"><button>Download</button></a>
            <button data-delete="${n.id}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
      // wire delete
      notesListEl.querySelectorAll('button[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this note?')) return;
          const id = btn.dataset.delete;
          await window.CCDB.deleteNote(id);
          renderNotes();
        });
      });
    } else {
      const notes = lsLoad(NOTES_KEY);
      if (!notes.length) {
        notesListEl.innerHTML = `<div class="item">No notes yet. Upload using the form above.</div>`;
        return;
      }
      notesListEl.innerHTML = notes.map((n, idx) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> <small>(${escapeHtml(n.subject)})</small>
          <div class="muted">${new Date(n.added).toLocaleString()}</div>
          <div class="row" style="margin-top:8px">
            <button data-download="${idx}">Download</button>
            <button data-delete="${idx}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
      // wire download/delete (fallback)
      notesListEl.querySelectorAll('button[data-download]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.download);
          const note = lsLoad(NOTES_KEY)[idx];
          if (!note) return;
          const link = document.createElement('a');
          link.href = note.data;
          link.download = note.filename || `note_${idx}`;
          document.body.appendChild(link);
          link.click(); link.remove();
        });
      });
      notesListEl.querySelectorAll('button[data-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Delete this note?')) return;
          const idx = Number(btn.dataset.delete);
          const arr = lsLoad(NOTES_KEY);
          arr.splice(idx,1);
          lsSave(NOTES_KEY, arr);
          renderNotes();
        });
      });
    }
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('noteSubject').value.trim();
    const title = document.getElementById('noteTitle').value.trim();
    const fileInput = document.getElementById('noteFile');
    const file = fileInput.files?.[0];
    if (!file) { alert('Select a file'); return; }

    if (hasDB) {
      // owner info from auth if available
      const owner = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
      try {
        await window.CCDB.uploadNote({ file, subject, title, owner });
        uploadForm.reset();
        renderNotes();
      } catch (err) {
        alert('Upload failed: ' + (err.message || err));
        console.error(err);
      }
    } else {
      // fallback: store data URL in localStorage (existing behavior)
      const data = await readFileAsDataURL(file);
      const arr = lsLoad(NOTES_KEY);
      arr.unshift({
        filename: file.name,
        subject,
        title,
        data,
        added: Date.now()
      });
      lsSave(NOTES_KEY, arr);
      uploadForm.reset();
      renderNotes();
    }
  });

  sampleNotesBtn.addEventListener('click', async () => {
    if (hasDB) {
      // create two tiny sample notes as plain text files in storage
      const blob1 = new Blob(["Sample note content (DSA)"], { type: 'text/plain' });
      const file1 = new File([blob1], 'DSA-lecture1.txt');
      const blob2 = new Blob(["Sample note content (Math)"], { type: 'text/plain' });
      const file2 = new File([blob2], 'Math-Discrete.txt');
      try {
        await window.CCDB.uploadNote({ file: file1, subject: 'Data Structures', title: 'Lecture 1 - Intro' });
        await window.CCDB.uploadNote({ file: file2, subject: 'Mathematics', title: 'Discrete Math Notes' });
        renderNotes();
      } catch (e) { console.error(e); alert('Import sample failed'); }
    } else {
      const sample = [
        {filename:'DSA-lecture1.pdf', subject:'Data Structures', title:'Lecture 1 - Intro', added:Date.now()-86400000, data: samplePDFDataURL()},
        {filename:'Math-Discrete.pdf', subject:'Mathematics', title:'Discrete Math Notes', added:Date.now()-43200000, data: samplePDFDataURL()},
      ];
      lsSave(NOTES_KEY, sample.concat(lsLoad(NOTES_KEY)));
      renderNotes();
    }
  });

  function readFileAsDataURL(file){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function samplePDFDataURL(){
    const txt = "Sample note content - replace with real PDF/Docs in production.";
    return 'data:text/plain;base64,' + btoa(txt);
  }

  renderNotes();

  /* ========= Discussion Forum ========= */
  const postsEl = document.getElementById('posts');
  const postForm = document.getElementById('postForm');

  async function renderPosts() {
    if (hasDB) {
      const posts = await window.CCDB.listPosts();
      if (!posts.length) { postsEl.innerHTML = `<div class="item">No posts yet. Start a conversation!</div>`; return; }
      postsEl.innerHTML = posts.map(p => `
        <div class="item">
          <strong>${escapeHtml(p.topic)}</strong> • <small>${escapeHtml(p.author?.name || p.author || 'Anonymous')}</small>
          <div class="muted">${p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : ''}</div>
          <p>${escapeHtml(p.content)}</p>
          <div class="row">
            <button data-reply="${p.id}">Reply</button>
            <button data-delete="${p.id}" style="background:#ef4444">Delete</button>
          </div>
          <div class="replies" style="margin-top:8px">${(p.replies||[]).map(r => `<div class="item"><small>${escapeHtml(r.author)}:</small> ${escapeHtml(r.text)}</div>`).join('')}</div>
        </div>
      `).join('');
      postsEl.querySelectorAll('button[data-reply]').forEach(b => {
        b.addEventListener('click', async () => {
          const id = b.dataset.reply;
          const name = prompt('Your name') || 'Anonymous';
          const text = prompt('Reply text:');
          if (!text) return;
          await window.CCDB.replyToPost(id, { author: name, text });
          renderPosts();
        });
      });
      postsEl.querySelectorAll('button[data-delete]').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete this post?')) return;
          await window.CCDB.deletePost(b.dataset.delete);
          renderPosts();
        });
      });
    } else {
      const posts = lsLoad(POSTS_KEY);
      if (posts.length === 0) { postsEl.innerHTML = `<div class="item">No posts yet. Start a conversation!</div>`; return; }
      postsEl.innerHTML = posts.map((p, idx) => `
        <div class="item">
          <strong>${escapeHtml(p.topic)}</strong> • <small>${escapeHtml(p.author)}</small>
          <div class="muted">${new Date(p.added).toLocaleString()}</div>
          <p>${escapeHtml(p.content)}</p>
          <div class="row">
            <button data-reply="${idx}">Reply</button>
            <button data-delete="${idx}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
      // local reply/delete handlers (omitted to keep fallback simple)
    }
  }

  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const authorName = document.getElementById('postAuthor').value.trim();
    const topic = document.getElementById('postTopic').value.trim();
    const content = document.getElementById('postContent').value.trim();

    if (hasDB) {
      const owner = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
      const author = owner ? { uid: owner.uid, name: owner.name || owner.email } : authorName || 'Anonymous';
      await window.CCDB.createPost({ author, topic, content });
      postForm.reset();
      renderPosts();
    } else {
      const arr = lsLoad(POSTS_KEY);
      arr.unshift({ author: authorName, topic, content, added: Date.now(), replies: [] });
      lsSave(POSTS_KEY, arr);
      postForm.reset();
      renderPosts();
    }
  });

  document.getElementById('clearForumBtn').addEventListener('click', async () => {
    if (!confirm('Clear entire forum?')) return;
    if (hasDB) {
      // for demo: delete all documents. Be careful - Firestore bulk deletions should use admin or batched writes in prod.
      const posts = await window.CCDB.listPosts();
      await Promise.all(posts.map(p => window.CCDB.deletePost(p.id)));
      renderPosts();
    } else {
      lsSave(POSTS_KEY, []);
      renderPosts();
    }
  });

  renderPosts();

  /* ========= News ========= */
  const newsList = document.getElementById('newsList');
  const newsForm = document.getElementById('newsForm');
  async function renderNews() {
    if (hasDB) {
      const items = await window.CCDB.listNews();
      if (!items.length) { newsList.innerHTML = `<div class="item">No news yet.</div>`; return; }
      newsList.innerHTML = items.map(n => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> <small>(${escapeHtml(n.tag||'General')})</small>
          <div class="muted">${n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
          <p>${escapeHtml(n.body)}</p>
          <div class="row">
            <button data-delete="${n.id}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
      newsList.querySelectorAll('button[data-delete]').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete news item?')) return;
          await window.CCDB.deleteNews(b.dataset.delete);
          renderNews();
        });
      });
    } else {
      const items = lsLoad(NEWS_KEY);
      if (items.length === 0) { newsList.innerHTML = `<div class="item">No news yet.</div>`; return; }
      newsList.innerHTML = items.map((n, idx) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> <small>(${escapeHtml(n.tag||'General')})</small>
          <div class="muted">${new Date(n.added).toLocaleString()}</div>
          <p>${escapeHtml(n.body)}</p>
          <div class="row">
            <button data-delete="${idx}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
    }
  }

  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('newsTitle').value.trim();
    const tag = document.getElementById('newsTag').value.trim();
    const body = document.getElementById('newsBody').value.trim();
    if (hasDB) {
      await window.CCDB.createNews({ title, tag, body, author: (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null });
      newsForm.reset();
      renderNews();
    } else {
      const arr = lsLoad(NEWS_KEY);
      arr.unshift({ title, tag, body, added: Date.now() });
      lsSave(NEWS_KEY, arr);
      newsForm.reset();
      renderNews();
    }
  });

  document.getElementById('clearNewsBtn').addEventListener('click', async () => {
    if (!confirm('Clear all news?')) return;
    if (hasDB) {
      const list = await window.CCDB.listNews();
      await Promise.all(list.map(i => window.CCDB.deleteNews(i.id)));
      renderNews();
    } else {
      lsSave(NEWS_KEY, []);
      renderNews();
    }
  });

  renderNews();

  /* ========= Schedule ========= */
  const scheduleList = document.getElementById('scheduleList');
  const eventForm = document.getElementById('eventForm');
  async function renderSchedule() {
    if (hasDB) {
      const events = await window.CCDB.listEvents();
      if (!events.length) { scheduleList.innerHTML = `<div class="item">No events yet. Add classes, exams or events above.</div>`; return; }
      events.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      scheduleList.innerHTML = events.map(e => `
        <div class="item">
          <strong>${escapeHtml(e.title)}</strong> <small>${escapeHtml(e.type)}</small>
          <div class="muted">${escapeHtml(e.date)} ${e.time ? '@ '+escapeHtml(e.time):''}</div>
          <div class="row">
            <button data-delete="${e.id}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
      scheduleList.querySelectorAll('button[data-delete]').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete event?')) return;
          await window.CCDB.deleteEvent(b.dataset.delete);
          renderSchedule();
        });
      });
    } else {
      const events = lsLoad(SCHEDULE_KEY);
      if (!events.length) { scheduleList.innerHTML = `<div class="item">No events yet. Add classes, exams or events above.</div>`; return; }
      events.sort((a,b)=>new Date(a.date) - new Date(b.date));
      scheduleList.innerHTML = events.map((e, idx) => `
        <div class="item">
          <strong>${escapeHtml(e.title)}</strong> <small>${escapeHtml(e.type)}</small>
          <div class="muted">${new Date(e.date).toLocaleDateString()} ${e.time ? '@ '+escapeHtml(e.time):''}</div>
          <div class="row">
            <button data-delete="${idx}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
    }
  }

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('eventTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const type = document.getElementById('eventType').value;
    if (!date || !title) return;
    if (hasDB) {
      await window.CCDB.createEvent({ title, date, time, type });
      eventForm.reset();
      renderSchedule();
    } else {
      const arr = lsLoad(SCHEDULE_KEY);
      arr.push({ title, date, time, type });
      lsSave(SCHEDULE_KEY, arr);
      eventForm.reset();
      renderSchedule();
    }
  });

  document.getElementById('importSampleSchedule').addEventListener('click', async () => {
    if (hasDB) {
      const sample = [
        { title: 'DSA Lecture', date: shiftDate(1), time:'09:00', type:'class' },
        { title: 'Math Exam', date: shiftDate(7), time:'10:00', type:'exam' },
        { title: 'Career Workshop', date: shiftDate(3), time:'14:00', type:'workshop' }
      ];
      for (const s of sample) await window.CCDB.createEvent(s);
      renderSchedule();
    } else {
      const sample = [
        {title:'DSA Lecture', date: shiftDate(1), time:'09:00', type:'class'},
        {title:'Math Exam', date: shiftDate(7), time:'10:00', type:'exam'},
        {title:'Career Workshop', date: shiftDate(3), time:'14:00', type:'workshop'}
      ];
      lsSave(SCHEDULE_KEY, sample.concat(lsLoad(SCHEDULE_KEY)));
      renderSchedule();
    }
  });

  renderSchedule();

  /* ========= Interactive Campus Map (unchanged) ========= */
  const mapFrom = document.getElementById('mapFrom');
  const mapTo = document.getElementById('mapTo');
  const navigateBtn = document.getElementById('navigateBtn');
  const resetMapBtn = document.getElementById('resetMapBtn');
  const campusMap = document.getElementById('campusMap');
  const pathsLayer = document.getElementById('pathsLayer');
  const walker = document.getElementById('walker');

  const nodes = {
    Gate: {id:'gate', x: 80, y: 250},
    Admin: {id:'admin', x: 260, y:95},
    Library: {id:'library', x:560, y:95},
    'Lecture Hall': {id:'lecture', x:270, y:280},
    Labs: {id:'lab', x:630, y:280},
    Canteen: {id:'canteen', x:400, y:415}
  };

  function populateMapSelects(){
    Object.keys(nodes).forEach(name => {
      const opt1 = document.createElement('option'); opt1.value = name; opt1.textContent = name;
      const opt2 = document.createElement('option'); opt2.value = name; opt2.textContent = name;
      mapFrom.appendChild(opt1); mapTo.appendChild(opt2);
    });
  }
  populateMapSelects();

  const paths = {
    'Gate->Admin': [{x:80,y:250},{x:160,y:200},{x:230,y:150},{x:260,y:95}],
    'Gate->Lecture Hall': [{x:80,y:250},{x:160,y:250},{x:230,y:250},{x:270,y:280}],
    'Admin->Library': [{x:260,y:95},{x:380,y:95},{x:500,y:95},{x:560,y:95}],
    'Lecture Hall->Labs': [{x:270,y:280},{x:400,y:280},{x:540,y:280},{x:630,y:280}],
    'Canteen->Lecture Hall': [{x:400,y:415},{x:350,y:350},{x:300,y:300},{x:270,y:280}],
    'Library->Labs': [{x:560,y:95},{x:560,y:150},{x:560,y:200},{x:560,y:250},{x:560,y:280},{x:630,y:280}]
  };

  function findPath(from, to){
    const direct = `${from}->${to}`;
    const reverse = `${to}->${from}`;
    if (paths[direct]) return paths[direct];
    if (paths[reverse]) return [...paths[reverse]].reverse();
    const via = 'Lecture Hall';
    if (from !== via && to !== via) {
      const p1 = findPath(from, via);
      const p2 = findPath(via, to);
      if (p1 && p2) return p1.concat(p2.slice(1));
    }
    return [{x:nodes[from].x,y:nodes[from].y},{x:nodes[to].x,y:nodes[to].y}];
  }

  function drawPath(ptArray){
    pathsLayer.innerHTML = '';
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', ptArray.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class','pathline');
    pathsLayer.appendChild(poly);
    const anim = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    anim.setAttribute('points', ptArray.map(p => `${p.x},${p.y}`).join(' '));
    anim.setAttribute('class','pathAnim');
    anim.setAttribute('stroke-dasharray','0 2000');
    pathsLayer.appendChild(anim);
  }

  function animateWalker(ptArray){
    walker.setAttribute('visibility','visible');
    const positions = [];
    for (let s=0; s<ptArray.length-1; s++){
      const a = ptArray[s], b = ptArray[s+1];
      const segLen = Math.hypot(b.x-a.x,b.y-a.y);
      const segSteps = Math.max(8, Math.round((segLen/10)*4));
      for (let k=0;k<segSteps;k++){
        const t = k/segSteps;
        positions.push({x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t});
      }
    }
    positions.push(ptArray[ptArray.length-1]);
    let idx = 0;
    const interval = setInterval(()=>{
      const p = positions[idx];
      walker.setAttribute('cx', p.x);
      walker.setAttribute('cy', p.y);
      idx++;
      if (idx>=positions.length){
        clearInterval(interval);
        setTimeout(()=> walker.setAttribute('visibility','hidden'), 800);
      }
    }, 18);
  }

  navigateBtn.addEventListener('click', () => {
    const from = mapFrom.value;
    const to = mapTo.value;
    if (!from || !to || from === to) { alert('Select different From and To'); return; }
    const pt = findPath(from, to);
    drawPath(pt);
    animateWalker(pt);
  });

  resetMapBtn.addEventListener('click', () => {
    pathsLayer.innerHTML = '';
    walker.setAttribute('visibility','hidden');
  });

  Object.keys(nodes).forEach(name => {
    const el = document.getElementById(nodes[name].id);
    el?.addEventListener('click', () => {
      if (!mapFrom.value) mapFrom.value = name;
      else if (!mapTo.value) mapTo.value = name;
      else {
        mapFrom.value = name;
        mapTo.value = '';
      }
    });
  });

  /* ========= Global Search ========= */
  document.getElementById('globalSearch').addEventListener('input', async (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    let notes = [], posts = [], news = [];
    try {
      if (hasDB) {
        notes = await window.CCDB.listNotes();
        posts = await window.CCDB.listPosts();
        news = await window.CCDB.listNews();
      } else {
        notes = lsLoad(NOTES_KEY);
        posts = lsLoad(POSTS_KEY);
        news = lsLoad(NEWS_KEY);
      }
    } catch (err) { console.error(err); }
    const msg = `Search results for "${q}":\n\nNotes: ${notes.filter(n => (n.title + ' ' + (n.subject||'')).toLowerCase().includes(q)).length}\nForum posts: ${posts.filter(p => (p.topic + ' ' + (p.content||'')).toLowerCase().includes(q)).length}\nNews: ${news.filter(n => (n.title + ' ' + (n.body||'')).toLowerCase().includes(q)).length}\n\nOpen the respective tab for details.`;
    alert(msg);
  });

  /* Helpers */
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shiftDate(days){ const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

  // seed demo data (only when using localStorage fallback)
  if (!hasDB) {
    if (lsLoad(NEWS_KEY).length === 0) {
      lsSave(NEWS_KEY, [
        {title:'Welcome back! Semester starts', tag:'General', body:'Classes start on Monday. Check your timetable.', added:Date.now()-86400000},
        {title:'Placement drive next week', tag:'Placement', body:'Company X on campus. Pre-registration required.', added:Date.now()-3600000}
      ]);
    }
    if (lsLoad(POSTS_KEY).length === 0) {
      lsSave(POSTS_KEY, [{author:'Sana', topic:'Project Team', content:'Anyone free to join a ML project?', added:Date.now()-7200000, replies:[]}]);
    }
    if (lsLoad(SCHEDULE_KEY).length === 0) {
      lsSave(SCHEDULE_KEY, [{title:'Orientation', date:shiftDate(0), time:'10:00', type:'event'}]);
    }
  }

  // small dev utils
  window.__cc_clearAll = async () => {
    if (hasDB) {
      if (!confirm('This will delete all demo data from Firestore collections (posts,news,notes,schedule,access). Continue?')) return;
      const posts = await window.CCDB.listPosts(); await Promise.all(posts.map(p=>window.CCDB.deletePost(p.id)));
      const news = await window.CCDB.listNews(); await Promise.all(news.map(n=>window.CCDB.deleteNews(n.id)));
      const notes = await window.CCDB.listNotes(); await Promise.all(notes.map(n=>window.CCDB.deleteNote(n.id)));
      const ev = await window.CCDB.listEvents(); await Promise.all(ev.map(e=>window.CCDB.deleteEvent(e.id)));
      const access = await window.CCDB.listAccessLinks(); await Promise.all(access.map(a=>window.CCDB.deleteAccessLink(a.id)));
      alert('Cleared demo Firestore data (best-effort).');
      location.reload();
    } else {
      ['cc_notes_v1','cc_posts_v1','cc_news_v1','cc_schedule_v1','cc_access_v1'].forEach(k=>localStorage.removeItem(k));
      location.reload();
    }
  };
});

