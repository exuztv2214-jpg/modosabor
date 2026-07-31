const { z } = require('zod');

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
  rol: z.enum(['admin', 'caja', 'cocina', 'delivery']).default('caja'),
});

const updateUserSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  password: z.string().min(6).max(255).optional(),
  rol: z.enum(['admin', 'caja', 'cocina', 'delivery']).optional(),
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
  precio: z.number().nonnegative(),
  costo: z.number().nonnegative().default(0),
  categoria_id: z.number().int().positive().nullable().optional(),
  imagen: z.string().max(1000).default(''),
  variantes: z.string().max(10000).default('[]'),
  extras: z.string().max(10000).default('[]'),
  activo: z.number().int().min(0).max(1).default(1),
  destacado: z.number().int().min(0).max(1).default(0),
  tiempo_preparacion: z.number().int().positive().default(15),
});

const updateProductoSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  descripcion: z.string().max(2000).optional(),
  precio: z.number().nonnegative().optional(),
  costo: z.number().nonnegative().optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
  imagen: z.string().max(1000).optional(),
  variantes: z.string().max(10000).optional(),
  extras: z.string().max(10000).optional(),
  activo: z.number().int().min(0).max(1).optional(),
  destacado: z.number().int().min(0).max(1).optional(),
  tiempo_preparacion: z.number().int().positive().optional(),
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
