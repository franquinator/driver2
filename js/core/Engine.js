import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CameraManager } from './Camera.js';
import { InputHandler } from './InputHandler.js';
import { Vehicle } from '../entities/Vehicle.js';
import { City } from '../entities/City.js';
import { Physics } from '../utils/Physics.js';
import { AudioEngine } from '../utils/AudioEngine.js';
import { SettingsPanel } from './SettingsPanel.js';

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
        this.settingsPanel = new SettingsPanel({
            onChange: (path, value) => this._onConfigChange(path, value),
            getValue: (path) => this._getConfigValue(path),
            onReset: () => this._resetConfig(),
        });
        this._defaultConfig = JSON.parse(JSON.stringify(CONFIG));
        this._loadConfig();

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
     * Aplica un cambio de configuración recibido del panel y persiste el estado.
     * @param {string} path Ruta de configuración (p. ej. 'AUDIO.MASTER_VOLUME').
     * @param {number|boolean} value Nuevo valor.
     */
    _onConfigChange(path, value) {
        this._setConfigValue(path, value);
        this._saveConfig();

        const top = path.split('.')[0];
        if (top === 'AUDIO') {
            if (path === 'AUDIO.MASTER_VOLUME') this.audioEngine.updateMasterVolume(value);
            else if (path === 'AUDIO.ENABLED') this.audioEngine.setEnabled(value);
        }
        if (top === 'PHYSICS') {
            try {
                this.physics.world.gravity = { x: 0, y: value, z: 0 };
            } catch (e) { /* el mundo ya está inicializado */ }
        }
    }

    /**
     * Escribe un valor en una ruta anidada del objeto CONFIG.
     * @param {string} path Ruta (p. ej. 'VEHICLES.MUSCLE.MASS').
     * @param {*} value Valor a asignar.
     */
    _setConfigValue(path, value) {
        const keys = path.split('.');
        let cur = CONFIG;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
            cur = cur[k];
        }
        cur[keys[keys.length - 1]] = value;
    }

    /**
     * Lee un valor desde una ruta anidada del objeto CONFIG.
     * @param {string} path Ruta (p. ej. 'AUDIO.ENGINE.IDLE_RPM').
     * @returns {*}
     */
    _getConfigValue(path) {
        const keys = path.split('.');
        let cur = CONFIG;
        for (const k of keys) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[k];
        }
        return cur;
    }

    /**
     * Guarda la configuración actual en localStorage.
     */
    _saveConfig() {
        try { localStorage.setItem('driver2.config', JSON.stringify(CONFIG)); } catch (e) { /* noop */ }
    }

    /**
     * Carga la configuración guardada (si existe) sobre los valores por defecto.
     */
    _loadConfig() {
        try {
            const raw = localStorage.getItem('driver2.config');
            if (!raw) return;
            const stored = JSON.parse(raw);
            this._deepMerge(CONFIG, stored);
        } catch (e) { /* sin configuracion guardada */ }
    }

    _resetConfig() {
        const defaults = this._defaultConfig;
        for (const key of Object.keys(defaults)) {
            CONFIG[key] = JSON.parse(JSON.stringify(defaults[key]));
        }
        try { localStorage.removeItem('driver2.config'); } catch (e) { /* noop */ }
        this._saveConfig();
        if (this.settingsPanel) this.settingsPanel._render();
    }

    /**
     * Fusiona un objeto fuente en el destino (solo objetos anidados).
     * @param {Object} target
     * @param {Object} source
     */
    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            const sv = source[key];
            const tv = target[key];
            if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
                this._deepMerge(tv, sv);
            } else {
                target[key] = sv;
            }
        }
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
