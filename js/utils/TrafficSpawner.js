import { CONFIG } from '../config.js';
import { TrafficVehicle } from '../entities/TrafficVehicle.js';
import { TrafficLight } from '../entities/TrafficLight.js';

/**
 * Sistema encargado de spawnear, actualizar y gestionar los vehículos de tráfico.
 * Funciona de forma independiente al vehículo del jugador.
 */
export class TrafficSpawner {
    /**
     * @param {import('../utils/Physics.js').Physics} physics Instancia del mundo físico.
     * @param {import('../entities/City.js').City} city Instancia de la ciudad.
     */
    constructor(physics, city, scene) {
        this.physics = physics;
        this.city = city;
        this.scene = scene;

        // Estado del spawner
        this.vehicles = []; // Array de vehículos activos
        this.spawnTimer = 0;
        this.maxVehicles = CONFIG.TRAFFIC.MAX_VEHICLES;
        this.spawnRate = CONFIG.TRAFFIC.SPAWN_RATE;

        // Configuración
        this.spawnProbability = CONFIG.TRAFFIC_LIGHTS.SPAWN_PROBABILITY;

        // Flags para evitar crear semáforos múltiples por vehículo
        this._vehicleLightFlags = new Map(); // vehicle.mesh -> boolean si ya creó semáforo

        // Estadísticas para debugging
        this.totalSpawned = 0;
        this.totalDespawned = 0;
    }

    /**
     * Inicializa el sistema (llamar en Engine.create()).
     */
    init() {
        // Podríamos pre-spawnear algunos vehículos si queremos
        this._trySpawnVehicle();
    }

    /**
     * Llena el bucle principal de actualización.
     * @param {number} dt Paso de tiempo (s).
     * @param {import('../entities/City.js').City} city Instancia de la ciudad.
     */
    update(dt, city) {
        this.city = city;

        // 1. Actualizar timer de spawneo
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.vehicles.length < this.maxVehicles) {
            this._trySpawnVehicle();
            this.spawnTimer = this.spawnRate;
        }

