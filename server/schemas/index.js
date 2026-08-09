const { z } = require('zod');

// FormData (multipart) sends every field as a string.  This helper coerces
// numeric strings to numbers so that Zod schemas work for both JSON and
// FormData payloads.  Empty strings and nullish values become undefined so
// that .optional() still works.
const coerceNum = (schema) =>
  z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }, schema);

const emailSchema = z.string().email().min(1).max(255);
const passwordSchema = z.string().min(1).max(255);

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const createUserSchema = z.object({
  nombre: z.string().min(1).max(255),
  email: emailSchema,
  password: z.string().min(6).max(255),
  rol: z.enum(['admin', 'caja', 'cocina', 'delivery', 'mozo']).default('caja'),
});

const updateUserSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  password: z.string().min(6).max(255).optional(),
  rol: z.enum(['admin', 'caja', 'cocina', 'delivery', 'mozo']).optional(),
  activo: z.boolean().optional(),
});

const pedidoItemSchema = z.object({
  producto_id: z.number().int().positive().nullable().optional(),
  nombre: z.string().max(255).default(''),
  cantidad: z.number().positive().default(1),
  precio_unitario: z.number().nonnegative().default(0),
  variantes: z.any().optional(),
  extras: z.any().optional(),
  descripcion: z.string().max(2000).default(''),
});

const createPedidoSchema = z.object({
  cliente_id: z.number().int().positive().nullable().optional(),
  cliente_nombre: z.string().max(255).default(''),
  cliente_telefono: z.string().max(50).default(''),
  cliente_direccion: z.string().max(500).default(''),
  cliente_latitud: z.number().nullable().optional(),
  cliente_longitud: z.number().nullable().optional(),
  cliente_ubicacion_exacta: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  direccion_estructurada: z.any().optional(),
  direccion_barrio_id: z.number().int().positive().nullable().optional(),
  direccion_barrio_nombre: z.string().max(255).optional(),
  direccion_manzana_id: z.number().int().positive().nullable().optional(),
  direccion_manzana: z.string().max(20).optional(),
  direccion_casa: z.string().max(50).optional(),
  items: z.union([z.string().min(1).max(50000), z.array(pedidoItemSchema).min(1)]),
  subtotal: z.number().nonnegative().default(0),
  costo_envio: z.number().nonnegative().default(0),
  descuento: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  estado: z.string().max(50).default('nuevo'),
  tipo_entrega: z.string().max(50).default('delivery'),
  mesa: z.string().max(50).default(''),
  hora_entrega: z.string().max(50).default(''),
  metodo_pago: z.string().max(50).default('efectivo'),
  notas: z.string().max(2000).default(''),
  origen: z.string().max(50).default('tpv'),
  repartidor_id: z.number().int().positive().nullable().optional(),
});

const updatePedidoSchema = z.object({
  estado: z.string().max(50).optional(),
  repartidor_id: z.number().int().positive().nullable().optional(),
  notas: z.string().max(2000).optional(),
});

const createProductoSchema = z.object({
  nombre: z.string().min(1).max(255),
  descripcion: z.string().max(2000).default(''),
  precio: coerceNum(z.number().nonnegative()),
  costo: coerceNum(z.number().nonnegative().default(0)),
  categoria_id: coerceNum(z.number().int().positive().nullable().optional()),
  imagen: z.string().max(1000).default(''),
  variantes: z.string().max(10000).default('[]'),
  extras: z.string().max(10000).default('[]'),
  activo: coerceNum(z.number().int().min(0).max(1).default(1)),
  destacado: coerceNum(z.number().int().min(0).max(1).default(0)),
  tiempo_preparacion: coerceNum(z.number().int().positive().default(15)),
  // El formulario de Productos carga stock directo con FormData. Zod elimina
  // las claves que no declara, por lo que sin este campo `req.body.stock`
  // desaparecía antes de que la ruta pudiera registrar el ajuste.
  stock: coerceNum(z.number().nonnegative().default(0)),
});

const updateProductoSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  descripcion: z.string().max(2000).optional(),
  precio: coerceNum(z.number().nonnegative().optional()),
  costo: coerceNum(z.number().nonnegative().optional()),
  categoria_id: coerceNum(z.number().int().positive().nullable().optional()),
  imagen: z.string().max(1000).optional(),
  variantes: z.string().max(10000).optional(),
  extras: z.string().max(10000).optional(),
  activo: coerceNum(z.number().int().min(0).max(1).optional()),
  destacado: coerceNum(z.number().int().min(0).max(1).optional()),
  tiempo_preparacion: coerceNum(z.number().int().positive().optional()),
  stock: coerceNum(z.number().nonnegative().optional()),
});

module.exports = {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  createPedidoSchema,
  updatePedidoSchema,
  createProductoSchema,
  updateProductoSchema,
};
