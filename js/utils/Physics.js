import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Gestor del mundo físico de Rapier.
 * Avanza la simulación con paso fijo y reparte los eventos de impacto.
 */
export class Physics {
    /**
     * Carga el módulo WASM de Rapier. Debe esperarse antes de crear cualquier objeto físico.
     */
    static async init() {
        await RAPIER.init();
    }

    /**
     * @param {Object} config Configuración global (`CONFIG.PHYSICS`).
     */
    constructor(config) {
        this.config = config;
        this.world = new RAPIER.World({ x: 0, y: config.GRAVITY, z: 0 });
        this.world.timestep = config.TIMESTEP;
        this.eventQueue = new RAPIER.EventQueue(true);
        this._accumulator = 0;
    }

    /**
     * Avanza la simulación en pasos fijos según el tiempo real transcurrido.
     *
     * @param {number} deltaTime Tiempo del frame (s).
     * @param {(dt: number) => void} beforeStep Se llama antes de cada paso (controles del vehículo).
     * @param {(event: RAPIER.TempContactForceEvent, dt: number) => void} onContactForce Eventos de fuerza de contacto.
     */
    update(deltaTime, beforeStep, onContactForce) {
        const dt = this.config.TIMESTEP;
        this._accumulator = Math.min(this._accumulator + deltaTime, dt * this.config.MAX_SUBSTEPS);

        while (this._accumulator >= dt) {
            beforeStep(dt);
            this.world.step(this.eventQueue);
            this.eventQueue.drainContactForceEvents(event => onContactForce(event, dt));
            this._accumulator -= dt;
        }
    }

    /**
     * Crea un cuerpo fijo vacío al que se pueden añadir colisionadores estáticos.
     * @returns {RAPIER.RigidBody}
     */
    createFixedBody() {
        return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    }

    /**
     * Añade una caja estática (dimensiones completas) centrada en (x, y, z).
     */
    addStaticBox(body, x, y, z, width, height, depth, friction = 0.6) {
        const desc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
            .setTranslation(x, y, z)
            .setFriction(friction);
        return this.world.createCollider(desc, body);
    }
}
