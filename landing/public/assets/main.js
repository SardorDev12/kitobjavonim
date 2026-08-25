  document.getElementById('year').textContent = new Date().getFullYear();
  var nav = document.getElementById('nav');
  var menuBtn = document.getElementById('menuBtn');
  menuBtn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.getElementById('mobilePanel').addEventListener('click', function (e) {
    if (e.target.tagName === 'A') nav.classList.remove('open');
  });
