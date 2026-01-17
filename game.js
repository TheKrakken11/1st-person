import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { GLTFLoader } from './GLTFLoader.js';

let scene, camera, renderer, ground;

async function init3d() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(20, 20, 20); // Move the camera further out
    camera.lookAt(0, 0, 0);          // Make sure camera looks at origin

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Tone mapping & color space for PBR textures
    renderer.outputColorSpace = THREE.sRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    // Lights setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    scene.add(hemiLight);

    // Load the GLB model
    ground = await loadGLB('environment.glb');
    if (!ground) {
        console.error('Failed to load GLB model.');
        return;
    }
    scene.add(ground);

    // Optional: add a simple grid helper to check scale and position
    const grid = new THREE.GridHelper(50, 50);
    scene.add(grid);

    // Start render loop
    animate();

    // Resize handling
    window.addEventListener('resize', onWindowResize, false);
}

function loadGLB(url) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                // Keep original materials (no override)
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve(gltf.scene);
            },
            undefined,
            (error) => {
                console.error('Error loading GLB:', error);
                reject(null);
            }
        );
    });
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

init3d();
