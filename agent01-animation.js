/**
 * AGENT 01 - Animation Module
 * Handles the 3D particle visualization using Three.js and Anime.js.
 */

// Import necessary shared state, config, and DOM references
// These will be exported from agent01-logic.js
import { AppState } from './agent01-logic.js';
import { CONFIG } from './agent01-logic.js';
import { DOM } from './agent01-logic.js';

// Ensure THREE and anime are loaded (check global scope)
if (typeof THREE === 'undefined' || typeof anime === 'undefined') {
    console.error("THREE.js or Anime.js not loaded. Animation module cannot function.");
    // Optionally throw an error or return a dummy object
}

const Animation = {
    scene: null,
    camera: null,
    renderer: null,
    particles: null,
    particleMaterial: null,
    clock: null,
    ambientLight: null,
    pointLight: null,
    elapsedTime: 0,
    animationFrameId: null,
    neuralConnections: null, // Store the neural connections mesh
    connectionVertices: [], // Store connection points

    /**
     * Initialize the animation system
     */
    initialize: function() {
        // Check if already initialized or if essential DOM elements are missing
        if (this.renderer || !DOM.canvas) {
            console.warn("Animation already initialized or canvas element missing.");
            return;
        }
        try {
            this.initScene();
            this.createParticleSystem();
            this.createNeuralConnections(); // Initialize neural connections
            this.setupEventListeners();
            this.animate();
            console.log("Animation system initialized");
        } catch (error) {
            console.error("Error during animation initialization:", error);
            this.dispose(); // Clean up if initialization fails
        }
    },

    /**
     * Initialize Three.js scene, camera, renderer
     */
    initScene: function() {
        // Create scene
        this.scene = new THREE.Scene();

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Adjust camera position based on device
        if (AppState.isMobile) {
            // Move camera slightly further back on mobile
            this.camera.position.z = 6;
        } else {
            this.camera.position.z = 5;
        }

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: DOM.canvas,
            antialias: true,
            alpha: true
        });
        // Set size to actual display size for mobile optimization
        const pixelRatio = Math.min(window.devicePixelRatio, 2); // Limit pixel ratio for performance
        this.renderer.setPixelRatio(pixelRatio);
        this.handleResize(); // Call resize immediately to set correct size
        this.renderer.setClearColor(CONFIG.particles.colors.background, 0);

        // Add lighting
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.2);
        this.scene.add(this.ambientLight);

        this.pointLight = new THREE.PointLight(
            CONFIG.particles.colors.light,
            CONFIG.particles.lightIntensity.standby,
            15, 2
        );
        this.pointLight.position.set(0, 3, 4);
        this.scene.add(this.pointLight);

        // Setup clock
        this.clock = new THREE.Clock();
        this.elapsedTime = 0;
    },

    /**
     * Create the particle system
     */
    createParticleSystem: function() {
        // Create geometry
        const geometry = new THREE.BufferGeometry();

        // Generate positions
        const spherePositions = this.generateSpherePositions(CONFIG.particles.count, CONFIG.particles.sphereRadius);
        const cubePositions = this.generateCubePositions(CONFIG.particles.count, CONFIG.particles.cubeSize);
        const tesseractPositions = this.generateTesseractPositions(CONFIG.particles.count, CONFIG.particles.cubeSize * 1.2);

        // Set attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(spherePositions, 3));
        geometry.setAttribute('targetPosition', new THREE.Float32BufferAttribute(cubePositions, 3));
        geometry.setAttribute('tesseractPosition', new THREE.Float32BufferAttribute(tesseractPositions, 3));

        // Generate particle indices
        const particleIndices = new Float32Array(CONFIG.particles.count);
        for (let i = 0; i < CONFIG.particles.count; i++) particleIndices[i] = i;
        geometry.setAttribute('particleIndex', new THREE.Float32BufferAttribute(particleIndices, 1));
        
        // Generate random values for each particle (for variation)
        const randomValues = new Float32Array(CONFIG.particles.count);
        for (let i = 0; i < CONFIG.particles.count; i++) randomValues[i] = Math.random();
        geometry.setAttribute('a_random', new THREE.Float32BufferAttribute(randomValues, 1));
        
        // Initialize highlight values (for interactive effects)
        const highlightValues = new Float32Array(CONFIG.particles.count);
        for (let i = 0; i < CONFIG.particles.count; i++) highlightValues[i] = 0.0; // Start with no highlight
        geometry.setAttribute('a_highlight', new THREE.Float32BufferAttribute(highlightValues, 1));

        // Get shader code
        const vertexShader = document.getElementById('vertexShader')?.textContent;
        const fragmentShader = document.getElementById('fragmentShader')?.textContent;
        if (!vertexShader || !fragmentShader) throw new Error("Shader code not found.");

        // Create material
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_baseColor: { value: new THREE.Color(CONFIG.particles.colors.particles) },
                u_glowColor: { value: new THREE.Color(CONFIG.particles.colors.glow) },
                u_glowIntensity: { value: 0.0 },
                u_morphProgress: { value: 0.0 },
                u_time: { value: 0.0 },
                u_waveAmplitude: { value: 0.0 },
                u_waveFrequency: { value: CONFIG.particles.thinking.waveFrequencyStart },
                u_isThinking: { value: false },
                u_cameraPos: { value: this.camera.position },
                u_size: { value: CONFIG.particles.size || 0.02 },
                u_noiseScale: { value: 0.5 },
                u_noiseSpeed: { value: 0.1 },
                u_noiseStrength: { value: 0.05 },
                u_hoverIntensity: { value: 0.2 },
                // modelViewMatrix, projectionMatrix, and modelMatrix are automatically provided by Three.js
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Create particle system
        this.particles = new THREE.Points(geometry, this.particleMaterial);
        this.scene.add(this.particles);
    },

    /**
     * Create neural network connections
     */
    createNeuralConnections: function() {
        // We'll create a line material with dark blue color
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x0055ff, // Dark blue
            transparent: true,
            opacity: 0.0, // Start invisible
            linewidth: 1,
            blending: THREE.AdditiveBlending
        });

        // Create empty line geometry
        const lineGeometry = new THREE.BufferGeometry();
        
        // We'll set number of connections as a fraction of total particles
        const numConnections = Math.min(1000, Math.floor(CONFIG.particles.count * 0.05));
        
        // Create an array to hold line vertices (each line has 2 vertices)
        const vertices = new Float32Array(numConnections * 2 * 3); // 2 points per line, 3 coords per point
        
        // We'll update these in the animate function, initially all zeros
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        // Create lines mesh and add to scene
        this.neuralConnections = new THREE.LineSegments(lineGeometry, lineMaterial);
        this.scene.add(this.neuralConnections);
        
        // Store how many connections we have
        this.neuralConnections.userData = { numConnections: numConnections };
        
        // Calculate max shape radius for boundary constraint
        const maxRadius = Math.max(
            CONFIG.particles.sphereRadius,
            CONFIG.particles.cubeSize / 2,
            CONFIG.particles.cubeSize * 1.2 / 2
        );
        this.neuralConnections.userData.maxRadius = maxRadius;
        
        // We'll store connection data for animation
        this.connectionVertices = [];
        for (let i = 0; i < numConnections; i++) {
            // Get a random start particle
            const startParticleIndex = Math.floor(Math.random() * CONFIG.particles.count);
            
            // Find a nearby end particle (to ensure connections stay within shape)
            const endParticleIndex = this.findNearbyParticle(startParticleIndex);
            
            this.connectionVertices.push({
                startParticleIndex: startParticleIndex,
                endParticleIndex: endParticleIndex,
                signalProgress: Math.random(), // Random initial progress
                signalSpeed: 0.2 + Math.random() * 0.8, // Random speed
                active: false, // Start inactive
                activationTime: Math.random() * 5, // Stagger activation
                pulsePhase: Math.random() * Math.PI * 2, // Random phase for the pulse effect
                pulseSpeed: 5 + Math.random() * 10, // Random pulse speed
                visible: Math.random() > 0.5 // Random initial visibility for flickering effect
            });
        }
    },

    /**
     * Find a nearby particle to connect with
     * This ensures connections stay within the shape's boundary
     */
    findNearbyParticle: function(startIndex) {
        const positionAttr = this.particles.geometry.getAttribute('position');
        const startPos = new THREE.Vector3(
            positionAttr.array[startIndex * 3],
            positionAttr.array[startIndex * 3 + 1],
            positionAttr.array[startIndex * 3 + 2]
        );
        
        // Get current shape radius
        const currentRadius = this.neuralConnections.userData.maxRadius;
        const maxDistanceAllowed = currentRadius * 0.7; // Only connect to particles within 70% of radius
        
        // Find potential targets within acceptable distance
        const potentialTargets = [];
        const maxAttempts = 30; // Limit search attempts
        
        for (let i = 0; i < maxAttempts; i++) {
            const targetIndex = Math.floor(Math.random() * CONFIG.particles.count);
            if (targetIndex === startIndex) continue; // Skip self
            
            const targetPos = new THREE.Vector3(
                positionAttr.array[targetIndex * 3],
                positionAttr.array[targetIndex * 3 + 1],
                positionAttr.array[targetIndex * 3 + 2]
            );
            
            const distance = startPos.distanceTo(targetPos);
            
            if (distance < maxDistanceAllowed) {
                potentialTargets.push({
                    index: targetIndex,
                    distance: distance
                });
            }
        }
        
        // Sort by proximity
        potentialTargets.sort((a, b) => a.distance - b.distance);
        
        // If we found at least one suitable target, return it
        // Otherwise fallback to a random particle but we'll constrain it in the update function
        return potentialTargets.length > 0 ? 
            potentialTargets[0].index : 
            Math.floor(Math.random() * CONFIG.particles.count);
    },

    /**
     * Generate random positions on a sphere surface using Fibonacci lattice
     */
    generateSpherePositions: function(count, radius) {
        const positions = new Float32Array(count * 3);
        const phi = Math.PI * (3.0 - Math.sqrt(5.0)); // Golden angle

        for (let i = 0; i < count; i++) {
            const y = 1 - (i / (count - 1)) * 2;
            const radiusAtY = Math.sqrt(1 - y * y);
            const theta = phi * i;
            const x = Math.cos(theta) * radiusAtY;
            const z = Math.sin(theta) * radiusAtY;
            positions[i * 3] = x * radius;
            positions[i * 3 + 1] = y * radius;
            positions[i * 3 + 2] = z * radius;
        }
        return positions;
    },

    /**
     * Generate random positions on a cube surface
     */
    generateCubePositions: function(count, size) {
        const positions = new Float32Array(count * 3);
        const halfSize = size / 2;
        for (let i = 0; i < count; i++) {
            const face = Math.floor(Math.random() * 6);
            const u = Math.random() * size - halfSize;
            const v = Math.random() * size - halfSize;
            switch (face) {
                case 0: positions[i * 3] = halfSize; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break; // +X
                case 1: positions[i * 3] = -halfSize; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break; // -X
                case 2: positions[i * 3] = u; positions[i * 3 + 1] = halfSize; positions[i * 3 + 2] = v; break; // +Y
                case 3: positions[i * 3] = u; positions[i * 3 + 1] = -halfSize; positions[i * 3 + 2] = v; break; // -Y
                case 4: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = halfSize; break; // +Z
                case 5: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = -halfSize; break; // -Z
            }
        }
        return positions;
    },

    /**
     * Generate tesseract positions by projecting 4D points
     */
    generateTesseractPositions: function(count, size) {
        const positions = new Float32Array(count * 3);
        const halfSize = size / 2;
        const rotation4D = AppState.visualizationState.rotation4D;
        const tesseractPoints = [];
        const vertices4D = [];

        for (let x = -1; x <= 1; x += 2)
            for (let y = -1; y <= 1; y += 2)
                for (let z = -1; z <= 1; z += 2)
                    for (let w = -1; w <= 1; w += 2)
                        vertices4D.push([x, y, z, w]);

        const vertices3D = vertices4D.map(v => this.project4Dto3D(v, rotation4D, halfSize));
        const numSamplesPerEdge = 10;

        for (let i = 0; i < vertices4D.length; i++) {
            for (let j = i + 1; j < vertices4D.length; j++) {
                let diffCount = 0;
                for (let k = 0; k < 4; k++) if (vertices4D[i][k] !== vertices4D[j][k]) diffCount++;
                if (diffCount === 1) {
                    for (let t = 0; t <= 1; t += 1 / numSamplesPerEdge) {
                        tesseractPoints.push(this.interpolate(vertices3D[i], vertices3D[j], t));
                    }
                }
            }
        }

        if (tesseractPoints.length === 0) return this.generateCubePositions(count, size); // Fallback

        for (let i = 0; i < count; i++) {
            const point = tesseractPoints[i % tesseractPoints.length];
            positions[i * 3] = point[0];
            positions[i * 3 + 1] = point[1];
            positions[i * 3 + 2] = point[2];
        }
        return positions;
    },

    /**
     * Project a 4D point to 3D space with rotations
     */
    project4Dto3D: function(point4D, rotation, scale) {
        let [x, y, z, w] = point4D;
        const cos = Math.cos, sin = Math.sin;

        // Apply rotations (simplified sequence)
        let x1 = cos(rotation.xy) * x - sin(rotation.xy) * y;
        let y1 = sin(rotation.xy) * x + cos(rotation.xy) * y;
        let z1 = z, w1 = w;
        let x2 = cos(rotation.xz) * x1 - sin(rotation.xz) * z1;
        let z2 = sin(rotation.xz) * x1 + cos(rotation.xz) * z1;
        let y2 = y1, w2 = w1;
        let x3 = cos(rotation.xw) * x2 - sin(rotation.xw) * w2;
        let w3 = sin(rotation.xw) * x2 + cos(rotation.xw) * w2;
        let y3 = y2, z3 = z2;
        let y4 = cos(rotation.yz) * y3 - sin(rotation.yz) * z3;
        let z4 = sin(rotation.yz) * y3 + cos(rotation.yz) * z3;
        let x4 = x3, w4 = w3;
        let y5 = cos(rotation.yw) * y4 - sin(rotation.yw) * w4;
        let w5 = sin(rotation.yw) * y4 + cos(rotation.yw) * w4;
        let x5 = x4, z5 = z4;
        let z6 = cos(rotation.zw) * z5 - sin(rotation.zw) * w5;
        let w6 = sin(rotation.zw) * z5 + cos(rotation.zw) * w5;
        let x6 = x5, y6 = y5;

        // Perspective projection
        const distance = 4;
        const wFactor = 1 / (distance - w6);
        return [x6 * wFactor * scale, y6 * wFactor * scale, z6 * wFactor * scale];
    },

    /**
     * Interpolate between two 3D points
     */
    interpolate: function(p1, p2, t) {
        return [
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t,
            p1[2] + (p2[2] - p1[2]) * t
        ];
    },

    /**
     * Set up event listeners for animation controls (resize, drag)
     */
    setupEventListeners: function() {
        window.addEventListener('resize', () => this.handleResize());

        const canvas = this.renderer.domElement;
        let isDragging = false;
        let previousPointerPosition = { x: 0, y: 0 };

        const onPointerDown = (event) => {
            if (AppState.visualizationState.currentMode !== "standby") return;
            isDragging = true;
            const pointer = event.touches ? event.touches[0] : event;
            previousPointerPosition.x = pointer.clientX;
            previousPointerPosition.y = pointer.clientY;
            AppState.visualizationState.rotation.isDragging = true;
            canvas.style.cursor = 'grabbing';
        };

        const onPointerUp = () => {
            if (!isDragging) return;
            isDragging = false;
            AppState.visualizationState.rotation.isDragging = false;
            canvas.style.cursor = 'grab';
        };

        const onPointerMove = (event) => {
            if (!isDragging || AppState.visualizationState.currentMode !== "standby") return;
            const pointer = event.touches ? event.touches[0] : event;
            const deltaX = pointer.clientX - previousPointerPosition.x;
            const deltaY = pointer.clientY - previousPointerPosition.y;
            if (this.particles) {
                this.particles.rotation.y += deltaX * AppState.visualizationState.rotation.sensitivity;
                this.particles.rotation.x += deltaY * AppState.visualizationState.rotation.sensitivity;
                this.particles.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.particles.rotation.x));
            }
            previousPointerPosition.x = pointer.clientX;
            previousPointerPosition.y = pointer.clientY;
        };

        canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchend', onPointerUp);
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        canvas.style.cursor = 'grab';
    },

    /**
     * Handle window resize
     */
    handleResize: function() {
        if (!this.camera || !this.renderer) return;
        
        // Get device dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update camera aspect ratio
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size - use actual client size to match display
        this.renderer.setSize(width, height, false);
        
        // For mobile devices, adjust particle size/density and ensure proper positioning
        const isMobile = width < 768;
        if (this.particleMaterial) {
            // Adjust particle size for better mobile performance
            this.particleMaterial.uniforms.u_size.value = 
                isMobile ? CONFIG.particles.size * 1.2 : CONFIG.particles.size;
        }
        
        // Center the particles in the view for mobile
        if (this.particles) {
            if (isMobile) {
                // Adjust position for mobile - reset any rotation-based offset
                this.particles.position.set(0, -0.5, 0); // Slightly lower on mobile for better centering
            } else {
                // Reset to center for desktop
                this.particles.position.set(0, 0, 0);
            }
        }
    },

    /**
     * Enter thinking mode animation
     */
    enterThinkingMode: function() {
        if (AppState.visualizationState.currentMode === "thinking" || !this.particleMaterial) return;
        AppState.visualizationState.currentMode = "thinking";
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = "thinking";

        this.particleMaterial.uniforms.u_isThinking.value = true;
        if (AppState.visualizationState.currentShape === "sphere") this.morphTo("cube");

        if (this.pointLight) anime({ targets: this.pointLight, intensity: CONFIG.particles.lightIntensity.thinking, duration: 500, easing: 'easeOutQuad' });
        anime({ targets: AppState.visualizationState, glowIntensity: 0.5, duration: 500, easing: 'easeOutQuad', update: () => { if (this.particleMaterial) this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity; } });
        anime({ targets: AppState.visualizationState, waveFrequency: CONFIG.particles.thinking.waveFrequencyEnd, duration: 1000, easing: 'easeInOutQuad' });
        this.particleMaterial.uniforms.u_waveAmplitude.value = CONFIG.particles.thinking.waveAmplitude;
        
        // Show neural connections
        if (this.neuralConnections) {
            anime({
                targets: this.neuralConnections.material,
                opacity: 0.8,
                duration: 1000,
                easing: 'easeOutQuad'
            });
            
            // Activate connections
            this.connectionVertices.forEach(connection => {
                connection.active = true;
            });
        }
    },

    /**
     * Enter standby mode animation
     */
    enterStandbyMode: function() {
        if (AppState.visualizationState.currentMode === "standby" || !this.particleMaterial) return;
        AppState.visualizationState.currentMode = "standby";
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = "standby";

        this.particleMaterial.uniforms.u_isThinking.value = false;
        if (this.pointLight) anime({ targets: this.pointLight, intensity: CONFIG.particles.lightIntensity.standby, duration: 500, easing: 'easeOutQuad' });
        anime({ targets: AppState.visualizationState, glowIntensity: 0, duration: 500, easing: 'easeOutQuad', update: () => { if (this.particleMaterial) this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity; } });
        anime({ targets: this.particleMaterial.uniforms.u_waveAmplitude, value: 0, duration: 500, easing: 'easeOutQuad' });
        AppState.visualizationState.waveFrequency = CONFIG.particles.thinking.waveFrequencyStart;
        
        // Hide neural connections
        if (this.neuralConnections) {
            anime({
                targets: this.neuralConnections.material,
                opacity: 0,
                duration: 300,
                easing: 'easeOutQuad'
            });
            
            // Deactivate connections
            this.connectionVertices.forEach(connection => {
                connection.active = false;
            });
        }
    },

    /**
     * Morph between shapes
     */
    morphTo: function(targetShape) {
        if (!this.particleMaterial) return;
        let targetProgress;
        if (targetShape === "sphere") targetProgress = 0;
        else if (targetShape === "cube") targetProgress = 0.5;
        else if (targetShape === "tesseract") targetProgress = 1.0;
        else return;

        if (Math.abs(AppState.visualizationState.morphProgress - targetProgress) < 0.01) return;

        const duration = AppState.visualizationState.currentMode === "standby" ? CONFIG.particles.morphDuration.standby : CONFIG.particles.morphDuration.thinking;
        const easing = AppState.visualizationState.currentMode === "standby" ? 'easeInOutSine' : 'easeInOutQuad';

        anime({
            targets: AppState.visualizationState,
            morphProgress: targetProgress,
            duration: duration,
            easing: easing,
            update: () => { this.particleMaterial.uniforms.u_morphProgress.value = AppState.visualizationState.morphProgress; },
            complete: () => {
                AppState.visualizationState.currentShape = targetShape;
                AppState.visualizationState.morphProgress = targetProgress;
                if (AppState.visualizationState.currentMode === "standby") AppState.visualizationState.rotationDirection *= -1;
                console.log("Morph complete. Current shape:", targetShape);
            }
        });
        AppState.visualizationState.lastMorphTime = this.elapsedTime;
    },

    /**
     * Update neural network connections
     */
    updateNeuralConnections: function(deltaTime) {
        if (!this.neuralConnections || !this.particles) return;
        
        // Get current particle positions based on morph state
        const positionAttr = this.particles.geometry.getAttribute('position');
        const targetAttr = this.particles.geometry.getAttribute('targetPosition');
        const tesseractAttr = this.particles.geometry.getAttribute('tesseractPosition');
        const morphProgress = AppState.visualizationState.morphProgress;
        
        // Update connections
        const linePositions = this.neuralConnections.geometry.getAttribute('position');
        const vertices = linePositions.array;
        
        // Get current shape radius
        const maxShapeRadius = this.neuralConnections.userData.maxRadius;
        
        this.connectionVertices.forEach((connection, index) => {
            if (!connection.active) return;
            
            // Update pulse phase
            connection.pulsePhase += connection.pulseSpeed * deltaTime;
            
            // Determine visibility based on pulse phase (creates flickering effect)
            connection.visible = (Math.sin(connection.pulsePhase) > 0);
            
            // Skip if not visible in this frame
            if (!connection.visible) {
                // Make line invisible by setting start and end at same point
                const lineIdx = index * 6; // 2 points * 3 coordinates
                vertices[lineIdx] = 0;
                vertices[lineIdx + 1] = 0;
                vertices[lineIdx + 2] = 0;
                vertices[lineIdx + 3] = 0;
                vertices[lineIdx + 4] = 0;
                vertices[lineIdx + 5] = 0;
                return;
            }
            
            // Animate signal progress
            connection.signalProgress += connection.signalSpeed * deltaTime;
            if (connection.signalProgress > 1) {
                connection.signalProgress = 0;
                // Occasionally change target particle to a nearby one
                if (Math.random() < 0.2) {
                    connection.endParticleIndex = this.findNearbyParticle(connection.startParticleIndex);
                }
            }
            
            // Get start particle position (accounting for morph state)
            const startIdx = connection.startParticleIndex * 3;
            const startPos = new THREE.Vector3();
            
            if (morphProgress <= 0.5) {
                // Between sphere and cube
                const t = morphProgress * 2;
                startPos.x = positionAttr.array[startIdx] * (1 - t) + targetAttr.array[startIdx] * t;
                startPos.y = positionAttr.array[startIdx + 1] * (1 - t) + targetAttr.array[startIdx + 1] * t;
                startPos.z = positionAttr.array[startIdx + 2] * (1 - t) + targetAttr.array[startIdx + 2] * t;
            } else {
                // Between cube and tesseract
                const t = (morphProgress - 0.5) * 2;
                startPos.x = targetAttr.array[startIdx] * (1 - t) + tesseractAttr.array[startIdx] * t;
                startPos.y = targetAttr.array[startIdx + 1] * (1 - t) + tesseractAttr.array[startIdx + 1] * t;
                startPos.z = targetAttr.array[startIdx + 2] * (1 - t) + tesseractAttr.array[startIdx + 2] * t;
            }
            
            // Apply particle rotation
            startPos.applyMatrix4(this.particles.matrixWorld);
            
            // Get end particle position
            const endIdx = connection.endParticleIndex * 3;
            const endPos = new THREE.Vector3();
            
            if (morphProgress <= 0.5) {
                const t = morphProgress * 2;
                endPos.x = positionAttr.array[endIdx] * (1 - t) + targetAttr.array[endIdx] * t;
                endPos.y = positionAttr.array[endIdx + 1] * (1 - t) + targetAttr.array[endIdx + 1] * t;
                endPos.z = positionAttr.array[endIdx + 2] * (1 - t) + targetAttr.array[endIdx + 2] * t;
            } else {
                const t = (morphProgress - 0.5) * 2;
                endPos.x = targetAttr.array[endIdx] * (1 - t) + tesseractAttr.array[endIdx] * t;
                endPos.y = targetAttr.array[endIdx + 1] * (1 - t) + tesseractAttr.array[endIdx + 1] * t;
                endPos.z = targetAttr.array[endIdx + 2] * (1 - t) + tesseractAttr.array[endIdx + 2] * t;
            }
            
            endPos.applyMatrix4(this.particles.matrixWorld);
            
            // Calculate direction vector
            const direction = new THREE.Vector3().subVectors(endPos, startPos);
            const distance = direction.length();
            
            // Ensure connection stays within bounds by constraining the end position if needed
            if (distance > maxShapeRadius * 0.7) {
                direction.normalize();
                endPos.copy(startPos).add(direction.multiplyScalar(maxShapeRadius * 0.7));
            }
            
            // Interpolate signal position based on progress
            const signalProgress = connection.signalProgress;
            
            // Create electrical signal effect
            // Instead of a continuous line, we'll create a shorter pulse that travels along the path
            const pulseLength = distance * 0.2; // Pulse is 20% of total distance
            const pulseStart = startPos.clone().add(direction.clone().normalize().multiplyScalar(signalProgress * distance - pulseLength/2));
            const pulseEnd = startPos.clone().add(direction.clone().normalize().multiplyScalar(signalProgress * distance + pulseLength/2));
            
            // Keep pulse within the path
            if (signalProgress * distance < pulseLength/2) {
                pulseStart.copy(startPos);
            }
            if (signalProgress * distance + pulseLength/2 > distance) {
                pulseEnd.copy(endPos);
            }
            
            // Set line positions
            const lineIdx = index * 6; // 2 points * 3 coordinates
            
            // Start point
            vertices[lineIdx] = pulseStart.x;
            vertices[lineIdx + 1] = pulseStart.y;
            vertices[lineIdx + 2] = pulseStart.z;
            
            // End point
            vertices[lineIdx + 3] = pulseEnd.x;
            vertices[lineIdx + 4] = pulseEnd.y;
            vertices[lineIdx + 5] = pulseEnd.z;
        });
        
        // Mark geometry for update
        linePositions.needsUpdate = true;
    },

    /**
     * Main animation loop
     */
    animate: function() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        if (!this.renderer || !this.scene || !this.camera || !this.clock || !this.particleMaterial) {
            console.warn("Animation loop cannot run: Missing components.");
            cancelAnimationFrame(this.animationFrameId);
            return;
        }

        try {
            const deltaTime = this.clock.getDelta();
            this.elapsedTime += deltaTime;
            this.updateFPS();

            // Update uniforms
            this.particleMaterial.uniforms.u_time.value = this.elapsedTime;
            this.particleMaterial.uniforms.u_cameraPos.value = this.camera.position;
            
            if (AppState.visualizationState.currentMode === "thinking") {
                this.particleMaterial.uniforms.u_waveFrequency.value = AppState.visualizationState.waveFrequency;
                
                // Add rotation during thinking mode
                if (this.particles && !AppState.visualizationState.rotation.isDragging) {
                    this.particles.rotation.y += deltaTime * CONFIG.particles.rotationSpeed * AppState.visualizationState.rotationDirection * 60;
                }
                
                // Update 4D rotation
                AppState.visualizationState.rotation4D.xw = (AppState.visualizationState.rotation4D.xw + deltaTime * 0.1) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.yw = (AppState.visualizationState.rotation4D.yw + deltaTime * 0.15) % (2 * Math.PI);
                
                // Regenerate tesseract positions if needed
                if (this.particles && (AppState.visualizationState.currentShape === "tesseract" || (AppState.visualizationState.morphProgress > 0.5 && AppState.visualizationState.morphProgress <= 1.0))) {
                    const newTesseractPositions = this.generateTesseractPositions(CONFIG.particles.count, CONFIG.particles.cubeSize * 1.2);
                    const tesseractAttribute = this.particles.geometry.getAttribute('tesseractPosition');
                    if (tesseractAttribute) {
                        tesseractAttribute.set(newTesseractPositions);
                        tesseractAttribute.needsUpdate = true;
                    }
                }
                
                // Update neural connections
                this.updateNeuralConnections(deltaTime);
            }

            if (AppState.visualizationState.currentMode === "standby") {
                if (this.particles && !AppState.visualizationState.rotation.isDragging) {
                    this.particles.rotation.y += deltaTime * CONFIG.particles.rotationSpeed * AppState.visualizationState.rotationDirection * 60;
                }
                if (this.elapsedTime - AppState.visualizationState.lastMorphTime > CONFIG.particles.morphInterval / 1000) {
                    const currentShape = AppState.visualizationState.currentShape;
                    if (currentShape === "sphere") this.morphTo("cube");
                    else if (currentShape === "cube") this.morphTo("tesseract");
                    else this.morphTo("sphere");
                    AppState.visualizationState.lastMorphTime = this.elapsedTime; // Reset timer immediately
                }

                // Update 4D rotation
                AppState.visualizationState.rotation4D.xw = (AppState.visualizationState.rotation4D.xw + deltaTime * 0.1) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.yw = (AppState.visualizationState.rotation4D.yw + deltaTime * 0.15) % (2 * Math.PI);

                // Regenerate tesseract positions if needed
                if (this.particles && (AppState.visualizationState.currentShape === "tesseract" || (AppState.visualizationState.morphProgress > 0.5 && AppState.visualizationState.morphProgress <= 1.0))) {
                    const newTesseractPositions = this.generateTesseractPositions(CONFIG.particles.count, CONFIG.particles.cubeSize * 1.2);
                    const tesseractAttribute = this.particles.geometry.getAttribute('tesseractPosition');
                    if (tesseractAttribute) {
                        tesseractAttribute.set(newTesseractPositions);
                        tesseractAttribute.needsUpdate = true;
                    }
                }
            }

            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error in animation loop:", error);
            cancelAnimationFrame(this.animationFrameId);
            this.dispose(); // Attempt cleanup on loop error
        }
    },

    /**
     * Update FPS counter
     */
    updateFPS: function() {
        AppState.visualizationState.fpsCounter.frames++;
        const now = performance.now();
        const timeDiff = now - AppState.visualizationState.fpsCounter.lastTime;
        if (timeDiff >= 1000) {
            AppState.visualizationState.fpsCounter.value = Math.round(AppState.visualizationState.fpsCounter.frames * 1000 / timeDiff);
            if (DOM.fpsCounter) DOM.fpsCounter.textContent = AppState.visualizationState.fpsCounter.value;
            AppState.visualizationState.fpsCounter.frames = 0;
            AppState.visualizationState.fpsCounter.lastTime = now;
        }
    },

    /**
     * Clean up resources
     */
    dispose: function() {
        console.log("Disposing animation resources...");
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        if (this.scene) {
            // Dispose geometries, materials, textures in the scene
            this.scene.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            this.scene = null;
        }
        this.particles = null;
        this.particleMaterial = null;
        this.neuralConnections = null;
        this.connectionVertices = [];
        this.camera = null;
        this.clock = null;
    }
};

// Export the Animation module
export { Animation };