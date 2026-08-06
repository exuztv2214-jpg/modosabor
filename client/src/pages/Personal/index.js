// Archivo muerto.
//
// Este barrel no lo importaba nadie, y convivía en la misma carpeta con
// `index.jsx`, que es el componente real de la página. Un import de
// `'./Personal'` sin extensión resuelve `.js` antes que `.jsx`, así que este
// archivo podía quedar seleccionado en lugar de la página y devolver un
// objeto de constantes donde se esperaba un componente.
//
// Se deja vacío en vez de borrarlo para no romper ningún import que se me
// haya pasado. Si no aparece nada roto, se puede eliminar el archivo.
export {};
