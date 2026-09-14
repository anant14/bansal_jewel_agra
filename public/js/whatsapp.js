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
  var elComposerForm = document.getElementById('wa-composer-form');
  var elComposerInput = document.getElementById('wa-composer-input');
  var elSearch = document.getElementById('wa-search-input');
  var elBack = document.getElementById('wa-back-btn');

  var activeId = null;

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
      row.innerHTML =
        '<div class="wa-bubble">' + escapeHtml(m.text) +
        '<span class="wa-bubble__time">' + m.time + (m.me ? ' ✓✓' : '') + '</span>' +
        '</div>';
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

  renderConversationList('');
})();
