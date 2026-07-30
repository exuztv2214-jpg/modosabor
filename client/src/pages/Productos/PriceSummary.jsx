import { fmtMoney } from './utils';

export default function PriceSummary({
  options,
  basePrice,
  singleClassName,
  multiClassName,
  itemClassName,
}) {
  if (options.length === 1) {
    return <p className={singleClassName}>{fmtMoney(basePrice)}</p>;
  }

  return (
    <div className={multiClassName}>
      {options.map((option) => (
        <p key={option.nombre} className={itemClassName}>
          {option.nombre}: {fmtMoney(option.finalPrice)}
        </p>
      ))}
    </div>
  );
}