        // 2. Actualizar todos los vehículos activos
        for (let i = this.vehicles.length - 1; i >= 0; i--) {
            const vehicle = this.vehicles[i];

            // Calcular distancia al centro de la ciudad
            const distanceFromCenter = Math.sqrt(
                vehicle.mesh.position.x ** 2 + vehicle.mesh.position.z ** 2
            );

            // 3. Verificar si debe despawnear (muy lejos del centro)
            const halfGrid = (this.city.config.GRID_SIZE * (this.city.config.BLOCK_SIZE + this.city.config.STREET_WIDTH)) / 2;
            if (distanceFromCenter > halfGrid + CONFIG.TRAFFIC.DESPAWN_DISTANCE) {
                this._despawnVehicle(i);
                continue;
            }

            // 4. Aplicar controles AI
            // Encontrar intersección más cercana para la lógica de semáforos
            const intersection = this.city.getNearestIntersection(vehicle.mesh.position.x, vehicle.mesh.position.z);

            // Verificar si hay semáforo en esta intersección
            // Usamos un flag por vehículo para evitar crear semáforos cada frame
            const meshId = vehicle.mesh.id;
            if (!this._vehicleLightFlags.has(meshId)) {
                this._vehicleLightFlags.set(meshId, false);
            }
            const lightFlag = this._vehicleLightFlags.get(meshId);

            let trafficLight = null;
            if (CONFIG.TRAFFIC_LIGHTS.ENABLED && !lightFlag && Math.random() < 0.5) {
                // Crear semáforo una sola vez al inicio
                trafficLight = this._getOrCreateTrafficLight(intersection);
                this._vehicleLightFlags.set(meshId, true);
            }

            // Asignar semáforo al vehículo si existe
            if (trafficLight) {
                vehicle.trafficLight = trafficLight;
            }

            vehicle.applyAIControls(dt, this.city);

            // Sincronizar malla
            vehicle.syncMesh();
        }
    }

    /**
     * Intenta spawnear un nuevo vehículo de tráfico.
     * @private
     */
    _trySpawnVehicle() {
        // Encontrar intersección aleatoria cerca del centro
        const randomOffsetX = (Math.random() - 0.5) * 40;
        const randomOffsetZ = (Math.random() - 0.5) * 40;
        const spawnPos = this.city.getNearestIntersection(randomOffsetX, randomOffsetZ);

        // Elegir vehículo aleatorio de los perfiles configurados
        const vehicleKeys = Object.keys(CONFIG.VEHICLES);
        const randomKey = vehicleKeys[Math.floor(Math.random() * vehicleKeys.length)];
        const preset = CONFIG.VEHICLES[randomKey];

        // Posición de spawneo: un poco alejada del intersection center
        const spawnX = spawnPos.x + (Math.random() - 0.5) * 10;
        const spawnZ = spawnPos.z + (Math.random() - 0.5) * 10;
        const spawnYaw = Math.random() * Math.PI * 2; // Aleatoria

        try {
            const vehicle = new TrafficVehicle(
                preset,
                this.physics,
                CONFIG.DAMAGE,
                { x: spawnX, z: spawnZ, yaw: spawnYaw },
                null // trafficLight se asignará después si corresponde
            );

            // Agregar vehículo a la escena
            this.scene.add(vehicle.mesh);

            // Si los semáforos están habilitados, hay probabilidad de asignar uno
            if (CONFIG.TRAFFIC_LIGHTS.ENABLED && Math.random() < 0.3) {
                // Buscar o crear semáforo para esta intersección
                const existingLights = this._findExistingLightAtIntersection(spawnPos);
                if (existingLights) {
                    vehicle.trafficLight = existingLights;
                    // Agregar el semáforo a la escena
                    this.city.mesh.add(existingLights.mesh);
                } else if (Math.random() < 0.5) {
                    // Crear nuevo semáforo en esta intersección
                    const newLight = new TrafficLight(spawnPos.x, spawnPos.z);
                    vehicle.trafficLight = newLight;
                    // Agregar el semáforo a la escena
                    this.city.mesh.add(newLight.mesh);
                }
            }

            this.vehicles.push(vehicle);
            this.totalSpawned++;
            console.log(`[TrafficSpawner] Vehículo spawneado: ${preset.NAME}, total: ${this.vehicles.length}`);
        } catch (e) {
            console.error('[TrafficSpawner] Error al spawnear vehículo:', e);
        }
    }

    /**
     * Busca si ya existe un semáforo en la intersección (para evitar duplicados).
     * @private
     * @param {Object} intersection {x: number, z: number}
     * @returns {TrafficLight|null}
     */
    _findExistingLightAtIntersection(intersection) {
        // En una implementación completa aquí buscaríamos en un Map/Set de semáforos
        // Por retorno null por ahora y dejaremos que _trySpawnVehicle cree uno nuevo
        return null;
    }

    /**
     * Obtiene o crea un semáforo para la intersección dada.
     * En una implementación más limpia tendríamos un cache, pero por ahora creamos uno nuevo.
     * @private
     * @param {Object} intersection {x: number, z: number}
     * @returns {TrafficLight|null}
     */
    _getOrCreateTrafficLight(intersection) {
        // Por simplicidad, creamos un nuevo semáforo cada vez (aunque podría reutilizarse)
        // En un sistema real usaríamos un WeakMap o Map para asociar semáforos a intersecciones
        const light = new TrafficLight(intersection.x, intersection.z);
        return light;
    }

    /**
     * Remueve un vehículo del tráfico.
     * @param {number} index Índice en el array vehicles
     * @private
     */
    _despawnVehicle(index) {
        const vehicle = this.vehicles[index];
        if (vehicle) {
            vehicle.dispose();
            // Limpiar el flag de semáforo para este vehículo
            this._vehicleLightFlags.delete(vehicle.mesh.id);
            this.vehicles.splice(index, 1);
            this.totalDespawned++;
            console.log(`[TrafficSpawner] Vehículo removido: total activos: ${this.vehicles.length}`);
        }
    }

    /**
     * Sincroniza todas las mallas de vehículos (llamar después de physics.update).
     */
    syncAllMeshes() {
        this.vehicles.forEach(vehicle => {
            vehicle.syncMesh();
        });
    }

    /**
     * Actualiza todos los semáforos activos.
     * @param {number} dt Tiempo transcurrido (s).
     */
    updateLights(dt) {
        // Actualizar semáforos asociados a vehículos
        this.vehicles.forEach(vehicle => {
            if (vehicle.trafficLight) {
                vehicle.trafficLight.update(dt);
            }
        });
    }

    /**
     * Obtiene lista de todos los vehículos activos (para HUD o colisiones).
     * @returns {Array<TrafficVehicle>}
     */
    getVehicles() {
        return this.vehicles;
    }

    /**
     * Obtiene número de vehículos activos.
     * @returns {number}
     */
    getVehicleCount() {
        return this.vehicles.length;
    }

    /**
     * Libera todos los recursos de vehículos y semáforos.
     */
    dispose() {
        this.vehicles.forEach(vehicle => vehicle.dispose());
        this.vehicles = [];
        this.totalSpawned = 0;
        this.totalDespawned = 0;
        console.log('[TrafficSpawner] Sistema descartado');
    }
}