import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PageHeader({ title, description, breadcrumbs = [], actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-400">
              <li>
                <Link
                  to="/admin/dashboard"
                  className="inline-flex items-center gap-1 transition-colors hover:text-primary-500"
                >
                  <Home size={12} />
                  Inicio
                </Link>
              </li>
              {breadcrumbs.map((crumb, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  <ChevronRight size={12} />
                  {crumb.to ? (
                    <Link to={crumb.to} className="transition-colors hover:text-primary-500">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-600">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-black tracking-tight text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm font-medium text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
