(function () {
  'use strict';

  var API = '/admin/api/whatsapp';
  var CONTACTS_API = '/admin/api/contacts';

  var elConvos = document.getElementById('wa-conversations');
  var elMessages = document.getElementById('wa-messages');
  var elEmpty = document.getElementById('wa-empty');
  var elApp = document.getElementById('wa-app');
  var elChatHeader = document.getElementById('wa-chat-header');
  var elChatName = document.getElementById('wa-chat-name');
  var elChatStatus = document.getElementById('wa-chat-status');
  var elChatAvatar = document.getElementById('wa-chat-avatar');
  var elStatusSelect = document.getElementById('wa-status-select');
  var elComposerForm = document.getElementById('wa-composer');
  var elComposerInput = document.getElementById('wa-composer-input');
  var elSearch = document.getElementById('wa-search-input');
  var elBack = document.getElementById('wa-back-btn');
  var elEmojiBtn = document.getElementById('wa-emoji-btn');
  var elEmojiPicker = document.getElementById('wa-emoji-picker');

  var elProfileToggle = document.getElementById('wa-profile-toggle');
  var elProfile = document.getElementById('wa-profile');
  var elProfileAvatar = document.getElementById('wa-profile-avatar');
  var elProfileName = document.getElementById('wa-profile-name');
  var elProfileNumber = document.getElementById('wa-profile-number');
  var elProfileLink = document.getElementById('wa-profile-link');
  var elProfileTags = document.getElementById('wa-profile-tags');
  var elAddTagForm = document.getElementById('wa-add-tag-form');
  var elAddTagInput = document.getElementById('wa-add-tag-input');
  var elTagOptions = document.getElementById('wa-tag-options');
  var elProfileConsent = document.getElementById('wa-profile-consent');
  var elProfileSource = document.getElementById('wa-profile-source');
  var elProfileFirst = document.getElementById('wa-profile-first');
  var elProfileLast = document.getElementById('wa-profile-last');
  var elProfileNotes = document.getElementById('wa-profile-notes');
  var elAddNoteForm = document.getElementById('wa-add-note-form');
  var elAddNoteInput = document.getElementById('wa-add-note-input');

  var activeConversationId = null;
  var activeContact = null;
  var conversations = [];
  var pollTimer = null;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function initials(name) {
    var source = (name || '?').trim();
    if (!source) return '?';
    return source
      .split(' ')
      .map(function (p) { return p[0]; })
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toTimeString().slice(0, 5);
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function api(path, options) {
    var res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.error || ('request_failed_' + res.status));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /* ---------------- conversation list ---------------- */

  async function loadConversations(search) {
    var qs = search ? '?search=' + encodeURIComponent(search) : '';
    var result = await api(API + '/conversations' + qs);
    conversations = result.conversations;
    renderConversationList();
  }

  function renderConversationList() {
    elConvos.innerHTML = '';
    conversations.forEach(function (convo) {
      var contact = convo.contact;
      var last = convo.messages && convo.messages[0];
      var row = document.createElement('div');
      row.className = 'wa-convo' + (convo.id === activeConversationId ? ' is-active' : '');
      row.innerHTML =
        '<div class="wa-avatar wa-avatar--lg">' + initials(contact.name || contact.whatsappNumber) + '</div>' +
        '<div class="wa-convo__body">' +
          '<div class="wa-convo__top">' +
            '<span class="wa-convo__name">' + escapeHtml(contact.name || contact.whatsappNumber) + '</span>' +
            '<span class="wa-convo__time">' + (last ? formatTime(last.createdAt) : '') + '</span>' +
          '</div>' +
          '<div class="wa-convo__bottom">' +
            '<span class="wa-convo__preview">' + escapeHtml(last ? (last.textBody || ('[' + last.type + ']')) : 'No messages yet') + '</span>' +
            (convo.unreadCount ? '<span class="wa-convo__badge">' + convo.unreadCount + '</span>' : '') +
          '</div>' +
        '</div>';
      row.addEventListener('click', function () { openConversation(convo.id); });
      elConvos.appendChild(row);
    });
  }

  /* ---------------- messages ---------------- */

  function statusTicks(message) {
    if (message.direction !== 'outbound') return '';
    if (message.status === 'read') return ' ✓✓';
    if (message.status === 'delivered') return ' ✓✓';
    if (message.status === 'failed') return ' ⚠';
    return ' ✓';
  }

  function renderMessages(messages) {
    elMessages.innerHTML = '';
    var lastDay = null;
    messages.forEach(function (m) {
      var day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        var sep = document.createElement('div');
        sep.className = 'wa-day-sep';
        sep.textContent = new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        elMessages.appendChild(sep);
        lastDay = day;
      }
      var row = document.createElement('div');
      row.className = 'wa-bubble-row' + (m.direction === 'outbound' ? ' is-me' : '');
      var ticks = statusTicks(m);

      if (m.type === 'image' && m.mediaId) {
        row.innerHTML =
          '<div class="wa-bubble wa-bubble--image">' +
            '<img src="' + API + '/media/' + encodeURIComponent(m.mediaId) + '" alt="photo" loading="lazy" />' +
            '<span class="wa-bubble__time">' + formatTime(m.createdAt) + ticks + '</span>' +
          '</div>';
      } else if (m.mediaId) {
        row.innerHTML =
          '<div class="wa-bubble wa-bubble--file">' +
            '<div class="wa-bubble__file-icon">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5z"/></svg>' +
            '</div>' +
            '<div>' +
              '<div class="wa-bubble__file-name">' + escapeHtml(m.mediaFilename || m.type) + '</div>' +
              '<div class="wa-bubble__file-size">' + escapeHtml(m.type) + '</div>' +
            '</div>' +
            '<span class="wa-bubble__time">' + formatTime(m.createdAt) + ticks + '</span>' +
          '</div>';
      } else {
        row.innerHTML =
          '<div class="wa-bubble">' + escapeHtml(m.textBody || '[' + m.type + ']') +
          '<span class="wa-bubble__time">' + formatTime(m.createdAt) + ticks + '</span>' +
          '</div>';
      }
      elMessages.appendChild(row);
    });
    elMessages.scrollTop = elMessages.scrollHeight;
  }

  async function openConversation(id) {
    activeConversationId = id;
    document.body.classList.add('wa-chat-open');

    var [conversation, messagesRes] = await Promise.all([
      api(API + '/conversations/' + id),
      api(API + '/conversations/' + id + '/messages'),
    ]);

    activeContact = conversation.contact;

    elEmpty.hidden = true;
    elChatHeader.hidden = false;
    elComposerForm.hidden = false;
    elChatName.textContent = activeContact.name || activeContact.whatsappNumber;
    elChatStatus.textContent = '+' + activeContact.whatsappNumber;
    elChatAvatar.textContent = initials(activeContact.name || activeContact.whatsappNumber);
    elStatusSelect.value = conversation.status;

    renderMessages(messagesRes.messages);
    renderProfile(activeContact);

    var found = conversations.find(function (c) { return c.id === id; });
    if (found) found.unreadCount = 0;
    renderConversationList();
  }

  /* ---------------- customer profile panel ---------------- */

  function renderProfile(contact) {
    elProfileAvatar.textContent = initials(contact.name || contact.whatsappNumber);
    elProfileName.textContent = contact.name || 'Unnamed contact';
    elProfileNumber.textContent = '+' + contact.whatsappNumber;
    elProfileLink.href = '/admin/contacts/' + contact.id;

    elProfileTags.innerHTML = '';
    (contact.tags || []).forEach(function (ct) {
      var chip = document.createElement('span');
      chip.className = 'wa-tag-chip';
      chip.innerHTML = escapeHtml(ct.tag.name) + ' <button type="button" aria-label="Remove tag">&times;</button>';
      chip.querySelector('button').addEventListener('click', async function () {
        await api(CONTACTS_API + '/' + contact.id + '/tags/' + ct.tagId, { method: 'DELETE' });
        var refreshed = await api(CONTACTS_API + '/' + contact.id);
        activeContact = refreshed;
        renderProfile(refreshed);
      });
      elProfileTags.appendChild(chip);
    });

    var isOptedIn = contact.marketingOptIn;
    elProfileConsent.innerHTML =
      '<span class="wa-consent-badge ' + (isOptedIn ? 'is-in' : 'is-out') + '">' +
      (isOptedIn ? 'Opted in to marketing' : 'Not opted in') +
      '</span>';

    elProfileSource.textContent = contact.source || '—';
    elProfileFirst.textContent = formatDateTime(contact.firstInteractionAt);
    elProfileLast.textContent = formatDateTime(contact.lastInteractionAt);

    elProfileNotes.innerHTML = '';
    (contact.notes || []).forEach(function (note) {
      var div = document.createElement('div');
      div.className = 'wa-note';
      div.innerHTML =
        escapeHtml(note.body) + '<div class="wa-note__meta">' + formatDateTime(note.createdAt) + '</div>';
      elProfileNotes.appendChild(div);
    });
  }

  async function loadTagOptions() {
    try {
      var tags = await api('/admin/api/tags');
      elTagOptions.innerHTML = tags.map(function (t) { return '<option value="' + escapeHtml(t.name) + '">'; }).join('');
    } catch (e) { /* non-critical — autocomplete just stays empty */ }
  }
  loadTagOptions();

  elProfileToggle.addEventListener('click', function () {
    var willOpen = elProfile.hidden;
    elProfile.hidden = !willOpen;
    elApp.classList.toggle('is-profile-open', willOpen);
  });

  elAddTagForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = elAddTagInput.value.trim();
    if (!name || !activeContact) return;
    await api(CONTACTS_API + '/' + activeContact.id + '/tags', { method: 'POST', body: JSON.stringify({ tagName: name }) });
    elAddTagInput.value = '';
    var refreshed = await api(CONTACTS_API + '/' + activeContact.id);
    activeContact = refreshed;
    renderProfile(refreshed);
  });

  elAddNoteForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = elAddNoteInput.value.trim();
    if (!body || !activeContact) return;
    await api(CONTACTS_API + '/' + activeContact.id + '/notes', { method: 'POST', body: JSON.stringify({ body: body }) });
    elAddNoteInput.value = '';
    var refreshed = await api(CONTACTS_API + '/' + activeContact.id);
    activeContact = refreshed;
    renderProfile(refreshed);
  });

  /* ---------------- sending / status ---------------- */

  elComposerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var text = elComposerInput.value.trim();
    if (!text || !activeConversationId) return;
    elComposerInput.value = '';
    try {
      await api(API + '/conversations/' + activeConversationId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ text: text }),
      });
      var messagesRes = await api(API + '/conversations/' + activeConversationId + '/messages');
      renderMessages(messagesRes.messages);
      loadConversations(elSearch.value);
    } catch (err) {
      window.alert('Could not send that message. Please try again.');
    }
  });

  elStatusSelect.addEventListener('change', async function () {
    if (!activeConversationId) return;
    await api(API + '/conversations/' + activeConversationId + '/status', {
      method: 'POST',
      body: JSON.stringify({ status: elStatusSelect.value }),
    });
    loadConversations(elSearch.value);
  });

  /* ---------------- emoji picker ---------------- */

  elEmojiBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    elEmojiPicker.hidden = !elEmojiPicker.hidden;
    elEmojiBtn.classList.toggle('is-active', !elEmojiPicker.hidden);
  });
  elEmojiPicker.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.wa-emoji-picker__item');
    if (!btn) return;
    var start = elComposerInput.selectionStart == null ? elComposerInput.value.length : elComposerInput.selectionStart;
    var end = elComposerInput.selectionEnd == null ? elComposerInput.value.length : elComposerInput.selectionEnd;
    var val = elComposerInput.value;
    var emoji = btn.textContent;
    elComposerInput.value = val.slice(0, start) + emoji + val.slice(end);
    var newPos = start + emoji.length;
    elComposerInput.focus();
    elComposerInput.setSelectionRange(newPos, newPos);
  });
  document.addEventListener('click', function (e) {
    if (elEmojiPicker.hidden) return;
    if (elEmojiBtn.contains(e.target) || elEmojiPicker.contains(e.target)) return;
    elEmojiPicker.hidden = true;
    elEmojiBtn.classList.remove('is-active');
  });

  /* ---------------- search / nav ---------------- */

  var searchDebounce;
  elSearch.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () { loadConversations(elSearch.value); }, 300);
  });

  elBack.addEventListener('click', function () {
    document.body.classList.remove('wa-chat-open');
  });

  /* ---------------- polling for new messages/statuses ---------------- */

  pollTimer = setInterval(function () {
    loadConversations(elSearch.value);
    if (activeConversationId) {
      api(API + '/conversations/' + activeConversationId + '/messages')
        .then(function (res) { renderMessages(res.messages); })
        .catch(function () {});
    }
  }, 6000);

  loadConversations('');
})();
