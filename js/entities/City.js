import * as THREE from 'three';

/**
 * Entidad encargada de generar la ciudad procedimentalmente.
 * Crea las mallas visuales y los colisionadores estáticos de Rapier.
 */
export class City {
    /**
     * @param {Object} config Configuración de la ciudad (`CONFIG.CITY`).
     * @param {import('../utils/Physics.js').Physics} physics Gestor del mundo físico.
     */
    constructor(config, physics) {
        this.config = config;
        this.physics = physics;

        // Grupo principal que contendrá todas las mallas de la ciudad
        this.mesh = new THREE.Group();

        // Cuerpo fijo que agrupa todos los colisionadores estáticos
        this.body = physics.createFixedBody();

        const { GRID_SIZE, BLOCK_SIZE, STREET_WIDTH } = config;
        this.blockStep = BLOCK_SIZE + STREET_WIDTH;
        this.halfGrid = (GRID_SIZE * this.blockStep) / 2;

        this._generateCity();
    }

    /**
     * Genera la cuadrícula de calles, aceras y edificios.
     * @private
     */
    _generateCity() {
        const { GRID_SIZE, BLOCK_SIZE, STREET_WIDTH } = this.config;
        const totalBlockStep = this.blockStep;
        const halfGrid = this.halfGrid;

        // 1. Suelo Principal (Asfalto / Calles)
        const totalCitySize = GRID_SIZE * totalBlockStep + STREET_WIDTH;
        const groundGeo = new THREE.PlaneGeometry(totalCitySize, totalCitySize);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x222225 }); // Asfalto oscuro
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.mesh.add(groundMesh);

        // Colisionador del suelo: caja fina con la cara superior en y = 0
        this.physics.addStaticBox(this.body, 0, -0.5, 0, totalCitySize, 1, totalCitySize, 0.9);

        // Muros invisibles en el borde para no caer fuera del mapa
        this._createBoundaryWalls(totalCitySize);

        // Geometría y material reutilizable para aceras
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Gris hormigón
        const sidewalkHeight = 0.3;

        // Loop principal para generar manzanas
        for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
                // Posición central de la manzana
                const blockX = (col * totalBlockStep) - halfGrid + (totalBlockStep / 2);
                const blockZ = (row * totalBlockStep) - halfGrid + (totalBlockStep / 2);

                // 2. Acera / Banqueta de la manzana
                const sidewalkGeo = new THREE.BoxGeometry(BLOCK_SIZE, sidewalkHeight, BLOCK_SIZE);
                const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat);
                sidewalkMesh.position.set(blockX, sidewalkHeight / 2, blockZ);
                sidewalkMesh.receiveShadow = true;
                this.mesh.add(sidewalkMesh);

                this.physics.addStaticBox(
                    this.body, blockX, sidewalkHeight / 2, blockZ,
                    BLOCK_SIZE, sidewalkHeight, BLOCK_SIZE, 0.8
                );

                // 3. Generar Edificios dentro de la manzana
                this._createBlockBuildings(blockX, blockZ, sidewalkHeight);
            }
        }
    }

    /**
     * Crea cuatro muros estáticos invisibles alrededor de la ciudad.
     * @private
     */
    _createBoundaryWalls(totalCitySize) {
        const h = this.config.BOUNDARY_WALL_HEIGHT;
        const t = 2; // Grosor
        const edge = totalCitySize / 2 + t / 2;
        const len = totalCitySize + t * 2;

        this.physics.addStaticBox(this.body, 0, h / 2, edge, len, h, t, 0.3);
        this.physics.addStaticBox(this.body, 0, h / 2, -edge, len, h, t, 0.3);
        this.physics.addStaticBox(this.body, edge, h / 2, 0, t, h, len, 0.3);
        this.physics.addStaticBox(this.body, -edge, h / 2, 0, t, h, len, 0.3);
    }

    /**
     * Crea un conjunto de edificios aleatorios dentro de una manzana urbana.
     * @private
     */
    _createBlockBuildings(blockX, blockZ, sidewalkHeight) {
        const { BLOCK_SIZE, BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT, BUILDING_COLORS } = this.config;

        // Subdividimos la manzana en 2x2 lotes de edificios
        const numSubdivisions = 2;
        const lotSize = BLOCK_SIZE / numSubdivisions;
        const margin = 1.5; // Margen respecto al borde de la acera

        for (let i = 0; i < numSubdivisions; i++) {
            for (let j = 0; j < numSubdivisions; j++) {
                // Cálculo de dimensiones aleatorias dentro del lote
                const width = lotSize - margin * 2;
                const depth = lotSize - margin * 2;
                const height = THREE.MathUtils.randFloat(BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT);

                // Posición del edificio individual
                const posX = blockX - (BLOCK_SIZE / 2) + (i * lotSize) + (lotSize / 2);
                const posZ = blockZ - (BLOCK_SIZE / 2) + (j * lotSize) + (lotSize / 2);
                const posY = sidewalkHeight + (height / 2);

                // Crear malla del edificio
                const buildingGeo = new THREE.BoxGeometry(width, height, depth);
                const randomColor = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
                const buildingMat = new THREE.MeshLambertMaterial({ color: randomColor });

                const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
                buildingMesh.position.set(posX, posY, posZ);
                buildingMesh.castShadow = true;
                buildingMesh.receiveShadow = true;

                this.mesh.add(buildingMesh);

                // 4. Colisionador estático del edificio
                this.physics.addStaticBox(this.body, posX, posY, posZ, width, height, depth, 0.4);
            }
        }
    }

    /**
     * Devuelve el cruce de calles más cercano a (x, z).
     * Las calles están centradas en k * blockStep - halfGrid, con k = 0..GRID_SIZE.
     * @returns {{x: number, z: number}}
     */
    getNearestIntersection(x, z) {
        const { GRID_SIZE } = this.config;
        const snap = (v) => {
            const k = THREE.MathUtils.clamp(Math.round((v + this.halfGrid) / this.blockStep), 0, GRID_SIZE);
            return k * this.blockStep - this.halfGrid;
        };
        return { x: snap(x), z: snap(z) };
    }
}
