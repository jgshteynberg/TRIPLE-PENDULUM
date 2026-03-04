const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

const countInput = document.getElementById('pendulum-count');
const applyButton = document.getElementById('apply-count');
const resetButton = document.getElementById('reset');

const pivot = { x: canvas.width / 2, y: 120 };
const gravity = 0.45;
const damping = 0.999;
const rodLength = 52;
const bobRadius = 11;

let bobs = [];
let draggingIndex = -1;

function createChain(count) {
  bobs = [];
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * 12;
    const x = pivot.x + spread;
    const y = pivot.y + (i + 1) * rodLength;
    bobs.push({
      x,
      y,
      prevX: x - spread * 0.03,
      prevY: y,
      radius: bobRadius,
      hue: Math.round((220 + i * 24) % 360),
    });
  }
}

function clampCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 3;
  return Math.max(1, Math.min(12, parsed));
}

function resetMotion() {
  bobs.forEach((bob, index) => {
    bob.prevX = bob.x - (index + 1) * 0.8;
    bob.prevY = bob.y;
  });
}

function satisfyConstraints() {
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 0; i < bobs.length; i += 1) {
      const bob = bobs[i];
      const anchor = i === 0 ? pivot : bobs[i - 1];

      const dx = bob.x - anchor.x;
      const dy = bob.y - anchor.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (dist - rodLength) / dist;

      if (i === 0) {
        bob.x -= dx * diff;
        bob.y -= dy * diff;
      } else {
        bob.x -= dx * diff * 0.5;
        bob.y -= dy * diff * 0.5;
        anchor.x += dx * diff * 0.5;
        anchor.y += dy * diff * 0.5;
      }
    }
  }
}

function updatePhysics() {
  for (let i = 0; i < bobs.length; i += 1) {
    if (i === draggingIndex) continue;

    const bob = bobs[i];
    const velocityX = (bob.x - bob.prevX) * damping;
    const velocityY = (bob.y - bob.prevY) * damping;

    bob.prevX = bob.x;
    bob.prevY = bob.y;
    bob.x += velocityX;
    bob.y += velocityY + gravity;
  }

  satisfyConstraints();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6f87b5';
  ctx.beginPath();
  ctx.moveTo(pivot.x - 40, pivot.y);
  ctx.lineTo(pivot.x + 40, pivot.y);
  ctx.stroke();

  let anchor = pivot;
  for (const bob of bobs) {
    ctx.strokeStyle = '#96a8cd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();

    ctx.fillStyle = `hsl(${bob.hue} 85% 62%)`;
    ctx.beginPath();
    ctx.arc(bob.x, bob.y, bob.radius, 0, Math.PI * 2);
    ctx.fill();

    anchor = bob;
  }
}

function tick() {
  updatePhysics();
  draw();
  requestAnimationFrame(tick);
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener('pointerdown', (event) => {
  const pos = getPointerPosition(event);
  draggingIndex = bobs.findIndex((bob) => Math.hypot(pos.x - bob.x, pos.y - bob.y) <= bob.radius + 4);
  if (draggingIndex >= 0) {
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (draggingIndex < 0) return;
  const pos = getPointerPosition(event);
  const bob = bobs[draggingIndex];
  bob.prevX = pos.x;
  bob.prevY = pos.y;
  bob.x = pos.x;
  bob.y = pos.y;
  satisfyConstraints();
});

canvas.addEventListener('pointerup', () => {
  draggingIndex = -1;
});

applyButton.addEventListener('click', () => {
  const count = clampCount(countInput.value);
  countInput.value = count;
  createChain(count);
  resetMotion();
});

resetButton.addEventListener('click', resetMotion);

createChain(clampCount(countInput.value));
resetMotion();
requestAnimationFrame(tick);
