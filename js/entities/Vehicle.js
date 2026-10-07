import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Índices de las ruedas
const FRONT_LEFT = 0;
const FRONT_RIGHT = 1;
const REAR_LEFT = 2;
const REAR_RIGHT = 3;
const FRONT_WHEELS = [FRONT_LEFT, FRONT_RIGHT];
const REAR_WHEELS = [REAR_LEFT, REAR_RIGHT];

const _forward = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _black = new THREE.Color(0x000000);

/**
 * Vehículo con físicas de Rapier (DynamicRayCastVehicleController).
 *
 * Marco local del chasis: +Z adelante, +Y arriba, +X a la izquierda.
 * El origen del cuerpo está en el centro de la caja de colisión de la carrocería.
 */
export class Vehicle {
    /**
     * @param {Object} preset Perfil del vehículo (`CONFIG.VEHICLES.*`).
     * @param {import('../utils/Physics.js').Physics} physics Gestor del mundo físico.
     * @param {Object} damageConfig Configuración de daño (`CONFIG.DAMAGE`).
     * @param {{x: number, z: number, yaw?: number}} spawn Posición y orientación iniciales.
     */
    constructor(preset, physics, damageConfig, spawn) {
        this.config = preset;
        this.physics = physics;
        this.damageConfig = damageConfig;

        // Media altura de la caja de colisión de la carrocería
        this.halfHeight = preset.HEIGHT * 0.35;

        // Estado de conducción y daño
        this.steering = 0;
        this.damage = 0;            // 0..100 %
        this.steerPullSign = 0;     // Lado al que tira la dirección dañada

        // Posición en Three.js (la usa la cámara)
        this.position = new THREE.Vector3();

        this.mesh = new THREE.Group();
        this.wheelPivots = [];
        this._spawn = { x: spawn.x, z: spawn.z, yaw: spawn.yaw ?? 0 };
        this._buildVehicleMesh();
        this._createPhysicsBody(spawn);
        this.syncMesh();
    }

    // ------------------------------------------------------------------
    // Construcción
    // ------------------------------------------------------------------

    /**
     * Crea el chasis dinámico, su colisionador y el controlador de vehículo de Rapier.
     * @private
     */
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

        // Masa e inercia explícitas, con el centro de masas bajo para la transferencia de peso
        const m = c.MASS;
        const w = c.WIDTH, h = c.HEIGHT, l = c.LENGTH;
        const inertia = {
            x: (m / 12) * (h * h + l * l),
            y: (m / 12) * (w * w + l * l),
            z: (m / 12) * (w * w + h * h)
        };
        const com = { x: 0, y: c.COM_OFFSET_Y, z: c.COM_OFFSET_Z };

        // Umbral de evento de fuerza: solo golpes que cambian la velocidad más de MIN_IMPACT en un paso
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
        // Ojo: en la API de Rapier este setter se llama así (se asigna, no se invoca)
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
                { x: 0, y: -1, z: 0 },  // Dirección de la suspensión
                { x: -1, y: 0, z: 0 },  // Eje (con +Y arriba produce avance hacia +Z)
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

    /**
     * Altura de aparición: ruedas con la suspensión en reposo apoyadas en el suelo.
     * @private
     */
    _spawnHeight() {
        return this.config.WHEEL_RADIUS + this.config.SUSPENSION_REST + this.halfHeight * 0.5 + 0.2;
    }

