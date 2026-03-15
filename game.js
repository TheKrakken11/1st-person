import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.168.0/examples/jsm/environments/RoomEnvironment.js?module';
import { GLTFLoader } from './GLTFLoader.js';
import { Aircraft } from './AirplanePhysics.js';

let scene, camera, renderer, model, plane, mixer, thrust, land, fire, elevation, planePhysics, last;
let raycaster = new THREE.Raycaster();
let trees = [];
let pointerLocked = false;
let mouseDeltaX = 0;
let mouseDeltaY = 0;
let keys = {};
let rudderInput = 0;
let touchActive = false;
let lastTouchX = 0;
let lastTouchY = 0;
init3d();

async function init3d() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // Camera
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.far = 100000;
  camera.updateProjectionMatrix();
  camera.position.set(0, 700, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);
  renderer.physicallyCorrectLights = true;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(
    new RoomEnvironment(),
    0.04
  ).texture;
  scene.environmentIntensity = 0.7;

  pmremGenerator.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemiLight);

  // Fog
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.00008);
  // Load GLB
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('environment.glb');

  model = gltf.scene;

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.geometry.computeVertexNormals();
      const m = child.material;
      m.flatShading = false;
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        m.metalness = 0.0;
        m.roughness = 1.0;
        m.envMap = null;
      }
      m.needsUpdate = true;
      console.log('Mesh: ', child.name);
      console.log('  type: ', m.type);
      console.log('  color: ', m.color?.getHexString());
      console.log('  map: ', m.map);
      console.log('  uv: ', !!child.geometry.attributes.uv);
      console.log('  uv2: ', !!child.geometry.attributes.uv2);
      console.log('  color_0 attribute: ', child.geometry.attributes.color);
      console.log('  baseColorTexture: ',
                  m.map ? 'YES' : 'NO'
                  );
    }
  });
  scene.add(model);
  model.scale.set(300, 300, 300);
  model.position.y = 0;
  const box = new THREE.Box3().setFromObject(model);
  const miny = box.min.y;
  model.position.y = -miny
  // Optional grid for scale reference
  // scene.add(new THREE.GridHelper(100, 100));
  // Load jet
  const obj = await loader.loadAsync('jet.glb');
  plane = obj.scene;
  mixer = new THREE.AnimationMixer(plane);
  const animations = obj.animations;
  const thrustbase = createCombinedClip(animations, [
    "thrust0", "thrust1", "thrust2", "thrust3", "thrust4", "thrust5", "thrust6", "thrust7", "thrust8", "thrust9"
    ], "thrust");
  const landbase = createCombinedClip(animations, [
    "landing11", "landing12", "landing13", "landing14", "landing15", "landing16", "landing17", "landing18", "landing21", "landing22", "landing23", "landing31", "landing32", "landing33"
    ], "land");
  const firebase = createCombinedClip(animations, [
    "fire0", "fire1", "fire2", "fire3"
    ], "fire");
  thrust = mixer.clipAction(thrustbase);
  land = mixer.clipAction(landbase);
  fire = mixer.clipAction(firebase);
  if (!thrust) {
    console.error("Thrust animations not found!");
  } else if (!land) {
    console.error("Landing animations not found!");
  } else if (!fire) {
    console.error("Fire animations not found!");
  }
  scene.add(plane);
  plane.scale.set(0.3048, 0.3048, 0.3048);
  plane.position.y = 1000;
  plane.rotation.x = 2 * Math.PI / 180
  thrust.play();
  const camOff = new THREE.Vector3(0, 5, 15);
  plane.add(camera);
  camera.position.copy(camOff);
  planePhysics = new Aircraft({
    object: plane,
    weight: 15500,
    wingArea: 158,
    wingspan: 25
  });
  planePhysics.updateThrust(11500 * 4.44822);

  // Step 1: Load Tree GLB once
  const treeBase = await loader.loadAsync('Tree.glb');

  // Step 2: Clone 1000 trees
  for (let i = 0; i < 1000; i++) {
    const tree = treeBase.scene.clone(true); // deep clone
    const x = Math.random() * 4000 - 2000;
    const z = Math.random() * 4000 - 2000;
    tree.position.set(x, -10, z);
    scene.add(tree);
    trees.push(tree);
  }

  const canvas = document.querySelector('canvas'); // your Three.js canvas
  canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (event) => {
    if (pointerLocked) {
      mouseDeltaX += event.movementX;
      mouseDeltaY += event.movementY;
    }
  });
  
  document.addEventListener('keydown', (event) => {
    keys[event.code] = true;
  });

  document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
  });

  canvas.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    touchActive = true;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
  });
  
  canvas.addEventListener("touchmove", (e) => {
    if (!touchActive) return;
    const touch = e.touches[0];
    const dx = touch.clientX - lastTouchX;
    const dy = touch.clientY - lastTouchY;
    mouseDeltaX += dx;
    mouseDeltaY += dy;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
  });
  
  canvas.addEventListener("touchend", () => {
    touchActive = false;
    mouseDeltaX = 0;
    mouseDeltaY = 0;
  });
  
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
        break;
      case 'ArrowDown':
        break;
    }
  });
  document.getElementById('loading')?.remove();
  last = performance.now();
  animate();
}

