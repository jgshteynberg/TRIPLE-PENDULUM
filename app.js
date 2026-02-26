const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');
const controlGrid = document.getElementById('control-grid');
const toggleBtn = document.getElementById('toggle');
const resetBtn = document.getElementById('reset');
const clearTraceBtn = document.getElementById('clear-trace');

const controlsConfig = [
  { key: 'l1', label: 'Arm 1 length (m)', min: 0.2, max: 3.0, step: 0.01, value: 1.3 },
  { key: 'l2', label: 'Arm 2 length (m)', min: 0.2, max: 3.0, step: 0.01, value: 1.1 },
  { key: 'l3', label: 'Arm 3 length (m)', min: 0.2, max: 3.0, step: 0.01, value: 0.9 },
  { key: 'm1', label: 'Mass 1 (kg)', min: 0.1, max: 6.0, step: 0.01, value: 1.2 },
  { key: 'm2', label: 'Mass 2 (kg)', min: 0.1, max: 6.0, step: 0.01, value: 1.0 },
  { key: 'm3', label: 'Mass 3 (kg)', min: 0.1, max: 6.0, step: 0.01, value: 0.8 },
  { key: 'th1', label: 'Initial angle 1 (°)', min: -179, max: 179, step: 0.1, value: 150 },
  { key: 'th2', label: 'Initial angle 2 (°)', min: -179, max: 179, step: 0.1, value: 125 },
  { key: 'th3', label: 'Initial angle 3 (°)', min: -179, max: 179, step: 0.1, value: 95 },
  { key: 'w1', label: 'Initial ω1 (rad/s)', min: -8.0, max: 8.0, step: 0.01, value: 0 },
  { key: 'w2', label: 'Initial ω2 (rad/s)', min: -8.0, max: 8.0, step: 0.01, value: 0 },
  { key: 'w3', label: 'Initial ω3 (rad/s)', min: -8.0, max: 8.0, step: 0.01, value: 0 },
  { key: 'g', label: 'Gravity (m/s²)', min: 0.0, max: 30.0, step: 0.01, value: 9.81 },
  { key: 'damp', label: 'Damping', min: 0.0, max: 2.0, step: 0.001, value: 0.02 },
  { key: 'dt', label: 'Simulation dt (s)', min: 0.001, max: 0.03, step: 0.001, value: 0.008 },
  { key: 'speed', label: 'Speed multiplier', min: 0.1, max: 3.0, step: 0.1, value: 1.0 },
];

const controls = {};
for (const cfg of controlsConfig) {
  const wrap = document.createElement('div');
  wrap.className = 'control';

  const label = document.createElement('label');
  label.htmlFor = cfg.key;
  const labelText = document.createElement('span');
  labelText.textContent = cfg.label;
  const valueText = document.createElement('strong');
  valueText.textContent = cfg.value;
  label.append(labelText, valueText);

  const input = document.createElement('input');
  input.id = cfg.key;
  input.type = 'range';
  input.min = cfg.min;
  input.max = cfg.max;
  input.step = cfg.step;
  input.value = cfg.value;
  input.addEventListener('input', () => {
    valueText.textContent = Number(input.value).toFixed(Number.isInteger(cfg.step) ? 0 : String(cfg.step).split('.')[1]?.length ?? 2);
  });

  wrap.append(label, input);
  controlGrid.appendChild(wrap);
  controls[cfg.key] = input;
}

let state = null;
let trace = [];
let running = true;

function getConfig() {
  const c = {};
  for (const key of Object.keys(controls)) c[key] = Number(controls[key].value);
  return c;
}

function rad(deg) {
  return (deg * Math.PI) / 180;
}

function resetState() {
  const c = getConfig();
  state = {
    theta: [rad(c.th1), rad(c.th2), rad(c.th3)],
    omega: [c.w1, c.w2, c.w3],
  };
  trace = [];
}

function cumulativeMasses(m) {
  return [m[0] + m[1] + m[2], m[1] + m[2], m[2]];
}

function buildMassMatrix(theta, lengths, masses) {
  const n = 3;
  const S = [
    [masses[0] + masses[1] + masses[2], masses[1] + masses[2], masses[2]],
    [masses[1] + masses[2], masses[1] + masses[2], masses[2]],
    [masses[2], masses[2], masses[2]],
  ];

  const M = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] = S[i][j] * lengths[i] * lengths[j] * Math.cos(theta[i] - theta[j]);
    }
  }
  return M;
}

function dM(theta, lengths, masses, a, b, cIdx) {
  const S = [
    [masses[0] + masses[1] + masses[2], masses[1] + masses[2], masses[2]],
    [masses[1] + masses[2], masses[1] + masses[2], masses[2]],
    [masses[2], masses[2], masses[2]],
  ];
  const scale = S[a][b] * lengths[a] * lengths[b];
  if (cIdx === a && cIdx === b) return 0;
  if (cIdx === a) return -scale * Math.sin(theta[a] - theta[b]);
  if (cIdx === b) return scale * Math.sin(theta[a] - theta[b]);
  return 0;
}

