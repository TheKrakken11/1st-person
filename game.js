import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.168.0/examples/jsm/environments/RoomEnvironment.js?module';
import { GLTFLoader } from './GLTFLoader.js';

let scene, camera, renderer, model;

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
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

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
  // Lighting (Don McCurdy–style defaults)
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

      const m = child.material;
      console.log('Mesh: ', child.name);
      console.log('  type: ', m.type);
      console.log('  color: ', m.color?.getHexString());
      console.log('  map: ', m.map);
      console.log('  uv: ', !!child.geometry.attributes.uv);
      console.log('  uv2: ', !!child.geometry.attributes.uv2);
      console.log('  color_0 attribute: ', child.geometry.attributes.color);
      console.log('  first vertex color: ',
                  child.geometry.attributes.color.getX(0),
                  child.geometry.attributes.color.getY(0),
                  child.geometry.attributes.color.getZ(0)
                  ),
      console.log('  baseColorTexture: ',
                  m.map ? 'YES' : 'NO'
                  );
    }
  });

  scene.add(model);

  // Optional grid for scale reference
  scene.add(new THREE.GridHelper(50, 50));

  window.addEventListener('resize', onWindowResize);
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
