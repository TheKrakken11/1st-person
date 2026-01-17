import * as THREE from 'https://unpkg.com/three@0.168.0/build/three.module.js';
import { GLTFLoader } from './GLTFLoader.js';

let scene, camera, renderer, ground;

async function init3d() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(10, 20, 10);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Tone mapping & color space
    renderer.outputColorSpace = THREE.sRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // stronger ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); // soft sky light
    scene.add(hemi);

    // Load GLB
    ground = await loadGLB('environment.glb');
    scene.add(ground);

    // Start animation loop
    animate();
}

function loadGLB(url) {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                // Keep Blender PBR materials intact
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve(gltf.scene);
            },
            undefined,
            (error) => reject(error)
        );
    });
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init3d();
