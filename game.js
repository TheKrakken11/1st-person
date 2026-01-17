import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { GLTFLoader } from './GLTFLoader.js';
function loadIt(url) {
	return new Promise((resolve, reject) => {
		const loader = new GLTFLoader();
		loader.load(
			url,
			(gltf) => {
				const obj = gltf.scene;
				resolve(obj);
			},
			undefined,
			(error) => reject(error)
		);
	});
}
let ground
async function init3d() {
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87ceeb);
  ground = await loadIt('environment.glb');
  scene.add(ground);
	camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(10, 20, 10);
  renderer = new THREE.WebGLRenderer();
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);
	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(10, 10, 10);
	scene.add(light);
	const ambientLight = new THREE.AmbientLight(0x404040, 10);
	scene.add(ambientLight);
  animate();
}
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
init3d();