function createCombinedClip(allClips, names, newName) {
  const selected = names
    .map(name => THREE.AnimationClip.findByName(allClips, name))
    .filter(Boolean);
  if (!selected.length) {
    console.warn("No clips found for", newName);
    return null;
  }
  const tracks = selected.flatMap(clip => clip.tracks);
  const duration = Math.max(...selected.map(c => c.duration));
  return new THREE.AnimationClip(newName, duration, tracks);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  let dt = (performance.now() - last) / 1000;
  dt = Math.min(dt, 0.033); // max ~30 FPS physics step
  if (trees.some(tree => tree.position.y === -10)) {
    trees.forEach((tree) => {
      if (tree.position.y === -10) {
        const box = new THREE.Box3().setFromObject(tree);
        const height = box.max.y - box.min.y;
        tree.scale.set(6/height, 6/height, 6/height);
        const box2 = new THREE.Box3().setFromObject(tree);
        const miny = box2.min.y;
        raycaster.set(new THREE.Vector3(tree.position.x, -10, tree.position.z), new THREE.Vector3(0, 1, 0).normalize());
        const intersects = raycaster.intersectObject(model, true);
        if (intersects.length > 0) {
          tree.position.y = intersects[0].point.y - miny;
        }
      }
    });
  }
  raycaster.set(new THREE.Vector3(plane.position.x, -10, plane.position.z), new THREE.Vector3(0, 1, 0).normalize());
  const intersects = raycaster.intersectObject(model, true);
  if (intersects.length > 0) {
    elevation = intersects[0].point.y;
  }
  updateControls(planePhysics);
  planePhysics.update(dt, elevation);
  camera.lookAt(plane.position.x, plane.position.y, plane.position.z);
  const delta = clock.getDelta();
  mixer.update(delta);
  last = performance.now()
  renderer.render(scene, camera);
}

function updateControls(aircraft) {
  if (pointerLocked || touchActive) {
    const sensitivity = 0.02; // adjust to your preference
    aircraft.setYawInput(-mouseDeltaX * sensitivity);
    aircraft.setPitchInput(-mouseDeltaY * sensitivity); // invert Y axis
    if (keys['KeyQ']) {
      rudderInput = 0.5;
    } else if (keys['KeyE']) {
      rudderInput = -0.5;
    } else {
      rudderInput = 0;
    }
    aircraft.setRollInput(rudderInput);
    console.log("Mouse X movement:  ", mouseDeltaX, "Mouse Y movement:  ", mouseDeltaY);
    // Reset deltas after use
    mouseDeltaX = 0;
    mouseDeltaY = 0;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
