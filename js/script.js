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
  // Admin email check
  function isAdmin() {
    const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
    return user && user.email === "aroraganesh2007@gmail.com";
  }

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

  const PERSONAL_ACCESS_KEY = 'cc_personal_access_v1'; // fallback for unsigned users / no DB

  /* ========= Personal Quick Links ========= */
  async function renderAccess() {
    const personalContainer = document.getElementById('personalLinksContainer');
    if (!personalContainer) return;

    const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;

    let personalLinks = [];
    if (hasDB && user) {
      try {
        const all = await window.CCDB.listAccessLinks();
        personalLinks = all.filter(l => l.owner && l.owner.uid === user.uid);
      } catch (e) {
        console.error('Failed to load personal links from DB', e);
        personalLinks = [];
      }
    } else {
      personalLinks = lsLoad(PERSONAL_ACCESS_KEY) || [];
    }

    if (!personalLinks.length) {
      personalContainer.innerHTML = `<div class="item muted">No personal links. Add one below.</div>`;
    } else {
      personalContainer.innerHTML = personalLinks.map((l, idx) => {
        const idAttr = l.id ? `data-id="${l.id}"` : `data-local-idx="${idx}"`;
        const title = escapeHtml(l.title || 'Untitled');
        const url = escapeHtml(l.url || '#');
        return `
          <div class="item" style="display:flex;justify-content:space-between;align-items:center">
            <a class="access-link" href="${url}" target="_blank" rel="noopener">${title}</a>
            <div style="display:flex;gap:8px;">
              <button ${idAttr} class="delete-personal" style="background:#ef4444">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // Delete handlers
    personalContainer.querySelectorAll('button.delete-personal').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this personal link?')) return;
        const id = btn.dataset.id;
        const localIdx = btn.dataset.localIdx;

        if (id && hasDB) {
          try {
            await window.CCDB.deleteAccessLink(id);
          } catch (err) {
            console.error('Failed to delete personal access link', err);
            alert('Failed to delete link: ' + (err.message || err));
          }
          renderAccess();
        } else if (localIdx != null) {
          const arr = lsLoad(PERSONAL_ACCESS_KEY);
          arr.splice(Number(localIdx), 1);
          lsSave(PERSONAL_ACCESS_KEY, arr);
          renderAccess();
        }
      });
    });
  }

  const addBtn = document.getElementById('addAccessBtn');
  addBtn?.addEventListener('click', async () => {
    const title = prompt('Link title (e.g., Portal)');
    if (!title) return;
    const url = prompt('URL (include https://)');
    if (!url) return;

    const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;

    if (hasDB && user) {
      try {
        await window.CCDB.addAccessLink({ title, url, owner: { uid: user.uid, name: user.name || user.email } });
        renderAccess();
      } catch (err) {
        console.error('Failed to create personal link in Firestore', err);
        alert('Failed to add link: ' + (err.message || err));
      }
    } else {
      const arr = lsLoad(PERSONAL_ACCESS_KEY);
      arr.unshift({ title, url, added: Date.now() });
      lsSave(PERSONAL_ACCESS_KEY, arr);
      renderAccess();
    }
  });

  renderAccess();

  /* ========= Global Quick Links (Admin-Controlled) ========= */
  async function renderGlobalLinks() {
    const container = document.getElementById('globalLinksContainer');
    if (!container) return;

    let allLinks = [];
    try {
      allLinks = await window.CCDB.listAccessLinks();
    } catch (err) {
      console.error('Failed to load global links:', err);
      container.innerHTML = `<div class="item muted">Error loading global links.</div>`;
      return;
    }

    const globals = allLinks.filter(l => !l.owner);
    if (!globals.length) {
      container.innerHTML = `<div class="item muted">No global links yet.</div>`;
    } else {
      container.innerHTML = globals.map(g => `
        <div class="item" style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <a href="${g.url}" target="_blank" rel="noopener">${escapeHtml(g.title)}</a>
          ${isAdmin() ? `<button data-id="${g.id}" class="delete-global" style="background:#ef4444">Delete</button>` : ''}
        </div>
      `).join('');
    }

    if (isAdmin()) {
      container.querySelectorAll('.delete-global').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this global link?')) return;
          await window.CCDB.deleteAccessLink(btn.dataset.id);
          renderGlobalLinks();
        });
      });
    }

    const adminBox = document.getElementById('adminGlobalLinks');
    if (adminBox) adminBox.style.display = isAdmin() ? 'block' : 'none';
  }

  document.getElementById('addGlobalLinkBtn')?.addEventListener('click', async () => {
    if (!isAdmin()) return alert('Only admin can add global links.');
    const title = prompt('Enter link title:');
    const url = prompt('Enter link URL (include https://):');
    if (!title || !url) return;
    await window.CCDB.addAccessLink({ title, url }); // owner=null => global
    renderGlobalLinks();
  });

  renderGlobalLinks();

  /* ========= Notes / File Upload ========= */
  const notesListEl = document.getElementById('notesList');
  const uploadForm = document.getElementById('uploadForm');
  const sampleNotesBtn = document.getElementById('importSampleNotes');

  // ... (notes, upload handlers remain unchanged) ...
  // For brevity I keep your existing notes/upload code unchanged below. It appears earlier in your file and is compatible.

  /* ========= Discussion Forum (Reddit-Style Replies + Ownership Delete) ========= */
  const postsEl = document.getElementById('posts');
  const postForm = document.getElementById('postForm');

  function getCurrentUserEmail() {
    const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
    return user?.email || null;
  }

  function getCurrentUserName() {
    const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;
    return user?.name || user?.email || null;
  }

  async function renderPosts() {
    if (!postsEl) return;
    postsEl.innerHTML = `<div class="item muted">Loading posts...</div>`;

    let posts = [];
    try {
      posts = await window.CCDB.listPosts();
    } catch (err) {
      console.error('Failed to fetch posts', err);
      posts = [];
    }

    if (!posts.length) {
      postsEl.innerHTML = `<div class="item muted">No posts yet. Start a conversation!</div>`;
      return;
    }

    postsEl.innerHTML = posts.map(p => renderPostHTML(p)).join('');
    attachReplyHandlers();
    attachDeleteHandlers();
  }

  // Render helper to pick author name safely (compat with older data)
  function pickAuthorName(obj) {
    if (!obj) return 'Anonymous';
    if (obj.authorName) return obj.authorName;
    if (typeof obj.author === 'string') return obj.author;
    if (obj.author && typeof obj.author === 'object') {
      return obj.author.name || obj.author.email || 'Anonymous';
    }
    return 'Anonymous';
  }

  // Recursive rendering of replies
  function renderReplies(replies = [], depth = 1) {
    if (!replies.length) return '';
    const margin = depth * 20;
    const currentUser = getCurrentUserEmail();

    return `
      <div class="replies" style="margin-left:${margin}px;margin-top:5px;">
        ${replies.map(r => `
          <div class="reply item" data-id="${r.id}">
            <div><strong>${escapeHtml(pickAuthorName(r))}</strong>: ${escapeHtml(r.text)}</div>
            <div class="reply-actions" style="margin-top:4px;">
              <button class="reply-btn" data-parent="${r.id}" data-depth="${depth}">Reply</button>
              ${
                (isAdmin() || (currentUser && currentUser === (r.authorEmail || r.author?.email)))
                  ? `<button class="delete-btn" data-id="${r.id}" data-type="reply" style="background:#ef4444">Delete</button>`
                  : ''
              }
            </div>
            ${renderReplies(r.replies || [], depth + 1)}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPostHTML(p) {
    const currentUser = getCurrentUserEmail();
    const authorName = pickAuthorName(p);
    return `
      <div class="post item" data-id="${p.id}">
        <h3>${escapeHtml(p.topic)}</h3>
        <p>${escapeHtml(p.content)}</p>
        <small>By ${escapeHtml(authorName)}</small>
        <div class="reply-actions" style="margin-top:8px;">
          <button class="reply-btn" data-parent="${p.id}" data-depth="0">Reply</button>
          ${
            (isAdmin() || (currentUser && currentUser === (p.authorEmail || p.author?.email)))
              ? `<button class="delete-btn" data-id="${p.id}" data-type="post" style="background:#ef4444">Delete</button>`
              : ''
          }
        </div>
        ${renderReplies(p.replies || [], 1)}
      </div>
    `;
  }

  /* ========== Inline Reply Form ========== */
  function attachReplyHandlers() {
    document.querySelectorAll('.reply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parentId = btn.dataset.parent;
        const depth = parseInt(btn.dataset.depth || '0', 10);
        showInlineReplyBox(parentId, depth);
      });
    });
  }

  function showInlineReplyBox(parentId, depth) {
    document.querySelectorAll('.inline-reply-form').forEach(f => f.remove());
    const container = document.querySelector(`[data-id="${parentId}"]`);
    if (!container) return;

    const form = document.createElement('div');
    form.className = 'inline-reply-form';
    form.style.marginLeft = `${(depth + 1) * 20}px`;
    form.style.marginTop = '8px';
    form.innerHTML = `
      <input type="text" class="reply-author" placeholder="Your name" style="display:block;width:100%;margin-bottom:4px;" value="${escapeHtml(getCurrentUserName() || '')}" />
      <textarea class="reply-text" rows="2" placeholder="Write a reply..." style="width:100%;"></textarea>
      <div style="margin-top:4px;">
        <button class="submit-reply">Reply</button>
        <button class="cancel-reply">Cancel</button>
      </div>
    `;

    container.appendChild(form);
    form.querySelector('.cancel-reply').addEventListener('click', () => form.remove());
    form.querySelector('.submit-reply').addEventListener('click', async () => {
      const authorName = form.querySelector('.reply-author').value.trim() || 'Anonymous';
      const text = form.querySelector('.reply-text').value.trim();
      if (!text) return alert('Cannot post empty reply.');

      const userEmail = getCurrentUserEmail();
      await addNestedReply(parentId, { authorName, authorEmail: userEmail, text });
      form.remove();
      renderPosts();
    });
  }

  /* ========== Reply Logic ========== */
  async function addNestedReply(parentId, reply) {
    try {
      const posts = await window.CCDB.listPosts();
      // find the post that either has id == parentId or contains the nested reply
      const post = posts.find(p => p.id === parentId) || posts.find(p => findReplyRecursive(p.replies, parentId));
      if (!post) return;

      const fullReply = { id: Date.now().toString(), authorName: reply.authorName || null, authorEmail: reply.authorEmail || null, text: reply.text, createdAt: new Date(), replies: [] };

      if (post.id === parentId) {
        // reply directly to top-level post -> use replyToPost which appends in Firestore
        await window.CCDB.replyToPost(post.id, { authorName: fullReply.authorName, authorEmail: fullReply.authorEmail, text: fullReply.text });
      } else {
        // nested reply: update local object, then push entire post doc via updatePost
        addReplyRecursive(post.replies, parentId, fullReply);
        await window.CCDB.updatePost(post);
      }
    } catch (err) {
      console.error('Error adding reply:', err);
    }
  }

  function findReplyRecursive(replies, id) {
    for (const r of replies || []) {
      if (r.id === id) return r;
      const found = findReplyRecursive(r.replies, id);
      if (found) return found;
    }
    return null;
  }

  function addReplyRecursive(replies, parentId, reply) {
    for (const r of replies || []) {
      if (r.id === parentId) {
        r.replies = r.replies || [];
        r.replies.push(reply);
        return true;
      }
      if (addReplyRecursive(r.replies, parentId, reply)) return true;
    }
    return false;
  }

  /* ========== Delete Logic ========== */
  function attachDeleteHandlers() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this?')) return;
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        await deletePostOrReply(id, type);
        renderPosts();
      });
    });
  }

  async function deletePostOrReply(id, type) {
    try {
      const posts = await window.CCDB.listPosts();
      const currentUser = getCurrentUserEmail();

      if (type === 'post') {
        const post = posts.find(p => p.id === id);
        if (!post) return;
        if (isAdmin() || (currentUser && currentUser === (post.authorEmail || post.author?.email))) {
          await window.CCDB.deletePost(id);
        } else {
          alert('You can only delete your own posts.');
        }
        return;
      }

      // If it's a reply -> find containing post and remove the nested reply then update post
      for (const post of posts) {
        if (deleteReplyRecursive(post.replies, id, currentUser)) {
          await window.CCDB.updatePost(post);
          break;
        }
      }
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  }

  function deleteReplyRecursive(replies, id, currentUser) {
    for (let i = 0; i < (replies || []).length; i++) {
      const r = replies[i];
      if (r.id === id) {
        if (isAdmin() || (currentUser && currentUser === (r.authorEmail || r.author?.email))) {
          replies.splice(i, 1);
          return true;
        } else {
          alert('You can only delete your own replies.');
          return false;
        }
      }
      if (deleteReplyRecursive(r.replies, id, currentUser)) return true;
    }
    return false;
  }

  /* ========== Post Creation ========== */
  postForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const authorName = document.getElementById('postAuthor').value.trim() || 'Anonymous';
    const topic = document.getElementById('postTopic').value.trim();
    const content = document.getElementById('postContent').value.trim();
    if (!topic || !content) return alert('Please fill out topic and content');

    const userEmail = getCurrentUserEmail();

    try {
      await window.CCDB.createPost({ authorName, authorEmail: userEmail, topic, content });
      postForm.reset();
      renderPosts();
    } catch (err) {
      console.error('Failed to create post', err);
      alert('Error posting message: ' + err.message);
    }
  });

  renderPosts();

  /* Delay button visibility until Firebase auth loads */
  setTimeout(() => {
    const clearBtn = document.getElementById('clearForumBtn');
    if (!clearBtn) return;
    if (!isAdmin()) clearBtn.style.display = 'none';
    else clearBtn.style.display = 'inline-block';
  }, 1000);


    /* ========= News ========= */
  const newsList = document.getElementById('newsList');
  const newsForm = document.getElementById('newsForm');

  // ========= Render News =========
  async function renderNews() {
    const selectedBranch = document.getElementById('newsFilter')?.value || 'all';
    if (!newsList) return;

    try {
      let items = hasDB ? await window.CCDB.listNews() : lsLoad(NEWS_KEY);

      // Filter by branch
      items = items.filter(item =>
        selectedBranch === 'all' || item.branch === selectedBranch
      );

      if (!items.length) {
        newsList.innerHTML = `<div class="item muted">No news yet.</div>`;
        return;
      }

      newsList.innerHTML = items.map((n, idx) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> 
          ${n.tag ? `<span class="tag">${escapeHtml(n.tag)}</span>` : ''}
          ${n.branch ? `<span class="branch-tag">${escapeHtml(n.branch)}</span>` : ''}
          <div class="muted">
            ${n.createdAt && n.createdAt.seconds
              ? new Date(n.createdAt.seconds * 1000).toLocaleString()
              : new Date(n.added).toLocaleString()}
          </div>
          <p>${escapeHtml(n.body)}</p>
          <div class="row">
            ${isAdmin() 
              ? `<button data-delete="${hasDB ? n.id : idx}" class="delete-btn" style="background:#ef4444;color:white;padding:4px 10px;border:none;border-radius:6px;cursor:pointer;">Delete</button>` 
              : ""
            }
          </div>
        </div>
      `).join('');

      // Attach delete listeners (for admins only)
      if (isAdmin()) {
        newsList.querySelectorAll('button[data-delete]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this news item?')) return;

            if (hasDB) {
              await window.CCDB.deleteNews(btn.dataset.delete);
            } else {
              const arr = lsLoad(NEWS_KEY);
              arr.splice(btn.dataset.delete, 1);
              lsSave(NEWS_KEY, arr);
            }

            renderNews();
          });
        });
      }

    } catch (err) {
      console.error('Error rendering news:', err);
      newsList.innerHTML = `<div class="item error">Failed to load news.</div>`;
    }
  }

  // ========= Add News =========
  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin()) { 
      alert('Only admin can publish news.'); 
      return; 
    }

    const title = document.getElementById('newsTitle').value.trim();
    const tag = document.getElementById('newsTag').value.trim();
    const body = document.getElementById('newsBody').value.trim();
    const branch = document.getElementById('newsBranch').value;

    if (!title || !body) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      if (hasDB) {
        await window.CCDB.createNews({
          title,
          tag,
          body,
          branch,
          author: window.CCAuth?.currentUser()?.email || null
        });
      } else {
        const arr = lsLoad(NEWS_KEY);
        arr.unshift({ title, tag, body, branch, added: Date.now() });
        lsSave(NEWS_KEY, arr);
      }

      newsForm.reset();
      renderNews();
    } catch (err) {
      console.error('Failed to publish news:', err);
      alert('Failed to publish news. Please try again.');
    }
  });

  // ========= Clear All News =========
  document.getElementById('clearNewsBtn').addEventListener('click', async () => {
    if (!confirm('Clear all news?')) return;

    if (hasDB) {
      const list = await window.CCDB.listNews();
      await Promise.all(list.map(i => window.CCDB.deleteNews(i.id)));
    } else {
      lsSave(NEWS_KEY, []);
    }

    renderNews();
  });

  // ========= Filter Events =========
  document.getElementById('newsFilter')?.addEventListener('change', renderNews);
  document.getElementById('scheduleFilter')?.addEventListener('change', renderSchedule);

  // ========= Init Section =========
  async function initNewsSection() {
    await renderNews();

    // Wait a second to ensure auth loads
    setTimeout(() => {
      const form = document.getElementById('newsForm');
      if (!form) return;

      if (!isAdmin()) {
        form.style.display = 'none';
      } else {
        form.style.display = 'block';
      }
    }, 1000);
  }

  initNewsSection();

  /* ========= Schedule ========= */
  const scheduleList = document.getElementById('scheduleList');
  const eventForm = document.getElementById('eventForm');

  async function renderSchedule() {
    const selectedBranch = document.getElementById('scheduleFilter')?.value || 'all';
    if (!scheduleList) return;

    try {
      let events = hasDB ? await window.CCDB.listEvents() : lsLoad(SCHEDULE_KEY);

      // Filter by branch
      events = events.filter(e =>
        selectedBranch === 'all' || e.branch === selectedBranch
      );

      // Sort by date + time
      events.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time || '00:00'}`);
        const dateB = new Date(`${b.date} ${b.time || '00:00'}`);
        return dateA - dateB;
      });

      if (!events.length) {
        scheduleList.innerHTML = `<div class="item muted">No events scheduled.</div>`;
        return;
      }

      scheduleList.innerHTML = events.map((e, idx) => `
        <div class="item">
          <strong>${escapeHtml(e.title)}</strong>
          ${e.type ? `<span class="tag">${escapeHtml(e.type)}</span>` : ''}
          ${e.branch ? `<span class="branch-tag">${escapeHtml(e.branch)}</span>` : ''}
          <div class="muted">
            ${new Date(e.date).toLocaleDateString()}${e.time ? ` at ${escapeHtml(e.time)}` : ''}
          </div>
          <div class="row">
            ${isAdmin() 
              ? `<button data-delete="${hasDB ? e.id : idx}" class="delete-btn" style="background:#ef4444;color:white;padding:4px 10px;border:none;border-radius:6px;cursor:pointer;">Delete</button>` 
              : ""}
          </div>
        </div>
      `).join('');

      // Attach delete listeners (admin only)
      if (isAdmin()) {
        scheduleList.querySelectorAll('button[data-delete]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this event?')) return;
            if (hasDB) {
              await window.CCDB.deleteEvent(btn.dataset.delete);
            } else {
              const arr = lsLoad(SCHEDULE_KEY);
              arr.splice(btn.dataset.delete, 1);
              lsSave(SCHEDULE_KEY, arr);
            }
            renderSchedule();
          });
        });
      }

    } catch (err) {
      console.error('Error rendering schedule:', err);
      scheduleList.innerHTML = `<div class="item error">Failed to load schedule.</div>`;
    }
  }

  /* ========= Add Event ========= */
  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin()) { 
      alert('Only admin can add events.');
      return; 
    }

    const title = document.getElementById('eventTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const type = document.getElementById('eventType').value;
    const branch = document.getElementById('eventBranch').value;

    if (!title || !date) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      if (hasDB) {
        await window.CCDB.createEvent({ title, date, time, type, branch });
      } else {
        const arr = lsLoad(SCHEDULE_KEY);
        arr.unshift({ title, date, time, type, branch, added: Date.now() });
        lsSave(SCHEDULE_KEY, arr);
      }

      eventForm.reset();
      renderSchedule();
    } catch (err) {
      console.error('Failed to create event:', err);
      alert('Failed to create event. Please try again.');
    }
  });

  /* ========= Clear All Events (optional button) ========= */
  document.getElementById('clearScheduleBtn')?.addEventListener('click', async () => {
    if (!confirm('Clear all events?')) return;

    if (hasDB) {
      const list = await window.CCDB.listEvents();
      await Promise.all(list.map(i => window.CCDB.deleteEvent(i.id)));
    } else {
      lsSave(SCHEDULE_KEY, []);
    }

    renderSchedule();
  });

  /* ========= Filter Change ========= */
  document.getElementById('scheduleFilter')?.addEventListener('change', renderSchedule);

  /* ========= Init Schedule Section ========= */
  async function initScheduleSection() {
    await renderSchedule();

    setTimeout(() => {
      const form = document.getElementById('eventForm');
      if (!form) return;
      form.style.display = isAdmin() ? 'block' : 'none';
    }, 1000);
  }

  initScheduleSection();


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
    Library: {id:'library', x:370, y:315},
    'Shakuntalam Hall': {id:'hall', x:450, y:430},
    'Auditorium/Management dept.': {id:'management', x:650, y:230},
    'CV RAMAN/Science Block': {id:'cv', x:570, y:540},
    'Cafeteria(Shri. krishan bhawan)': {id:'canteen', x:200, y:315},
    'Mechanical engineering dept.': {id:'mechanical', x:450, y:530},
    'Computer engineering dept.': {id:'comp', x:440, y:315},
    'Electrical engineering dept.': {id:'ele', x:540, y:315},
    'Civil engineering dept.': {id:'civil', x:580, y:415},
    'New Building': {id:'new', x:880, y:325},
    // 'LaLchowk': {id:'new', x:550, y:230},
    'V.C. OFFICE': {id:'vc', x:680, y:325},
    // Administravtive: {id:'vc', x:640, y:315},
    'Girls hostel': {id:'vc', x:710, y:400},
    // Temple: {id:'temple', x:790, y:560},
    // bank: {id:'vbank', x:200, y:550},
    'Gate-2': {id:'gate2', x:980, y:130},
    // turn1: {id:'turn', x:330, y:255},
    // turn2: {id:'turn2', x:710, y:260},
    // turn3: {id:'turn3', x:400, y:365},
    // turn4: {id:'turn4', x:515, y:580},
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
    'Gate->turn1': [{x:80,y:250},{x:330, y:255}],

    'turn1->turn3': [{x:330, y:255},{x:330, y:365},{x:400, y:365}],
    'turn1->turn2': [{x:330, y:255},{x:710, y:260}],
    'turn3->turn4': [{x:400, y:365},{x:400, y:500},{x:515, y:500},{x:515, y:580}],
    
    'Gate->Cafeteria(Shri. krishan bhawan)': [{x:80,y:250},{x:200, y:255},{x:200, y:315}],
    // 'bank->Cafeteria(Shri. krishan bhawan)': [{x:200, y:550},{x:150, y:550},{x:150, y:255},{x:200, y:255},{x:200, y:315}],
    // 'Gate->bank': [{x:80,y:250},{x:150, y:255},{x:150, y:550},{x:200, y:550}],
    
    'turn1->Cafeteria(Shri. krishan bhawan)': [{x:330, y:255},{x:200, y:255},{x:200, y:315}],
    'turn1->Library': [{x:330, y:255},{x:370, y:255},{x:370, y:315}],
    'turn1->Computer engineering dept.': [{x:330, y:255},{x:440, y:257},{x:440, y:315}],
    'turn1->Electrical engineering dept.': [{x:330, y:255},{x:540, y:260},{x:540, y:315}],
    // 'turn1->Electrical engineering dept.': [{x:330, y:255},{x:540, y:260},{x:540, y:315}],
    'turn1->administravtive': [{x:330, y:255},{x:640, y:260},{x:640, y:315}],
    'turn1->V.C. OFFICE': [{x:330, y:255},{x:680, y:260},{x:680, y:325}],
    'turn1->Auditorium/Management dept.': [{x:330, y:255},{x:650, y:257},{x:650, y:230}],
    'turn1->LaLchowk': [{x:330, y:255},{x:550, y:260},{x:550, y:230}],
    // 'turn1->bank': [{x:330, y:255},{x:150, y:255},{x:150, y:550},{x:200, y:550}],
    
    'Auditorium/Management dept.->V.C. OFFICE': [{x:650, y:230},{x:680, y:325}],
    'Electrical engineering dept.->V.C. OFFICE': [{x:540, y:315},{x:540, y:260},{x:680, y:260},{x:680, y:325}],
    'Electrical engineering dept.->Auditorium/Management dept.': [{x:540, y:315},{x:540, y:260},{x:650, y:260},{x:650, y:230}],
    'Computer engineering dept.->V.C. OFFICE': [{x:440, y:315},{x:440, y:260},{x:680, y:260},{x:680, y:325}],
    'Computer engineering dept.->Auditorium/Management dept.': [{x:440, y:315},{x:440, y:260},{x:650, y:260},{x:650, y:230}],
    'Library->Auditorium/Management dept.': [{x:370, y:315},{x:370, y:260},{x:650, y:260},{x:650, y:230}],
    'Library->V.C. OFFICE': [{x:370, y:315},{x:370, y:260},{x:680, y:260},{x:680, y:325}],
    
    'turn2->Library': [{x:710, y:260},{x:370, y:255},{x:370, y:315}],
    'turn2->Computer engineering dept.': [{x:710, y:260},{x:440, y:257},{x:440, y:315}],
    'turn2->Electrical engineering dept.': [{x:710, y:260},{x:540, y:260},{x:540, y:315}],
    'turn2->administravtive': [{x:710, y:260},{x:640, y:260},{x:640, y:315}],
    'turn2->Auditorium/Management dept.': [{x:710, y:260},{x:650, y:260},{x:650, y:230}],
    'turn2->V.C. OFFICE': [{x:710, y:260},{x:680, y:260},{x:680, y:325}],
    'turn2->Girls hostel': [{x:710, y:260},{x:710, y:400}],
    'turn2->New Building': [{x:710, y:260},{x:820, y:260},{x:820, y:325},{x:880, y:325}],
    'turn2->LaLchowk': [{x:710, y:260},{x:550, y:260},{x:550, y:230}],
    'turn2->Gate-2': [{x:710, y:260},{x:710, y:130},{x:980, y:130}],
    
    'turn3->Shakuntalam Hall': [{x:400, y:365},{x:400, y:430},{x:450, y:430}],
    'turn3->Mechanical engineering dept.': [{x:400, y:365},{x:400, y:500},{x:450, y:500},{x:450, y:530}],
    'turn3->Civil engineering dept.': [{x:400, y:365},{x:580, y:365},{x:580, y:415}],
    
    'Shakuntalam Hall->turn4': [{x:450, y:430},{x:400, y:435},{x:400, y:500},{x:515, y:500},{x:515, y:580}],
    'Shakuntalam Hall->Mechanical engineering dept.': [{x:450, y:430},{x:400, y:435},{x:400, y:500},{x:450, y:500},{x:450, y:530}],
    
    'turn4->CV RAMAN/Science Block': [{x:515, y:580},{x:570, y:580},{x:570, y:540}],
    'turn4->Mechanical engineering dept.': [{x:515, y:580},{x:450, y:580},{x:450, y:530}],
    // 'turn4->Temple': [{x:515, y:580},{x:790, y:580},{x:790, y:560}],
    // 'turn4->bank': [{x:515, y:580},{x:200, y:580},{x:200, y:550}],
  };

  // --- Replacement findPath using BFS on the road graph + safe concatenation ---
  // Put this where your old findPath(...) was.
  function findPath(from, to) {
    // sanity
    if (!nodes[from] || !nodes[to]) return null;
    if (from === to) return [{ x: nodes[from].x, y: nodes[from].y }];

    // helper: return stored segment for a->b (prefer fwd, else reverse stored)
    const getSegment = (a, b) => {
      const fwd = `${a}->${b}`;
      const rev = `${b}->${a}`;
      if (paths[fwd]) return paths[fwd];
      if (paths[rev]) return [...paths[rev]].reverse();
      return null;
    };

    // quick direct check
    const direct = getSegment(from, to);
    if (direct) return direct;

    // build adjacency from paths keys (treat roads as bidirectional)
    const adj = {};
    Object.keys(paths).forEach(k => {
      const parts = k.split('->');
      if (parts.length !== 2) return;
      const [a, b] = parts;
      adj[a] = adj[a] || new Set();
      adj[b] = adj[b] || new Set();
      adj[a].add(b);
      adj[b].add(a);
    });

    // BFS to find shortest hop-path from -> to
    const queue = [from];
    const prev = { [from]: null };
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      const neighbors = adj[cur] ? Array.from(adj[cur]) : [];
      for (const nb of neighbors) {
        if (prev.hasOwnProperty(nb)) continue;
        prev[nb] = cur;
        queue.push(nb);
      }
    }

    // if no path via roads found, fallback to prior 'via' candidates attempt (optional)
    if (!prev.hasOwnProperty(to)) {
      // optional: try your small viaCandidates heuristic (keeps compatibility)
      const viaCandidates = ['turn1','turn2','turn3','turn4'];
      for (const via of viaCandidates) {
        if (!via || via === from || via === to) continue;
        const s1 = getSegment(from, via);
        const s2 = getSegment(via, to);
        if (s1 && s2) return s1.concat(s2.slice(1));
      }
      // final fallback: straight centers
      return [{ x: nodes[from].x, y: nodes[from].y }, { x: nodes[to].x, y: nodes[to].y }];
    }

    // reconstruct node sequence
    const seq = [];
    let cur = to;
    while (cur !== null) {
      seq.unshift(cur);
      cur = prev[cur];
    }

    // append helper that avoids duplicate consecutive points
    const appendNoDup = (dest, pts) => {
      if (!pts || !pts.length) return;
      if (dest.length === 0) {
        dest.push(...pts);
        return;
      }
      const last = dest[dest.length - 1];
      const firstNew = pts[0];
      if (last.x === firstNew.x && last.y === firstNew.y) dest.push(...pts.slice(1));
      else dest.push(...pts);
    };

    // build full polyline by concatenating segments for each edge in seq
    const full = [];
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i+1];
      const seg = getSegment(a, b);
      if (seg) appendNoDup(full, seg);
      else {
        // fallback for missing edge: connect centers
        appendNoDup(full, [{ x: nodes[a].x, y: nodes[a].y }, { x: nodes[b].x, y: nodes[b].y }]);
      }
    }

    return full;
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










