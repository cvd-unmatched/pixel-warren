"use strict";
// Talks to the ADMIN_PASSWORD-gated endpoints in server.js. The password
// is kept in memory only (never localStorage/a cookie) and resent with
// every request via the X-Admin-Password header -- there's no separate
// admin session, so refreshing the page just re-prompts.

var adminPassword = null;

var el = {
  unlockCard: document.getElementById('unlockCard'),
  unlockForm: document.getElementById('unlockForm'),
  adminPasswordInput: document.getElementById('adminPasswordInput'),
  unlockError: document.getElementById('unlockError'),
  usersCard: document.getElementById('usersCard'),
  usersError: document.getElementById('usersError'),
  usersBody: document.getElementById('usersBody'),
  refreshBtn: document.getElementById('refreshBtn')
};

function adminFetch(path, options) {
  options = options || {};
  options.headers = Object.assign({ 'X-Admin-Password': adminPassword }, options.headers || {});
  return fetch(path, options).then(function(r){
    return r.json().then(function(body){
      if (!r.ok || !body.ok) throw new Error(body.error || ('request failed (' + r.status + ')'));
      return body;
    });
  });
}

function renderUsers(users) {
  el.usersBody.innerHTML = '';
  users.forEach(function(u){
    var row = document.createElement('tr');
    var created = u.created_at ? new Date(u.created_at).toLocaleString() : '';
    row.innerHTML =
      '<td>' + u.username.replace(/</g, '&lt;') + '</td>' +
      '<td>' + created + '</td>' +
      '<td><div class="admin-row-actions">' +
        '<button type="button" class="reset-btn">Reset password</button>' +
        '<button type="button" class="delete-btn danger">Delete</button>' +
      '</div></td>';
    row.querySelector('.reset-btn').addEventListener('click', function(){ resetPassword(u.username); });
    row.querySelector('.delete-btn').addEventListener('click', function(){ deleteUser(u.username); });
    el.usersBody.appendChild(row);
  });
}

function loadUsers() {
  el.usersError.textContent = '';
  return adminFetch('/api/admin/users').then(function(body){
    renderUsers(body.users);
  }).catch(function(e){
    el.usersError.textContent = e.message;
  });
}

function resetPassword(username) {
  var next = prompt('New password for "' + username + '" (min 8 characters):');
  if (next === null) return;
  if (next.length < 8) { alert('Password must be at least 8 characters.'); return; }
  adminFetch('/api/admin/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, newPassword: next })
  }).then(function(){
    alert('Password reset for "' + username + '". Their existing sessions were logged out.');
  }).catch(function(e){
    alert('Failed: ' + e.message);
  });
}

function deleteUser(username) {
  if (!confirm('Delete "' + username + '"? This removes their account, save, and leaderboard entry permanently.')) return;
  adminFetch('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username })
  }).then(function(){
    loadUsers();
  }).catch(function(e){
    alert('Failed: ' + e.message);
  });
}

el.unlockForm.addEventListener('submit', function(ev){
  ev.preventDefault();
  el.unlockError.textContent = '';
  adminPassword = el.adminPasswordInput.value;
  adminFetch('/api/admin/users').then(function(body){
    renderUsers(body.users);
    el.unlockCard.hidden = true;
    el.usersCard.hidden = false;
  }).catch(function(e){
    adminPassword = null;
    el.unlockError.textContent = e.message;
  });
});

el.refreshBtn.addEventListener('click', loadUsers);
