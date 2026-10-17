(function () {
  'use strict';
  var html = document.documentElement;
  var nav = navigator;
  var weak = false;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) { weak = true; }
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) { weak = true; }
  if (window.matchMedia('(max-width: 768px)').matches) { weak = true; }
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) { weak = true; }
  if (weak) { html.classList.add('lite-mode'); return; }
  var frames = 0;
  var start = performance.now();
  function probe() {
    frames++;
    var now = performance.now();
    var elapsed = now - start;
    if (elapsed >= 2000) {
      var fps = frames / (elapsed / 1000);
      if (fps < 30) { html.classList.add('lite-mode'); }
      return;
    }
    requestAnimationFrame(probe);
  }
  requestAnimationFrame(probe);
})();
