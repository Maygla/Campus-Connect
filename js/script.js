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

async function renderAccess() {
  const personalContainer = document.getElementById('personalLinksContainer');
  if (!personalContainer) return;

  // Determine current user if available
  const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;

  // Load personal links:
  // - If DB available and signed-in: read all access docs and filter owner.uid == user.uid
  // - Else use local personal storage
  let personalLinks = [];
  if (hasDB && user) {
    try {
      const all = await window.CCDB.listAccessLinks(); // returns global+personal
      personalLinks = all.filter(l => l.owner && l.owner.uid === user.uid);
    } catch (e) {
      console.error('Failed to load personal links from DB', e);
      personalLinks = [];
    }
  } else {
    personalLinks = lsLoad(PERSONAL_ACCESS_KEY) || [];
  }

  // Render personal links area
  if (!personalLinks.length) {
    personalContainer.innerHTML = `<div class="item muted">No personal links. Add one below.</div>`;
  } else {
    personalContainer.innerHTML = personalLinks.map((l, idx) => {
      // if Firestore doc it will have l.id, else local items rely on index
      const idAttr = l.id ? `data-id="${l.id}"` : `data-local-idx="${idx}"`;
      const title = escapeHtml(l.title || l.title === 0 ? l.title : 'Untitled');
      const url = escapeHtml(l.url || '#');
      return `<div class="item" style="display:flex;justify-content:space-between;align-items:center">
                <a class="access-link" href="${url}" target="_blank" rel="noopener">${title}</a>
                <div style="display:flex;gap:8px;">
                  <button ${idAttr} class="delete-personal" style="background:#ef4444">Delete</button>
                </div>
              </div>`;
    }).join('');
  }

  // Wire delete handlers for personal links
  personalContainer.querySelectorAll('button.delete-personal').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this personal link?')) return;
      const id = btn.getAttribute('data-id');
      const localIdx = btn.getAttribute('data-local-idx');

      if (id && hasDB) {
        // Firestore doc deletion - CCDB.deleteAccessLink will delete by doc id
        try {
          await window.CCDB.deleteAccessLink(id);
        } catch (err) {
          console.error('Failed to delete personal access link', err);
          alert('Failed to delete link: ' + (err.message || err));
        }
        renderAccess();
        return;
      } else if (localIdx != null) {
        const arr = lsLoad(PERSONAL_ACCESS_KEY);
        arr.splice(Number(localIdx), 1);
        lsSave(PERSONAL_ACCESS_KEY, arr);
        renderAccess();
        return;
      } else {
        alert('Cannot delete this link');
      }
    });
  });
}

// Add button (only creates personal links)
const addBtn = document.getElementById('addAccessBtn');
addBtn?.addEventListener('click', async () => {
  const title = prompt('Link title (e.g., Portal)');
  if (!title) return;
  const url = prompt('URL (include https://)');
  if (!url) return;

  const user = (window.CCAuth && window.CCAuth.currentUser) ? window.CCAuth.currentUser() : null;

  // Personal link: if DB+signed-in => save to Firestore with owner, else fallback to local storage
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

  // Not signed-in or no DB -> store locally as personal-only
  const arr = lsLoad(PERSONAL_ACCESS_KEY);
  arr.unshift({ title, url, added: Date.now() });
  lsSave(PERSONAL_ACCESS_KEY, arr);
  renderAccess();
});

// initial render call (replace any earlier renderAccess() call as needed)
renderAccess();
// ✅ NEW CODE: Global Quick Links (Admin-controlled)
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

  // Filter only global (no owner)
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

  // delete buttons (admin only)
  if (isAdmin()) {
    container.querySelectorAll('.delete-global').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this global link?')) return;
        await window.CCDB.deleteAccessLink(btn.dataset.id);
        renderGlobalLinks();
      });
    });
  }

  // show/hide admin controls
  const adminBox = document.getElementById('adminGlobalLinks');
  if (adminBox) adminBox.style.display = isAdmin() ? 'block' : 'none';
}

