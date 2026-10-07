/**
 * Configuración global del juego.
 * Todos los parámetros de físicas, ciudad, vehículos y cámara centralizados.
 * Unidades de física: metros, segundos, kilogramos y newtons (1 unidad = 1 m).
 */
export const CONFIG = {
    // Canvas y Render
    CANVAS: {
        BACKGROUND_COLOR: 0x87ceeb, // Azul cielo retro
        FOG_DENSITY: 0.015,
        FOG_COLOR: 0xcce0ff
    },

    // Mundo físico (Rapier)
    PHYSICS: {
        GRAVITY: -9.81,
        TIMESTEP: 1 / 60,       // Paso fijo de simulación
        MAX_SUBSTEPS: 5         // Máximo de pasos por frame (evita la "espiral de la muerte")
    },

    // Teclas de control (KeyboardEvent.code)
    CONTROLS: {
        FORWARD: ['KeyW', 'ArrowUp'],
        BACKWARD: ['KeyS', 'ArrowDown'],
        LEFT: ['KeyA', 'ArrowLeft'],
        RIGHT: ['KeyD', 'ArrowRight'],
        HANDBRAKE: ['Space'],
        RESET: ['KeyR'],
        // Cambio de vehículo: el índice corresponde a VEHICLE_ORDER
        SELECT_VEHICLE: ['Digit1', 'Digit2', 'Digit3', 'Digit4']
    },

    // Daño por impactos
    DAMAGE: {
        MIN_IMPACT: 3.0,        // Cambio de velocidad mínimo (m/s) en un paso para que cuente como golpe
        SCALE: 1.0,             // % de daño por cada m/s de impacto por encima del mínimo
        MAX_ENGINE_LOSS: 0.85,  // Pérdida de fuerza del motor al 100 % de daño
        MAX_SPEED_LOSS: 0.5,    // Pérdida de velocidad máxima al 100 % de daño
        MAX_STEER_PULL: 0,      // Sin tirón de dirección por daño

        MAX_DARKEN: 0.6         // Oscurecimiento de la carrocería al 100 % de daño
    },

    // Vehículo inicial y orden de selección (teclas 1-4)
    DEFAULT_VEHICLE: 'MUSCLE',
    VEHICLE_ORDER: ['MUSCLE', 'POLICE', 'TRUCK', 'BUS'],

    /*
     * Perfiles de vehículo.
     * - ENGINE_FORCE: fuerza total (N) repartida entre las ruedas motrices (traseras).
     * - MAX_SPEED / MAX_REVERSE_SPEED: velocidades máximas en m/s (÷ = km/h ÷ 3,6).
     * - BRAKE_DECEL / HANDBRAKE_DECEL: deceleración objetivo (m/s²) del freno y del freno de mano.
     * - FRONT_GRIP / REAR_GRIP: "friction slip" de Rapier (~coeficiente de agarre). Trasera < delantera = sobreviraje.
     * - HANDBRAKE_GRIP: multiplicador del agarre trasero con el freno de mano pulsado.
     * - SUSPENSION_STIFFNESS: rigidez por unidad de masa (Rapier multiplica por la masa del chasis).
     * - COM_OFFSET_Y / COM_OFFSET_Z: desplazamiento del centro de masas (m) respecto al centro de la caja.
     * - DURABILITY: divide el daño recibido (más alto = más resistente).
     * - CAMERA_SCALE: multiplica la distancia de la cámara.
     * - Opcionales: CABIN_LENGTH / CABIN_Z (fracción de LENGTH, por defecto 0.5 / -0.05), SIREN.
     */
    VEHICLES: {
        MUSCLE: {
            NAME: 'Muscle car',
            COLOR: 0xb5432a,
            WIDTH: 2.0, HEIGHT: 1.3, LENGTH: 4.8,
            MASS: 1500,
            ENGINE_FORCE: 16000,
            MAX_SPEED: 46,
            MAX_REVERSE_SPEED: 4,
            REVERSE_RATIO: 0.5,
            BRAKE_DECEL: 14,
            HANDBRAKE_DECEL: 7,
            ROLLING_DECEL: 0.5,
            MAX_STEER: 0.55,
            STEER_RATE: 3.2,
            STEER_FALLOFF: 40,
            FRONT_GRIP: 2.4,
            REAR_GRIP: 2.1,
            HANDBRAKE_GRIP: 0.3,
            SIDE_FRICTION: 1.5,
            WHEEL_RADIUS: 0.38,
            SUSPENSION_REST: 0.35,
            SUSPENSION_TRAVEL: 0.25,
            SUSPENSION_STIFFNESS: 18,
            SUSPENSION_COMPRESSION: 2.0,
            SUSPENSION_RELAXATION: 2.4,
            COM_OFFSET_Y: -0.35,
            COM_OFFSET_Z: -0.2,
            DURABILITY: 1.0,
            CAMERA_SCALE: 1.0
        },
        POLICE: {
            NAME: 'Patrulla',
            COLOR: 0xf2f2f2,
            SIREN: true,
            WIDTH: 2.0, HEIGHT: 1.4, LENGTH: 5.0,
            MASS: 1700,
            ENGINE_FORCE: 18000,
            MAX_SPEED: 50,
            MAX_REVERSE_SPEED: 4,
            REVERSE_RATIO: 0.5,
            BRAKE_DECEL: 15,
            HANDBRAKE_DECEL: 7,
            ROLLING_DECEL: 0.5,
            MAX_STEER: 0.55,
            STEER_RATE: 3.2,
            STEER_FALLOFF: 40,
            FRONT_GRIP: 2.4,
            REAR_GRIP: 2.1,
            HANDBRAKE_GRIP: 0.3,
            SIDE_FRICTION: 1.5,
            WHEEL_RADIUS: 0.38,
            SUSPENSION_REST: 0.35,
            SUSPENSION_TRAVEL: 0.25,
            SUSPENSION_STIFFNESS: 18,
            SUSPENSION_COMPRESSION: 2.0,
            SUSPENSION_RELAXATION: 2.4,
            COM_OFFSET_Y: -0.35,
            COM_OFFSET_Z: -0.2,
            DURABILITY: 1.3,
            CAMERA_SCALE: 1.0
        },
        TRUCK: {
            NAME: 'Camión',
            COLOR: 0x3a5f8a,
            CABIN_LENGTH: 0.3, CABIN_Z: 0.32,
            WIDTH: 2.5, HEIGHT: 2.8, LENGTH: 7.5,
            MASS: 7000,
            ENGINE_FORCE: 35000,
            MAX_SPEED: 22,
            MAX_REVERSE_SPEED: 2.5,
            REVERSE_RATIO: 0.4,
            BRAKE_DECEL: 8,
            HANDBRAKE_DECEL: 4,
            ROLLING_DECEL: 0.7,
            MAX_STEER: 0.5,
            STEER_RATE: 2.0,
            STEER_FALLOFF: 30,
            FRONT_GRIP: 2.1,
            REAR_GRIP: 2.0,
            HANDBRAKE_GRIP: 0.5,
            SIDE_FRICTION: 1.4,
            WHEEL_RADIUS: 0.55,
            SUSPENSION_REST: 0.4,
            SUSPENSION_TRAVEL: 0.25,
            SUSPENSION_STIFFNESS: 22,
            SUSPENSION_COMPRESSION: 2.6,
            SUSPENSION_RELAXATION: 3.0,
            COM_OFFSET_Y: -0.9,
            COM_OFFSET_Z: 0.3,
            DURABILITY: 3.0,
            CAMERA_SCALE: 1.6
        },
        BUS: {
            NAME: 'Autobús',
            COLOR: 0xd9a400,
            CABIN_LENGTH: 0.95, CABIN_Z: 0,
            WIDTH: 2.6, HEIGHT: 3.0, LENGTH: 11.0,
            MASS: 12000,
            ENGINE_FORCE: 45000,
            MAX_SPEED: 18,
            MAX_REVERSE_SPEED: 2,
            REVERSE_RATIO: 0.4,
            BRAKE_DECEL: 7,
            HANDBRAKE_DECEL: 3,
            ROLLING_DECEL: 0.7,
            MAX_STEER: 0.55,
            STEER_RATE: 1.6,
            STEER_FALLOFF: 26,
            FRONT_GRIP: 2.0,
            REAR_GRIP: 1.9,
            HANDBRAKE_GRIP: 0.6,
            SIDE_FRICTION: 1.4,
            WHEEL_RADIUS: 0.55,
            SUSPENSION_REST: 0.4,
            SUSPENSION_TRAVEL: 0.25,
            SUSPENSION_STIFFNESS: 20,
            SUSPENSION_COMPRESSION: 2.6,
            SUSPENSION_RELAXATION: 3.0,
            COM_OFFSET_Y: -1.0,
            COM_OFFSET_Z: 0,
            DURABILITY: 4.0,
            CAMERA_SCALE: 2.0
        }
    },

    // Ajustes de Cámara Persecución (Chase Cam)
    CAMERA: {
        FOV: 60,
        NEAR: 0.1,
        FAR: 1000,
        OFFSET: {
            X: 0,
            Y: 3.5,             // Altura sobre el auto
            Z: -8.0             // Distancia detrás del auto
        },
        LERP_FACTOR: 0.1        // Suavizado del seguimiento (0.1 = suave, 1 = rígido)
    },

    // Ajustes de la Ciudad (Cuadrícula urbana)
    CITY: {
        GRID_SIZE: 8,           // Matriz de 8x8 bloques
        BLOCK_SIZE: 40,         // Tamaño de cada manzana/bloque de edificios
        STREET_WIDTH: 18,       // Ancho de las calles entre manzanas
        BUILDING_MIN_HEIGHT: 15,
        BUILDING_MAX_HEIGHT: 65,
        BUILDING_COLORS: [
            0x8c7c6d, 0xa39281, 0x5c626d, 0x7a8393, 0x9e8a78
        ],
        BOUNDARY_WALL_HEIGHT: 6 // Muros invisibles en el borde del mapa
    }
};
