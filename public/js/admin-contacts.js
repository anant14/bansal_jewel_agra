(function () {
  'use strict';

  var dialog = document.getElementById('add-contact-dialog');
  var openBtn = document.getElementById('open-add-contact');
  var cancelBtn = document.getElementById('cancel-add-contact');

  if (!dialog || !openBtn) return;

  openBtn.addEventListener('click', function () { dialog.showModal(); });
  cancelBtn.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close(); // click on the backdrop
  });
})();
