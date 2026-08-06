/**
 * OBSOLETO — se puede borrar.
 *
 * Este archivo no renderizaba nada propio: recibía 30 props y las repartía
 * entre `ClientesCampaignsSection` y `ClientesGrid`. Esa capa de pasamanos era
 * justamente donde se perdían props en el camino (`toast` llegaba undefined y
 * reventaba la grilla). Ahora `index.jsx` monta los dos componentes directo.
 */
export default null;