    /**
     * Construye la apariencia 3D del vehículo con geometrías procedurales.
     * @private
     */
    _buildVehicleMesh() {
        const c = this.config;
        const { WIDTH, HEIGHT, LENGTH } = c;
        const hy = this.halfHeight;

        // 1. Carrocería (coincide con la caja de colisión)
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

        // Barra de luces de la patrulla
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

        // 4. Ruedas: pivote (dirección y suspensión) + malla (rodadura)
        const r = c.WHEEL_RADIUS;
        const wheelGeo = new THREE.CylinderGeometry(r, r, 0.3, 16);
        wheelGeo.rotateZ(Math.PI / 2); // Eje del cilindro a lo largo de X
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
    // Simulación
    // ------------------------------------------------------------------

    /**
     * Aplica motor, frenos y dirección. Se llama antes de cada paso fijo de física.
     *
     * @param {Object} input Estado de InputHandler ({ forward, backward, left, right, handbrake }).
     * @param {number} dt Paso de simulación (s).
     */
    applyControls(input, dt) {
        const c = this.config;
        const d = this.damageConfig;
        const damage01 = this.damage / 100;
        const speed = this.controller.currentVehicleSpeed();

        const engineMul = 1 - damage01 * d.MAX_ENGINE_LOSS;
        const maxSpeed = c.MAX_SPEED * (1 - damage01 * d.MAX_SPEED_LOSS);

        // 1. Motor y freno de servicio
        let engine = 0;
        let brakeDecel = 0;

        if (input.forward && !input.backward) {
            if (speed < -0.5) brakeDecel = c.BRAKE_DECEL;
            else if (speed < maxSpeed) engine = c.ENGINE_FORCE * engineMul;
        } else if (input.backward && !input.forward) {
            if (speed > 0.5) brakeDecel = c.BRAKE_DECEL;
            else if (speed > -c.MAX_REVERSE_SPEED) engine = -c.ENGINE_FORCE * c.REVERSE_RATIO * engineMul;
        } else {
            brakeDecel = c.ROLLING_DECEL; // Resistencia a la rodadura
        }

        // Impulso de freno por rueda para conseguir la deceleración deseada
        const brakeImpulse = (decel, wheels) => (c.MASS * decel * dt) / wheels;

        FRONT_WHEELS.forEach(i => {
            this.controller.setWheelEngineForce(i, 0);
            this.controller.setWheelBrake(i, brakeImpulse(brakeDecel, 4));
            this.controller.setWheelFrictionSlip(i, c.FRONT_GRIP);
        });

        // 2. Tracción trasera y freno de mano (bloquea y quita agarre a las traseras)
        REAR_WHEELS.forEach(i => {
            if (input.handbrake) {
                this.controller.setWheelEngineForce(i, 0);
                this.controller.setWheelBrake(i, brakeImpulse(Math.max(brakeDecel, c.HANDBRAKE_DECEL), 2));
                this.controller.setWheelFrictionSlip(i, c.REAR_GRIP * c.HANDBRAKE_GRIP);
            } else {
                this.controller.setWheelEngineForce(i, engine / 2);
                this.controller.setWheelBrake(i, brakeImpulse(brakeDecel, 4));
                this.controller.setWheelFrictionSlip(i, c.REAR_GRIP);
            }
        });

        // 3. Dirección: menos ángulo a más velocidad y giro progresivo del volante
        const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        const steerTarget = steerInput * c.MAX_STEER / (1 + Math.abs(speed) / c.STEER_FALLOFF);
        const maxDelta = c.STEER_RATE * dt;
        this.steering += THREE.MathUtils.clamp(steerTarget - this.steering, -maxDelta, maxDelta);

        // La dirección dañada tira hacia un lado
        const pull = this.steerPullSign * damage01 * d.MAX_STEER_PULL;
        FRONT_WHEELS.forEach(i => this.controller.setWheelSteering(i, this.steering + pull));

        this.controller.updateVehicle(dt);
    }

    /**
     * Registra un impacto.
     * @param {number} deltaV Cambio de velocidad estimado del impacto (m/s).
     */
    applyImpact(deltaV) {
        const d = this.damageConfig;
        if (deltaV <= d.MIN_IMPACT || this.damage >= 100) return;

        if (this.steerPullSign === 0) {
            this.steerPullSign = Math.random() < 0.5 ? -1 : 1;
        }

        this.damage = Math.min(100, this.damage + ((deltaV - d.MIN_IMPACT) * d.SCALE) / this.config.DURABILITY);

        // Carrocería más oscura cuanto más dañada
        this.bodyMaterial.color.copy(this.baseColor).lerp(_black, (this.damage / 100) * d.MAX_DARKEN);
    }

    /**
     * Copia la posición/rotación del chasis y de las ruedas a las mallas.
     */
    syncMesh() {
        const t = this.body.translation();
        const r = this.body.rotation();
        this.mesh.position.set(t.x, t.y, t.z);
        this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        this.position.copy(this.mesh.position);

        for (let i = 0; i < this.wheelPivots.length; i++) {
            const pivot = this.wheelPivots[i];
            const conn = this.controller.wheelChassisConnectionPointCs(i);
            const suspension = this.controller.wheelSuspensionLength(i) ?? this.config.SUSPENSION_REST;
            if (conn) pivot.position.set(conn.x, conn.y - suspension, conn.z);
            pivot.rotation.y = this.controller.wheelSteering(i) ?? 0;
            pivot.userData.wheel.rotation.x = this.controller.wheelRotation(i) ?? 0;
        }
    }

    /**
     * Ángulo de orientación (yaw) del chasis en el plano XZ. 0 = mirando hacia +Z.
     * @returns {number}
     */
    getYaw() {
        const r = this.body.rotation();
        _forward.set(0, 0, 1).applyQuaternion(_quat.set(r.x, r.y, r.z, r.w));
        return Math.atan2(_forward.x, _forward.z);
    }

    /**
     * Endereza el vehículo en (x, z) conservando la orientación horizontal. No repara el daño.
     */
    reset(x, z) {
        const yaw = this.getYaw();
        _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        this.body.setTranslation({ x, y: this._spawnHeight(), z }, true);
        this.body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.steering = 0;
        this.syncMesh();
    }

    /**
     * Reinicia por completo: vuelve al punto de inicio, velocidad cero y daño a 0.
     */
    resetToSpawn() {
        this.damage = 0;
        this.steerPullSign = 0;
        this.bodyMaterial.color.copy(this.baseColor);
        this.reset(this._spawn.x, this._spawn.z);

        // Recuperar la orientación original de aparición
        _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._spawn.yaw);
        this.body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
        this.syncMesh();
    }

    /**
     * Libera el cuerpo físico, el controlador y los recursos de Three.js.
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

    /**
     * Velocidad de avance actual en km/h (Rapier trabaja en m/s).
     * @returns {number}
     */
    getSpeedKmH() {
        return Math.round(Math.abs(this.controller.currentVehicleSpeed()) * 3.6);
    }
}
