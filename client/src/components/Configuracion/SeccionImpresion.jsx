import { useEffect, useState } from 'react';
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
    detalle: 'Hoja chica cortada — la que usa el local',
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

// Los productos de ejemplo de la vista previa ahora los arma el servidor,
// junto con el documento: `samplePedido` en `server/utils/printTemplates.js`.

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

/*
  Acá vivían unas trescientas líneas que dibujaban en React una imitación del
  ticket, la comanda y la hoja de reparto para la vista previa. Cada cambio en
  las plantillas de impresión del servidor había que replicarlo a mano, y
  cuando alguien se olvidaba el panel mostraba un documento y la impresora
  otro distinto.

  Ahora la vista previa pide el documento real al servidor y lo muestra en un
  iframe, así que no puede desincronizarse.
*/

export default function SeccionImpresion({ config, f, setToggle, setConfig }) {
  const [previewDoc, setPreviewDoc] = useState('ticket');
  const [printingTest, setPrintingTest] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);

  const formatoActual = FORMATOS_IMPRESION[config.impresion_formato] || FORMATOS_IMPRESION.a6;
  const escalaPreview = getPreviewScale(formatoActual.key);

  /**
   * La vista previa pide el documento real al servidor y lo muestra en un
   * iframe. Antes era una maqueta en React que imitaba el resultado: cada
   * cambio en las plantillas de impresión había que replicarlo a mano, y
   * cuando alguien se olvidaba, el panel mostraba una cosa y la impresora
   * otra.
   *
   * Se recarga con medio segundo de espera para no pedir un documento nuevo
   * por cada tecla mientras se ajusta el margen o el tamaño de letra.
   */
  const previewKey = [
    previewDoc,
    config.impresion_formato,
    config.impresion_tipo_letra,
    config.impresion_tamano_fuente,
    config.impresion_margen_mm,
    config.impresion_compacta,
    config.impresion_mostrar_logo,
    config.impresion_mostrar_nombre_negocio,
    config.impresion_mostrar_direccion,
    config.impresion_mostrar_telefono,
    config.impresion_mostrar_fecha,
    config.impresion_mostrar_detalles_items,
    config.impresion_mostrar_precios_ticket,
    config.impresion_mostrar_qr_seguimiento,
    config.impresion_comanda_mostrar_cliente,
    config.impresion_mensaje_ticket,
  ].join('|');

  useEffect(() => {
    let cancelado = false;
    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      api
        .get(`/configuracion/impresion/test?tipo=${previewDoc}`)
        .then((documento) => {
          if (!cancelado) setPreviewHtml(documento?.html || '');
        })
        .catch(() => {
          if (!cancelado) setPreviewHtml('');
        })
        .finally(() => {
          if (!cancelado) setPreviewLoading(false);
        });
    }, 500);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const probarImpresion = async () => {
    setPrintingTest(true);
    try {
      const documento = await api.get(`/configuracion/impresion/test?tipo=${previewDoc}`);
      const popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permití las ventanas emergentes para abrir la prueba');
        return;
      }
      popup.document.open();
      popup.document.write(documento.html);
      popup.document.close();
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la prueba');
    } finally {
      setPrintingTest(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={probarImpresion}
          disabled={printingTest}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-[13px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          <Printer size={15} strokeWidth={1.9} />
          {printingTest ? 'Generando…' : 'Probar impresión'}
        </button>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <SectionCard
            icon={Layout}
            title="Formato y Papel"
            subtitle="Selecciona el tamaño base de tus impresiones"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(FORMATOS_IMPRESION).map((fmt) => (
                <button
                  key={fmt.key}
                  type="button"
                  role="radio"
                  aria-checked={config.impresion_formato === fmt.key}
                  onClick={() => setConfig((prev) => ({ ...prev, impresion_formato: fmt.key }))}
                  style={
                    config.impresion_formato === fmt.key ? { borderColor: '#DC1F2D' } : undefined
                  }
                  className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition ${
                    config.impresion_formato === fmt.key
                      ? 'bg-white'
                      : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-[14px] font-semibold text-gray-900">{fmt.nombre}</span>
                  <span className="text-[12px] text-gray-500">{fmt.detalle}</span>
                  <span className="mt-1 text-[11px] tabular-nums text-gray-400">
                    {fmt.ancho} × {fmt.alto} · {fmt.tipo}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          {/*
            Los diez interruptores de contenido estaban en una grilla plana,
            sin decir a qué documento afectaba cada uno. "Precios en ticket"
            sólo cambia el ticket, "Cliente en comanda" sólo la comanda y el
            resto salen en los tres. Agrupados por documento se entiende sin
            tener que probar imprimiendo.
          */}
          <SectionCard
            icon={AlignJustify}
            title="Qué se imprime"
            subtitle="Contenido de cada documento"
          >
            <p className="mb-2 text-[11px] font-medium text-gray-400">En los tres documentos</p>
            <div className="space-y-1">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_logo', true)}
                onChange={(value) => setToggle('impresion_mostrar_logo', value)}
                label="Logo del negocio"
                description="En la cabecera. En térmica de 58 mm puede verse borroso."
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_nombre_negocio', true)}
                onChange={(value) => setToggle('impresion_mostrar_nombre_negocio', value)}
                label="Nombre del negocio"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_direccion', true)}
                onChange={(value) => setToggle('impresion_mostrar_direccion', value)}
                label="Dirección del local"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_telefono', true)}
                onChange={(value) => setToggle('impresion_mostrar_telefono', value)}
                label="Teléfono"
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_fecha', true)}
                onChange={(value) => setToggle('impresion_mostrar_fecha', value)}
                label="Fecha y hora"
                description="Cuándo se tomó el pedido."
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_detalles_items', true)}
                onChange={(value) => setToggle('impresion_mostrar_detalles_items', value)}
                label="Detalle de cada producto"
                description="Mitades, guarniciones, extras y notas. Sin esto la cocina no sabe qué preparar."
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_compacta', false)}
                onChange={(value) => setToggle('impresion_compacta', value)}
                label="Modo compacto"
                description="Menos espacio entre líneas. Ahorra papel térmico."
              />
            </div>

            <p className="mb-2 mt-5 text-[11px] font-medium text-gray-400">Sólo en el ticket</p>
            <div className="space-y-1">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_precios_ticket', true)}
                onChange={(value) => setToggle('impresion_mostrar_precios_ticket', value)}
                label="Precios"
                description="Precio por producto y total."
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_mostrar_qr_seguimiento', true)}
                onChange={(value) => setToggle('impresion_mostrar_qr_seguimiento', value)}
                label="QR de seguimiento"
                description="El cliente escanea y ve el estado de su pedido."
              />
            </div>

            <p className="mb-2 mt-5 text-[11px] font-medium text-gray-400">Sólo en la comanda</p>
            <div className="space-y-1">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_comanda_mostrar_cliente', true)}
                onChange={(value) => setToggle('impresion_comanda_mostrar_cliente', value)}
                label="Nombre del cliente"
                description="Ayuda a identificar el pedido al armarlo."
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Truck}
            title="Hoja de reparto"
            subtitle="La hoja que se lleva el rider en los pedidos con envío"
          >
            <ToggleSwitch
              checked={isEnabled(config, 'impresion_hoja_reparto_activa', true)}
              onChange={(value) => setToggle('impresion_hoja_reparto_activa', value)}
              label="Imprimir la hoja de reparto"
              description="Sale una hoja extra por cada pedido de delivery."
            />
            <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
              {isEnabled(config, 'impresion_hoja_reparto_activa', true)
                ? 'Cuando los riders trabajen sólo con la app en el celular, apagá esto y dejás de gastar una hoja por cada delivery. Los datos que necesitan ya los tienen en pantalla.'
                : 'No se imprime. Los riders ven la dirección, el teléfono y cuánto cobrar desde la app.'}
            </p>
          </SectionCard>

          <SectionCard icon={Type} title="Letra" subtitle="Cómo se ve el texto impreso">
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Tipografía"
                value={config.impresion_tipo_letra || 'mono'}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, impresion_tipo_letra: event.target.value }))
                }
                options={[
                  { value: 'mono', label: 'Monoespaciada (ticket clásico)' },
                  { value: 'sans', label: 'Sans serif (moderna)' },
                  { value: 'serif', label: 'Serif (clásica)' },
                ]}
              />
              <SelectField
                label="Tamaño"
                value={config.impresion_tamano_fuente || '12px'}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, impresion_tamano_fuente: event.target.value }))
                }
                options={[
                  { value: '10px', label: 'Chica' },
                  { value: '12px', label: 'Normal' },
                  { value: '14px', label: 'Grande' },
                  { value: '16px', label: 'Extra grande' },
                ]}
              />
              <InputField
                label="Margen del papel"
                type="number"
                min="2"
                max="20"
                {...f('impresion_margen_mm')}
                hint="En milímetros. En A6 conviene 5 o 6: más grande y no entra el pedido en una hoja."
              />
            </div>

            {/*
              Había además un campo "Escala de fuente" que multiplicaba el
              tamaño elegido arriba. Dos controles para lo mismo: se elegía
              "Grande" y después había que entender por qué salía distinto.
              Quedó sólo el tamaño; la escala se sigue guardando pero ya no se
              edita a mano desde acá.
            */}
          </SectionCard>

          <SectionCard
            icon={Zap}
            title="Automatización"
            subtitle="Decide cuándo sale la impresión automáticamente"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_auto_tpv')}
                onChange={(value) => setToggle('impresion_auto_tpv', value)}
                label="Auto-impresión en TPV"
                description="Imprime al confirmar una venta en caja."
              />
              <ToggleSwitch
                checked={isEnabled(config, 'impresion_auto_web')}
                onChange={(value) => setToggle('impresion_auto_web', value)}
                label="Auto-impresión Web"
                description="Imprime al recibir pedidos online."
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Layers}
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
              />
            </div>
          </SectionCard>
        </div>

        <div className="xl:sticky xl:top-24 h-fit">
          <SectionCard
            icon={Eye}
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
                      style={active ? { background: '#DC1F2D' } : undefined}
                      className={`flex h-10 items-center gap-2 rounded-xl px-3.5 text-[12px] font-semibold transition ${
                        active ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon size={14} strokeWidth={1.9} />
                      {doc.label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-gray-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 px-1 text-[11px] font-medium text-gray-500">
                  <span>
                    {formatoActual.nombre} · {formatoActual.ancho} × {formatoActual.alto}
                  </span>
                  <span>{previewLoading ? 'Actualizando…' : 'Documento real'}</span>
                </div>

                <div
                  className="overflow-auto rounded-xl bg-gray-200/70 p-3"
                  style={{ maxHeight: '70vh' }}
                >
                  <div
                    className="mx-auto bg-white shadow-sm"
                    style={{
                      width: formatoActual.pxAncho * escalaPreview,
                      height: formatoActual.pxAlto * escalaPreview,
                    }}
                  >
                    {/*
                      El iframe renderiza el mismo HTML que sale impreso, a
                      escala. `sandbox` sin `allow-scripts` deja fuera el botón
                      de imprimir del documento, que acá no hace falta.
                    */}
                    <iframe
                      key={previewDoc}
                      title="Vista previa de impresión"
                      srcDoc={previewHtml}
                      sandbox=""
                      className="origin-top-left border-0 bg-white"
                      style={{
                        width: formatoActual.pxAncho,
                        height: formatoActual.pxAlto,
                        transform: `scale(${escalaPreview})`,
                      }}
                    />
                  </div>
                </div>

                <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500">
                  Es el documento real, no una maqueta. Si acá entra en una hoja, en la impresora
                  también.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
