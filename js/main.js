import * as THREE from 'three';

const SX = 48, SZ = 48, SY = 24;
const world = new Uint8Array(SX * SZ * SY);
const idx = (x, y, z) => x + z * SX + y * SX * SZ;
const inB = (x, y, z) => x >= 0 && x < SX && z >= 0 && z < SZ && y >= 0 && y < SY;
const get = (x, y, z) => (y < 0 ? 1 : inB(x, y, z) ? world[idx(x, y, z)] : 0);
const set = (x, y, z, t) => { if (inB(x, y, z)) world[idx(x, y, z)] = t; };

// Tipos: 1 pasto, 2 tierra, 3 piedra, 4 madera, 5 ladrillo, 6 hojas
const COLORS = { 1: '#5da02e', 2: '#8b5a2b', 3: '#808080', 4: '#6b4423', 5: '#b5442f', 6: '#2f7d32' };

// Generar terreno
const heights = [];
for (let x = 0; x < SX; x++) {
  heights[x] = [];
  for (let z = 0; z < SZ; z++) {
    const h = Math.floor(7 + Math.sin(x * 0.2) * 2 + Math.cos(z * 0.17) * 2 + Math.sin((x + z) * 0.08) * 2);
    heights[x][z] = h;
    for (let y = 0; y <= h; y++) set(x, y, z, y === h ? 1 : y > h - 3 ? 2 : 3);
  }
}
// Árboles
for (let i = 0; i < 18; i++) {
  const x = 3 + Math.floor(Math.random() * (SX - 6));
  const z = 3 + Math.floor(Math.random() * (SZ - 6));
  const h = heights[x][z];
  for (let y = 1; y <= 4; y++) set(x, h + y, z, 4);
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 3; dy <= 5; dy++)
        if (!(dx === 0 && dz === 0 && dy < 5) && Math.abs(dx) + Math.abs(dz) < 4 && get(x + dx, h + dy, z + dz) === 0)
          set(x + dx, h + dy, z + dz, 6);
}

// Escena
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.fog = new THREE.Fog('#87ceeb', 20, 60);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
camera.rotation.order = 'YXZ';
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(30, 50, 20);
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Texturas pixeladas
const mats = {};
for (const t in COLORS) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = COLORS[t];
  g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.12)';
    g.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 2, 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter;
  mats[t] = new THREE.MeshLambertMaterial({ map: tx });
}

// Construir mallas (solo bloques visibles)
const geo = new THREE.BoxGeometry(1, 1, 1);
let meshes = [];
const dummy = new THREE.Object3D();
const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function rebuild() {
  meshes.forEach(m => { scene.remove(m); m.dispose(); });
  meshes = [];
  const lists = {};
  for (let x = 0; x < SX; x++)
    for (let y = 0; y < SY; y++)
      for (let z = 0; z < SZ; z++) {
        const t = world[idx(x, y, z)];
        if (!t) continue;
        if (N.some(([a, b, c]) => !get(x + a, y + b, z + c) && y + b >= 0)) (lists[t] ||= []).push([x, y, z]);
      }
  for (const t in lists) {
    const m = new THREE.InstancedMesh(geo, mats[t], lists[t].length);
    lists[t].forEach(([x, y, z], i) => {
      dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    scene.add(m);
    meshes.push(m);
  }
}
rebuild();

// Jugador
const player = { p: new THREE.Vector3(SX / 2, heights[SX / 2][SZ / 2] + 3, SZ / 2), vy: 0, ground: false };
let yaw = 0, pitch = 0;
const R = 0.3, H = 1.8;

function collides(px, py, pz) {
  for (let x = Math.floor(px - R); x <= Math.floor(px + R); x++)
    for (let y = Math.floor(py); y <= Math.floor(py + H); y++)
      for (let z = Math.floor(pz - R); z <= Math.floor(pz + R); z++)
        if (get(x, y, z)) return true;
  return false;
}

// Controles
const mv = { x: 0, y: 0 };
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code >= 'Digit1' && e.code <= 'Digit6') select(+e.code.slice(5)); });
addEventListener('keyup', e => (keys[e.code] = false));

