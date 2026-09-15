(function () {
  'use strict';
  var dialog = document.getElementById('upload-dialog');
  var openBtn = document.getElementById('open-upload');
  var cancelBtn = document.getElementById('cancel-upload');
  if (!dialog || !openBtn) return;

  openBtn.addEventListener('click', function () { dialog.showModal(); });
  cancelBtn.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
})();
