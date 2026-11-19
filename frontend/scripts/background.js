(function () {
  if (!document.body.classList.contains('schedula-background')) {
    document.body.classList.add('schedula-background');
  }

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

  const canvas = document.getElementById('particleCanvas');
  const context = canvas.getContext && canvas.getContext('2d');
  if (!context) return;

  let particles = [];
  let animationFrame = 0;

  function reset(particle) {
    particle.x = Math.random() * canvas.width;
    particle.y = Math.random() * canvas.height;
    particle.speed = Math.random() / 5 + 0.1;
    particle.opacity = 0.7;
    particle.fadeStart = Date.now() + Math.random() * 600 + 100;
    particle.fadingOut = false;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function init() {
    particles = Array.from({ length: Math.floor(canvas.width * canvas.height / 7000) }, () => {
      const particle = {};
      reset(particle);
      return particle;
    });
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();
    particles.forEach(particle => {
      particle.y -= particle.speed;
      if (particle.y < 0) { reset(particle); return; }
      if (!particle.fadingOut && now > particle.fadeStart) particle.fadingOut = true;
      if (particle.fadingOut) particle.opacity -= 0.008;
      if (particle.opacity <= 0) { reset(particle); return; }
      context.fillStyle = document.documentElement.dataset.theme === 'light'
        ? `rgba(124, 58, 237, ${particle.opacity})`
        : `rgba(200, 180, 255, ${particle.opacity})`;
      context.fillRect(particle.x, particle.y, 0.6, Math.random() * 2 + 1);
    });
    animationFrame = requestAnimationFrame(draw);
  }

  resize();
  init();
  animationFrame = requestAnimationFrame(draw);
  window.addEventListener('resize', () => {
    resize();
    cancelAnimationFrame(animationFrame);
    init();
    animationFrame = requestAnimationFrame(draw);
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
