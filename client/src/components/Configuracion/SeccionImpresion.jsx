import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChefHat,
  Eye,
  Layers,
  Layout,
  Printer,
  Receipt,
  Truck,
  Type,
  Zap,
  AlignJustify,
  Maximize,
  Minimize,
  Image as ImageIcon,
  CheckSquare,
  Square,
} from 'lucide-react';

import api from '../../lib/api.js';

import { SectionCard, InputField, ToggleSwitch, SelectField } from './ConfigComponents.jsx';

const FORMATOS_IMPRESION = {
  a4: {
    key: 'a4',
    nombre: 'A4',
    detalle: 'Factura o carta',
    ancho: '210mm',
    alto: '297mm',
    tipo: 'hoja',
    pxAncho: 794,
    pxAlto: 1123,
  },
  a5: {
    key: 'a5',
    nombre: 'A5',
    detalle: 'Media carta',
    ancho: '148mm',
    alto: '210mm',
    tipo: 'hoja',
    pxAncho: 559,
    pxAlto: 794,
  },
  a6: {
    key: 'a6',
    nombre: 'A6',
    detalle: 'Comanda pequeña',
    ancho: '105mm',
    alto: '148mm',
    tipo: 'hoja',
    pxAncho: 397,
    pxAlto: 559,
  },
  ticket80: {
    key: 'ticket80',
    nombre: 'Ticket 80mm',
    detalle: 'Térmica estándar',
    ancho: '80mm',
    alto: 'auto',
    tipo: 'rollo',
    pxAncho: 302,
    pxAlto: 640,
  },
  ticket58: {
    key: 'ticket58',
    nombre: 'Ticket 58mm',
    detalle: 'Térmica angosta',
    ancho: '58mm',
    alto: 'auto',
    tipo: 'rollo',
    pxAncho: 219,
    pxAlto: 640,
  },
};

const DOCUMENTOS = [
  { key: 'ticket', label: 'Ticket cliente', icon: Receipt },
  { key: 'comanda', label: 'Comanda cocina', icon: ChefHat },
  { key: 'delivery', label: 'Hoja delivery', icon: Truck },
];

const PREVIEW_ITEMS = [
  {
    id: 1,
    cantidad: 1,
    nombre: 'Pizza especial',
    detalle: 'Mitades: muzza / napolitana',
    precio: 12000,
  },
  {
    id: 2,
    cantidad: 1,
    nombre: 'Empanadas surtidas',
    detalle: 'Docena · carne, pollo y jyq',
    precio: 8500,
  },
  { id: 3, cantidad: 2, nombre: 'Gaseosa 1.5L', detalle: '', precio: 1800 },
];

function isEnabled(config, key, fallback = false) {
  const value = config?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return value === '1' || value === 1 || value === true;
}

function getPreviewScale(formatKey) {
  if (formatKey === 'a4') return 0.34;
  if (formatKey === 'a5') return 0.48;
  if (formatKey === 'a6') return 0.74;
  if (formatKey === 'ticket58') return 1;
  return 0.92;
}

function getFontFamily(tipo) {
  if (tipo === 'sans') return 'ui-sans-serif, system-ui, sans-serif';
  if (tipo === 'serif') return 'Georgia, serif';
  return '"Courier New", Courier, monospace';
}

