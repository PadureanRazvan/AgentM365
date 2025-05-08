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

export const Animation = {
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
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(-10, -10), // Initialize off-screen
    INTERSECTED: null,

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
            this.camera.position.z = 7; // ENHANCEMENT: Slightly further for a grander mobile view
        } else {
            this.camera.position.z = 6; // ENHANCEMENT: Slightly further for a grander desktop view
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
        // ENHANCEMENT: Assuming CONFIG.particles.colors.background is a dark, futuristic color.
        // If it's meant to be transparent, ensure the page background complements this.
        this.renderer.setClearColor(CONFIG.particles.colors.background, AppState.isMobile ? 0.1 : 0); // ENHANCEMENT: Slightly less transparent on mobile if background is complex

        // Add lighting
        this.ambientLight = new THREE.AmbientLight(0x505070, 0.3); // ENHANCEMENT: Slightly brighter, cooler ambient light
        this.scene.add(this.ambientLight);

        this.pointLight = new THREE.PointLight(
            CONFIG.particles.colors.light, // ENHANCEMENT: Ensure this is a vibrant, futuristic color (e.g., electric blue, cyan)
            CONFIG.particles.lightIntensity.standby * 1.2, // ENHANCEMENT: Slightly brighter standby light
            20, // ENHANCEMENT: Increased range
            1.8 // ENHANCEMENT: Softer decay
        );
        this.pointLight.position.set(0, 4, 5); // ENHANCEMENT: Adjusted light position
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

        // Generate random values for each particle (for variation)
        const randomValues = new Float32Array(CONFIG.particles.count);
        for (let i = 0; i < CONFIG.particles.count; i++) randomValues[i] = Math.random();
        geometry.setAttribute('a_random', new THREE.Float32BufferAttribute(randomValues, 1));
        
        // Add morph delay attribute for staggered morphing
        const morphDelays = new Float32Array(CONFIG.particles.count);
        for (let i = 0; i < CONFIG.particles.count; i++) {
            morphDelays[i] = Math.random() * 0.8; // Random delay up to 0.8 (was 0.5) of total morph time
        }
        geometry.setAttribute('a_morphDelay', new THREE.Float32BufferAttribute(morphDelays, 1));
        
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
                // ENHANCEMENT: Ensure CONFIG colors are vibrant (e.g., u_baseColor: electric blue/cyan, u_glowColor: bright white/light cyan)
                u_baseColor: { value: new THREE.Color(CONFIG.particles.colors.particles) },
                u_glowColor: { value: new THREE.Color(CONFIG.particles.colors.glow) },
                u_glowIntensity: { value: 0.0 },
                u_morphProgress: { value: 0.0 },
                u_time: { value: 0.0 },
                u_waveAmplitude: { value: 0.0 },
                u_waveFrequency: { value: CONFIG.particles.thinking.waveFrequencyStart },
                u_isThinking: { value: false },
                u_cameraPos: { value: this.camera.position },
                // ENHANCEMENT: Slightly larger base particle size for more visual impact, if performance allows.
                u_size: { value: (CONFIG.particles.size || 0.02) * 1.2 }, 
                u_noiseScale: { value: 0.6 }, // ENHANCEMENT: Slightly increased noise scale for more detailed turbulence
                u_noiseSpeed: { value: 0.15 }, // ENHANCEMENT: Slightly faster noise animation
                u_noiseStrength: { value: 0.07 }, // ENHANCEMENT: Slightly stronger noise effect
                // Removed hover/click related uniforms
                u_sparkleIntensity: { value: 0.0 }, // For thinking mode sparkle effect
                u_thinkingIntensity: { value: 0.0 } // 0 for standby, 1 for thinking (for fragment shader)
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthTest: true, // ENHANCEMENT: Keep true for correct layering, false could be more "ethereal" but may have sorting issues.
            depthWrite: false,
            blending: THREE.AdditiveBlending // ENHANCEMENT: Additive blending is great for futuristic glow.
        });

        // Create particle system
        this.particles = new THREE.Points(geometry, this.particleMaterial);
        this.scene.add(this.particles);
    },

    /**
     * Create neural network connections
     */
    createNeuralConnections: function() {
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Brighter Cyan/Aqua
            transparent: true,
            opacity: 0.0,
            linewidth: 1.0, // Linewidth > 1 has limitations in WebGL
            blending: THREE.AdditiveBlending
        });

        // Each "connection" will now be made of multiple segments for a jagged look
        const segmentsPerConnection = 5; // Number of jagged segments
        const numConnections = Math.min(400, Math.floor(CONFIG.particles.count * 0.05)); // Increased number of connections

        // Vertices: numConnections * segmentsPerConnection * 2 points * 3 coords
        const vertices = new Float32Array(numConnections * segmentsPerConnection * 2 * 3);
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        this.neuralConnections = new THREE.LineSegments(lineGeometry, lineMaterial);
        this.scene.add(this.neuralConnections);

        this.neuralConnections.userData = { 
            numConnections: numConnections, 
            segmentsPerConnection: segmentsPerConnection 
        };
        
        const maxRadius = Math.max(
            CONFIG.particles.sphereRadius,
            CONFIG.particles.cubeSize / 2,
            CONFIG.particles.cubeSize * 1.2 / 2
        );
        this.neuralConnections.userData.maxRadius = maxRadius;
        
        this.connectionVertices = []; // This will now store start/end for the whole jagged path
        for (let i = 0; i < numConnections; i++) {
            const startParticleIndex = Math.floor(Math.random() * CONFIG.particles.count);
            const endParticleIndex = this.findNearbyParticle(startParticleIndex);

            this.connectionVertices.push({
                startParticleIndex: startParticleIndex,
                endParticleIndex: endParticleIndex,
                // signalProgress, signalSpeed, pulsePhase, pulseSpeed are for the "pulse" along the path
                signalProgress: Math.random(),
                signalSpeed: 0.5 + Math.random() * 1.5,
                active: false,
                activationTime: Math.random() * 2, // Quicker activation
                pulsePhase: Math.random() * Math.PI * 2,
                pulseSpeed: 10 + Math.random() * 20, // Faster pulses
                visible: Math.random() > 0.5, // More chance of being visible initially
                // Store random offsets for jaggedness, one per segment
                jaggednessOffsets: Array.from({length: segmentsPerConnection - 1}, () => (Math.random() - 0.5) * 0.6) // Increased jaggedness (was 0.4)
            });
        }
    },

    findNearbyParticle: function(startIndex) {
        const positionAttr = this.particles.geometry.getAttribute('position');
        const startPos = new THREE.Vector3(
            positionAttr.array[startIndex * 3],
            positionAttr.array[startIndex * 3 + 1],
            positionAttr.array[startIndex * 3 + 2]
        );
        
        const currentRadius = this.neuralConnections.userData.maxRadius;
        // ENHANCEMENT: Allow connections to be slightly longer for a more sprawling network feel
        const maxDistanceAllowed = currentRadius * 0.85; 
        
        const potentialTargets = [];
        const maxAttempts = 40; // ENHANCEMENT: More attempts to find a good nearby particle
        
        for (let i = 0; i < maxAttempts; i++) {
            const targetIndex = Math.floor(Math.random() * CONFIG.particles.count);
            if (targetIndex === startIndex) continue; 
            
            const targetPos = new THREE.Vector3(
                positionAttr.array[targetIndex * 3],
                positionAttr.array[targetIndex * 3 + 1],
                positionAttr.array[targetIndex * 3 + 2]
            );
            
            const distance = startPos.distanceTo(targetPos);
            
            if (distance < maxDistanceAllowed && distance > currentRadius * 0.1) { // ENHANCEMENT: Add a minimum distance to avoid tiny loops
                potentialTargets.push({
                    index: targetIndex,
                    distance: distance
                });
            }
        }
        
        potentialTargets.sort((a, b) => a.distance - b.distance);
        
        return potentialTargets.length > 0 ? 
            potentialTargets[Math.floor(Math.random() * Math.min(potentialTargets.length, 5))].index : // ENHANCEMENT: Pick one of the 5 closest, not always the closest, for variety
            Math.floor(Math.random() * CONFIG.particles.count);
    },

    generateSpherePositions: function(count, radius) {
        const positions = new Float32Array(count * 3);
        const phi = Math.PI * (3.0 - Math.sqrt(5.0)); 

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

    generateCubePositions: function(count, size) {
        const positions = new Float32Array(count * 3);
        const halfSize = size / 2;
        for (let i = 0; i < count; i++) {
            const face = Math.floor(Math.random() * 6);
            const u = Math.random() * size - halfSize;
            const v = Math.random() * size - halfSize;
            switch (face) {
                case 0: positions[i * 3] = halfSize; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break; 
                case 1: positions[i * 3] = -halfSize; positions[i * 3 + 1] = u; positions[i * 3 + 2] = v; break; 
                case 2: positions[i * 3] = u; positions[i * 3 + 1] = halfSize; positions[i * 3 + 2] = v; break; 
                case 3: positions[i * 3] = u; positions[i * 3 + 1] = -halfSize; positions[i * 3 + 2] = v; break; 
                case 4: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = halfSize; break; 
                case 5: positions[i * 3] = u; positions[i * 3 + 1] = v; positions[i * 3 + 2] = -halfSize; break; 
            }
        }
        return positions;
    },

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
        const numSamplesPerEdge = 12; // ENHANCEMENT: More samples for smoother tesseract edges

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

        if (tesseractPoints.length === 0) return this.generateCubePositions(count, size); 

        for (let i = 0; i < count; i++) {
            const point = tesseractPoints[i % tesseractPoints.length];
            positions[i * 3] = point[0];
            positions[i * 3 + 1] = point[1];
            positions[i * 3 + 2] = point[2];
        }
        return positions;
    },

    project4Dto3D: function(point4D, rotation, scale) {
        let [x, y, z, w] = point4D;
        const cos = Math.cos, sin = Math.sin;

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

        const distance = 3.5; // ENHANCEMENT: Slightly adjust distance for tesseract projection perspective
        const wFactor = 1 / (distance - w6);
        return [x6 * wFactor * scale, y6 * wFactor * scale, z6 * wFactor * scale];
    },

    interpolate: function(p1, p2, t) {
        return [
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t,
            p1[2] + (p2[2] - p1[2]) * t
        ];
    },

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
                // ENHANCEMENT: Slightly more sensitive rotation for a more responsive feel
                this.particles.rotation.y += deltaX * AppState.visualizationState.rotation.sensitivity * 1.1;
                this.particles.rotation.x += deltaY * AppState.visualizationState.rotation.sensitivity * 1.1;
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

    handleResize: function() {
        if (!this.camera || !this.renderer) return;
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height, false);
        
        const isMobile = width < 768;
        if (this.particleMaterial) {
            // ENHANCEMENT: Make mobile particles slightly larger for visibility, desktop slightly larger too.
            this.particleMaterial.uniforms.u_size.value = 
                isMobile ? CONFIG.particles.size * 1.5 : CONFIG.particles.size * 1.2;
        }
        
        if (this.particles) {
            if (isMobile) {
                this.particles.position.set(0, -0.35, 0); // ENHANCEMENT: Adjusted mobile centering
            } else {
                this.particles.position.set(0, 0, 0);
            }
        }
    },

    enterThinkingMode: function() {
        if (AppState.visualizationState.currentMode === "thinking" || !this.particleMaterial) return;
        AppState.visualizationState.currentMode = "thinking";
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = "thinking";

        // Use the transition duration from CONFIG
        const transitionDuration = CONFIG.transitions.thinkingEnterDuration;
        
        this.particleMaterial.uniforms.u_isThinking.value = true; // For vertex shader wave logic
        
        // Queue the shape transition to synchronize with other animations
        // Only morphing to a more complex shape for thinking mode
        if (AppState.visualizationState.currentShape === "sphere") {
            // Instead of calling morphTo directly, we'll animate the morphProgress here
            // to ensure it's synchronized with other transitions
            const targetProgress = 0.5; // cube
            
            anime({
                targets: AppState.visualizationState,
                morphProgress: targetProgress,
                duration: transitionDuration,
                easing: 'easeOutQuad',
                update: () => {
                    if (this.particleMaterial) {
                        this.particleMaterial.uniforms.u_morphProgress.value = AppState.visualizationState.morphProgress;
                    }
                },
                complete: () => {
                    AppState.visualizationState.currentShape = "cube";
                }
            });
        }

        // Make all animations use the same duration for smoother transition
        if (this.pointLight) {
            anime({ 
                targets: this.pointLight, 
                intensity: CONFIG.particles.lightIntensity.thinking * 1.5, 
                duration: transitionDuration, 
                easing: 'easeOutQuad' 
            });
        }
        
        // Glow intensity animation
        anime({ 
            targets: AppState.visualizationState, 
            glowIntensity: 0.8, 
            duration: transitionDuration, 
            easing: 'easeOutQuad', 
            update: () => { 
                if (this.particleMaterial) {
                    this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity;
                }
            } 
        });
        
        // Wave animation
        anime({ 
            targets: AppState.visualizationState, 
            waveFrequency: CONFIG.particles.thinking.waveFrequencyEnd * 1.2, 
            duration: transitionDuration, 
            easing: 'easeOutQuad' 
        });
        
        // Wave amplitude animation
        anime({
            targets: this.particleMaterial.uniforms.u_waveAmplitude,
            value: CONFIG.particles.thinking.waveAmplitude * 1.3,
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });
        
        // --- ADD THESE NEW ANIMATIONS ---
        anime({
            targets: this.particleMaterial.uniforms.u_thinkingIntensity,
            value: 1.0,
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_noiseStrength,
            value: 0.35, // Target thinking mode noise strength
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_noiseSpeed,
            value: 0.6, // Target thinking mode noise speed
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_sparkleIntensity,
            value: 1.2, // Target thinking mode sparkle intensity
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });
        // --- END OF ADDED ANIMATIONS ---
        
        if (this.neuralConnections) {
            // Neural connections animation with the same duration
            anime({
                targets: this.neuralConnections.material,
                opacity: 0.8,
                duration: transitionDuration,
                easing: 'easeOutQuad'
            });
            
            // Stagger neural connection activations over the transition duration
            this.connectionVertices.forEach(connection => {
                // Regenerate jaggedness offsets for all connections
                const segmentsPerConnection = this.neuralConnections.userData.segmentsPerConnection;
                connection.jaggednessOffsets = Array.from(
                    {length: segmentsPerConnection - 1}, 
                    () => (Math.random() - 0.5) * 0.35
                );
                
                // Distribute activation times across the full transition duration
                setTimeout(() => {
                    connection.active = true;
                    connection.pulseSpeed = 15 + Math.random() * 25;
                    connection.signalSpeed = 0.8 + Math.random() * 1.8;
                }, connection.activationTime * transitionDuration / 3); // Distribute over first third of transition
            });
            
            this.neuralConnections.material.color.set(0x00ffff);
        }
    },

    enterStandbyMode: function() {
        if (AppState.visualizationState.currentMode === "standby" || !this.particleMaterial) return;
        AppState.visualizationState.currentMode = "standby";
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = "standby";

        // Use the transition duration from CONFIG
        const transitionDuration = CONFIG.transitions.standbyEnterDuration;
        
        this.particleMaterial.uniforms.u_isThinking.value = false; // For vertex shader wave logic
        
        // Queue the shape transition to synchronize with other animations
        // Only morphing to sphere for standby mode
        if (AppState.visualizationState.currentShape !== "sphere") {
            // Instead of calling morphTo directly, we'll animate the morphProgress here
            // to ensure it's synchronized with other transitions
            const targetProgress = 0; // sphere
            
            anime({
                targets: AppState.visualizationState,
                morphProgress: targetProgress,
                duration: transitionDuration,
                easing: 'easeOutQuad',
                update: () => {
                    if (this.particleMaterial) {
                        this.particleMaterial.uniforms.u_morphProgress.value = AppState.visualizationState.morphProgress;
                    }
                },
                complete: () => {
                    AppState.visualizationState.currentShape = "sphere";
                    // Reverse rotation direction when morphing is complete
                    AppState.visualizationState.rotationDirection *= -1;
                }
            });
        }
        
        // Make all animations use the same duration for smoother transition
        if (this.pointLight) {
            anime({ 
                targets: this.pointLight, 
                intensity: CONFIG.particles.lightIntensity.standby, 
                duration: transitionDuration, 
                easing: 'easeOutQuad' 
            });
        }
        
        // Glow intensity animation
        anime({ 
            targets: AppState.visualizationState, 
            glowIntensity: 0.05, 
            duration: transitionDuration, 
            easing: 'easeOutQuad', 
            update: () => { 
                if (this.particleMaterial) {
                    this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity; 
                }
            } 
        });
        
        // Wave amplitude animation
        anime({
            targets: this.particleMaterial.uniforms.u_waveAmplitude,
            value: 0,
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });
        
        // Reset wave frequency immediately since it's not directly visible
        AppState.visualizationState.waveFrequency = CONFIG.particles.thinking.waveFrequencyStart;
        
        // --- ADD THESE NEW ANIMATIONS ---
        anime({
            targets: this.particleMaterial.uniforms.u_thinkingIntensity,
            value: 0.0,
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_noiseStrength,
            value: 0.07, // Target standby mode noise strength
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_noiseSpeed,
            value: 0.15, // Target standby mode noise speed
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });

        anime({
            targets: this.particleMaterial.uniforms.u_sparkleIntensity,
            value: 0.0, // Target standby mode sparkle intensity (off)
            duration: transitionDuration,
            easing: 'easeOutQuad'
        });
        // --- END OF ADDED ANIMATIONS ---
        
        if (this.neuralConnections) {
            // Neural connections animation with the same duration
            anime({
                targets: this.neuralConnections.material,
                opacity: 0.05,
                duration: transitionDuration,
                easing: 'easeOutQuad'
            });
            
            // Stagger neural connection deactivations over the transition duration
            this.connectionVertices.forEach(connection => {
                // Stagger deactivation times for a more natural fade-out
                setTimeout(() => {
                    connection.active = false;
                    // Slow down pulse speeds for a calmer appearance
                    connection.pulseSpeed = 5 + Math.random() * 10;
                    connection.signalSpeed = 0.3 + Math.random() * 0.5;
                }, Math.random() * transitionDuration / 2); // Random timing within first half of transition
            });
        }
    },

    morphTo: function(targetShape) {
        if (!this.particleMaterial) return;
        let targetProgress;
        if (targetShape === "sphere") targetProgress = 0;
        else if (targetShape === "cube") targetProgress = 0.5;
        else if (targetShape === "tesseract") targetProgress = 1.0;
        else return;

        if (Math.abs(AppState.visualizationState.morphProgress - targetProgress) < 0.01) return;

        // Use consistent durations that align with mode transitions
        const baseDuration = AppState.visualizationState.currentMode === "standby" 
            ? CONFIG.particles.morphDuration.standby
            : CONFIG.particles.morphDuration.thinking;
        
        // Calculate the actual duration based on how far we need to morph
        // This prevents morphing from feeling too slow for small changes and too fast for large changes
        const progressDifference = Math.abs(AppState.visualizationState.morphProgress - targetProgress);
        const duration = baseDuration * (0.5 + progressDifference * 0.5);
        
        // Use consistent easing for better transitions
        const easing = 'easeInOutQuad';

        anime({
            targets: AppState.visualizationState,
            morphProgress: targetProgress,
            duration: duration,
            easing: easing,
            update: () => { 
                if (this.particleMaterial) {
                    this.particleMaterial.uniforms.u_morphProgress.value = AppState.visualizationState.morphProgress; 
                }
            },
            complete: () => {
                AppState.visualizationState.currentShape = targetShape;
                AppState.visualizationState.morphProgress = targetProgress;
                if (AppState.visualizationState.currentMode === "standby") {
                    AppState.visualizationState.rotationDirection *= -1;
                }
            }
        });
        
        AppState.visualizationState.lastMorphTime = this.elapsedTime;
    },

    updateNeuralConnections: function(deltaTime) {
        if (!this.neuralConnections || !this.particles) return;

        const particlePosAttr = this.particles.geometry.getAttribute('position');
        const targetAttr = this.particles.geometry.getAttribute('targetPosition');
        const tesseractAttr = this.particles.geometry.getAttribute('tesseractPosition');
        const morphProgress = AppState.visualizationState.morphProgress;

        const linePositions = this.neuralConnections.geometry.getAttribute('position');
        const vertices = linePositions.array;
        const segmentsPerConnection = this.neuralConnections.userData.segmentsPerConnection;

        let vertexOffset = 0;

        this.connectionVertices.forEach((connection) => {
            // Remove temporary forced visibility
            // connection.visible = true;
            
            // Update pulse phase for flickering effect
            connection.pulsePhase += connection.pulseSpeed * deltaTime * (connection.active ? 1 : 0.3);
            const pulseValue = 0.5 + Math.sin(connection.pulsePhase) * 0.5;
            
            // Re-enable visibility calculation - more aggressively flickering in thinking mode
            connection.visible = connection.active && pulseValue > 0.15 || // Was 0.2 - Make flicker slightly more frequent when active
                       !connection.active && pulseValue > 0.95;
            
            // Skip remaining processing if connection is invisible and inactive
            if (!connection.visible && !connection.active && this.neuralConnections.material.opacity < 0.1) {
                for(let s = 0; s < segmentsPerConnection; s++) {
                    const lineIdx = vertexOffset + s * 6;
                    vertices[lineIdx] = vertices[lineIdx + 3] = 0;
                    vertices[lineIdx + 1] = vertices[lineIdx + 4] = 0;
                    vertices[lineIdx + 2] = vertices[lineIdx + 5] = 0;
                }
                vertexOffset += segmentsPerConnection * 6;
                return;
            }

            // Update signal progress
            connection.signalProgress += connection.signalSpeed * deltaTime * (connection.active ? 1 : 0.2);
            if (connection.signalProgress > 1) {
                connection.signalProgress = 0;
                
                // More frequent rerouting for active connections in thinking mode
                if (connection.active && Math.random() < 0.5) {
                    connection.endParticleIndex = this.findNearbyParticle(connection.startParticleIndex);
                    
                    // Also randomize the jaggedness for more dynamic appearance
                    if (AppState.visualizationState.currentMode === "thinking") {
                        connection.jaggednessOffsets = Array.from(
                            {length: segmentsPerConnection - 1}, 
                            () => (Math.random() - 0.5) * 0.6 // Increased from 0.3 to 0.6
                        );
                    }
                }
            }

            // Get start and end positions based on current morph state
            const startP = this.getMorphedParticlePosition(
                connection.startParticleIndex, 
                particlePosAttr, targetAttr, tesseractAttr, morphProgress
            );
            const endP = this.getMorphedParticlePosition(
                connection.endParticleIndex, 
                particlePosAttr, targetAttr, tesseractAttr, morphProgress
            );
            
            // Apply world transformation
            startP.applyMatrix4(this.particles.matrixWorld);
            endP.applyMatrix4(this.particles.matrixWorld);

            // Calculate main direction and length
            const mainDirection = new THREE.Vector3().subVectors(endP, startP);
            const mainLength = mainDirection.length();
            
            // Skip if the connection is too short
            if (mainLength < 0.01) {
                for(let s = 0; s < segmentsPerConnection; s++) {
                    const lineIdx = vertexOffset + s * 6;
                    vertices[lineIdx] = vertices[lineIdx + 3] = 0;
                    vertices[lineIdx + 1] = vertices[lineIdx + 4] = 0;
                    vertices[lineIdx + 2] = vertices[lineIdx + 5] = 0;
                }
                vertexOffset += segmentsPerConnection * 6;
                return;
            }
            
            // Calculate perpendicular direction for jagged offsets
            mainDirection.normalize();
            // Create a better perpendicular vector primarily in the XY plane
            let perpendicular = new THREE.Vector3(-mainDirection.y, mainDirection.x, 0.0);
            if (perpendicular.lengthSq() < 0.0001) { // If mainDirection is mostly along Z-axis
                perpendicular.set(0.0, -mainDirection.z, mainDirection.y);
            }
            perpendicular.normalize();

            // Generate path points with jagged offsets
            const segmentLength = mainLength / segmentsPerConnection;
            const pathPoints = [startP.clone()];
            
            for (let s = 0; s < segmentsPerConnection - 1; s++) {
                // Base point along the straight line
                let nextBasePoint = startP.clone().addScaledVector(mainDirection, segmentLength * (s + 1));
                
                // Apply jagged offset perpendicular to main direction
                let offset = connection.jaggednessOffsets[s];
                
                // Re-enable dynamic wiggle for thinking mode
                if (connection.active && AppState.visualizationState.currentMode === "thinking") {
                    // Add more pronounced time-based variation to the offset
                    offset += Math.sin(this.elapsedTime * 5 + s * 1.5) * 0.2; // Increased from 0.12 to 0.2
                }
                
                let midPointOffset = perpendicular.clone().multiplyScalar(offset * segmentLength * 0.7); // Increase multiplier for more visible jaggedness
                pathPoints.push(nextBasePoint.add(midPointOffset));
            }
            
            // Add end point
            pathPoints.push(endP.clone());
            
            // Calculate total path length for signal progress
            let totalPathLength = 0;
            for (let i = 0; i < pathPoints.length - 1; i++) {
                totalPathLength += pathPoints[i].distanceTo(pathPoints[i+1]);
            }
            if (totalPathLength < 0.01) totalPathLength = 0.01;

            // Draw the pulse along the jagged path
            // Pulse length is proportional to total path length, shorter for more electric appearance
            const pulseLengthRatio = connection.active ? 0.15 : 0.05;
            const pulseLengthWorld = Math.max(0.05, totalPathLength * pulseLengthRatio);
            const signalPosWorld = connection.signalProgress * totalPathLength;

            let accumulatedLength = 0;
            
            // Process each segment
            for (let s = 0; s < segmentsPerConnection; s++) {
                const segStart = pathPoints[s];
                const segEnd = pathPoints[s+1];
                const currentSegLength = segStart.distanceTo(segEnd);

                // Calculate where on this segment the pulse should start and end
                const pulseStartOnSeg = Math.max(0, signalPosWorld - accumulatedLength - pulseLengthWorld / 2);
                const pulseEndOnSeg = Math.min(currentSegLength, signalPosWorld - accumulatedLength + pulseLengthWorld / 2);
                
                const lineIdx = vertexOffset + s * 6;
                
                // If the pulse is on this segment and the connection is visible
                if (pulseEndOnSeg > pulseStartOnSeg && connection.visible) {
                    const dir = new THREE.Vector3().subVectors(segEnd, segStart).normalize();
                    const actualPulseStart = segStart.clone().addScaledVector(dir, pulseStartOnSeg);
                    const actualPulseEnd = segStart.clone().addScaledVector(dir, pulseEndOnSeg);

                    // Set line vertices
                    vertices[lineIdx] = actualPulseStart.x;
                    vertices[lineIdx + 1] = actualPulseStart.y;
                    vertices[lineIdx + 2] = actualPulseStart.z;
                    vertices[lineIdx + 3] = actualPulseEnd.x;
                    vertices[lineIdx + 4] = actualPulseEnd.y;
                    vertices[lineIdx + 5] = actualPulseEnd.z;
                } else {
                    // Pulse not on this segment or connection not visible - collapse to zero-length line
                    vertices[lineIdx] = vertices[lineIdx + 3] = segStart.x;
                    vertices[lineIdx + 1] = vertices[lineIdx + 4] = segStart.y;
                    vertices[lineIdx + 2] = vertices[lineIdx + 5] = segStart.z;
                }
                
                accumulatedLength += currentSegLength;
            }
            
            vertexOffset += segmentsPerConnection * 6;
        });

        // Mark buffer as needing update
        linePositions.needsUpdate = true;
    },

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

            this.particleMaterial.uniforms.u_time.value = this.elapsedTime;
            this.particleMaterial.uniforms.u_cameraPos.value = this.camera.position;
            
            if (AppState.visualizationState.currentMode === "thinking") {
                this.particleMaterial.uniforms.u_waveFrequency.value = AppState.visualizationState.waveFrequency;
                
                if (this.particles && !AppState.visualizationState.rotation.isDragging) {
                    // ENHANCEMENT: Faster, more energetic rotation during thinking
                    this.particles.rotation.y += deltaTime * CONFIG.particles.rotationSpeed * AppState.visualizationState.rotationDirection * 90; 
                }
                
                // ENHANCEMENT: Faster 4D rotation for a more dynamic tesseract
                AppState.visualizationState.rotation4D.xw = (AppState.visualizationState.rotation4D.xw + deltaTime * 0.25) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.yw = (AppState.visualizationState.rotation4D.yw + deltaTime * 0.30) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.zw = (AppState.visualizationState.rotation4D.zw + deltaTime * 0.20) % (2 * Math.PI); // Assuming zw exists in rotation4D state
                
                if (this.particles && (AppState.visualizationState.currentShape === "tesseract" || (AppState.visualizationState.morphProgress > 0.5 && AppState.visualizationState.morphProgress <= 1.0))) {
                    const newTesseractPositions = this.generateTesseractPositions(CONFIG.particles.count, CONFIG.particles.cubeSize * 1.2);
                    const tesseractAttribute = this.particles.geometry.getAttribute('tesseractPosition');
                    if (tesseractAttribute) {
                        tesseractAttribute.set(newTesseractPositions);
                        tesseractAttribute.needsUpdate = true;
                    }
                }
                
                this.updateNeuralConnections(deltaTime);
                // ENHANCEMENT: Make neural connections flicker more erratically in thinking mode
                if (this.neuralConnections && this.neuralConnections.material.opacity > 0) {
                    const baseOpacity = 0.8; // From enterThinkingMode
                    // Quick, sharp, erratic flickers
                    const flickerAmount = Math.random() * 0.6; // Was 0.4 - More extreme flicker for electrical effect
                    this.neuralConnections.material.opacity = baseOpacity * (0.5 + flickerAmount); // Was 0.6 - Lower base to make flickering more noticeable
                    
                    // Make the connections more electric blue during peaks
                    if (flickerAmount > 0.45) {
                        this.neuralConnections.material.color.set(0x00ffff); // Bright cyan for peaks
                    } else {
                        this.neuralConnections.material.color.set(0x007fff); // More blue for valleys
                    }
                }

            } else { // Standby mode
                if (this.particles && !AppState.visualizationState.rotation.isDragging) {
                     // ENHANCEMENT: Slightly faster standby rotation
                    this.particles.rotation.y += deltaTime * CONFIG.particles.rotationSpeed * AppState.visualizationState.rotationDirection * 70;
                }
                // ENHANCEMENT: Shorter interval for more frequent morphing in standby
                if (this.elapsedTime - AppState.visualizationState.lastMorphTime > (CONFIG.particles.morphInterval / 1000) * 0.8) {
                    const currentShape = AppState.visualizationState.currentShape;
                    if (currentShape === "sphere") this.morphTo("cube");
                    else if (currentShape === "cube") this.morphTo("tesseract");
                    else this.morphTo("sphere");
                    AppState.visualizationState.lastMorphTime = this.elapsedTime; 
                }

                // ENHANCEMENT: Slower, continuous 4D rotation in standby for a mesmerizing tesseract
                AppState.visualizationState.rotation4D.xw = (AppState.visualizationState.rotation4D.xw + deltaTime * 0.08) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.yw = (AppState.visualizationState.rotation4D.yw + deltaTime * 0.12) % (2 * Math.PI);
                AppState.visualizationState.rotation4D.xz = (AppState.visualizationState.rotation4D.xz + deltaTime * 0.10) % (2 * Math.PI); // Assuming xz exists

                if (this.particles && (AppState.visualizationState.currentShape === "tesseract" || (AppState.visualizationState.morphProgress > 0.5 && AppState.visualizationState.morphProgress <= 1.0))) {
                    const newTesseractPositions = this.generateTesseractPositions(CONFIG.particles.count, CONFIG.particles.cubeSize * 1.2);
                    const tesseractAttribute = this.particles.geometry.getAttribute('tesseractPosition');
                    if (tesseractAttribute) {
                        tesseractAttribute.set(newTesseractPositions);
                        tesseractAttribute.needsUpdate = true;
                    }
                }
                // ENHANCEMENT: Update neural connections in standby too, if they are meant to be faintly visible/active
                if (this.neuralConnections && this.neuralConnections.material.opacity > 0.01) {
                    this.updateNeuralConnections(deltaTime);
                }
            }

            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error in animation loop:", error);
            cancelAnimationFrame(this.animationFrameId);
            this.dispose(); 
        }
    },

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

    dispose: function() {
        console.log("Disposing animation resources...");
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        if (this.scene) {
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
    },

    // Helper function to get morphed particle position for neural connections
    getMorphedParticlePosition: function(index, posAttr, targetAttr, tesseractAttr, morphProgress) {
        const particleIndex3 = index * 3;
        const pos = new THREE.Vector3();
        if (morphProgress <= 0.5) {
            const t = morphProgress * 2;
            pos.x = posAttr.array[particleIndex3] * (1 - t) + targetAttr.array[particleIndex3] * t;
            pos.y = posAttr.array[particleIndex3 + 1] * (1 - t) + targetAttr.array[particleIndex3 + 1] * t;
            pos.z = posAttr.array[particleIndex3 + 2] * (1 - t) + targetAttr.array[particleIndex3 + 2] * t;
        } else {
            const t = (morphProgress - 0.5) * 2;
            pos.x = targetAttr.array[particleIndex3] * (1 - t) + tesseractAttr.array[particleIndex3] * t;
            pos.y = targetAttr.array[particleIndex3 + 1] * (1 - t) + tesseractAttr.array[particleIndex3 + 1] * t;
            pos.z = targetAttr.array[particleIndex3 + 2] * (1 - t) + tesseractAttr.array[particleIndex3 + 2] * t;
        }
        return pos;
    },
};