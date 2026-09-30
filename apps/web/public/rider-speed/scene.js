import * as THREE from 'three';

const embedded = new URLSearchParams(location.search).has('embed');
const stage = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xffffff, 1);
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.35, 0.15, 22);

function fitCamera() {
  const verticalSlope = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  camera.position.z = Math.max(22, 14.4 / (verticalSlope * camera.aspect));
}
fitCamera();

const clock = new THREE.Clock();
const rider = new THREE.Group();
scene.add(rider);
if (embedded) {
  rider.scale.setScalar(1.45);
  rider.position.x = 1.05;
}

const imageWidth = 13.35;
const imageHeight = imageWidth * 768 / 1365;
const imageGeometry = new THREE.PlaneGeometry(imageWidth, imageHeight, 80, 36);

const texture = await new THREE.TextureLoader().loadAsync('/assets/logo.jpg');
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const keyedMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { map: { value: texture }, opacity: { value: 1 }, phase: { value: 0 } },
  vertexShader: `
    uniform float phase;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;

      // Keep the photographic anatomy rigid. Fine body motion is applied to
      // the assembled rider/bike group so it cannot ripple like a flat flag.
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float opacity;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(map, vUv);
      float whiteness = min(c.r, min(c.g, c.b));
      float spread = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      float alpha = 1.0 - smoothstep(0.91, 0.995, whiteness - spread * 0.32);
      if (alpha < 0.012) discard;
      gl_FragColor = vec4(c.rgb, alpha * opacity);
    }
  `
});

const photo = new THREE.Mesh(imageGeometry, keyedMaterial);
photo.position.y = 0.2;
rider.add(photo);

function imagePoint(px, py, z = 0.04) {
  return new THREE.Vector3((px / 1365 - 0.5) * imageWidth, (0.5 - py / 768) * imageHeight + 0.2, z);
}

const wheels = [];
function makeWheel(px, py, radius) {
  const group = new THREE.Group();
  group.position.copy(imagePoint(px, py, 0.08));
  group.userData.baseY = group.position.y;
  const staticSpokeMask = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.70, 96),
    new THREE.MeshBasicMaterial({ color: 0x161616, transparent: true, opacity: 0.42, depthWrite: false })
  );
  group.add(staticSpokeMask);
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.74, radius * 0.94, 96),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.25, depthWrite: false })
  );
  group.add(outer);
  for (let i = 0; i < 24; i++) {
    const spoke = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 1.30, 0.018),
      new THREE.MeshBasicMaterial({ color: 0xa0a0a0, transparent: true, opacity: 0.19, depthWrite: false })
    );
    spoke.rotation.z = i * Math.PI / 12;
    group.add(spoke);
  }
  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.12, 32),
    new THREE.MeshBasicMaterial({ color: 0x292929, transparent: true, opacity: 0.34, depthWrite: false })
  );
  group.add(hub);
  rider.add(group);
  wheels.push(group);
}
makeWheel(371, 600, 1.13);
makeWheel(848, 600, 1.12);

const speedLayer = new THREE.Group();
scene.add(speedLayer);
const streaks = [];
for (let i = 0; i < 38; i++) {
  const length = 0.75 + Math.random() * 3.2;
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(length, 0.012 + Math.random() * 0.025),
    new THREE.MeshBasicMaterial({ color: i % 7 === 0 ? 0xd52e23 : 0x777777, transparent: true, opacity: 0.07 + Math.random() * 0.12, depthWrite: false })
  );
  line.position.set(-8 + Math.random() * 16, -2.5 + Math.random() * 5.4, -0.5);
  line.userData.startX = line.position.x;
  line.userData.cycles = 1 + Math.floor(Math.random() * 3);
  speedLayer.add(line);
  streaks.push(line);
}

let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionFx = true;
let elapsed = 0;
const loopDuration = 4;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  if (!paused) elapsed += dt;
  const t = elapsed;
  const phase = (t % loopDuration) / loopDuration * Math.PI * 2;
  keyedMaterial.uniforms.phase.value = phase;

  const road = Math.sin(phase * 10) * 0.022 + Math.sin(phase * 5) * 0.016;
  const suspension = Math.sin(phase * 4) * 0.018 + Math.sin(phase * 7) * 0.008;
  rider.position.y = road + suspension;
  rider.position.x = embedded ? 1.05 : 0;
  // A restrained acceleration pitch keeps the seated rider and motorcycle
  // connected. No local texture warping is used.
  rider.rotation.z = -0.010 + Math.sin(phase * 2) * 0.006;
  rider.rotation.y = Math.sin(phase) * 0.004;

  wheels.forEach((wheel, i) => {
    wheel.rotation.z = -phase * (28 + i * 2);
    wheel.position.y = wheel.userData.baseY + Math.sin(phase * 6 + i * 1.7) * 0.007;
  });

  camera.position.x = 0.35 + Math.sin(phase) * 0.045;
  camera.position.y = 0.15 + Math.sin(phase * 7) * 0.008;
  camera.lookAt(0, -0.1, 0);
  streaks.forEach((line) => {
    line.visible = motionFx;
    const travel = ((phase / (Math.PI * 2)) * line.userData.cycles * 20) % 20;
    line.position.x = ((line.userData.startX - travel + 10) % 20 + 20) % 20 - 10;
  });

  renderer.render(scene, camera);
}
animate();

document.querySelector('#pause').addEventListener('click', (event) => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'Play' : 'Pause';
  event.currentTarget.setAttribute('aria-pressed', String(paused));
});
document.querySelector('#motion').addEventListener('click', (event) => {
  motionFx = !motionFx;
  event.currentTarget.textContent = `Motion FX: ${motionFx ? 'on' : 'off'}`;
  event.currentTarget.setAttribute('aria-pressed', String(motionFx));
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  fitCamera();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
