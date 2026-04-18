import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.168.0/examples/jsm/environments/RoomEnvironment.js?module';
import { GLTFLoader } from './GLTFLoader.js';
import { Aircraft } from './AirplanePhysics.js';

let scene, camera, renderer, model, plane, mixer, thrust, land, fire, elevation, planePhysics, last;
let attind; 
let raycaster = new THREE.Raycaster();
let trees = [];
let pointerLocked = false;
let mouseDeltaX = 0;
let mouseDeltaY = 0;
let eng1stat = 1;
let eng2stat = 1;
let waitkey1 = false;
let waitkey2 = false;
let keys = {};
let rudderInput = 0;
let rollInput = 0;
let pitchInput = 0;
let touchActive = false;
let lastTouchX = 0;
let lastTouchY = 0;
let throttle = 1;
let throttleTarget = 1;
let throttleResponse = 3.0;
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
  const obj = await loader.loadAsync('jetv2.glb');
  plane = obj.scene;
  mixer = new THREE.AnimationMixer(plane);
  const animations = obj.animations;
  const thrustbase = createCombinedClip(animations, [
    "thrust0", "thrust1", "thrust2", "thrust3", "thrust4", "thrust5", "thrust6", "thrust7"
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
  // plane.rotation.x = 2 * Math.PI / 180
  thrust.play();
  const camOff = new THREE.Vector3(0, 6, 25);
  plane.add(camera);
  camera.position.copy(camOff);
  planePhysics = new Aircraft({
    object: plane,
    weight: 15500,
    wingArea: 158,
    wingspan: 25
  });
  planePhysics.updateThrust(32000);

  const geometryTop = new THREE.SphereGeometry(
    0.035,
    64,
    64,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2   // top half
  );

  const materialTop = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  materialTop.side = THREE.DoubleSide;
  attind = new THREE.Mesh(geometryTop, materialTop);
  camera.add(attind);
  
  const geometryBottom = new THREE.SphereGeometry(
    0.035,
    64,
    64,
    0,
    Math.PI * 2,
    Math.PI / 2,  // start halfway down
    Math.PI / 2   // bottom half
  );

  const ringgeo = new THREE.RingGeometry(0.0075, 0.01, 32);
  const ringmat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  ringmat.side = THREE.DoubleSide;
  const ringind = new THREE.Mesh(ringgeo, ringmat);
  camera.add(ringind);
  ringind.position.set(0.083, -0.08, -0.2);

  const materialBottom = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
  materialBottom.side = THREE.DoubleSide;
  const bottomSphere = new THREE.Mesh(geometryBottom, materialBottom);
  attind.add(bottomSphere);
  attind.position.set(0.1, -0.09, -0.25);

  // Step 1: Load Tree GLB once
  const treeBase = await loader.loadAsync('Tree.glb');

  // Step 2: Clone 5000 trees
  for (let i = 0; i < 5000; i++) {
    const tree = treeBase.scene.clone(true); // deep clone
    const x = Math.random() * 20000 - 10000;
    const z = Math.random() * 20000 - 10000;
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
  document.getElementById('velocity').style.display = "block";
  document.getElementById('vy').style.display = "block";
  document.getElementById('alt').style.display = "block";
  document.getElementById('seaalt').style.display = "block";
  document.getElementById('mach').style.display = "block";
  document.getElementById('engine1').style.display = "block";
  document.getElementById('engine2').style.display = "block";
  document.getElementById('status1').style.display = "block";
  document.getElementById('status2').style.display = "block";
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
          tree.position.y = intersects[0].point.y - miny/2;
        }
      }
    });
  }
  raycaster.set(new THREE.Vector3(plane.position.x, -10, plane.position.z), new THREE.Vector3(0, 1, 0).normalize());
  const intersects = raycaster.intersectObject(model, true);
  if (intersects.length > 0) {
    elevation = intersects[0].point.y;
  }
  updateControls(planePhysics, dt);
  planePhysics.update(dt, elevation);
  camera.lookAt(plane.position.x, plane.position.y, plane.position.z);
  scene.updateMatrixWorld(true);
  const euler = new THREE.Euler().setFromQuaternion(plane.quaternion, 'YXZ');
  const ry = Math.atan(0.1, -0.25);
  const rx = Math.atan(-0.09, Math.sqrt(0.01 + 0.25 * 0.25));
  attind.rotation.set(
    THREE.MathUtils.clamp(euler.x, -Math.PI / 2, Math.PI / 2) + rx, // pitch
    ry,                                                         // ignore yaw
    euler.z                                                    // roll
  );
  const delta = clock.getDelta();
  mixer.update(delta);
  last = performance.now()
  document.getElementById('velocity').textContent = `VELOCITY: ${Math.ceil(planePhysics.velocity.length() * 1.94384)} KTS`
  document.getElementById('mach').textContent = `MACH NO: MACH ${Math.ceil(100 * planePhysics.velocity.length() / 343) / 100}`
  if (Math.ceil(planePhysics.velocity.y * 3.28084) >= 0) {
    document.getElementById('vy').textContent = `ASCENT RATE: ${Math.ceil(planePhysics.velocity.y * 3.28084)} FT/S`
  } else {
    document.getElementById('vy').textContent = `DESCENT RATE: ${-Math.ceil(planePhysics.velocity.y * 3.28084)} FT/S`
  }
  document.getElementById('alt').textContent = `AGL: ${Math.ceil((plane.position.y - elevation) * 3.28084)} FT`
  document.getElementById('seaalt').textContent = `ABSOLUTE ALTITUDE: ${Math.ceil(plane.position.y * 3.28084)} FT`
  if (eng1stat === 1) {
    document.getElementById('status1').textContent = `${Math.round(throttle * 100)}%`
  } else {
    document.getElementById('status1').textContent = `OFF`
  };
  if (eng2stat === 1) {
    document.getElementById('status2').textContent = `${Math.round(throttle * 100)}%`
  } else {
    document.getElementById('status2').textContent = `OFF`
  };
  renderer.render(scene, camera);
}

