import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config.js';
import { TrafficLight } from './TrafficLight.js';

// Índices de las ruedas (mismos que Vehicle.js)
const FRONT_LEFT = 0;
const FRONT_RIGHT = 1;
const REAR_LEFT = 2;
const REAR_RIGHT = 3;
const FRONT_WHEELS = [FRONT_LEFT, FRONT_RIGHT];
const REAR_WHEELS = [REAR_LEFT, REAR_RIGHT];

const _forward = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/**
 * Vehículo AI de tráfico que se mueve por la ciudad siguiendo reglas de tráfico.
 *
 * Diferencias con Vehicle.js:
 * - Comportamiento AI en lugar de inputs del jugador
 * - Detención en semáforos rojos
 * - Selección de dirección en intersecciones
 * - Spawneo y despawneo automático basado en distancia
 */
export class TrafficVehicle {
    /**
     * @param {Object} preset Perfil del vehículo (`CONFIG.VEHICLES.*`).
     * @param {import('../utils/Physics.js').Physics} physics Gestor del mundo físico.
     * @param {Object} damageConfig Configuración de daño (`CONFIG.DAMAGE`).
     * @param {{x: number, z: number, yaw?: number}} spawn Posición y orientación iniciales.
     * @param {TrafficLight} [trafficLight] Semáforo asociado a esta intersección (opcional).
     */
    constructor(preset, physics, damageConfig, spawn, trafficLight) {
        this.config = preset;
        this.physics = physics;
        this.damageConfig = damageConfig;

        // Media altura de la caja de colisión de la carrocería
        this.halfHeight = preset.HEIGHT * 0.35;

        // Estado de conducción y daño
        this.steering = 0;
        this.damage = 0;
        this.steerPullSign = 0;

        // Estado del sonido del motor
        this._engineRpm01 = CONFIG.AUDIO.ENGINE.IDLE_RPM;
        this._throttle01 = 0;

        // Posición en Three.js
        this.position = new THREE.Vector3();

        this.mesh = new THREE.Group();
        this.wheelPivots = [];
        this._spawn = { x: spawn.x, z: spawn.z, yaw: spawn.yaw ?? 0 };

        // Asociar semáforo si existe
        this.trafficLight = trafficLight;

        // Estado AI
        this.aiState = 'DRIVING'; // DRIVING, WAITING_AT_LIGHT, TURNING
        this.aiTimer = 0;
        this.currentDirection = 0; // -1 = izquierda, 0 = recto, 1 = derecha
        this.intersectionWaitTimer = 0;
        this.nextIntersectionTime = 0;

        // Config AI
        this.aiConfig = {
            minDecisionTime: CONFIG.TRAFFIC.AI_DECISION_TIME.MIN,
            maxDecisionTime: CONFIG.TRAFFIC.AI_DECISION_TIME.MAX,
            minIntersectionWait: CONFIG.TRAFFIC.INTERSECTION_WAIT_TIME.MIN,
            maxIntersectionWait: CONFIG.TRAFFIC.INTERSECTION_WAIT_TIME.MAX,
            speedKmH: 40 + Math.random() * 20, // velocidad inicial aleatoria
            minSafeDistance: 10.0
        };

        this._buildVehicleMesh();
        this._createPhysicsBody(spawn);
        this.syncMesh();
    }

    // ------------------------------------------------------------------
    // Construcción
    // ------------------------------------------------------------------