const joy = document.getElementById('joy'), knob = document.getElementById('knob');
let joyId = null;
function joyMove(t) {
  const r = joy.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy), m = 50;
  if (d > m) { dx = dx / d * m; dy = dy / d * m; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  mv.x = dx / m; mv.y = dy / m;
}
joy.addEventListener('touchstart', e => { e.preventDefault(); joyId = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]); }, { passive: false });
joy.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
const joyEnd = e => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; mv.x = mv.y = 0; knob.style.transform = ''; } };
joy.addEventListener('touchend', joyEnd);
joy.addEventListener('touchcancel', joyEnd);

// Mirar arrastrando el dedo
const looks = {};
canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) looks[t.identifier] = [t.clientX, t.clientY]; }, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const l = looks[t.identifier];
    if (!l) continue;
    yaw -= (t.clientX - l[0]) * 0.006;
    pitch -= (t.clientY - l[1]) * 0.006;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    looks[t.identifier] = [t.clientX, t.clientY];
  }
}, { passive: false });
const lookEnd = e => { for (const t of e.changedTouches) delete looks[t.identifier]; };
canvas.addEventListener('touchend', lookEnd);
canvas.addEventListener('touchcancel', lookEnd);

// Botones
let selected = 1;
const bar = document.getElementById('bar');
for (let t = 1; t <= 6; t++) {
  const d = document.createElement('div');
  d.style.background = COLORS[t];
  d.onclick = () => select(t);
  bar.appendChild(d);
}
function select(t) {
  selected = t;
  [...bar.children].forEach((d, i) => d.classList.toggle('sel', i + 1 === t));
}
select(1);

function press(id, fn) {
  const b = document.getElementById(id);
  b.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
  b.addEventListener('mousedown', fn);
}
function jump() { if (player.ground) { player.vy = 8; player.ground = false; } }

function target() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  const o = camera.position;
  let prev = null;
  for (let t = 0; t < 6; t += 0.05) {
    const c = [Math.floor(o.x + d.x * t), Math.floor(o.y + d.y * t), Math.floor(o.z + d.z * t)];
    if (get(...c)) return { hit: c, prev };
    prev = c;
  }
  return null;
}
function breakBlock() {
  const t = target();
  if (t && t.hit[1] > 0) { set(...t.hit, 0); rebuild(); }
}
function placeBlock() {
  const t = target();
  if (!t || !t.prev) return;
  set(...t.prev, selected);
  if (collides(player.p.x, player.p.y, player.p.z)) set(...t.prev, 0);
  else rebuild();
}
press('jump', jump);
press('brk', breakBlock);
press('plc', placeBlock);
addEventListener('keydown', e => { if (e.code === 'Space') jump(); if (e.code === 'KeyQ') breakBlock(); if (e.code === 'KeyE') placeBlock(); });

// Bucle del juego
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  let jx = mv.x, jy = mv.y;
  if (keys.KeyA) jx -= 1; if (keys.KeyD) jx += 1;
  if (keys.KeyW) jy -= 1; if (keys.KeyS) jy += 1;
  if (keys.ArrowLeft) yaw += 2 * dt; if (keys.ArrowRight) yaw -= 2 * dt;

  const sp = 4.5;
  const dx = (Math.cos(yaw) * jx - Math.sin(yaw) * jy) * sp * dt;
  const dz = (-Math.sin(yaw) * jx - Math.cos(yaw) * jy) * sp * dt;
  const p = player.p;
  if (!collides(p.x + dx, p.y, p.z)) p.x += dx;
  if (!collides(p.x, p.y, p.z + dz)) p.z += dz;

  player.vy -= 22 * dt;
  const ny = p.y + player.vy * dt;
  if (!collides(p.x, ny, p.z)) { p.y = ny; player.ground = false; }
  else { if (player.vy < 0) player.ground = true; player.vy = 0; }

  if (p.y < -15) p.set(SX / 2, 20, SZ / 2);

  camera.position.set(p.x, p.y + 1.6, p.z);
  camera.rotation.set(pitch, yaw, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