function getFontSize(size) {
  if (['10px', '12px', '14px', '16px'].includes(size)) return size;
  if (size === 'pequeno') return '10px';
  if (size === 'grande') return '14px';
  return '12px';
}

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function PreviewHeader({ config, showMetaDefault = true }) {
  const showLogo = isEnabled(config, 'impresion_mostrar_logo', true);
  const showName = isEnabled(config, 'impresion_mostrar_nombre_negocio', true);
  const showAddress = isEnabled(config, 'impresion_mostrar_direccion', true) && showMetaDefault;
  const showPhone = isEnabled(config, 'impresion_mostrar_telefono', true) && showMetaDefault;

  if (!showLogo && !showName && !showAddress && !showPhone) return null;

  return (
    <div className="border-b border-dashed border-slate-300 pb-3 text-center">
      {showLogo ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-xs font-black tracking-wider text-white">
          LOGO
        </div>
      ) : null}
      {showName && (
        <div className="text-[1.05em] font-black uppercase tracking-[0.18em] text-slate-900">
          {config.negocio_nombre || 'Modo Sabor'}
        </div>
      )}
      {showAddress || showPhone ? (
        <div className="mt-2 space-y-1 text-[0.88em] text-slate-500">
          {showAddress && config.negocio_direccion ? <div>{config.negocio_direccion}</div> : null}
          {showPhone && config.negocio_telefono ? <div>{config.negocio_telefono}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function TicketPreview({ config, format }) {
  const subtotal = PREVIEW_ITEMS.reduce((acc, item) => acc + item.cantidad * item.precio, 0);
  const envio = isEnabled(config, 'impresion_mostrar_envio') ? 500 : 0;
  const total = subtotal + envio;
  const showPrices = isEnabled(config, 'impresion_mostrar_precios_ticket', true);
  const showQr = isEnabled(config, 'impresion_mostrar_qr_seguimiento', true);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const isCompact = isEnabled(config, 'impresion_compacta', false);

  return (
    <div className={isCompact ? 'space-y-2' : 'space-y-4'}>
      <PreviewHeader config={config} />

      <div className={`text-[0.9em] ${isCompact ? 'space-y-0.5' : 'space-y-1.5'}`}>
        <div className="flex justify-between">
          <span>Pedido</span>
          <strong>#0001</strong>
        </div>
        {showDate && (
          <div className="flex justify-between">
            <span>Fecha</span>
            <span>{new Date().toLocaleString('es-AR')}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Entrega</span>
          <span>Delivery</span>
        </div>
        <div className="flex justify-between">
          <span>Cliente</span>
          <span>Juan Perez</span>
        </div>
      </div>

      <div className={`border-y border-dashed border-slate-300 ${isCompact ? 'py-1.5' : 'py-3'}`}>
        <div className="mb-2 flex justify-between text-[0.78em] font-black uppercase tracking-[0.18em] text-slate-500">
          <span>Detalle</span>
          {showPrices ? <span>Total</span> : null}
        </div>
        <div className={isCompact ? 'space-y-1.5' : 'space-y-2.5'}>
          {PREVIEW_ITEMS.map((item) => (
            <div key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-bold text-slate-900">
                    {item.cantidad}x {item.nombre}
                  </div>
                  {showDetails && item.detalle ? (
                    <div className="mt-1 text-[0.88em] text-slate-500">{item.detalle}</div>
                  ) : null}
                </div>
                {showPrices ? (
                  <div className="whitespace-nowrap font-bold text-slate-900">
                    {money(item.cantidad * item.precio)}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`text-[0.92em] ${isCompact ? 'space-y-0.5' : 'space-y-1.5'}`}>
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>
        {envio > 0 ? (
          <div className="flex justify-between">
            <span>Envío</span>
            <span>{money(envio)}</span>
          </div>
        ) : null}
        <div
          className={`flex justify-between border-t border-slate-900 text-[1.08em] font-black text-slate-900 ${isCompact ? 'pt-1' : 'pt-2'}`}
        >
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      {config.impresion_mensaje_ticket ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-center text-[0.9em] italic text-slate-600">
          {config.impresion_mensaje_ticket}
        </div>
      ) : null}

      {showQr ? (
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-[0.7em] font-bold text-slate-500">
            QR
          </div>
          <div className="mt-2 text-[0.78em] text-slate-500">Seguimiento del pedido</div>
        </div>
      ) : null}

      {isEnabled(config, 'impresion_ticket_duplicado') ? (
        <div className="rounded-2xl bg-violet-50 px-3 py-2 text-center text-[0.82em] font-black uppercase tracking-wider text-violet-700">
          Salida configurada en duplicado
        </div>
      ) : null}
    </div>
  );
}

function ComandaPreview({ config }) {
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const showPrices = isEnabled(config, 'impresion_comanda_mostrar_precios', false);
  const showClient = isEnabled(config, 'impresion_comanda_mostrar_cliente', true);
  const isCompact = isEnabled(config, 'impresion_compacta', false);

  return (
    <div className={isCompact ? 'space-y-2' : 'space-y-4'}>
      <PreviewHeader config={config} showMetaDefault={false} />

      <div className="flex items-center justify-between">
        <div className="rounded-full bg-orange-100 px-3 py-1 text-[0.76em] font-black uppercase tracking-[0.18em] text-orange-700">
          Comanda cocina
        </div>
        <div className="text-[0.82em] font-semibold text-slate-500">Turno noche</div>
      </div>

      <div className={`text-[0.9em] ${isCompact ? 'space-y-0.5' : 'space-y-1.5'}`}>
        <div className="flex justify-between">
          <span>Pedido</span>
          <strong>#0001</strong>
        </div>
        <div className="flex justify-between">
          <span>Tipo</span>
          <span>Delivery</span>
        </div>
        {showDate && (
          <div className="flex justify-between">
            <span>Hora</span>
            <span>{new Date().toLocaleTimeString('es-AR')}</span>
          </div>
        )}
        {showClient && (
          <div className="flex justify-between">
            <span>Cliente</span>
            <span>Juan Perez</span>
          </div>
        )}
      </div>

      <div className={`border-y border-dashed border-slate-300 ${isCompact ? 'py-1.5' : 'py-3'}`}>
        <div className="mb-2 text-[0.78em] font-black uppercase tracking-[0.18em] text-slate-500">
          Producción
        </div>
        <div className={isCompact ? 'space-y-1.5' : 'space-y-3'}>
          {PREVIEW_ITEMS.map((item) => (
            <div key={item.id} className="flex justify-between items-start">
              <div>
                <div className="font-black text-slate-900">
                  {item.cantidad}x {item.nombre}
                </div>
                {showDetails && item.detalle ? (
                  <div className="mt-1 text-[0.88em] text-slate-500">{item.detalle}</div>
                ) : null}
              </div>
              {showPrices && (
                <div className="font-bold text-slate-900">{money(item.cantidad * item.precio)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-orange-50 px-3 py-3 text-[0.88em] text-orange-700">
        <strong>Nota:</strong> sin aceitunas y cortar en 8 porciones.
      </div>
    </div>
  );
}

function DeliverySheetPreview({ config }) {
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const isCompact = isEnabled(config, 'impresion_compacta', false);

  return (
    <div className={isCompact ? 'space-y-2' : 'space-y-4'}>
      <PreviewHeader config={config} showMetaDefault={false} />

      <div className="rounded-2xl border border-slate-200 px-3 py-3 text-[0.9em]">
        <div className="mb-2 flex items-center justify-between">
          <strong>Pedido #0001</strong>
          <span className="rounded-full bg-success-100 px-2.5 py-1 text-[0.72em] font-black uppercase tracking-wider text-success-700">
            Delivery
          </span>
        </div>
        <div className="space-y-1.5 text-slate-600">
          <div className="flex justify-between">
            <span>Cliente</span>
            <span>Juan Perez</span>
          </div>
          <div className="flex justify-between">
            <span>Teléfono</span>
            <span>3811234567</span>
          </div>
          <div className="flex justify-between">
            <span>Zona</span>
            <span>Centro</span>
          </div>
          <div className="flex justify-between">
            <span>ETA</span>
            <span>30 min</span>
          </div>
          <div className="flex justify-between">
            <span>PIN</span>
            <strong>4821</strong>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 px-3 py-3 text-[0.9em] text-slate-700">
        <div className="mb-1 font-black uppercase tracking-[0.16em] text-slate-500">Dirección</div>
        <div>Av. Sarmiento 245, Monteros</div>
      </div>

      <div className={`border-y border-dashed border-slate-300 ${isCompact ? 'py-1.5' : 'py-3'}`}>
        <div className="mb-2 text-[0.78em] font-black uppercase tracking-[0.18em] text-slate-500">
          Carga
        </div>
        <div className={isCompact ? 'space-y-1.5' : 'space-y-2.5'}>
          {PREVIEW_ITEMS.map((item) => (
            <div key={item.id} className="flex justify-between gap-3 text-[0.9em]">
              <span className="font-bold">
                {item.cantidad}x {item.nombre}
              </span>
              <span className="font-bold text-slate-900">{money(item.cantidad * item.precio)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between border-t border-slate-900 pt-2 text-[1.02em] font-black text-slate-900">
        <span>Total a cobrar</span>
        <span>
          {money(PREVIEW_ITEMS.reduce((acc, item) => acc + item.cantidad * item.precio, 0) + 500)}
        </span>
      </div>
    </div>
  );
}

function PreviewDocument({ previewDoc, config, format }) {
  const style = useMemo(
    () => ({
      fontFamily: getFontFamily(config.impresion_tipo_letra || 'mono'),
      fontSize: getFontSize(config.impresion_tamano_fuente || '12px'),
      lineHeight: 1.45,
      color: '#0f172a',
    }),
    [config.impresion_tamano_fuente, config.impresion_tipo_letra]
  );

  return (
    <div
      style={style}
      className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm"
    >
      {previewDoc === 'comanda' ? <ComandaPreview config={config} format={format} /> : null}
      {previewDoc === 'ticket' ? <TicketPreview config={config} format={format} /> : null}
      {previewDoc === 'delivery' ? <DeliverySheetPreview config={config} format={format} /> : null}
    </div>
  );
}

export default function SeccionImpresion({ config, f, setToggle, setConfig }) {
  const [previewDoc, setPreviewDoc] = useState('ticket');
  const [printingTest, setPrintingTest] = useState(false);

  const formatoActual = FORMATOS_IMPRESION[config.impresion_formato] || FORMATOS_IMPRESION.a6;
  const escalaPreview = getPreviewScale(formatoActual.key);

  const probarImpresion = async () => {
    setPrintingTest(true);
    try {
      const document = await api.get('/configuracion/impresion/test');
      const popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permite ventanas emergentes para abrir la prueba de impresion');
        return;
      }
      popup.document.open();
      popup.document.write(document.html);
      popup.document.close();
      toast.success('Prueba de impresion generada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la prueba de impresion');
    } finally {
      setPrintingTest(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      <div className="sticky top-[84px] z-10 mb-8 flex flex-col gap-4 rounded-[28px] border border-gray-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-violet-100 flex items-center justify-center">
            <Printer className="text-violet-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Configuración de impresión</h2>
            <p className="text-sm text-gray-500">
              Ajusta el contenido, estilo y automatización de tus tickets.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={probarImpresion}
          disabled={printingTest}
          className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-violet-100 transition-all hover:bg-violet-700 disabled:opacity-50"
        >
          <Printer size={16} />
          {printingTest ? 'Generando...' : 'Probar impresión'}
        </button>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <SectionCard
            icon={Layout}
            tone="violet"
            title="Formato y Papel"
            subtitle="Selecciona el tamaño base de tus impresiones"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(FORMATOS_IMPRESION).map((fmt) => (
                <label
                  key={fmt.key}
                  className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-all ${
                    config.impresion_formato === fmt.key
                      ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    className="hidden"
                    name="impresion_formato"
                    checked={config.impresion_formato === fmt.key}
                    onChange={() => setConfig((prev) => ({ ...prev, impresion_formato: fmt.key }))}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900">{fmt.nombre}</span>
                    <div
                      className={`h-4 w-4 rounded-full border-2 ${config.impresion_formato === fmt.key ? 'border-violet-500 bg-violet-500' : 'border-gray-300'}`}
                    >
                      {config.impresion_formato === fmt.key ? (
                        <div className="m-0.5 h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{fmt.detalle}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
                      {fmt.tipo}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {fmt.ancho} x {fmt.alto}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={AlignJustify}
            tone="violet"
            title="Contenido de Impresión"
            subtitle="Habilita o deshabilita secciones de los documentos"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_logo', true)}
                onChange={(value) => setToggle('impresion_mostrar_logo', value)}
                label="Mostrar Logo"
                description="Incluye el logo de tu negocio en la cabecera."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_nombre_negocio', true)}
                onChange={(value) => setToggle('impresion_mostrar_nombre_negocio', value)}
                label="Nombre del Negocio"
                description="Muestra el nombre principal en el encabezado."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_direccion', true)}
                onChange={(value) => setToggle('impresion_mostrar_direccion', value)}
                label="Dirección"
                description="Incluye la dirección física del local."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_telefono', true)}
                onChange={(value) => setToggle('impresion_mostrar_telefono', value)}
                label="Teléfono"
                description="Muestra el contacto del negocio."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_fecha', true)}
                onChange={(value) => setToggle('impresion_mostrar_fecha', value)}
                label="Fecha y Hora"
                description="Muestra cuándo se generó el pedido."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_detalles_items', true)}
                onChange={(value) => setToggle('impresion_mostrar_detalles_items', value)}
                label="Detalles de Productos"
                description="Muestra sabores, mitades y extras."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_precios_ticket', true)}
                onChange={(value) => setToggle('impresion_mostrar_precios_ticket', value)}
                label="Precios en Ticket"
                description="Muestra precios unitarios y totales al cliente."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_qr_seguimiento', true)}
                onChange={(value) => setToggle('impresion_mostrar_qr_seguimiento', value)}
                label="QR de Seguimiento"
                description="Imprime un QR para que el cliente siga su pedido."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_compacta', false)}
                onChange={(value) => setToggle('impresion_compacta', value)}
                label="Modo Compacto"
                description="Reduce espaciados para ahorrar papel térmico."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_comanda_mostrar_cliente', true)}
                onChange={(value) => setToggle('impresion_comanda_mostrar_cliente', value)}
                label="Cliente en Comanda"
                description="Muestra el nombre del cliente a la cocina."
                color="violet"
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Type}
            tone="violet"
            title="Estilo y Tipografía"
            subtitle="Ajusta la fuente y el tamaño de letra"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SelectField
                label="Tipo de letra"
                value={config.impresion_tipo_letra || 'mono'}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, impresion_tipo_letra: event.target.value }))
                }
                options={[
                  { value: 'mono', label: 'Monospace (ticket clásico)' },
                  { value: 'sans', label: 'Sans Serif (moderna)' },
                  { value: 'serif', label: 'Serif (clásica)' },
                ]}
              />
              <SelectField
                label="Tamaño de fuente base"
                value={config.impresion_tamano_fuente || '12px'}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, impresion_tamano_fuente: event.target.value }))
                }
                options={[
                  { value: '10px', label: 'Pequeña (10px)' },
                  { value: '12px', label: 'Normal (12px)' },
                  { value: '14px', label: 'Grande (14px)' },
                  { value: '16px', label: 'Extra grande (16px)' },
                ]}
              />
              <InputField
                label="Margen (mm)"
                type="number"
                min="2"
                max="20"
                {...f('impresion_margen_mm')}
              />
              <InputField
                label="Escala de fuente"
                type="number"
                min="0.8"
                max="1.4"
                step="0.05"
                {...f('impresion_escala_fuente')}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Zap}
            tone="violet"
            title="Automatización"
            subtitle="Decide cuándo sale la impresión automáticamente"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_auto_tpv')}
                onChange={(value) => setToggle('impresion_auto_tpv', value)}
                label="Auto-impresión en TPV"
                description="Imprime al confirmar una venta en caja."
                color="violet"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_auto_web')}
                onChange={(value) => setToggle('impresion_auto_web', value)}
                label="Auto-impresión Web"
                description="Imprime al recibir pedidos online."
                color="violet"
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Layers}
            tone="violet"
            title="Copias por Defecto"
            subtitle="Cuántas copias se preparan automáticamente"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <InputField
                label="Copias de comanda (cocina)"
                type="number"
                min="1"
                {...f('impresion_copias_comanda')}
              />
              <InputField
                label="Copias de ticket (cliente)"
                type="number"
                min="1"
                {...f('impresion_copias_ticket')}
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_ticket_duplicado')}
                onChange={(value) => setToggle('impresion_ticket_duplicado', value)}
                label="Ticket Duplicado"
                description="Genera siempre dos copias del ticket cliente."
                color="violet"
              />
            </div>
          </SectionCard>
        </div>

        <div className="xl:sticky xl:top-24 h-fit">
          <SectionCard
            icon={Eye}
            tone="violet"
            title="Vista Previa Real"
            subtitle="Visualiza cómo quedará el documento físico"
          >
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {DOCUMENTOS.map((doc) => {
                  const Icon = doc.icon;
                  const active = previewDoc === doc.key;
                  return (
                    <button
                      key={doc.key}
                      type="button"
                      onClick={() => setPreviewDoc(doc.key)}
                      className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${
                        active
                          ? 'bg-violet-600 text-white shadow-lg shadow-violet-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Icon size={15} />
                      {doc.label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-3xl bg-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                  <span>
                    {formatoActual.nombre} · {formatoActual.ancho} x {formatoActual.alto}
                  </span>
                  <span>Escala {Math.round(escalaPreview * 100)}%</span>
                </div>

                <div
                  className="overflow-auto rounded-[28px] border border-slate-200 bg-slate-200/60 p-4"
                  style={{ maxHeight: '72vh' }}
                >
                  <div
                    className="mx-auto origin-top"
                    style={{
                      width: formatoActual.pxAncho * escalaPreview,
                      minHeight: formatoActual.pxAlto * escalaPreview,
                    }}
                  >
                    <div
                      style={{
                        width: formatoActual.pxAncho,
                        minHeight: formatoActual.pxAlto,
                        transform: `scale(${escalaPreview})`,
                        transformOrigin: 'top center',
                        marginBottom: `-${formatoActual.pxAlto * (1 - escalaPreview)}px`,
                      }}
                    >
                      <PreviewDocument
                        previewDoc={previewDoc}
                        config={config}
                        format={formatoActual}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
                <strong className="font-black uppercase tracking-wider flex items-center gap-2">
                  <Zap size={14} /> Recomendación
                </strong>
                <p className="mt-1">
                  Usa el <strong>Modo Compacto</strong> si tu impresora térmica tiene poco papel o
                  si quieres reducir el largo del ticket.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
