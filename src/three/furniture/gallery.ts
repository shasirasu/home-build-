// Furniture gallery (open /furniture.html) — a dev page to inspect every model.
//
//   /furniture.html                       all kinds on a floor, grouped by category, labelled
//   /furniture.html?cat=Kitchen           one category
//   /furniture.html?kind=sofa-3seat       one item close up   (&w= &d= &h= &color=%23aabbcc to test resizing)
//   /furniture.html?sheet=Bedroom         contact sheet: one tile per item, each with its own camera
//   /furniture.html?sheet=bed-queen,tv    contact sheet of chosen kinds
//   /furniture.html?turn=car              one kind from six sides (&w= &d= &h= &color= work here too)
//   common: &az=35 &el=18 (camera angles, degrees) &zoom=1 &box=1 (show the w×d×h contract box) &stats=1

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CATALOG, CATEGORIES, catalogByKind, type CatalogItem } from '@/data/catalog';
import { buildItem, countTriangles, furnitureCacheSize } from './index';

const q = new URLSearchParams(location.search);
const num = (k: string, dflt: number) => (q.has(k) && Number.isFinite(+q.get(k)!) ? +q.get(k)! : dflt);
const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const nav = document.getElementById('nav')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efece6');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.62;

const sun = new THREE.DirectionalLight('#fff6ea', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(q.has('sheet') ? 1024 : 4096, q.has('sheet') ? 1024 : 4096);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.012;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 0.18));

const floorMat = new THREE.MeshStandardMaterial({ color: '#e4dfd6', roughness: 0.9 });
const wallMat = new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.95 });
const ceilMat = new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.95 });

function aimSun(center: THREE.Vector3, radius: number) {
  sun.target.position.copy(center);
  sun.position.copy(center).add(new THREE.Vector3(0.55, 1.25, 0.8).normalize().multiplyScalar(radius * 3 + 4));
  const c = sun.shadow.camera;
  c.left = c.bottom = -radius * 1.25;
  c.right = c.top = radius * 1.25;
  c.near = 0.5;
  c.far = radius * 6 + 12;
  c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

interface Entry {
  cat: CatalogItem;
  w: number;
  d: number;
  h: number;
  color?: string;
  root: THREE.Group; // item + its bit of wall / ceiling
  item: THREE.Group;
  y0: number; // bottom of the item above the floor
  tris: number;
  meshes: number;
  over: number[]; // overflow beyond the contract box [x-, x+, y-, y+, z-, z+] in metres (>0 = outside)
}

function makeEntry(cat: CatalogItem, o: { w?: number; d?: number; h?: number; color?: string } = {}): Entry {
  const w = o.w ?? cat.w;
  const d = o.d ?? cat.d;
  const h = o.h ?? cat.h;
  const item = buildItem({ kind: cat.kind, w, d, h, color: o.color });
  const root = new THREE.Group();
  let y0 = 0;
  if (cat.mount === 'wall') {
    y0 = cat.elevation ?? 1;
    const top = Math.max(2.3, y0 + h + 0.3);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, top, 0.06), wallMat);
    wall.position.set(0, top / 2, -d / 2 - 0.03);
    wall.receiveShadow = true;
    wall.castShadow = true;
    root.add(wall);
  } else if (cat.mount === 'ceiling') {
    const cy = Math.max(2.5, h);
    y0 = cy - h;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, d + 0.5), ceilMat); // one-sided: visible from below only
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = cy;
    root.add(ceil);
  }
  item.position.y = y0;
  root.add(item);
  item.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(item);
  const over = [-w / 2 - bb.min.x, bb.max.x - w / 2, y0 - bb.min.y, bb.max.y - (y0 + h), -d / 2 - bb.min.z, bb.max.z - d / 2];
  let meshes = 0;
  item.traverse((o3) => {
    if ((o3 as THREE.Mesh).isMesh) meshes++;
  });
  return { cat, w, d, h, color: o.color, root, item, y0, tris: countTriangles(item), meshes, over };
}

const overflowText = (e: Entry) => {
  const names = ['-x', '+x', '-y', '+y', '-z', '+z'];
  const bad = e.over.map((v, i) => (v > 0.002 ? `${names[i]} ${(v * 1000).toFixed(0)}mm` : '')).filter(Boolean);
  return bad.length ? `outside box: ${bad.join(', ')}` : 'fits box';
};

function contractBox(e: Entry): THREE.LineSegments {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(e.w, e.h, e.d));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d2542d' }));
  l.position.y = e.y0 + e.h / 2;
  return l;
}

