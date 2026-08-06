import { fmtMoney } from './utils';

export default function PriceSummary({
  options,
  basePrice,
  singleClassName,
  multiClassName,
  itemClassName,
}) {
  const lista = Array.isArray(options) ? options : [];

  // Sólo contemplaba `length === 1`. Con una lista vacía caía en la rama de
  // varias opciones y devolvía un div sin nada: la celda del precio quedaba
  // en blanco en vez de mostrar al menos el precio base.
  if (lista.length <= 1) {
    return <p className={singleClassName}>{fmtMoney(lista[0]?.finalPrice ?? basePrice)}</p>;
  }

  return (
    <div className={multiClassName}>
      {lista.map((option) => (
        <p key={option.nombre} className={itemClassName}>
          <span className="font-normal text-gray-500">{option.nombre}</span>{' '}
          {fmtMoney(option.finalPrice)}
        </p>
      ))}
    </div>
  );
}
