import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CameraManager } from './Camera.js';
import { InputHandler } from './InputHandler.js';
import { Vehicle } from '../entities/Vehicle.js';
import { City } from '../entities/City.js';
import { Physics } from '../utils/Physics.js';
import { AudioEngine } from '../utils/AudioEngine.js';

/**
 * Motor principal del juego. Coordina la escena, renderizador, física, entidades y loop.
 * Usar `await Engine.create()`: Rapier debe inicializarse antes de construir el motor.
 */
export class Engine {
    /**
     * Inicializa Rapier y crea el motor.
     * @returns {Promise<Engine>}
     */
    static async create() {
        await Physics.init();
        const engine = new Engine();
        await engine.audioEngine.init();
        engine.audioEngine.startEngineSound();
        return engine;
    }

    constructor() {
        this.clock = new THREE.Clock();
        this.isRunning = false;

        this.audioEngine = AudioEngine.getInstance();

        this._initRenderer();
        this._initScene();
        this._initEntities();
        this._initListeners();
    }

    /**
     * Inicializa el WebGLRenderer de Three.js.
     * @private
     */
    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        document.body.appendChild(this.renderer.domElement);
    }

    /**
     * Configura la escena 3D, niebla e iluminación estilo retro.
     * @private
     */
    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.CANVAS.BACKGROUND_COLOR);

        // Niebla retro
        this.scene.fog = new THREE.FogExp2(CONFIG.CANVAS.FOG_COLOR, CONFIG.CANVAS.FOG_DENSITY);

        // Luz ambiental
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Luz direccional (Sol) con sombras
        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.8);
        dirLight.position.set(100, 150, 50);
        dirLight.castShadow = true;

        // Optimización del mapa de sombras
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 300;

        const d = 100;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;

        this.scene.add(dirLight);
    }

    /**
     * Instancia la física, el gestor de cámara, inputs, ciudad y vehículo.
     * @private
     */
    _initEntities() {
        this.physics = new Physics(CONFIG.PHYSICS);
        this.inputHandler = new InputHandler(CONFIG.CONTROLS);
        this.cameraManager = new CameraManager(CONFIG.CAMERA);

        // Generar la ciudad (mallas + colisionadores estáticos)
        this.city = new City(CONFIG.CITY, this.physics);
        this.scene.add(this.city.mesh);

        // Generar el vehículo en el cruce más cercano al centro
        const spawn = this.city.getNearestIntersection(0, 0);
        this._spawnVehicle(CONFIG.DEFAULT_VEHICLE, { x: spawn.x, z: spawn.z, yaw: 0 });
    }

    /**
     * Crea (o sustituye) el vehículo activo.
     * @param {string} key Clave en `CONFIG.VEHICLES`.
     * @param {{x: number, z: number, yaw: number}} spawn
     * @private
     */
    _spawnVehicle(key, spawn) {
        if (this.vehicle) this.vehicle.dispose();

        const preset = CONFIG.VEHICLES[key];
        this.vehicleKey = key;
        this.vehicle = new Vehicle(preset, this.physics, CONFIG.DAMAGE, spawn);
        this.scene.add(this.vehicle.mesh);
        this.cameraManager.setScale(preset.CAMERA_SCALE);
        this.audioEngine.startEngineSound();
    }

    /**
     * Procesa las acciones de una sola pulsación (reiniciar, cambiar vehículo).
     * @private
     */
    _handleActions() {
        for (const action of this.inputHandler.consumeActions()) {
            const pos = this.vehicle.position;
            const spot = this.city.getNearestIntersection(pos.x, pos.z);

            if (action.type === 'reset') {
                this.vehicle.resetToSpawn();
            } else if (action.type === 'selectVehicle') {
                const key = CONFIG.VEHICLE_ORDER[action.index];
                if (key && key !== this.vehicleKey) {
                    this._spawnVehicle(key, { x: spot.x, z: spot.z, yaw: this.vehicle.getYaw() });
                }
            }
        }
    }

    /**
     * Convierte los eventos de fuerza de contacto del chasis en daño.
     * @private
     */
    _onContactForce(event, dt) {
        const handle = this.vehicle.collider.handle;
        if (event.collider1() !== handle && event.collider2() !== handle) return;

        // Cambio de velocidad aproximado en este paso: F·dt / m
        const deltaV = (event.totalForceMagnitude() * dt) / this.vehicle.config.MASS;
        this.vehicle.applyImpact(deltaV);

        // Choque: reproducir sonido procedural según la fuerza del impacto
        this.audioEngine.playCrash(deltaV);
    }

    /**
     * Eventos de ventana.
     * @private
     */
    _initListeners() {
        window.addEventListener('resize', this._onWindowResize.bind(this));
        window.addEventListener('keydown', this._onFirstInteraction.bind(this));
        window.addEventListener('pointerdown', this._onFirstInteraction.bind(this));
    }

    /**
     * Reanuda el audio tras una interacción del usuario (política de autoplay).
     * @private
     */
    _onFirstInteraction() {
        this.audioEngine.resume();
    }

    /**
     * Ajusta el visor cuando la pantalla cambia de tamaño.
     * @private
     */
    _onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.cameraManager.onWindowResize(width, height);
    }

    /**
     * Arranca el bucle de renderizado.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();
        this.renderer.setAnimationLoop(this._animate.bind(this));
    }

    /**
     * Detiene el bucle.
     */
    stop() {
        if (this.isRunning) {
            this.audioEngine.stopEngineSound();
        }
        this.isRunning = false;
        this.renderer.setAnimationLoop(null);
    }

    /**
     * Bucle de actualización y renderizado continuo.
     * @private
     */
    _animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap de seguridad para dTime

        // 1. Acciones puntuales (R, 1-4)
        this._handleActions();

        // 2. Física con paso fijo: controles del vehículo antes de cada paso
        const inputState = this.inputHandler.getState();
        this.physics.update(
            deltaTime,
            (dt) => this.vehicle.applyControls(inputState, dt),
            (event, dt) => this._onContactForce(event, dt)
        );

        // 3. Sincronizar mallas con la física
        this.vehicle.syncMesh();

        // 4. Actualizar la cámara de persecución
        this.cameraManager.update(this.vehicle.position, this.vehicle.getYaw(), deltaTime);

        // 5. Actualizar el sonido procedural del motor
        this._updateEngineSound();

        // 6. Renderizar
        this.renderer.render(this.scene, this.cameraManager.getCamera());
    }

    /**
     * Sincroniza el sonido del motor con el régimen y el acelerador del vehículo.
     * @private
     */
    _updateEngineSound() {
        const vehicle = this.vehicle;
        if (!vehicle) return;

        this.audioEngine.setEngine(
            vehicle.getEngineRpm01(),
            vehicle.getEngineThrottle01()
        );
    }
}