function updateControls(aircraft, dt) {
  if (pointerLocked || touchActive) {
    const sensitivity = 0.04; // adjust to your preference
    if (keys['KeyW']) {
      pitchInput = 0.5;
    } else if (keys['KeyS']) {
      pitchInput = -0.5;
    } else {
      pitchInput = 0;
    }
    if (keys['KeyA']) {
      rollInput = 1.0;
    } else if (keys['KeyD']) {
      rollInput = -1.0;
    } else {
      rollInput = 0;
    }
    aircraft.setYawInput(-mouseDeltaX * sensitivity * 4 + rollInput);
    aircraft.setRollInput(-mouseDeltaY * sensitivity + pitchInput); // invert Y axis
    if (keys['KeyQ']) {
      rudderInput = 0.5;
    } else if (keys['KeyE']) {
      rudderInput = -0.5;
    } else {
      rudderInput = 0;
    }
    aircraft.setPitchInput(rudderInput);
    console.log("Mouse X movement:  ", mouseDeltaX, "Mouse Y movement:  ", mouseDeltaY);
    // Reset deltas after use
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    
    // Throttle
    if (keys['ArrowUp']) throttleTarget += 0.5 * dt;
    if (keys['ArrowDown']) throttleTarget -= 0.5 * dt;
    if (keys['Digit1']) {
      if (!waitkey1) {
        eng1stat = Math.abs(eng1stat-1);
      }
      waitkey1 = true;
    } else {
      waitkey1 = false;
    }
    if (keys['Digit2']) {
      if (!waitkey2) {
        eng2stat = Math.abs(eng2stat-1);
      }
      waitkey2 = true;
    } else {
      waitkey2 = false;
    }
    throttleTarget = THREE.MathUtils.clamp(throttleTarget, 0, 1);
    throttle += (throttleTarget - throttle) * throttleResponse * dt;
    planePhysics.updateThrust(32000 * throttle * ((eng1stat+eng2stat)/2));
    console.log("THRUST: ", Math.round(32000 * throttle * ((eng1stat+eng2stat)/2)));
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
