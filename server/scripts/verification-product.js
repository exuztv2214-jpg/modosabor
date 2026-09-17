module.exports = function crearProductoDePrueba(db) {
  if (process.env.ISOLATED_OPERATIONAL_TEST !== '1') throw new Error('Requiere base aislada');
  const id = db
    .prepare(
      "INSERT INTO productos (nombre,precio,variantes,extras,activo,disponible_para_venta,stock_mode,stock_directo) VALUES ('Producto verificación simple',500000,'[]','[]',1,1,'direct',100)"
    )
    .run().lastInsertRowid;
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
};