document.getElementById('addGlobalLinkBtn')?.addEventListener('click', async () => {
  if (!isAdmin()) return alert('Only admin can add global links.');
  const title = prompt('Enter link title:');
  const url = prompt('Enter link URL (include https://):');
  if (!title || !url) return;
  await window.CCDB.addAccessLink({ title, url }); // owner=null → global
  renderGlobalLinks();
});

// call global render too
renderGlobalLinks();

  /* ========= Notes / File Upload ========= */
  const notesListEl = document.getElementById('notesList');
  const uploadForm = document.getElementById('uploadForm');
  const sampleNotesBtn = document.getElementById('importSampleNotes');
  
    async function renderNotes() {
    const selectedSubject = document.getElementById('notesSubjectFilter')?.value || '';
    const selectedBranch = document.getElementById('notesBranchFilter')?.value || '';

    if (hasDB) {
      let notes = await window.CCDB.listNotes();

      // Extract all subjects (for filter dropdown)
      const subjectSet = new Set(notes.map(n => n.subject).filter(Boolean));
      const subjectFilter = document.getElementById('notesSubjectFilter');
      if (subjectFilter && subjectFilter.options.length <= 1) {
        subjectSet.forEach(subj => {
          const opt = document.createElement('option');
          opt.value = subj;
          opt.textContent = subj;
          subjectFilter.appendChild(opt);
        });
      }

      // Apply filters
      notes = notes.filter(note => {
        const matchesSubject = !selectedSubject || note.subject === selectedSubject;
        const matchesBranch = !selectedBranch || note.branch === selectedBranch;
        return matchesSubject && matchesBranch;
      });

      // Sort alphabetically by subject, then title
      notes.sort((a, b) => {
        const sA = (a.subject || '').toLowerCase();
        const sB = (b.subject || '').toLowerCase();
        if (sA < sB) return -1;
        if (sA > sB) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });

      if (!notes.length) {
        notesListEl.innerHTML = `<div class="item">No notes found matching the selected filters.</div>`;
        return;
      }

      notesListEl.innerHTML = notes.map((n) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> 
          <small>(${escapeHtml(n.subject || '')}, ${escapeHtml(n.branch || '')})</small>
          <div class="muted">${n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
          <div class="row" style="margin-top:8px">
            ${n.url ? `<a href="${n.url}" target="_blank"><button>Download</button></a>` : ''}
            ${n.driveLink ? `<a href="${escapeHtml(n.driveLink)}" target="_blank"><button>Open Drive Link</button></a>` : ''}
            ${isAdmin() ? `<button data-delete="${n.id}" style="background:#ef4444">Delete</button>` : ''}
          </div>
        </div>
      `).join('');

      // Delete button
      notesListEl.querySelectorAll('button[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this note?')) return;
          await window.CCDB.deleteNote(btn.dataset.delete);
          renderNotes();
        });
      });

    } else {
      // Fallback (localStorage)
      const notes = lsLoad(NOTES_KEY) || [];

      const subjectSet = new Set(notes.map(n => n.subject).filter(Boolean));
      const subjectFilter = document.getElementById('notesSubjectFilter');
      if (subjectFilter && subjectFilter.options.length <= 1) {
        subjectSet.forEach(subj => {
          const opt = document.createElement('option');
          opt.value = subj;
          opt.textContent = subj;
          subjectFilter.appendChild(opt);
        });
      }

      const filtered = notes.filter(note => {
        const matchesSubject = !selectedSubject || note.subject === selectedSubject;
        const matchesBranch = !selectedBranch || note.branch === selectedBranch;
        return matchesSubject && matchesBranch;
      }).sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

      if (!filtered.length) {
        notesListEl.innerHTML = `<div class="item">No notes found matching the selected filters.</div>`;
        return;
      }

      notesListEl.innerHTML = filtered.map((n, idx) => `
        <div class="item">
          <strong>${escapeHtml(n.title)}</strong> 
          <small>(${escapeHtml(n.subject || '')}, ${escapeHtml(n.branch || '')})</small>
          <div class="muted">${new Date(n.added).toLocaleString()}</div>
          <div class="row" style="margin-top:8px">
            ${n.data ? `<button data-download="${idx}">Download</button>` : ''}
            ${n.driveLink ? `<a href="${escapeHtml(n.driveLink)}" target="_blank"><button>Open Drive Link</button></a>` : ''}
            <button data-delete="${idx}" style="background:#ef4444">Delete</button>
          </div>
        </div>
      `).join('');
    }
  }
  document.getElementById('notesSubjectFilter')?.addEventListener('change', renderNotes);
  document.getElementById('notesBranchFilter')?.addEventListener('change', renderNotes);
  document.getElementById('clearNotesFilters')?.addEventListener('click', () => {
    document.getElementById('notesSubjectFilter').value = '';
    document.getElementById('notesBranchFilter').value = '';
    renderNotes();
  });
                                            
  renderNotes();

    /* ========= Discussion Forum ========= */
  const postsEl = document.getElementById('posts');
  const postForm = document.getElementById('postForm');

  async function renderPosts() {
    if (!hasDB) {
      const posts = lsLoad(POSTS_KEY);
      if (!posts.length) {
        postsEl.innerHTML = `<div class="item">No posts yet. Start a conversation!</div>`;
        return;
      }
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
      return;
    }

    // Firestore-based posts
    const posts = await window.CCDB.listPosts();
    const currentUser = window.CCAuth?.currentUser?.();

    if (!posts.length) {
      postsEl.innerHTML = `<div class="item">No posts yet. Start a conversation!</div>`;
      return;
    }

    postsEl.innerHTML = posts.map(p => {
      const isOwner = currentUser && p.author?.uid === currentUser.uid;
      const canDeletePost = isAdmin() || isOwner;

      // replies UI
      const repliesHtml = (p.replies || []).map(r => {
        const replyIsOwner = currentUser && r.author?.uid === currentUser.uid;
        const canDeleteReply = isAdmin() || replyIsOwner;
        const replyTime = r.createdAt?.toDate
          ? r.createdAt.toDate().toLocaleString()
          : new Date(r.createdAt).toLocaleString();

        return `
          <div class="item reply" style="margin-left:25px; border-left:2px solid #ddd; padding-left:8px; margin-top:6px;">
            <small><b>${escapeHtml(r.author?.name || r.author || "Anonymous")}</b></small>
            <div class="muted" style="font-size:0.8em">${replyTime}</div>
            <p>${escapeHtml(r.text)}</p>
            ${canDeleteReply
              ? `<button data-delreply="${p.id}" data-replyid="${r.id}" style="background:#f87171;padding:3px 8px;border:none;border-radius:6px;color:white;">Delete Reply</button>`
              : ''}
          </div>
        `;
      }).join('');

      const createdTime = p.createdAt?.toDate
        ? p.createdAt.toDate().toLocaleString()
        : new Date(p.createdAt).toLocaleString();

      return `
        <div class="item post" style="margin-bottom:12px;">
          <strong>${escapeHtml(p.topic)}</strong> • <small>${escapeHtml(p.author?.name || p.author || 'Anonymous')}</small>
          <div class="muted">${createdTime}</div>
          <p>${escapeHtml(p.content)}</p>
          <div class="row">
            <button data-reply="${p.id}">Reply</button>
            ${canDeletePost
              ? `<button data-delete="${p.id}" style="background:#ef4444;color:white;">Delete Post</button>`
              : ''}
          </div>
          <div class="replies">${repliesHtml}</div>
        </div>
      `;
    }).join('');

    // === Reply button logic ===
    postsEl.querySelectorAll('button[data-reply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.reply;
        const user = window.CCAuth?.currentUser?.();
        const name = user ? (user.name || user.email) : (prompt("Your name") || "Anonymous");
        const text = prompt("Write your reply:");
        if (!text) return;

        await window.CCDB.replyToPost(postId, {
          author: user ? { uid: user.uid, name } : name,
          text
        });
        renderPosts();
      });
    });

    // === Post delete logic (admin or owner only) ===
    postsEl.querySelectorAll('button[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.delete;
        const post = posts.find(p => p.id === postId);
        const user = window.CCAuth?.currentUser?.();
        const isOwner = user && post?.author?.uid === user.uid;

        if (!isAdmin() && !isOwner) {
          alert("You can only delete your own post.");
          return;
        }

        if (!confirm("Delete this post?")) return;
        await window.CCDB.deletePost(postId);
        renderPosts();
      });
    });

    // === Reply delete logic ===
    postsEl.querySelectorAll('button[data-delreply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.delreply;
        const replyId = btn.dataset.replyid;
        const user = window.CCAuth?.currentUser?.();

        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const reply = (post.replies || []).find(r => r.id === replyId);
        const isOwner = user && reply?.author?.uid === user.uid;

        if (!isAdmin() && !isOwner) {
          alert("You can only delete your own reply.");
          return;
        }

        if (!confirm("Delete this reply?")) return;

        // remove reply from Firestore
        const updatedReplies = (post.replies || []).filter(r => r.id !== replyId);
        const docRef = doc(window.CCDB._internal.db, "posts", postId);
        await updateDoc(docRef, { replies: updatedReplies });
        renderPosts();
      });
    });
  }

  // === Post form submit ===
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const authorName = document.getElementById('postAuthor').value.trim();
    const topic = document.getElementById('postTopic').value.trim();
    const content = document.getElementById('postContent').value.trim();

    if (!topic || !content) return alert('Please fill in all fields.');

    if (hasDB) {
      const owner = window.CCAuth?.currentUser?.();
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

  // === Clear all forum (admin only) ===
  document.getElementById('clearForumBtn').addEventListener('click', async () => {
    if (!isAdmin()) return alert('Only admin can clear all posts.');
    if (!confirm('Clear entire forum?')) return;

    if (hasDB) {
      const posts = await window.CCDB.listPosts();
      await Promise.all(posts.map(p => window.CCDB.deletePost(p.id)));
    } else {
      lsSave(POSTS_KEY, []);
    }

    renderPosts();
  });

  // Initial load
  renderPosts();

  // Hide or show the Clear Forum button depending on admin access
  setTimeout(() => {
    const clearBtn = document.getElementById('clearForumBtn');
    if (!clearBtn) return;
    clearBtn.style.display = isAdmin() ? 'inline-block' : 'none';
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

  
  /* ========= Schedule Calendar with Inline Admin Form & Branch Filter ========= */
  async function initScheduleCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;

    // Wait for Firebase auth to load current user
    let user = null;
    if (window.CCAuth && typeof window.CCAuth.currentUser === "function") {
      for (let i = 0; i < 20; i++) {
        user = window.CCAuth.currentUser();
        if (user) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }

    const adminEmail = "aroraganesh2007@gmail.com";
    const isAdmin = user && user.email === adminEmail;

    // Show admin form only for admin
    const formBox = document.getElementById("adminScheduleForm");
    if (formBox) formBox.style.display = isAdmin ? "block" : "none";

    const msgBox = document.getElementById("eventStatusMsg");
    const branchFilter = document.getElementById("branchFilter");

    let allEvents = await window.CCDB.listEvents();

    // Function to render calendar
    function renderCalendar(filteredBranch = "all") {
      if (window.currentCalendar) window.currentCalendar.destroy();

      const filteredEvents =
        filteredBranch === "all"
          ? allEvents
          : allEvents.filter(e => e.branch === filteredBranch || e.branch === "all");

      const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        selectable: false,
        editable: false,
        eventDisplay: "block",
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        },
        events: filteredEvents.map(e => ({
          id: e.id,
          title: e.title + (e.venue ? ` @ ${e.venue}` : ""),
          start: e.date + (e.time ? `T${e.time}` : ""),
          allDay: !e.time,
          extendedProps: {
            type: e.type,
            branch: e.branch,
            venue: e.venue || "",
          },
        })),
        eventClick: async info => {
          if (!isAdmin) return;
          if (confirm(`Delete "${info.event.title}"?`)) {
            await window.CCDB.deleteEvent(info.event.id);
            info.event.remove();
          }
        },
      });

      calendar.render();
      window.currentCalendar = calendar;
    }

    renderCalendar(); // initial load

    // Handle branch filter change
    if (branchFilter) {
      branchFilter.addEventListener("change", () => {
        renderCalendar(branchFilter.value);
      });
    }

    // Admin inline event add form
    const addEventForm = document.getElementById("addEventForm");
    if (addEventForm && isAdmin) {
      addEventForm.addEventListener("submit", async e => {
        e.preventDefault();

        const title = document.getElementById("eventTitleInput").value.trim();
        const date = document.getElementById("eventDateInput").value;
        const time = document.getElementById("eventTimeInput").value;
        const venue = document.getElementById("eventVenueInput").value.trim();
        const type = document.getElementById("eventTypeInput").value;
        const branch = document.getElementById("eventBranchInput").value;

        if (!title || !date) {
          showEventMessage("Please enter both title and date!", "error");
          return;
        }

        try {
          await window.CCDB.createEvent({ title, date, time, type, branch, venue });
          addEventForm.reset();
          showEventMessage("✅ Event added successfully!", "success");
          allEvents = await window.CCDB.listEvents();
          renderCalendar(branchFilter.value);
        } catch (err) {
          console.error(err);
          showEventMessage("❌ Failed to add event. Please try again.", "error");
        }
      });
    }

    // Inline confirmation helper
    function showEventMessage(text, type = "success") {
      if (!msgBox) return;
      msgBox.textContent = text;
      msgBox.style.color = type === "success" ? "#16a34a" : "#dc2626";
      msgBox.style.opacity = "1";
      setTimeout(() => {
        msgBox.style.transition = "opacity 0.5s";
        msgBox.style.opacity = "0";
      }, 3000);
    }
  }

  window.addEventListener("DOMContentLoaded", initScheduleCalendar);

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

  // --- Distance & Time display setup ---
  const pathInfo = document.createElement('div');
  pathInfo.id = 'pathInfo';
  pathInfo.style.marginTop = '10px';
  pathInfo.style.fontWeight = '600';
  document.querySelector('#map .map-wrap').after(pathInfo);

  function computeDistanceMeters(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      total += Math.hypot(dx, dy);
    }
    return total * 0.367; // 1 px ≈ 0.367 m (based on 20-acre campus)
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m} min ${s} sec`;
  }

  navigateBtn.addEventListener('click', () => {
    const from = mapFrom.value;
    const to = mapTo.value;
    if (!from || !to || from === to) {
      alert('Select different From and To');
      return;
    }
    const pts = findPath(from, to);
    drawPath(pts);
    animateWalker(pts);

    // Compute & show distance/time
    const distMeters = computeDistanceMeters(pts);
    const speedMps = 5 * 1000 / 3600; // 5 km/h
    const timeSec = distMeters / speedMps;
    pathInfo.textContent = `Distance: ${distMeters.toFixed(1)} m | Estimated time: ${formatTime(timeSec)}`;
  });

  resetMapBtn.addEventListener('click', () => {
    pathsLayer.innerHTML = '';
    walker.setAttribute('visibility', 'hidden');
    pathInfo.textContent = '';
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
















