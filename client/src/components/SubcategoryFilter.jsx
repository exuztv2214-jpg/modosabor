import { claveSubcategoria } from '../lib/catalogVisibility.js';

export default function SubcategoryFilter({ productos, value, onChange }) {
  const options = [
    ...new Map(
      productos
        .filter((p) => p.subcategoria)
        .map((p) => [
          claveSubcategoria(p),
          `${p.categoria_nombre || 'Categoría'} · ${p.subcategoria}`,
        ])
    ).entries(),
  ];
  if (!options.length && !value) return null;
  return (
    <label className="my-2 flex flex-wrap items-center gap-2 px-4 text-sm text-gray-700">
      Subcategoría
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2"
      >
        <option value="">Todas las subcategorías</option>
        {options.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
        {value && !options.some(([key]) => key === value) && (
          <option value={value}>Subcategoría sin productos disponibles</option>
        )}
      </select>
    </label>
  );
}
