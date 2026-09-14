/* Bansal Jewellers — front-end behaviour (vanilla, no deps) */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------------------------------------------------------------- */
  /*  navbar                                                          */
  /* ---------------------------------------------------------------- */
  var nav = $('#site-nav');
  var navToggle = $('#nav-toggle');

  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('menu-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // close mobile menu when a link is tapped
  $$('#nav-mobile a').forEach(function (a) {
    a.addEventListener('click', function () {
      nav.classList.remove('menu-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  reveal on scroll                                                */
  /* ---------------------------------------------------------------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------------------------------------------------------------- */
  /*  hero slideshow                                                  */
  /* ---------------------------------------------------------------- */
  var heroImgs = $$('#hero-bg img');
  var heroPill = $('#hero-pill');
  if (heroImgs.length > 1) {
    var hi = 0;
    setInterval(function () {
      heroImgs[hi].classList.remove('active');
      hi = (hi + 1) % heroImgs.length;
      heroImgs[hi].classList.add('active');
      if (heroPill) heroPill.textContent = heroImgs[hi].getAttribute('data-label') || '';
    }, 5500);
  }

  /* ---------------------------------------------------------------- */
  /*  catalogue filter                                                */
  /* ---------------------------------------------------------------- */
  var filterBtns = $$('.filter');
  var cards = $$('#product-grid .card');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      filterBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      cards.forEach(function (card) {
        var show = f === 'all' || card.getAttribute('data-category') === f;
        card.hidden = !show;
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  product data                                                    */
  /* ---------------------------------------------------------------- */
  var PRODUCTS = [];
  try {
    var raw = $('#products-data');
    if (raw) PRODUCTS = JSON.parse(raw.textContent.trim());
  } catch (e) { PRODUCTS = []; }

  function productBySku(sku) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].sku === sku) return PRODUCTS[i];
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /*  generic modal helpers                                           */
  /* ---------------------------------------------------------------- */
  var lastFocus = null;

  function openModal(el) {
    lastFocus = document.activeElement;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(el) {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $$('.modal').forEach(function (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal(modal);
    });
  });
  $$('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      closeModal(btn.closest('.modal'));
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $$('.modal.open').forEach(closeModal);
      if (waFloat) waFloat.classList.remove('open');
    }
  });

  /* ---------------------------------------------------------------- */
  /*  quick view                                                      */
  /* ---------------------------------------------------------------- */
  var qvModal = $('#quickview-modal');
  var qvContent = $('#quickview-content');

  function waHref(msg) {
    var num = (document.body.getAttribute('data-phone') || '').replace(/[^\d]/g, '');
    return 'https://wa.me/' + num + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  $$('[data-quickview]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = productBySku(btn.getAttribute('data-quickview'));
      if (!p || !qvModal) return;
      var msg = "Hello Bansal Jewellers, I'm interested in " + p.name + ' (' + p.sku + '). Please share details.';
      qvContent.innerHTML =
        '<div class="qv__media"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"></div>' +
        '<div class="qv__body">' +
          '<span class="qv__sku">' + esc(p.sku) + '</span>' +
          '<h3 class="qv__name">' + esc(p.name) + '</h3>' +
          '<div class="gold-hairline"></div>' +
          '<p class="qv__specs">' + esc(p.specs) + '</p>' +
          '<p class="qv__craft">' + esc(p.craft) + '</p>' +
          '<p class="qv__desc">' + esc(p.description) + '</p>' +
          '<div class="qv__actions">' +
            '<a class="btn btn--gold btn--block" href="' + waHref(msg) + '" target="_blank" rel="noopener">Enquire on WhatsApp</a>' +
            '<button class="btn btn--ghost btn--block" type="button" data-open-enquiry ' +
              'data-type="product" data-title="Enquire — ' + esc(p.name) + '" ' +
              'data-product-sku="' + esc(p.sku) + '" data-product-name="' + esc(p.name) + '">Send an Enquiry</button>' +
          '</div>' +
        '</div>';
      openModal(qvModal);

      var chain = qvContent.querySelector('[data-open-enquiry]');
      if (chain) {
        chain.addEventListener('click', function () {
          closeModal(qvModal);
          openEnquiry(chain);
        });
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  enquiry modal + form                                            */
  /* ---------------------------------------------------------------- */
  var enqModal = $('#enquiry-modal');
  var enqForm = $('#enquiry-form');
  var enqTitle = $('#enquiry-title');
  var enqType = $('#enquiry-type');
  var enqSku = $('#enquiry-sku');
  var enqPName = $('#enquiry-pname');
  var enqFallback = $('#enquiry-fallback');
  var enqProduct = $('#enquiry-product');
  var enqMsg = $('#enquiry-msg');
  var enqSubmit = $('#enquiry-submit');
  var enqSuccess = $('#enquiry-success');
  var enqSuccessText = $('#enquiry-success-text');
  var enqWaLink = $('#enquiry-wa-link');

  function openEnquiry(trigger) {
    if (!enqModal) return;
    var type = trigger.getAttribute('data-type') || 'general';
    var title = trigger.getAttribute('data-title') || 'Send an Enquiry';
    var sku = trigger.getAttribute('data-product-sku') || '';
    var pname = trigger.getAttribute('data-product-name') || '';
    var presetMsg = trigger.getAttribute('data-message') || '';
    var fallback = trigger.getAttribute('href') || waHref(presetMsg);

    enqForm.hidden = false;
    enqForm.reset();
    if (enqSuccess) enqSuccess.hidden = true;
    $$('.field', enqForm).forEach(function (f) { f.hidden = false; });
    enqForm.querySelector('#enquiry-submit').hidden = false;
    enqForm.querySelector('.form__note').hidden = false;
    if (enqMsg) { enqMsg.textContent = ''; enqMsg.className = 'form__msg'; }

    enqTitle.textContent = title;
    enqType.value = type;
    enqSku.value = sku;
    enqPName.value = pname;
    enqFallback.value = fallback;

    if (pname) {
      enqProduct.hidden = false;
      enqProduct.textContent = 'Regarding: ' + pname + (sku ? ' (' + sku + ')' : '');
    } else {
      enqProduct.hidden = true;
    }
    openModal(enqModal);
    var nameInput = $('#f-name');
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 60);
  }

  // any element with [data-enquiry] opens the form instead of navigating
  $$('[data-enquiry]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let power users open wa.me directly
      e.preventDefault();
      openEnquiry(el);
    });
  });

  if (enqForm) {
    enqForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enqMsg) { enqMsg.textContent = ''; enqMsg.className = 'form__msg'; }

      var fd = new FormData(enqForm);
      var payload = {
        type: fd.get('type'),
        name: (fd.get('name') || '').trim(),
        phone: (fd.get('phone') || '').trim(),
        email: (fd.get('email') || '').trim(),
        message: (fd.get('message') || '').trim(),
        productSku: fd.get('productSku') || '',
        productName: fd.get('productName') || '',
        company: fd.get('company') || ''
      };

      if (payload.name.length < 2 || payload.phone.replace(/[^\d]/g, '').length < 8) {
        enqMsg.textContent = 'Please enter your name and a valid phone number.';
        enqMsg.className = 'form__msg error';
        return;
      }

      enqSubmit.disabled = true;
      enqSubmit.textContent = 'Sending…';

      fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.data.ok) {
            var err = (res.data.errors && res.data.errors.join(' ')) || 'Something went wrong. Please WhatsApp us directly.';
            enqMsg.textContent = err;
            enqMsg.className = 'form__msg error';
            return;
          }
          // success
          $$('.field', enqForm).forEach(function (f) { f.hidden = true; });
          enqProduct.hidden = true;
          enqSubmit.hidden = true;
          enqForm.querySelector('.form__note').hidden = true;
          if (enqSuccessText && res.data.message) enqSuccessText.textContent = res.data.message;
          if (enqWaLink) enqWaLink.href = res.data.whatsappUrl || enqFallback.value;
          enqSuccess.hidden = false;
        })
        .catch(function () {
          enqMsg.textContent = 'Network error. Tap below to reach us on WhatsApp.';
          enqMsg.className = 'form__msg error';
          if (enqWaLink) enqWaLink.href = enqFallback.value;
          $$('.field', enqForm).forEach(function (f) { f.hidden = true; });
          enqSubmit.hidden = true;
          enqSuccess.hidden = false;
        })
        .then(function () {
          enqSubmit.disabled = false;
          enqSubmit.textContent = 'Send Enquiry';
        });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  gold & silver rate request modal                                */
  /* ---------------------------------------------------------------- */
  var rateModal = $('#rate-modal');
  var rateForm = $('#rate-form');
  var rateMsg = $('#rate-msg');
  var rateSubmit = $('#rate-submit');
  var rateSuccess = $('#rate-success');
  var rateSuccessTitle = $('#rate-success-title');
  var rateSuccessText = $('#rate-success-text');
  var openRateBtn = $('#open-rate-request');

  if (openRateBtn && rateModal) {
    openRateBtn.addEventListener('click', function () {
      rateForm.reset();
      rateForm.hidden = false;
      $$('.field, .form__consent, .form__checkbox', rateForm).forEach(function (f) { f.hidden = false; });
      rateSubmit.hidden = false;
      rateForm.querySelector('.form__note').hidden = false;
      rateSuccess.hidden = true;
      if (rateMsg) { rateMsg.textContent = ''; rateMsg.className = 'form__msg'; }
      openModal(rateModal);
      var phoneInput = $('#r-phone');
      if (phoneInput) setTimeout(function () { phoneInput.focus(); }, 60);
    });
  }

  if (rateForm) {
    rateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (rateMsg) { rateMsg.textContent = ''; rateMsg.className = 'form__msg'; }

      var fd = new FormData(rateForm);
      var payload = {
        name: (fd.get('name') || '').trim(),
        whatsappNumber: (fd.get('whatsappNumber') || '').trim(),
        marketingOptIn: fd.get('marketingOptIn') === 'on',
        company: fd.get('company') || ''
      };

      if (payload.whatsappNumber.replace(/[^\d]/g, '').length < 10) {
        rateMsg.textContent = 'Please enter a valid WhatsApp number.';
        rateMsg.className = 'form__msg error';
        return;
      }

      rateSubmit.disabled = true;
      rateSubmit.textContent = 'Sending…';

      fetch('/api/rates/whatsapp-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.data.ok) {
            rateMsg.textContent = (res.data && res.data.error) || 'Something went wrong. Please try again.';
            rateMsg.className = 'form__msg error';
            return;
          }
          $$('.field, .form__consent, .form__checkbox', rateForm).forEach(function (f) { f.hidden = true; });
          rateSubmit.hidden = true;
          rateForm.querySelector('.form__note').hidden = true;
          rateSuccessTitle.textContent = res.data.delivered ? 'Sent! 🙏' : 'Request Received';
          rateSuccessText.textContent = res.data.message;
          rateSuccess.hidden = false;
        })
        .catch(function () {
          rateMsg.textContent = 'Network error. Please try again in a moment.';
          rateMsg.className = 'form__msg error';
        })
        .then(function () {
          rateSubmit.disabled = false;
          rateSubmit.textContent = "Send Me Today's Rate";
        });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  whatsapp float                                                  */
  /* ---------------------------------------------------------------- */
  var waFloat = $('#wafloat');
  var waBtn = $('#wafloat-btn');
  if (waBtn && waFloat) {
    waBtn.addEventListener('click', function () {
      var open = waFloat.classList.toggle('open');
      waBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (!waFloat.contains(e.target)) waFloat.classList.remove('open');
    });
  }
})();