function coriolis(theta, omega, lengths, masses) {
  const n = 3;
  const h = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const gamma = 0.5 * (
          dM(theta, lengths, masses, i, j, k) +
          dM(theta, lengths, masses, i, k, j) -
          dM(theta, lengths, masses, j, k, i)
        );
        sum += gamma * omega[j] * omega[k];
      }
    }
    h[i] = sum;
  }
  return h;
}

function gravity(theta, lengths, masses, g) {
  const cMass = cumulativeMasses(masses);
  return theta.map((th, i) => cMass[i] * g * lengths[i] * Math.sin(th));
}

function solveLinear3(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return [0, 0, 0];
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];

    const p = m[col][col];
    for (let c = col; c < 4; c++) m[col][c] /= p;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      for (let c = col; c < 4; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

function derivatives(curr, cfg) {
  const lengths = [cfg.l1, cfg.l2, cfg.l3];
  const masses = [cfg.m1, cfg.m2, cfg.m3];
  const M = buildMassMatrix(curr.theta, lengths, masses);
  const h = coriolis(curr.theta, curr.omega, lengths, masses);
  const G = gravity(curr.theta, lengths, masses, cfg.g);
  const damp = curr.omega.map((w) => cfg.damp * w);
  const rhs = h.map((val, i) => -(val + G[i] + damp[i]));
  const alpha = solveLinear3(M, rhs);
  return {
    thetaDot: [...curr.omega],
    omegaDot: alpha,
  };
}

function addState(a, b, scale) {
  return {
    theta: a.theta.map((x, i) => x + b.thetaDot[i] * scale),
    omega: a.omega.map((x, i) => x + b.omegaDot[i] * scale),
  };
}

function integrateRK4(dt, cfg) {
  const k1 = derivatives(state, cfg);
  const k2 = derivatives(addState(state, k1, dt / 2), cfg);
  const k3 = derivatives(addState(state, k2, dt / 2), cfg);
  const k4 = derivatives(addState(state, k3, dt), cfg);

  for (let i = 0; i < 3; i++) {
    state.theta[i] += (dt / 6) * (k1.thetaDot[i] + 2 * k2.thetaDot[i] + 2 * k3.thetaDot[i] + k4.thetaDot[i]);
    state.omega[i] += (dt / 6) * (k1.omegaDot[i] + 2 * k2.omegaDot[i] + 2 * k3.omegaDot[i] + k4.omegaDot[i]);
  }
}

function joints(theta, lengths) {
  const points = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 3; i++) {
    x += lengths[i] * Math.sin(theta[i]);
    y += lengths[i] * Math.cos(theta[i]);
    points.push({ x, y });
  }
  return points;
}

function draw() {
  const cfg = getConfig();
  const lengths = [cfg.l1, cfg.l2, cfg.l3];
  const points = joints(state.theta, lengths);

  const maxLen = lengths[0] + lengths[1] + lengths[2];
  const scale = (Math.min(canvas.width, canvas.height) * 0.42) / maxLen;
  const ox = canvas.width / 2;
  const oy = canvas.height * 0.16;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (trace.length > 1) {
    ctx.beginPath();
    trace.forEach((p, i) => {
      const tx = ox + p.x * scale;
      const ty = oy + p.y * scale;
      if (i === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    });
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (let i = 0; i < 3; i++) {
    const a = points[i];
    const b = points[i + 1];

    ctx.beginPath();
    ctx.moveTo(ox + a.x * scale, oy + a.y * scale);
    ctx.lineTo(ox + b.x * scale, oy + b.y * scale);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ox + b.x * scale, oy + b.y * scale, 8 + getConfig()[`m${i + 1}`] * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = ['#ef4444', '#22c55e', '#38bdf8'][i];
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(ox, oy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '14px monospace';
  ctx.fillText(`θ (deg): ${state.theta.map((t) => ((t * 180) / Math.PI).toFixed(1)).join(', ')}`, 16, canvas.height - 36);
  ctx.fillText(`ω (rad/s): ${state.omega.map((w) => w.toFixed(2)).join(', ')}`, 16, canvas.height - 16);
}

let lastTime = performance.now();
function frame(time) {
  const cfg = getConfig();
  const elapsed = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;

  if (running) {
    const step = cfg.dt;
    const simTime = elapsed * cfg.speed;
    const subSteps = Math.max(1, Math.floor(simTime / step));
    const h = simTime / subSteps;
    for (let i = 0; i < subSteps; i++) integrateRK4(h, cfg);
    const endPoint = joints(state.theta, [cfg.l1, cfg.l2, cfg.l3])[3];
    trace.push(endPoint);
    if (trace.length > 2500) trace.shift();
  }

  draw();
  requestAnimationFrame(frame);
}

toggleBtn.addEventListener('click', () => {
  running = !running;
  toggleBtn.textContent = running ? 'Pause' : 'Resume';
});

resetBtn.addEventListener('click', () => {
  resetState();
});

clearTraceBtn.addEventListener('click', () => {
  trace = [];
});

resetState();
requestAnimationFrame(frame);
