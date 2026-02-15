import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.168.0/examples/jsm/environments/RoomEnvironment.js?module';
import { GLTFLoader } from './GLTFLoader.js';

let scene, camera, renderer, model, plane, mixer, thrust, land, fire, elevation;
let vertices = [];
let raycaster = new THREE.Raycaster();
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
  camera.far = 10000;
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
  model.scale.set(150, 150, 150);
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
  thrust.play();
  const camOff = new THREE.Vector3(0, 5, 15);
  plane.add(camera);
  camera.position.copy(camOff);
  extractVerticesFromGround();
  for (let i = 0; i < 500; i++) {
    const base = await loader.loadAsync('Tree.glb');  // Load your tree model
    const tree = base.scene;
    scene.add(tree);

    // Generate random (x, z) positions within the terrain bounds
    const x = Math.floor(Math.random() * (500 + 500 + 1)) - 500;
    const z = Math.floor(Math.random() * (500 + 500 + 1)) - 500;

    // Use getElevationAt to find the height at (x, z)
    const elevation = (getElevationAt(x, z) * 150);

    // Set the tree position at the correct elevation
    const miny = new THREE.Box3().setFromObject(tree).min.y;
    tree.position.set(x, elevation + 300 - miny, z);
    if (i == 100) {
      console.log("Tree #100 position:  ", tree.position.y);
    }
  }
  
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

// Extract the vertices from the ground model
function extractVerticesFromGround() {
  const ground = model; // Your ground model (make sure it's loaded)
  
  // Traverse the model and extract vertices from each mesh
  ground.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry;
      const positionAttribute = geometry.getAttribute('position');
      
      for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        vertices.push(vertex); // Store each vertex in the vertices array
      }
    }
  });
}


function getElevationAt(xbase, zbase) {
  const x = xbase / 150
  const z = zbase / 150
  let lowerLeft = null;
  let lowerRight = null;
  let upperLeft = null;
  let upperRight = null;

  // Find the 4 closest vertices surrounding the (x, z) point
  for (let vertex of vertices) {
    if (vertex.x <= x && vertex.z <= z) upperLeft = vertex;
    if (vertex.x >= x && vertex.z <= z) upperRight = vertex;
    if (vertex.x <= x && vertex.z >= z) lowerLeft = vertex;
    if (vertex.x >= x && vertex.z >= z) lowerRight = vertex;
  }

  // If we have the four surrounding vertices, use bilinear interpolation
  if (upperLeft && upperRight && lowerLeft && lowerRight) {
    const x1 = upperLeft.x, x2 = upperRight.x, x3 = lowerLeft.x, x4 = lowerRight.x;
    const z1 = upperLeft.z, z2 = lowerLeft.z;
    const y1 = upperLeft.y, y2 = upperRight.y, y3 = lowerLeft.y, y4 = lowerRight.y;

    // Interpolate in the x-direction (top and bottom rows)
    const f1 = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);  // Top row interpolation
    const f2 = y3 + ((x - x3) / (x4 - x3)) * (y4 - y3);  // Bottom row interpolation

    // Interpolate in the z-direction between the two rows
    const elevation = f1 + ((z - z1) / (z2 - z1)) * (f2 - f1);

    return elevation;
  }

  // If no valid surrounding vertices, fallback to nearest vertex method
  return getNearestElevation(x, z);  // A fallback method to use the nearest vertex
}

function getNearestElevation(x, z) {
  let closestVertex = null;
  let minDistance = Infinity;

  // Find the closest vertex to (x, z)
  for (let vertex of vertices) {
    const distance = Math.sqrt(Math.pow(x - vertex.x, 2) + Math.pow(z - vertex.z, 2));  // 2D distance
    if (distance < minDistance) {
      minDistance = distance;
      closestVertex = vertex;
    }
  }

  // Return the y (elevation) of the closest vertex
  return closestVertex ? closestVertex.y : 0;
}


const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  raycaster.set(new THREE.Vector3(plane.position.x, -10, plane.position.z), new THREE.Vector3(0, 1, 0).normalize());
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length > 0) {
    elevation = intersects[0].point.y;
  }
  plane.position.y = elevation + 30;
  camera.lookAt(plane.position.x, plane.position.y, plane.position.z);
  const delta = clock.getDelta();
  mixer.update(delta);
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
