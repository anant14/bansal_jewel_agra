(function () {
  'use strict';

  var dataEl = document.getElementById('wa-dummy-data');
  var conversations = JSON.parse(dataEl.textContent);

  var elConvos = document.getElementById('wa-conversations');
  var elMessages = document.getElementById('wa-messages');
  var elEmpty = document.getElementById('wa-empty');
  var elChatHeader = document.getElementById('wa-chat-header');
  var elChatName = document.getElementById('wa-chat-name');
  var elChatStatus = document.getElementById('wa-chat-status');
  var elChatAvatar = document.getElementById('wa-chat-avatar');
  var elComposerForm = document.getElementById('wa-composer');
  var elComposerInput = document.getElementById('wa-composer-input');
  var elSearch = document.getElementById('wa-search-input');
  var elBack = document.getElementById('wa-back-btn');
  var elEmojiBtn = document.getElementById('wa-emoji-btn');
  var elEmojiPicker = document.getElementById('wa-emoji-picker');
  var elAttachBtn = document.getElementById('wa-attach-btn');
  var elFileInput = document.getElementById('wa-file-input');

  var activeId = null;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;

  function initials(name) {
    return name
      .split(' ')
      .map(function (p) { return p[0]; })
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderConversationList(filter) {
    var q = (filter || '').trim().toLowerCase();
    elConvos.innerHTML = '';
    conversations
      .filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; })
      .forEach(function (convo) {
        var last = convo.messages[convo.messages.length - 1];
        var row = document.createElement('div');
        row.className = 'wa-convo' + (convo.id === activeId ? ' is-active' : '');
        row.setAttribute('data-id', convo.id);
        row.innerHTML =
          '<div class="wa-avatar wa-avatar--lg">' + initials(convo.name) + '</div>' +
          '<div class="wa-convo__body">' +
            '<div class="wa-convo__top">' +
              '<span class="wa-convo__name">' + escapeHtml(convo.name) + '</span>' +
              '<span class="wa-convo__time">' + (last ? last.time : '') + '</span>' +
            '</div>' +
            '<div class="wa-convo__bottom">' +
              '<span class="wa-convo__preview">' + (last ? escapeHtml(last.text) : '') + '</span>' +
              (convo.unread ? '<span class="wa-convo__badge">' + convo.unread + '</span>' : '') +
            '</div>' +
          '</div>';
        row.addEventListener('click', function () { openConversation(convo.id); });
        elConvos.appendChild(row);
      });
  }

  function renderMessages(convo) {
    elMessages.innerHTML = '';
    var lastDay = null;
    convo.messages.forEach(function (m) {
      if (m.day !== lastDay) {
        var sep = document.createElement('div');
        sep.className = 'wa-day-sep';
        sep.textContent = m.day;
        elMessages.appendChild(sep);
        lastDay = m.day;
      }
      var row = document.createElement('div');
      row.className = 'wa-bubble-row' + (m.me ? ' is-me' : '');
      var ticks = m.me ? ' ✓✓' : '';

      if (m.type === 'image') {
        row.innerHTML =
          '<div class="wa-bubble wa-bubble--image">' +
            '<img src="' + m.dataUrl + '" alt="' + escapeHtml(m.text || 'photo') + '" />' +
            '<span class="wa-bubble__time">' + m.time + ticks + '</span>' +
          '</div>';
      } else if (m.type === 'file') {
        row.innerHTML =
          '<div class="wa-bubble wa-bubble--file">' +
            '<div class="wa-bubble__file-icon">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5z"/></svg>' +
            '</div>' +
            '<div>' +
              '<div class="wa-bubble__file-name">' + escapeHtml(m.fileName) + '</div>' +
              '<div class="wa-bubble__file-size">' + escapeHtml(m.fileSize) + '</div>' +
            '</div>' +
            '<span class="wa-bubble__time">' + m.time + ticks + '</span>' +
          '</div>';
      } else {
        row.innerHTML =
          '<div class="wa-bubble">' + escapeHtml(m.text) +
          '<span class="wa-bubble__time">' + m.time + ticks + '</span>' +
          '</div>';
      }
      elMessages.appendChild(row);
    });
    elMessages.scrollTop = elMessages.scrollHeight;
  }

  function openConversation(id) {
    var convo = conversations.find(function (c) { return c.id === id; });
    if (!convo) return;
    activeId = id;
    convo.unread = 0;

    elEmpty.hidden = true;
    elChatHeader.hidden = false;
    document.getElementById('wa-composer').hidden = false;
    elChatName.textContent = convo.name;
    elChatStatus.textContent = convo.status || '';
    elChatAvatar.textContent = initials(convo.name);

    renderMessages(convo);
    renderConversationList(elSearch.value);
    document.body.classList.add('wa-chat-open');
  }

  elComposerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = elComposerInput.value.trim();
    if (!text || activeId == null) return;
    var convo = conversations.find(function (c) { return c.id === activeId; });
    var now = new Date();
    convo.messages.push({
      me: true,
      text: text,
      time: now.toTimeString().slice(0, 5),
      day: 'Today',
    });
    elComposerInput.value = '';
    renderMessages(convo);
    renderConversationList(elSearch.value);
  });

  elSearch.addEventListener('input', function () {
    renderConversationList(elSearch.value);
  });

  elBack.addEventListener('click', function () {
    document.body.classList.remove('wa-chat-open');
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

  /* ---------------- file / image attach ---------------- */
  elAttachBtn.addEventListener('click', function () {
    if (activeId == null) return;
    elFileInput.click();
  });

  elFileInput.addEventListener('change', function () {
    var file = elFileInput.files && elFileInput.files[0];
    if (!file || activeId == null) { elFileInput.value = ''; return; }

    if (file.size > MAX_FILE_BYTES) {
      window.alert('That file is larger than 8 MB — pick a smaller one for this preview.');
      elFileInput.value = '';
      return;
    }

    var convo = conversations.find(function (c) { return c.id === activeId; });
    var isImage = file.type.indexOf('image/') === 0;
    var now = new Date();
    var reader = new FileReader();

    reader.onload = function () {
      var message = { me: true, time: now.toTimeString().slice(0, 5), day: 'Today' };
      if (isImage) {
        message.type = 'image';
        message.dataUrl = reader.result;
        message.text = file.name;
      } else {
        message.type = 'file';
        message.fileName = file.name;
        message.fileSize = formatBytes(file.size);
      }
      convo.messages.push(message);
      renderMessages(convo);
      renderConversationList(elSearch.value);
    };
    reader.readAsDataURL(file);
    elFileInput.value = '';
  });

  renderConversationList('');
})();