function labelPlane(lines: string[], width: number, big = false): THREE.Mesh {
  const cv = document.createElement('canvas');
  const scale = 256; // px per metre
  const hM = big ? 0.5 : 0.36;
  cv.width = Math.max(64, Math.round(width * scale));
  cv.height = Math.round(hM * scale);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = big ? '#3a3632' : 'rgba(255,255,255,0.0)';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = big ? '#ffffff' : '#3a3632';
  ctx.textBaseline = 'middle';
  if (big) {
    ctx.font = '600 76px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText(lines[0], 28, cv.height / 2 + 4);
  } else {
    ctx.font = '600 40px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText(lines[0], 4, 26, cv.width - 8);
    ctx.font = '30px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#6b655d';
    ctx.fillText(lines[1] ?? '', 4, 68, cv.width - 8);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width / scale, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: !big, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Move the camera along `dir` from the centre of `box` until the whole box is just inside the view. */
function fitCamera(cam: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, fill = 0.94): THREE.Vector3 {
  const center = box.getCenter(new THREE.Vector3());
  let dist = box.getSize(new THREE.Vector3()).length();
  const v = new THREE.Vector3();
  for (let it = 0; it < 12; it++) {
    cam.position.copy(center).add(dir.clone().multiplyScalar(dist));
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    let m = 0;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
    }
    if (Math.abs(m - fill) < 0.01) break;
    dist *= 1 + (m / fill - 1) * 0.85;
  }
  return center;
}

function dirFromAngles(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

function navLinks() {
  const links = [`<a href="?">all</a>`, ...CATEGORIES.map((c) => `<a href="?cat=${c}">${c}</a>`), ...CATEGORIES.map((c) => `<a href="?sheet=${c}">▦ ${c}</a>`)];
  nav.innerHTML = links.join('·');
}
navLinks();

const az = num('az', 32);
const el = num('el', 16);
const zoom = num('zoom', 1);
const fov = 32;
let frame: () => void = () => {};

// ---------------------------------------------------------------------------------------------
if (q.has('sheet') || q.has('turn')) {
  // contact sheet (or `turn`: one kind seen from six sides)
  const arg = q.get('sheet') ?? '';
  const cats = CATALOG.filter((c) => c.category === arg);
  const turn = q.get('turn');
  const TURN: [number, number][] = [
    [35, 14],
    [0, 8],
    [90, 8],
    [145, 14],
    [180, 8],
    [20, 62],
  ];
  const list = turn
    ? TURN.map(() => catalogByKind(turn)).filter((c): c is CatalogItem => !!c)
    : cats.length
      ? cats
      : [];
  const size = { w: q.has('w') ? num('w', 1) : undefined, d: q.has('d') ? num('d', 1) : undefined, h: q.has('h') ? num('h', 1) : undefined, color: q.get('color') ?? undefined };
  const entries = list.map((c) => makeEntry(c, turn ? size : {}));
  if (!list.length)
    // kinds, each optionally resized / recoloured:  kind@w,d,h,colour  (blank = catalog default), e.g. wardrobe-2door@1.5,,2.5
    // separate entries with ';' when a colour is given (hex digits would confuse the comma split)
    for (const part of arg.includes(';') ? arg.split(';') : arg.split(/,(?=[a-z])/)) {
      const [kind, dims] = part.trim().split('@');
      const c = catalogByKind(kind);
      if (!c) continue;
      const v = (dims ?? '').split(',');
      const f = (i: number) => (v[i] && Number.isFinite(+v[i]) ? +v[i] : undefined);
      entries.push(makeEntry(c, { w: f(0), d: f(1), h: f(2), color: v[3] ? (v[3].startsWith('#') ? v[3] : '#' + v[3]) : undefined }));
    }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  for (const e of entries) {
    e.root.visible = false;
    if (q.has('box')) e.root.add(contractBox(e));
    scene.add(e.root);
  }
  const cols = num('cols', turn ? 3 : Math.ceil(Math.sqrt(entries.length * 1.5)));
  const rows = Math.ceil(entries.length / cols);
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
  const tiles: HTMLDivElement[] = entries.map((e) => {
    const div = document.createElement('div');
    div.className = 'tile';
    const ov = overflowText(e);
    div.innerHTML = `<b>${e.cat.kind}</b> · ${e.w}×${e.d}×${e.h} · ${e.tris} tris · ${e.meshes} meshes<br><span class="${ov === 'fits box' ? '' : 'bad'}">${ov}</span>`;
    document.body.appendChild(div);
    return div;
  });
  hud.style.display = 'none';
  nav.style.display = 'none';
  frame = () => {
    const W = app.clientWidth;
    const H = app.clientHeight;
    const tw = W / cols;
    const th = H / rows;
    renderer.setScissorTest(true);
    entries.forEach((e, i) => {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      tiles[i].style.left = `${cx * tw}px`;
      tiles[i].style.top = `${cy * th}px`;
      tiles[i].style.width = `${tw}px`;
      tiles[i].style.height = `${th}px`;
      for (const o of entries) o.root.visible = o === e;
      const center = new THREE.Vector3(0, e.y0 + e.h / 2, 0);
      const radius = 0.5 * Math.hypot(e.w, e.h, e.d);
      cam.aspect = tw / th;
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.08 * Math.max(1, 1 / cam.aspect) / zoom;
      const below = e.cat.mount === 'ceiling' && e.cat.kind !== 'jhoola' && !q.has('el');
      const [a2, e2] = turn ? TURN[i] : [az, below ? -14 : el];
      cam.position.copy(center).add(dirFromAngles(a2, turn && below && e2 < 30 ? -e2 : e2).multiplyScalar(dist));
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      aimSun(center, Math.max(radius, 0.4));
      renderer.setViewport(cx * tw, H - (cy + 1) * th, tw, th);
      renderer.setScissor(cx * tw, H - (cy + 1) * th, tw, th);
      renderer.render(scene, cam);
    });
  };
  let n = 0;
  const loop = () => {
    if (n++ === 1 || n % 90 === 0) frame();
    requestAnimationFrame(loop);
  };
  loop();
} else {
  // grid or single item, with orbit controls
  const camera = new THREE.PerspectiveCamera(fov, app.clientWidth / app.clientHeight, 0.05, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const entries: Entry[] = [];
  const bounds = new THREE.Box3();

  if (q.has('kind')) {
    const kind = q.get('kind')!;
    const cat = catalogByKind(kind) ?? ({ kind, name: kind, category: 'Decor', w: 0.6, d: 0.6, h: 0.6, mount: 'floor', rooms: [], material: '', price: [0, 0], colors: ['#b9a88f'] } as CatalogItem);
    const e = makeEntry(cat, { w: num('w', cat.w), d: num('d', cat.d), h: num('h', cat.h), color: q.get('color') ?? undefined });
    entries.push(e);
    scene.add(e.root);
    if (q.has('box')) e.root.add(contractBox(e));
    const repeat = num('n', 1);
    for (let i = 1; i < repeat; i++) {
      const c = makeEntry(cat, { w: e.w, d: e.d, h: e.h, color: e.color });
      c.root.position.x = i * (e.w + 0.4);
      scene.add(c.root);
    }
    bounds.set(new THREE.Vector3(-e.w / 2, e.y0, -e.d / 2), new THREE.Vector3(e.w / 2 + (repeat - 1) * (e.w + 0.4), e.y0 + e.h, e.d / 2));
    const base = `${cat.name}  (${kind})\n${e.w} × ${e.d} × ${e.h} m · ${cat.mount}${e.color ? ' · ' + e.color : ''}\n${e.tris} triangles · ${e.meshes} meshes · ${overflowText(e)}`;
    hud.textContent = base;
    // after the first frames: what the GPU actually holds (copies of one kind share geometry + materials)
    setTimeout(() => {
      hud.textContent = `${base}\n${repeat} cop${repeat > 1 ? 'ies' : 'y'} · ${furnitureCacheSize()} prototype(s) cached · GPU geometries ${renderer.info.memory.geometries} · draw calls ${renderer.info.render.calls}`;
    }, 1500);
  } else {
    // flow layout: categories left to right, wrapping into rows
    const only = q.get('cat');
    const MAX_W = num('rowWidth', 27);
    const slot = (c: CatalogItem) => Math.max(c.w + 0.5, 1.5) + 0.25;
    const sections = CATEGORIES.filter((c) => !only || only === c)
      .map((category) => ({ category, items: CATALOG.filter((c) => c.category === category) }))
      .filter((sec) => sec.items.length);
    const rows: (typeof sections)[] = [];
    let cur: typeof sections = [];
    let curW = 0;
    for (const sec of sections) {
      const sw = sec.items.reduce((a, c) => a + slot(c), 0) + 0.8;
      if (cur.length && curW + sw > MAX_W) {
        rows.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(sec);
      curW += sw;
    }
    if (cur.length) rows.push(cur);
    let z = 0;
    for (const row of rows) {
      const depth = Math.max(...row.flatMap((sec) => sec.items.map((c) => c.d)));
      let x = 0;
      for (const sec of row) {
        const x0 = x;
        for (const cat of sec.items) {
          const e = makeEntry(cat);
          e.root.position.set(x + slot(cat) / 2 - 0.125, 0, z + depth - cat.d / 2);
          scene.add(e.root);
          entries.push(e);
          const lw = slot(cat) - 0.25;
          const lab = labelPlane([cat.kind, `${cat.w}×${cat.d}×${cat.h} · ${e.tris}t`], lw);
          lab.position.set(x + lw / 2, 0.004, z + depth + 0.26);
          scene.add(lab);
          bounds.expandByPoint(new THREE.Vector3(x, 0, z));
          bounds.expandByPoint(new THREE.Vector3(x + slot(cat), Math.min(e.y0 + cat.h, 2.4), z + depth + 1.15));
          x += slot(cat);
        }
        const title = labelPlane([sec.category], Math.min(2.6, x - x0 - 0.25), true);
        title.position.set(x0 + Math.min(2.6, x - x0 - 0.25) / 2, 0.004, z + depth + 0.82);
        scene.add(title);
        x += 0.8;
      }
      z += depth + 2.1;
    }
    const tris = entries.reduce((a, e) => a + e.tris, 0);
    hud.textContent = `${entries.length} kinds · ${tris.toLocaleString()} triangles · ${entries.reduce((a, e) => a + e.meshes, 0)} meshes\n${entries.filter((e) => e.item.userData.placeholder).map((e) => e.cat.kind).join(', ') || 'no placeholders'}`;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = 0.5 * size.length();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 60, size.z + 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, 0, center.z);
  floor.receiveShadow = true;
  scene.add(floor);
  aimSun(center, Math.max(radius, 0.5));
  const single = q.has('kind');
  const dir = dirFromAngles(num('az', single ? 32 : 0), num('el', single ? 16 : 52));
  if (single) {
    const aspect = app.clientWidth / app.clientHeight;
    const dist = ((radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.1 * Math.max(1, 0.9 / aspect)) / zoom;
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    controls.target.copy(center);
  } else {
    controls.target.copy(fitCamera(camera, bounds, dir));
    const gz = zoom * 1.1; // the fit is conservative for a flat layout seen from above
    camera.position.sub(controls.target).multiplyScalar(1 / gz).add(controls.target);
  }
  controls.update();
  frame = () => {
    controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
  window.addEventListener('resize', () => {
    camera.aspect = app.clientWidth / app.clientHeight;
    camera.updateProjectionMatrix();
  });

  if (q.has('fuzz')) {
    // build every kind at awkward sizes and report anything that throws, produces NaN or leaves its box
    const F: [number, number, number][] = [
      [0.5, 1, 1],
      [0.75, 1, 1],
      [1.5, 1, 1],
      [2.2, 1, 1],
      [1, 0.6, 1],
      [1, 1.6, 1],
      [1, 1, 0.6],
      [1, 1, 1.5],
      [0.4, 0.4, 0.4],
      [2, 2, 2],
    ];
    const bad: string[] = [];
    let built = 0;
    for (const c of CATALOG)
      for (const [fw, fd, fh] of F) {
        const e = makeEntry(c, { w: +(c.w * fw).toFixed(3), d: +(c.d * fd).toFixed(3), h: +(c.h * fh).toFixed(3), color: c.colors[c.colors.length - 1] });
        built++;
        const nan = e.over.some((v) => !Number.isFinite(v));
        const lim = c.kind === 'kitchen-sink-unit' || c.kind === 'hob-unit' || c.kind === 'washbasin' || c.kind === 'utility-sink' ? [0.004, 0.004, 0.004, 0.4, 0.004, 0.004] : [0.004, 0.004, 0.004, 0.004, 0.004, 0.004];
        const out = e.over.some((v, i) => v > lim[i]);
        if (nan || out || e.item.userData.placeholder) bad.push(`${c.kind} ×[${fw},${fd},${fh}] ${e.item.userData.placeholder ? 'THREW ' : ''}${nan ? 'NaN ' : ''}${overflowText(e)} · ${e.tris}t`);
      }
    console.error(`FUZZ ${built} builds, ${bad.length} problems\n` + bad.join('\n'));
  }

  if (q.has('stats')) {
    const all = CATALOG.map((c) => {
      const t0 = performance.now();
      makeEntry(c, { w: c.w + 0.001 }); // a size nobody has built yet: measures a real (uncached) build
      const ms = performance.now() - t0;
      const e = makeEntry(c);
      return `${c.kind.padEnd(20)} ${String(e.tris).padStart(6)} tris ${String(e.meshes).padStart(3)} meshes ${ms.toFixed(1).padStart(7)} ms  ${overflowText(e)}${e.item.userData.placeholder ? '  PLACEHOLDER' : ''}`;
    });
    console.error('STATS\n' + all.join('\n'));
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(app.clientWidth, app.clientHeight);
  frame();
});
