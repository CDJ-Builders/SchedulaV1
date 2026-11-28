(function () {
  if (!document.body.classList.contains('hero-root')) {
    document.body.classList.add('schedula-background');
    if (!document.getElementById('particleCanvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'particleCanvas';
      canvas.className = 'particleCanvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(canvas);
    }
    if (!document.querySelector('.accent-lines')) {
      const lines = document.createElement('div');
      lines.className = 'accent-lines';
      lines.setAttribute('aria-hidden', 'true');
      lines.innerHTML = '<div class="hline"></div><div class="hline"></div><div class="hline"></div><div class="vline"></div><div class="vline"></div><div class="vline"></div>';
      document.body.prepend(lines);
    }
  }

  const canvas = document.getElementById('particleCanvas');
  const context = canvas?.getContext?.('2d');
  if (!context) return;

  let particles = [];
  let animationFrame = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let particleColor = getComputedStyle(document.documentElement).getPropertyValue('--particle').trim() || 'rgba(200,180,255,.6)';

  function reset(particle) {
    particle.x = Math.random() * window.innerWidth;
    particle.y = Math.random() * window.innerHeight;
    particle.speed = Math.random() / 5 + 0.1;
    particle.opacity = 0.7;
    particle.height = 1 + Math.random();
    particle.fadeStart = Date.now() + Math.random() * 600 + 100;
    particle.fadingOut = false;
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function init() {
    const count = Math.min(80, Math.floor(window.innerWidth * window.innerHeight / 12000));
    particles = Array.from({ length: count }, () => {
      const particle = {};
      reset(particle);
      return particle;
    });
  }

  function draw() {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const now = Date.now();
    particles.forEach(particle => {
      particle.y -= particle.speed;
      if (particle.y < 0) { reset(particle); return; }
      if (!particle.fadingOut && now > particle.fadeStart) particle.fadingOut = true;
      if (particle.fadingOut) particle.opacity -= 0.008;
      if (particle.opacity <= 0) { reset(particle); return; }
      context.fillStyle = particleColor;
      context.globalAlpha = particle.opacity;
      context.fillRect(particle.x, particle.y, 1, particle.height);
    });
    context.globalAlpha = 1;
    animationFrame = requestAnimationFrame(draw);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function start() {
    if (animationFrame || document.hidden || reducedMotion.matches) return;
    animationFrame = requestAnimationFrame(draw);
  }

  resize();
  init();
  start();
  window.addEventListener('resize', () => {
    resize();
    init();
    stop();
    start();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  reducedMotion.addEventListener?.('change', () => reducedMotion.matches ? stop() : start());
  document.addEventListener('schedula:themechange', () => {
    particleColor = getComputedStyle(document.documentElement).getPropertyValue('--particle').trim() || 'rgba(200,180,255,.6)';
  });

  document.addEventListener('click', event => {
    const logout = event.target.closest('[data-action="logout"]');
    if (!logout) return;
    event.preventDefault();
    if (typeof window.handleLogout === 'function') {
      window.handleLogout(logout.dataset.redirect || '../index.html');
      return;
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = logout.dataset.redirect || '../index.html';
  });
})();