    _createPhysicsBody(spawn) {
        const c = this.config;
        const world = this.physics.world;
        const hx = c.WIDTH / 2;
        const hy = this.halfHeight;
        const hz = c.LENGTH / 2;

        _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw ?? 0);

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(spawn.x, this._spawnHeight(), spawn.z)
            .setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w })
            .setLinearDamping(0.05)
            .setAngularDamping(0.3)
            .setCanSleep(false)
            .setCcdEnabled(true);
        this.body = world.createRigidBody(bodyDesc);

        // Masa e inercia
        const m = c.MASS;
        const w = c.WIDTH, h = c.HEIGHT, l = c.LENGTH;
        const inertia = {
            x: (m / 12) * (h * h + l * l),
            y: (m / 12) * (w * w + l * l),
            z: (m / 12) * (w * w + h * h)
        };
        const com = { x: 0, y: c.COM_OFFSET_Y, z: c.COM_OFFSET_Z };

        // Umbral de evento de fuerza
        const dt = this.physics.config.TIMESTEP;
        const forceThreshold = (m * this.damageConfig.MIN_IMPACT) / dt;

        const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
            .setMassProperties(m, com, inertia, { x: 0, y: 0, z: 0, w: 1 })
            .setFriction(0.3)
            .setRestitution(0.1)
            .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
            .setContactForceEventThreshold(forceThreshold);
        this.collider = world.createCollider(colliderDesc, this.body);

        // Controlador de vehículo
        this.controller = world.createVehicleController(this.body);
        this.controller.indexUpAxis = 1;
        this.controller.setIndexForwardAxis = 2;

        const wheelX = hx - 0.1;
        const wheelZ = hz * 0.64;
        const wheelY = -hy * 0.5;
        const positions = [
            { x: wheelX, y: wheelY, z: wheelZ },    // Delantera izquierda
            { x: -wheelX, y: wheelY, z: wheelZ },   // Delantera derecha
            { x: wheelX, y: wheelY, z: -wheelZ },   // Trasera izquierda
            { x: -wheelX, y: wheelY, z: -wheelZ }   // Trasera derecha
        ];

        const maxSuspensionForce = m * 9.81 * 3;

        positions.forEach((pos, i) => {
            this.controller.addWheel(
                pos,
                { x: 0, y: -1, z: 0 },
                { x: -1, y: 0, z: 0 },
                c.SUSPENSION_REST,
                c.WHEEL_RADIUS
            );
            this.controller.setWheelMaxSuspensionTravel(i, c.SUSPENSION_TRAVEL);
            this.controller.setWheelSuspensionStiffness(i, c.SUSPENSION_STIFFNESS);
            this.controller.setWheelSuspensionCompression(i, c.SUSPENSION_COMPRESSION);
            this.controller.setWheelSuspensionRelaxation(i, c.SUSPENSION_RELAXATION);
            this.controller.setWheelMaxSuspensionForce(i, maxSuspensionForce);
            this.controller.setWheelSideFrictionStiffness(i, c.SIDE_FRICTION);
            this.controller.setWheelFrictionSlip(i, i < 2 ? c.FRONT_GRIP : c.REAR_GRIP);

            this.wheelPivots[i].position.set(pos.x, pos.y - c.SUSPENSION_REST, pos.z);
        });
    }

    _spawnHeight() {
        return this.config.WHEEL_RADIUS + this.config.SUSPENSION_REST + this.halfHeight * 0.5 + 0.2;
    }

    _buildVehicleMesh() {
        const c = this.config;
        const { WIDTH, HEIGHT, LENGTH } = c;
        const hy = this.halfHeight;

        // 1. Carrocería
        this.baseColor = new THREE.Color(c.COLOR);
        this.bodyMaterial = new THREE.MeshLambertMaterial({ color: this.baseColor.clone() });
        const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, hy * 2, LENGTH), this.bodyMaterial);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        // 2. Cabina / Techo
        const cabinLength = LENGTH * (c.CABIN_LENGTH ?? 0.5);
        const cabinHeight = HEIGHT * 0.45;
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const cabinMesh = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.88, cabinHeight, cabinLength), cabinMat);
        cabinMesh.position.set(0, hy + cabinHeight / 2, LENGTH * (c.CABIN_Z ?? -0.05));
        cabinMesh.castShadow = true;
        this.mesh.add(cabinMesh);

        // Barra de luces de la patrulla (si corresponde)
        if (c.SIREN) {
            const sirenGeo = new THREE.BoxGeometry(WIDTH * 0.3, 0.15, 0.3);
            const red = new THREE.Mesh(sirenGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            const blue = new THREE.Mesh(sirenGeo, new THREE.MeshBasicMaterial({ color: 0x0044ff }));
            const sirenY = hy + cabinHeight + 0.075;
            const sirenZ = LENGTH * (c.CABIN_Z ?? -0.05);
            red.position.set(WIDTH * 0.16, sirenY, sirenZ);
            blue.position.set(-WIDTH * 0.16, sirenY, sirenZ);
            this.mesh.add(red, blue);
        }

        // 3. Luces delanteras y traseras
        const lightGeo = new THREE.BoxGeometry(0.35, 0.2, 0.1);
        const frontLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const frontLeft = new THREE.Mesh(lightGeo, frontLightMat);
        frontLeft.position.set(-WIDTH * 0.35, 0, LENGTH * 0.5 + 0.01);
        const frontRight = frontLeft.clone();
        frontRight.position.x = WIDTH * 0.35;
        this.mesh.add(frontLeft, frontRight);

        const rearLightMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
        const rearLeft = new THREE.Mesh(lightGeo, rearLightMat);
        rearLeft.position.set(-WIDTH * 0.35, 0, -LENGTH * 0.5 - 0.01);
        const rearRight = rearLeft.clone();
        rearRight.position.x = WIDTH * 0.35;
        this.mesh.add(rearLeft, rearRight);

        // 4. Ruedas
        const r = c.WHEEL_RADIUS;
        const wheelGeo = new THREE.CylinderGeometry(r, r, 0.3, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

        for (let i = 0; i < 4; i++) {
            const pivot = new THREE.Object3D();
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.castShadow = true;
            pivot.add(wheel);
            pivot.userData.wheel = wheel;
            this.mesh.add(pivot);
            this.wheelPivots.push(pivot);
        }
    }

    // ------------------------------------------------------------------
    // Simulación AI
    // ------------------------------------------------------------------

    /**
     * Aplica el comportamiento AI para este vehículo.
     * Se llama antes de cada paso fijo de física.
     * @param {number} dt Paso de simulación (s).
     * @param {import('../entities/City.js').City} city Instancia de la ciudad para buscar intersecciones.
     */
    applyAIControls(dt, city) {
        const c = this.config;
        const d = this.damageConfig;
        const damage01 = this.damage / 100;
        const speed = this.controller.currentVehicleSpeed();
        const currentSpeedKmH = Math.abs(speed) * 3.6;

        // 1. Verificar semáforo si existe
        if (this.trafficLight) {
            const lightState = this.trafficLight.getState();
            this._handleTrafficLight(speed, lightState, dt);
        }

        // 2. Lógica AI principal según estado
        switch (this.aiState) {
            case 'DRIVING':
                this._driveAI(dt, currentSpeedKmH, c);
                break;
            case 'WAITING_AT_LIGHT':
                this._waitingAtLightAI(dt, speed, c);
                break;
            case 'TURNING':
                this._turningAI(dt, currentSpeedKmH, c);
                break;
        }

        // 3. Actualizar timer de intersección
        if (this.aiState !== 'DRIVING') {
            this.intersectionWaitTimer -= dt;
            if (this.intersectionWaitTimer <= 0) {
                this._finishWaitAtLight();
            }
        }

        // 4. Sonido del motor
        const accelerating = Math.abs(speed) > 0.5;
        this._engineRpm01 = accelerating
            ? Math.min(Math.abs(speed) / (c.ENGINE_FORCE * 0.1), 1) * (speed > 0 ? 1 : 0.3)
            : CONFIG.AUDIO.ENGINE.IDLE_RPM;
        this._throttle01 = speed > 0 ? 0.5 : 0;

        // Aplicar controles al controller
        this.controller.updateVehicle(dt);
    }

    /**
     * Maneja la lógica del semáforo.
     * @private
     * @param {number} speed Velocidad actual (m/s)
     * @param {string} lightState Estado actual ('GREEN','YELLOW','RED','RED_YELLOW')
     * @param {number} dt Paso de tiempo
     */
    _handleTrafficLight(speed, lightState, dt) {
        const c = this.config;

        if (lightState === 'RED') {
            // Detener completamente el vehículo
            const brakeDecel = Math.max(c.BRAKE_DECEL, c.HANDBRAKE_DECEL);
            const brakeImpulse = (c.MASS * brakeDecel * dt) / 4;
            FRONT_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, brakeImpulse);
                this.controller.setWheelFrictionSlip(i, c.FRONT_GRIP);
            });
            REAR_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, brakeImpulse);
                this.controller.setWheelFrictionSlip(i, c.REAR_GRIP);
            });
            if (this.aiState !== 'WAITING_AT_LIGHT') {
                this.aiState = 'WAITING_AT_LIGHT';
                this.intersectionWaitTimer = Math.random() * (this.aiConfig.maxIntersectionWait - this.aiConfig.minIntersectionWait) + this.aiConfig.minIntersectionWait;
            }
        } else if (lightState === 'YELLOW') {
            const distanceToLight = this._distanceToTrafficLight();
            if (distanceToLight < this.aiConfig.minSafeDistance) {
                // Detenerse
                const brakeDecel = Math.max(c.BRAKE_DECEL, c.HANDBRAKE_DECEL);
                const brakeImpulse = (c.MASS * brakeDecel * dt) / 4;
                FRONT_WHEELS.forEach(i => {
                    this.controller.setWheelEngineForce(i, 0);
                    this.controller.setWheelBrake(i, brakeImpulse);
                });
                REAR_WHEELS.forEach(i => {
                    this.controller.setWheelEngineForce(i, 0);
                    this.controller.setWheelBrake(i, brakeImpulse);
                });
                if (this.aiState !== 'WAITING_AT_LIGHT') {
                    this.aiState = 'WAITING_AT_LIGHT';
                    this.intersectionWaitTimer = Math.random() * (this.aiConfig.maxIntersectionWait - this.aiConfig.minIntersectionWait) + this.aiConfig.minIntersectionWait;
                }
            }
            // Si está lejos, deja que _driveAI continúe
        } else {
            // GREEN o RED_YELLOW: si estaba esperando, permitir salir
            if (this.aiState === 'WAITING_AT_LIGHT') {
                this._finishWaitAtLight();
            }
        }
    }

    /**
     * Calcula distancia aproximada al semáforo basado en la posición y dirección.
     * @private
     * @returns {number} Distancia en metros
     */
    _distanceToTrafficLight() {
        if (!this.trafficLight) return Infinity;
        const dx = this.mesh.position.x - this.trafficLight.position.x;
        const dz = this.mesh.position.z - this.trafficLight.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Comportamiento AI: conducción normal.
     * @private
     * @param {number} dt Paso de tiempo
     * @param {number} currentSpeedKmH Velocidad actual km/h
     * @param {Object} config Configuración del vehículo
     */
    _driveAI(dt, currentSpeedKmH, config) {
        // Acelerar continuamente hasta alcanzar una velocidad objetivo
        const targetSpeedMS = this.aiConfig.speedKmH / 3.6; // convertir km/h a m/s
        const currentSpeedMS = currentSpeedKmH / 3.6;
        const damage01 = this.damage / 100;

        if (Math.abs(currentSpeedMS) < targetSpeedMS) {
            const engineForce = config.ENGINE_FORCE * (1 - damage01 * this.damageConfig.MAX_ENGINE_LOSS);
            FRONT_WHEELS.forEach(i => this.controller.setWheelEngineForce(i, engineForce / 4));
            REAR_WHEELS.forEach(i => this.controller.setWheelEngineForce(i, engineForce / 4));
        } else if (Math.abs(currentSpeedMS) > targetSpeedMS * 1.1) {
            // Frenar si vamos muy rápido
            const brakeDecel = 8;
            const brakeImpulse = (config.MASS * brakeDecel * dt) / 4;
            FRONT_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, brakeImpulse);
            });
            REAR_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, brakeImpulse);
            });
        } else {
            // Mantener velocidad
            FRONT_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, 0);
            });
            REAR_WHEELS.forEach(i => {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, 0);
            });
        }

        // Dirección: mantener recto con pequeñas correcciones
        const steerTarget = 0; // recto
        const maxDelta = config.STEER_RATE * dt;
        this.steering += THREE.MathUtils.clamp(steerTarget - this.steering, -maxDelta, maxDelta);

        // Aplicar dirección a ruedas delanteras
        FRONT_WHEELS.forEach(i => this.controller.setWheelSteering(i, this.steering));
        // Traseras con poco giro para estabilidad
        REAR_WHEELS.forEach(i => this.controller.setWheelSteering(i, this.steering * 0.3));
    }

    /**
     * Comportamiento AI: esperando en semáforo en rojo.
     * @private
     * @param {number} dt Paso de tiempo
     * @param {number} speed Velocidad
     * @param {Object} config Configuración
     */
    _waitingAtLightAI(dt, speed, config) {
        // Ya no acelerar, solo mantener frenado
        const brakeDecel = Math.max(config.BRAKE_DECEL, config.HANDBRAKE_DECEL);
        const brakeImpulse = (config.MASS * brakeDecel * dt) / 4;
        FRONT_WHEELS.forEach(i => {
            this.controller.setWheelEngineForce(i, 0);
            this.controller.setWheelBrake(i, brakeImpulse);
            this.controller.setWheelFrictionSlip(i, config.FRONT_GRIP * 0.8);
        });
        REAR_WHEELS.forEach(i => {
            this.controller.setWheelEngineForce(i, 0);
            this.controller.setWheelBrake(i, brakeImpulse);
            this.controller.setWheelFrictionSlip(i, config.REAR_GRIP * 0.8);
        });

        // Dirección ligeramente girada para "estar atento"
        const steerInput = 0.1 * Math.sin(this.aiTimer * 2);
        FRONT_WHEELS.forEach(i => this.controller.setWheelSteering(i, steerInput));
        REAR_WHEELS.forEach(i => this.controller.setWheelSteering(i, steerInput * 0.3));
    }

    /**
     * Finaliza el estado de espera en luz roja y decide siguiente acción.
     * @private
     */
    _finishWaitAtLight() {
        // Elegir dirección aleatoria al pasar la luz
        const randomChoice = Math.random();
        if (randomChoice < 0.45) {
            this.currentDirection = -1; // Izquierda
        } else if (randomChoice < 0.90) {
            this.currentDirection = 1; // Derecha
        } else {
            this.currentDirection = 0; // Recto
        }

        this.aiState = 'TURNING';
        this.aiTimer = Math.random() * 2 + 1; // Tiempo para completar el giro (1-3s)
    }

    /**
     * Comportamiento AI: realizando un giro/maniobra en intersección.
     * @private
     * @param {number} dt Paso de tiempo
     * @param {number} currentSpeedKmH Velocidad km/h
     * @param {Object} config Configuración
     */
    _turningAI(dt, currentSpeedKmH, config) {
        // Aplicar dirección fuerte en las ruedas delanteras
        const steerAmount = this.currentDirection * 0.8; // -0.8 o +0.8
        const maxSteer = config.MAX_STEER;
        const clampedSteer = THREE.MathUtils.clamp(steerAmount, -maxSteer, maxSteer);

        FRONT_WHEELS.forEach(i => this.controller.setWheelSteering(i, clampedSteer));
        REAR_WHEELS.forEach(i => this.controller.setWheelSteering(i, clampedSteer * 0.4));

        // Acelerar ligeramente mientras giramos
        const engineForce = config.ENGINE_FORCE * (1 - this.damage / 100 * this.damageConfig.MAX_ENGINE_LOSS) * 0.6;
        FRONT_WHEELS.forEach(i => this.controller.setWheelEngineForce(i, engineForce / 2));
        REAR_WHEELS.forEach(i => this.controller.setWheelEngineForce(i, engineForce / 2));

        // Decrementar timer y decidir cuándo terminar el giro
        this.aiTimer -= dt;
        if (this.aiTimer <= 0 || Math.abs(currentSpeedKmH) < 5) {
            // Giro completado, volver a conducción normal
            this.aiState = 'DRIVING';
            this.steering = 0;
            this.currentDirection = 0;
        }
    }

    // ------------------------------------------------------------------
    // Sincronización y utilidades
    // ------------------------------------------------------------------

    syncMesh() {
        const t = this.body.translation();
        const r = this.body.rotation();
        this.mesh.position.set(t.x, t.y, t.z);
        this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        this.position.copy(this.mesh.position);

        for (let i = 0; i < this.wheelPivots.length; i++) {
            const pivot = this.wheelPivots[i];
            const conn = this.controller.wheelChassisConnectionPointCs(i);
            const suspension = this.controller.wheelSuspensionLength(i) || this.config.SUSPENSION_REST;
            if (conn) pivot.position.set(conn.x, conn.y - suspension, conn.z);
            pivot.rotation.y = this.controller.wheelSteering(i) ?? 0;
            pivot.userData.wheel.rotation.x = this.controller.wheelRotation(i) ?? 0;
        }
    }

    getYaw() {
        const r = this.body.rotation();
        _forward.set(0, 0, 1).applyQuaternion(_quat.set(r.x, r.y, r.z, r.w));
        return Math.atan2(_forward.x, _forward.z);
    }

    getSpeedKmH() {
        return Math.round(Math.abs(this.controller.currentVehicleSpeed()) * 3.6);
    }

    getEngineRpm01() {
        return this._engineRpm01;
    }

    getEngineThrottle01() {
        return this._throttle01;
    }

    /**
     * Libera recursos del vehículo de tráfico.
     */
    dispose() {
        const world = this.physics.world;
        world.removeVehicleController(this.controller);
        world.removeRigidBody(this.body);

        this.mesh.removeFromParent();
        this.mesh.traverse(obj => {
            if (obj.isMesh) {
                obj.geometry.dispose();
                obj.material.dispose();
            }
        });
    }
}