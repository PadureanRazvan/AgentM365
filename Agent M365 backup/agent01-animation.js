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
                u_hoverIntensity: { value: 0.25 }, // ENHANCEMENT: Stronger hover feedback
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
        // ENHANCEMENT: Use a brighter, more energetic color for connections.
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00aaff, // ENHANCEMENT: Brighter cyan/blue
            transparent: true,
            opacity: 0.0, // Start invisible
            linewidth: 1.5, // ENHANCEMENT: Slightly thicker lines (note: linewidth > 1 has limitations)
            blending: THREE.AdditiveBlending
        });

        const lineGeometry = new THREE.BufferGeometry();
        
        // ENHANCEMENT: Increase connection density for a richer network, if performance allows.
        const numConnections = Math.min(1500, Math.floor(CONFIG.particles.count * 0.08));
        
        const vertices = new Float32Array(numConnections * 2 * 3); 
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        this.neuralConnections = new THREE.LineSegments(lineGeometry, lineMaterial);
        this.scene.add(this.neuralConnections);
        
        this.neuralConnections.userData = { numConnections: numConnections };
        
        const maxRadius = Math.max(
            CONFIG.particles.sphereRadius,
            CONFIG.particles.cubeSize / 2,
            CONFIG.particles.cubeSize * 1.2 / 2
        );
        this.neuralConnections.userData.maxRadius = maxRadius;
        
        this.connectionVertices = [];
        for (let i = 0; i < numConnections; i++) {
            const startParticleIndex = Math.floor(Math.random() * CONFIG.particles.count);
            const endParticleIndex = this.findNearbyParticle(startParticleIndex);
            
            this.connectionVertices.push({
                startParticleIndex: startParticleIndex,
                endParticleIndex: endParticleIndex,
                signalProgress: Math.random(), 
                // ENHANCEMENT: Wider range of signal speeds for more dynamic variety
                signalSpeed: 0.3 + Math.random() * 1.2, 
                active: false, 
                activationTime: Math.random() * 3, // ENHANCEMENT: Shorter max activation time for quicker ramp-up
                pulsePhase: Math.random() * Math.PI * 2, 
                // ENHANCEMENT: Faster pulse speeds for more energetic visuals
                pulseSpeed: 8 + Math.random() * 15, 
                visible: Math.random() > 0.3 // ENHANCEMENT: More connections initially visible for flickering
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

        this.particleMaterial.uniforms.u_isThinking.value = true;
        if (AppState.visualizationState.currentShape === "sphere") this.morphTo("cube"); // Or tesseract for more immediate complexity

        // ENHANCEMENT: More intense light and glow for thinking mode
        if (this.pointLight) anime({ targets: this.pointLight, intensity: CONFIG.particles.lightIntensity.thinking * 1.5, duration: 700, easing: 'easeOutExpo' });
        anime({ targets: AppState.visualizationState, glowIntensity: 0.8, duration: 700, easing: 'easeOutExpo', update: () => { if (this.particleMaterial) this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity; } });
        // ENHANCEMENT: More dynamic wave animation
        anime({ targets: AppState.visualizationState, waveFrequency: CONFIG.particles.thinking.waveFrequencyEnd * 1.2, duration: 1200, easing: 'easeInOutSine' });
        this.particleMaterial.uniforms.u_waveAmplitude.value = CONFIG.particles.thinking.waveAmplitude * 1.3;
        
        if (this.neuralConnections) {
            anime({
                targets: this.neuralConnections.material,
                opacity: 0.9, // ENHANCEMENT: Brighter connections
                duration: 1200, // ENHANCEMENT: Slightly longer fade-in for dramatic effect
                easing: 'easeOutQuad'
            });
            
            // ENHANCEMENT: Staggered activation of connections for a "powering up" feel
            this.connectionVertices.forEach((connection, index) => {
                // Use a timeout that respects existing activationTime logic if needed, or simplify
                setTimeout(() => {
                    connection.active = true;
                }, connection.activationTime * 200); // Scale activationTime for noticeable stagger
            });
        }
    },

    enterStandbyMode: function() {
        if (AppState.visualizationState.currentMode === "standby" || !this.particleMaterial) return;
        AppState.visualizationState.currentMode = "standby";
        if (DOM.modeIndicator) DOM.modeIndicator.textContent = "standby";

        this.particleMaterial.uniforms.u_isThinking.value = false;
        if (this.pointLight) anime({ targets: this.pointLight, intensity: CONFIG.particles.lightIntensity.standby, duration: 700, easing: 'easeOutQuad' });
        anime({ targets: AppState.visualizationState, glowIntensity: 0.05, duration: 700, easing: 'easeOutQuad', update: () => { if (this.particleMaterial) this.particleMaterial.uniforms.u_glowIntensity.value = AppState.visualizationState.glowIntensity; } }); // ENHANCEMENT: Subtle residual glow
        anime({ targets: this.particleMaterial.uniforms.u_waveAmplitude, value: 0, duration: 700, easing: 'easeOutQuad' });
        AppState.visualizationState.waveFrequency = CONFIG.particles.thinking.waveFrequencyStart;
        
        if (this.neuralConnections) {
            anime({
                targets: this.neuralConnections.material,
                opacity: 0.05, // ENHANCEMENT: Keep connections very faintly visible in standby
                duration: 500,
                easing: 'easeOutQuad'
            });
            
            this.connectionVertices.forEach(connection => {
                connection.active = false; // Some could remain active but dim if desired
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

        // ENHANCEMENT: Faster, more decisive morphing, especially in thinking mode
        const duration = AppState.visualizationState.currentMode === "standby" ? CONFIG.particles.morphDuration.standby * 0.8 : CONFIG.particles.morphDuration.thinking * 0.7;
        const easing = AppState.visualizationState.currentMode === "standby" ? 'easeInOutSine' : 'spring(1, 80, 10, 0)'; // ENHANCEMENT: Springy easing for thinking morph

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

    updateNeuralConnections: function(deltaTime) {
        if (!this.neuralConnections || !this.particles) return;
        
        const positionAttr = this.particles.geometry.getAttribute('position');
        const targetAttr = this.particles.geometry.getAttribute('targetPosition');
        const tesseractAttr = this.particles.geometry.getAttribute('tesseractPosition');
        const morphProgress = AppState.visualizationState.morphProgress;
        
        const linePositions = this.neuralConnections.geometry.getAttribute('position');
        const vertices = linePositions.array;
        
        const maxShapeRadius = this.neuralConnections.userData.maxRadius;
        
        this.connectionVertices.forEach((connection, index) => {
            if (!connection.active && AppState.visualizationState.currentMode !== "thinking") { // ENHANCEMENT: Allow some standby connections to be faintly active if opacity is > 0
                 if (this.neuralConnections.material.opacity < 0.01) { // Only fully hide if material is essentially invisible
                    const lineIdx = index * 6;
                    vertices[lineIdx] = vertices[lineIdx + 3] = 0;
                    vertices[lineIdx + 1] = vertices[lineIdx + 4] = 0;
                    vertices[lineIdx + 2] = vertices[lineIdx + 5] = 0;
                    return;
                 }
            }
            
            connection.pulsePhase += connection.pulseSpeed * deltaTime * (connection.active ? 1 : 0.3); // ENHANCEMENT: Slower pulse if inactive but visible
            
            // ENHANCEMENT: More organic flickering, less binary
            const pulseValue = 0.5 + Math.sin(connection.pulsePhase) * 0.5; // Ranges 0 to 1
            connection.visible = pulseValue > (connection.active ? 0.2 : 0.6); // More likely visible if active

            if (!connection.visible && !connection.active && this.neuralConnections.material.opacity < 0.1) { // Stricter hiding for inactive standby
                const lineIdx = index * 6;
                vertices[lineIdx] = vertices[lineIdx + 3] = 0;
                vertices[lineIdx + 1] = vertices[lineIdx + 4] = 0;
                vertices[lineIdx + 2] = vertices[lineIdx + 5] = 0;
                return;
            }
            
            connection.signalProgress += connection.signalSpeed * deltaTime * (connection.active ? 1 : 0.2);
            if (connection.signalProgress > 1) {
                connection.signalProgress = 0;
                // ENHANCEMENT: More frequent and slightly smarter rerouting
                if (connection.active && Math.random() < 0.35) { 
                    connection.endParticleIndex = this.findNearbyParticle(connection.startParticleIndex);
                } else if (!connection.active && Math.random() < 0.05) { // Infrequent reroute for standby
                    connection.endParticleIndex = this.findNearbyParticle(connection.startParticleIndex);
                }
            }
            
            const startIdx = connection.startParticleIndex * 3;
            const startPos = new THREE.Vector3();
            
            if (morphProgress <= 0.5) {
                const t = morphProgress * 2;
                startPos.x = positionAttr.array[startIdx] * (1 - t) + targetAttr.array[startIdx] * t;
                startPos.y = positionAttr.array[startIdx + 1] * (1 - t) + targetAttr.array[startIdx + 1] * t;
                startPos.z = positionAttr.array[startIdx + 2] * (1 - t) + targetAttr.array[startIdx + 2] * t;
            } else {
                const t = (morphProgress - 0.5) * 2;
                startPos.x = targetAttr.array[startIdx] * (1 - t) + tesseractAttr.array[startIdx] * t;
                startPos.y = targetAttr.array[startIdx + 1] * (1 - t) + tesseractAttr.array[startIdx + 1] * t;
                startPos.z = targetAttr.array[startIdx + 2] * (1 - t) + tesseractAttr.array[startIdx + 2] * t;
            }
            startPos.applyMatrix4(this.particles.matrixWorld);
            
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
            
            const direction = new THREE.Vector3().subVectors(endPos, startPos);
            const distance = direction.length();
            
            // ENHANCEMENT: Slightly longer pulses
            const pulseLengthRatio = connection.active ? 0.3 : 0.15; // Longer pulses when active
            const pulseLength = Math.max(0.05, distance * pulseLengthRatio); // Ensure minimum pulse length
            
            const currentSignalPos = connection.signalProgress * distance;
            const pulseStartOffset = Math.max(0, currentSignalPos - pulseLength / 2);
            const pulseEndOffset = Math.min(distance, currentSignalPos + pulseLength / 2);

            const pulseStart = startPos.clone().add(direction.clone().normalize().multiplyScalar(pulseStartOffset));
            const pulseEnd = startPos.clone().add(direction.clone().normalize().multiplyScalar(pulseEndOffset));
            
            const lineIdx = index * 6; 
            
            if (!connection.visible && !connection.active) { // If not visible and not active, make the segment zero length effectively hiding it
                 vertices[lineIdx] = vertices[lineIdx + 3] = startPos.x; // Collapse to start point
                 vertices[lineIdx + 1] = vertices[lineIdx + 4] = startPos.y;
                 vertices[lineIdx + 2] = vertices[lineIdx + 5] = startPos.z;
            } else {
                vertices[lineIdx] = pulseStart.x;
                vertices[lineIdx + 1] = pulseStart.y;
                vertices[lineIdx + 2] = pulseStart.z;
                vertices[lineIdx + 3] = pulseEnd.x;
                vertices[lineIdx + 4] = pulseEnd.y;
                vertices[lineIdx + 5] = pulseEnd.z;
            }
        });
        
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
            
            // ENHANCEMENT: More dynamic noise based on mode
            this.particleMaterial.uniforms.u_noiseStrength.value = AppState.visualizationState.currentMode === "thinking" ? 0.12 : 0.07;
            this.particleMaterial.uniforms.u_noiseSpeed.value = AppState.visualizationState.currentMode === "thinking" ? 0.25 : 0.15;

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
                 // ENHANCEMENT: Make overall connection brightness pulse slightly in thinking mode
                if (this.neuralConnections && this.neuralConnections.material.opacity > 0) {
                    const baseOpacity = 0.9; // From enterThinkingMode
                    this.neuralConnections.material.opacity = baseOpacity - Math.abs(Math.sin(this.elapsedTime * 2.5)) * 0.3; // Pulsate opacity
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
    }
};

// Export the Animation module
export { Animation };