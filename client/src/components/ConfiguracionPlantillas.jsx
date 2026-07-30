import { useState, useEffect } from 'react';
import {
  Printer,
  Eye,
  Save,
  RotateCcw,
  Image as ImageIcon,
  Type,
  QrCode,
  Receipt,
  Check,
  X,
  FileText,
  Ruler,
  Zap,
  Settings,
  Info,
  Truck,
  ChefHat,
  LayoutTemplate,
} from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../lib/api.js';

// Constantes del sistema (alineadas con Configuracion.jsx)
const TAMANOS_PAPEL = {
  a4: {
    key: 'a4',
    nombre: 'A4 (Factura/Carta)',
    ancho: '210mm',
    alto: '297mm',
    pxAncho: 794,
    pxAlto: 1123,
    tipo: 'hoja',
    badge: 'Factura',
    badgeTone: 'bg-violet-100 text-violet-700',
  },
  a5: {
    key: 'a5',
    nombre: 'A5 (Media Carta)',
    ancho: '148mm',
    alto: '210mm',
    pxAncho: 559,
    pxAlto: 794,
    tipo: 'hoja',
    badge: 'Hoja',
    badgeTone: 'bg-sky-100 text-sky-700',
  },
  a6: {
    key: 'a6',
    nombre: 'A6 (Ticket Mediano)',
    ancho: '105mm',
    alto: '148mm',
    pxAncho: 397,
    pxAlto: 559,
    tipo: 'hoja',
    badge: 'Recomendado',
    badgeTone: 'bg-success-100 text-success-700',
  },
  ticket80: {
    key: 'ticket80',
    nombre: 'Ticket 80mm (Rollo)',
    ancho: '80mm',
    alto: 'auto',
    pxAncho: 302,
    pxAlto: 'auto',
    tipo: 'rollo',
    badge: 'Térmica',
    badgeTone: 'bg-orange-100 text-orange-700',
  },
  ticket58: {
    key: 'ticket58',
    nombre: 'Ticket 58mm (Rollo Chico)',
    ancho: '58mm',
    alto: 'auto',
    pxAncho: 219,
    pxAlto: 'auto',
    tipo: 'rollo',
    badge: 'Mini',
    badgeTone: 'bg-warning-100 text-warning-700',
  },
};

const DOCUMENTOS = [
  { key: 'ticket', label: 'Ticket Cliente', icon: Receipt, color: 'blue' },
  { key: 'comanda', label: 'Comanda Cocina', icon: ChefHat, color: 'orange' },
  { key: 'delivery', label: 'Hoja Delivery', icon: Truck, color: 'emerald' },
];

const PRODUCTOS_PREVIEW = [
  {
    id: 1,
    cantidad: 1,
    nombre: 'Pizza especial',
    descripcion: 'Entera',
    modificadores: ['Mitades: Muzzarella / Napolitana', 'Extra: borde relleno'],
    precio: 12000,
  },
  {
    id: 2,
    cantidad: 1,
    nombre: 'Empanadas surtidas',
    descripcion: 'Docena',
    modificadores: ['2 carne, 2 pollo, 2 jyq, 2 arabe, 4 humita'],
    precio: 8500,
  },
  { id: 3, cantidad: 2, nombre: 'Gaseosa 1.5L', descripcion: '', modificadores: [], precio: 1800 },
];

// Funciones auxiliares
function isConfigEnabled(config, key, fallback = false) {
  const value = config?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return value === '1' || value === 1 || value === true;
}

function getPreviewScale(formatKey) {
  if (formatKey === 'a4') return 0.34;
  if (formatKey === 'a5') return 0.46;
  if (formatKey === 'a6') return 0.72;
  if (formatKey === 'ticket58') return 1;
  return 0.92;
}

export default function ConfiguracionPlantillas({ config, setConfig, onSave }) {
  const [activeTab, setActiveTab] = useState('ticket');
  const [tamanioSeleccionado, setTamanioSeleccionado] = useState(config.impresion_formato || 'a6');
  const [saving, setSaving] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);

  // Sincronizar con config externo
  useEffect(() => {
    if (config.impresion_formato && TAMANOS_PAPEL[config.impresion_formato]) {
      setTamanioSeleccionado(config.impresion_formato);
    }
  }, [config.impresion_formato]);

  const tamanioActual = TAMANOS_PAPEL[tamanioSeleccionado] || TAMANOS_PAPEL.a6;
  const escalaPreview = getPreviewScale(tamanioSeleccionado);
  const esHoja = tamanioActual.tipo === 'hoja';

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSwitch = (key) => {
    const current = isConfigEnabled(config, key);
    setConfig((prev) => ({ ...prev, [key]: current ? '0' : '1' }));
  };

  const guardarPlantilla = async () => {
    setSaving(true);
    try {
      // Guardar el formato seleccionado
      await onSave?.();
      toast.success(`Plantilla guardada para formato ${tamanioActual.nombre}`);
    } catch (error) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const probarImpresion = async () => {
    setPrintingTest(true);
    try {
      const document = await api.get('/configuracion/impresion/test');
      const popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permití las ventanas emergentes para imprimir la prueba');
        return;
      }
      popup.document.open();
      popup.document.write(document.html);
      popup.document.close();
      toast.success('Prueba lista para imprimir');
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la prueba');
    } finally {
      setPrintingTest(false);
    }
  };

  const calcularTotal = () => {
    const subtotal = PRODUCTOS_PREVIEW.reduce((acc, p) => acc + p.cantidad * p.precio, 0);
    const envio = isConfigEnabled(config, 'impresion_mostrar_envio') ? 500 : 0;
    return subtotal + envio;
  };

  const renderTicketContent = () => {
    const fontSize =
      config.impresion_tamano_fuente === 'pequeno'
        ? '11px'
        : config.impresion_tamano_fuente === 'grande'
          ? '14px'
          : '12px';

    const fontFamily =
      config.impresion_tipo_letra === 'sans'
        ? 'ui-sans-serif, system-ui, sans-serif'
        : config.impresion_tipo_letra === 'serif'
          ? 'Georgia, serif'
          : '"Courier New", Courier, monospace';

    return (
      <div
        style={{
          fontFamily,
          fontSize,
          lineHeight: '1.4',
          color: '#000',
          padding: esHoja ? '20px' : '10px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Logo */}
        {isConfigEnabled(config, 'impresion_mostrar_logo', true) && (
          <div
            style={{
              textAlign: 'center',
              marginBottom: esHoja ? '16px' : '10px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {config.negocio_logo ? (
              <img
                src={config.negocio_logo}
                alt="Logo"
                style={{ maxHeight: esHoja ? '80px' : '50px', maxWidth: '80%' }}
              />
            ) : (
              <div
                style={{
                  width: esHoja ? '80px' : '50px',
                  height: esHoja ? '80px' : '50px',
                  backgroundColor: '#f97316',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: esHoja ? '14px' : '10px',
                }}
              >
                LOGO
              </div>
            )}
          </div>
        )}

        {/* Nombre del negocio */}
        {isConfigEnabled(config, 'impresion_mostrar_nombre', true) && (
          <div
            style={{
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: esHoja ? '22px' : '1.3em',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {config.negocio_nombre || 'Modo Sabor'}
          </div>
        )}

        {/* Dirección y teléfono */}
        {(isConfigEnabled(config, 'impresion_mostrar_direccion', true) ||
          isConfigEnabled(config, 'impresion_mostrar_telefono', true)) && (
          <div
            style={{
              textAlign: 'center',
              fontSize: esHoja ? '13px' : '0.9em',
              marginBottom: esHoja ? '16px' : '12px',
              borderBottom: esHoja ? '2px solid #000' : '1px dashed #ccc',
              paddingBottom: '10px',
              color: '#333',
            }}
          >
            {isConfigEnabled(config, 'impresion_mostrar_direccion', true) &&
              config.negocio_direccion && (
                <div style={{ marginBottom: '2px' }}>{config.negocio_direccion}</div>
              )}
            {isConfigEnabled(config, 'impresion_mostrar_telefono', true) &&
              config.negocio_telefono && <div>Tel: {config.negocio_telefono}</div>}
            {esHoja && isConfigEnabled(config, 'impresion_mostrar_fiscales') && (
              <div style={{ marginTop: '6px', fontSize: '11px' }}>IVA Responsable Inscripto</div>
            )}
          </div>
        )}

        {/* Info del pedido */}
        <div
          style={{
            marginBottom: '14px',
            borderBottom: esHoja ? '1px solid #ccc' : '1px dashed #ccc',
            paddingBottom: '10px',
          }}
        >
          {esHoja && (
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>
              DOCUMENTO NO FISCAL
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span>{esHoja ? 'Número:' : 'Pedido #:'}</span>
            <span style={{ fontWeight: 'bold', fontSize: esHoja ? '16px' : 'inherit' }}>0001</span>
          </div>

          {isConfigEnabled(config, 'impresion_mostrar_fecha', true) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span>Fecha:</span>
              <span>{new Date().toLocaleString('es-AR')}</span>
            </div>
          )}

          {isConfigEnabled(config, 'impresion_mostrar_tipo_entrega', true) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tipo:</span>
              <span style={{ fontWeight: 'bold' }}>Delivery</span>
            </div>
          )}

          {esHoja && isConfigEnabled(config, 'impresion_mostrar_metodo_pago') && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
              <span>Pago:</span>
              <span>Efectivo</span>
            </div>
          )}
        </div>

        {/* Cliente */}
        {isConfigEnabled(config, 'impresion_mostrar_cliente', true) && (
          <div
            style={{
              marginBottom: '14px',
              borderBottom: esHoja ? '1px solid #eee' : '1px dashed #ccc',
              paddingBottom: '10px',
            }}
          >
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                fontSize: esHoja ? '13px' : 'inherit',
              }}
            >
              CLIENTE:
            </div>
            <div style={{ marginLeft: esHoja ? '8px' : '0' }}>
              <div style={{ fontWeight: '500' }}>Juan Pérez</div>
              <div style={{ fontSize: '0.9em', color: '#555', marginTop: '1px' }}>
                Av. Principal 123
              </div>
              <div style={{ fontSize: '0.9em', color: '#555' }}>381 123-4567</div>
            </div>
          </div>
        )}

        {/* Productos */}
        <div style={{ marginBottom: '14px' }}>
          {esHoja && isConfigEnabled(config, 'impresion_tabla_productos') ? (
            // Tabla estilo factura para A4/A5
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '6px 3px' }}>Cant.</th>
                  <th style={{ textAlign: 'left', padding: '6px 3px' }}>Descripción</th>
                  <th style={{ textAlign: 'right', padding: '6px 3px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTOS_PREVIEW.map((prod) => (
                  <tr key={prod.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '5px 3px' }}>{prod.cantidad}</td>
                    <td style={{ padding: '5px 3px' }}>
                      <div>{prod.nombre}</div>
                      {isConfigEnabled(config, 'impresion_mostrar_modificadores', true) &&
                        prod.modificadores.length > 0 && (
                          <div style={{ fontSize: '0.85em', color: '#666' }}>
                            {prod.modificadores.join(', ')}
                          </div>
                        )}
                    </td>
                    <td style={{ textAlign: 'right', padding: '5px 3px', fontWeight: '500' }}>
                      ${(prod.cantidad * prod.precio).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            // Formato ticket para A6/rollo
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                  marginBottom: '5px',
                  borderBottom: '1px solid #000',
                  paddingBottom: '3px',
                }}
              >
                <span style={{ flex: 0.5 }}>Cant</span>
                <span style={{ flex: 2 }}>Producto</span>
                {isConfigEnabled(config, 'impresion_mostrar_precios', true) && (
                  <span style={{ flex: 1, textAlign: 'right' }}>Precio</span>
                )}
              </div>
              {PRODUCTOS_PREVIEW.map((prod) => (
                <div key={prod.id} style={{ marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ flex: 0.5 }}>{prod.cantidad}x</span>
                    <span style={{ flex: 2 }}>{prod.nombre}</span>
                    {isConfigEnabled(config, 'impresion_mostrar_precios', true) && (
                      <span style={{ flex: 1, textAlign: 'right' }}>
                        ${(prod.cantidad * prod.precio).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {isConfigEnabled(config, 'impresion_mostrar_descripcion') && prod.descripcion && (
                    <div style={{ fontSize: '0.85em', color: '#666', marginLeft: '18px' }}>
                      {prod.descripcion}
                    </div>
                  )}
                  {isConfigEnabled(config, 'impresion_mostrar_modificadores', true) &&
                    prod.modificadores.length > 0 && (
                      <div style={{ fontSize: '0.85em', color: '#666', marginLeft: '18px' }}>
                        * {prod.modificadores.join(', ')}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totales */}
        <div
          style={{
            marginBottom: '14px',
            borderTop: esHoja ? '2px solid #000' : '1px dashed #ccc',
            borderBottom: esHoja ? '2px solid #000' : 'none',
            padding: esHoja ? '12px 0' : '10px 0',
            backgroundColor: esHoja ? '#f9f9f9' : 'transparent',
          }}
        >
          {isConfigEnabled(config, 'impresion_mostrar_subtotal', true) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Subtotal:</span>
              <span>
                $
                {PRODUCTOS_PREVIEW.reduce(
                  (acc, p) => acc + p.cantidad * p.precio,
                  0
                ).toLocaleString()}
              </span>
            </div>
          )}

          {isConfigEnabled(config, 'impresion_mostrar_envio') && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Envío:</span>
              <span>$500</span>
            </div>
          )}

          {isConfigEnabled(config, 'impresion_mostrar_descuentos') && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px',
                color: '#dc2626',
              }}
            >
              <span>Descuento:</span>
              <span>$0</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 'bold',
              fontSize: esHoja ? '18px' : '1.2em',
              marginTop: '6px',
              paddingTop: esHoja ? '8px' : '0',
              borderTop: esHoja ? '1px solid #ddd' : 'none',
            }}
          >
            <span>TOTAL:</span>
            <span>${calcularTotal().toLocaleString()}</span>
          </div>

          {isConfigEnabled(config, 'impresion_mostrar_propina') && (
            <div
              style={{
                marginTop: '10px',
                padding: '6px',
                backgroundColor: esHoja ? '#e8f4f8' : '#f3f4f6',
                borderRadius: '6px',
                fontSize: '0.9em',
                textAlign: 'center',
                border: esHoja ? '1px solid #b8e0f0' : 'none',
              }}
            >
              💡 Propina sugerida (10%):{' '}
              <strong> ${Math.round(calcularTotal() * 0.1).toLocaleString()}</strong>
            </div>
          )}
        </div>

        {/* Mensaje de agradecimiento */}
        {isConfigEnabled(config, 'impresion_mostrar_mensaje', true) &&
          config.impresion_mensaje_ticket && (
            <div
              style={{
                textAlign: 'center',
                marginBottom: '14px',
                fontStyle: 'italic',
                fontSize: esHoja ? '13px' : 'inherit',
                padding: esHoja ? '15px' : '8px',
                border: esHoja ? '1px dashed #ccc' : 'none',
                borderRadius: esHoja ? '8px' : '0',
              }}
            >
              {config.impresion_mensaje_ticket}
            </div>
          )}

        {/* Redes sociales */}
        {isConfigEnabled(config, 'impresion_mostrar_redes') && (
          <div
            style={{
              textAlign: 'center',
              fontSize: esHoja ? '11px' : '0.9em',
              marginBottom: '14px',
              padding: esHoja ? '12px' : '8px',
              backgroundColor: esHoja ? '#f5f5f5' : 'transparent',
              borderRadius: esHoja ? '6px' : '0',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Seguinos</div>
            <div>📷 @modosabor 📱 381 555-0123</div>
          </div>
        )}

        {/* QR */}
        {isConfigEnabled(config, 'impresion_mostrar_qr') && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <div
              style={{
                width: esHoja ? '100px' : '70px',
                height: esHoja ? '100px' : '70px',
                margin: '0 auto',
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: '6px',
              }}
            >
              QR
            </div>
            <div style={{ fontSize: '0.75em', marginTop: '6px', color: '#666' }}>
              Escaneá para ver tu pedido
            </div>
          </div>
        )}

        {esHoja && (
          <div
            style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #ccc',
              fontSize: '9px',
              color: '#999',
              textAlign: 'center',
            }}
          >
            Documento generado electrónicamente - Modo Sabor POS
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutTemplate className="w-7 h-7 text-primary-600" />
            Editor de Plantillas
          </h2>
          <p className="text-gray-500 mt-1 text-sm">
            Personalizá tickets, comandas y hojas de delivery
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={probarImpresion}
            disabled={printingTest}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Printer size={18} />
            {printingTest ? 'Generando...' : 'Probar Impresión'}
          </button>
          <button
            onClick={guardarPlantilla}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-lg shadow-primary-200"
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar Plantilla'}
          </button>
        </div>
      </div>

      {/* Tabs de documentos */}
      <div className="flex gap-2 border-b border-gray-200">
        {DOCUMENTOS.map((doc) => (
          <button
            key={doc.key}
            onClick={() => setActiveTab(doc.key)}
            className={`flex items-center gap-2 px-5 py-3 font-medium transition-colors border-b-2 ${
              activeTab === doc.key
                ? `border-${doc.color}-600 text-${doc.color}-600`
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <doc.icon size={18} />
            {doc.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel de Edición */}
        <div className="space-y-5">
          {/* Selector de Tamaño */}
          <SectionCard title="Formato de Papel" icon={Ruler} tone="blue">
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(TAMANOS_PAPEL).map(([key, tamanio]) => (
                <label
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    tamanioSeleccionado === key
                      ? 'border-blue-600 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="tamanio"
                      value={key}
                      checked={tamanioSeleccionado === key}
                      onChange={() => {
                        setTamanioSeleccionado(key);
                        handleChange('impresion_formato', key);
                      }}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <div
                        className={`font-semibold ${tamanioSeleccionado === key ? 'text-blue-900' : 'text-gray-900'}`}
                      >
                        {tamanio.nombre}
                      </div>
                      <div className="text-xs text-gray-500">
                        {tamanio.ancho} x {tamanio.alto}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${tamanio.badgeTone}`}
                  >
                    {tamanio.badge}
                  </span>
                </label>
              ))}
            </div>
          </SectionCard>

          {/* Autoimpresión */}
          <SectionCard title="Autoimpresión" icon={Zap} tone="amber">
            <div className="space-y-3">
              <ToggleOption
                label="Autoimpresión en TPV"
                checked={isConfigEnabled(config, 'impresion_auto_tpv')}
                onChange={() => toggleSwitch('impresion_auto_tpv')}
                description="Al confirmar venta en caja se imprime automáticamente"
              />
              <ToggleOption
                label="Autoimpresión pedidos web"
                checked={isConfigEnabled(config, 'impresion_auto_web')}
                onChange={() => toggleSwitch('impresion_auto_web')}
                description="Imprimir automáticamente al entrar pedido web"
              />
            </div>
          </SectionCard>

          {/* Cabecera */}
          <SectionCard title="Cabecera del Documento" icon={ImageIcon} tone="indigo">
            <div className="space-y-2">
              <ToggleOption
                label="Mostrar logo del negocio"
                checked={isConfigEnabled(config, 'impresion_mostrar_logo', true)}
                onChange={() => toggleSwitch('impresion_mostrar_logo')}
              />
              <ToggleOption
                label="Mostrar nombre del negocio"
                checked={isConfigEnabled(config, 'impresion_mostrar_nombre', true)}
                onChange={() => toggleSwitch('impresion_mostrar_nombre')}
              />
              <ToggleOption
                label="Mostrar dirección"
                checked={isConfigEnabled(config, 'impresion_mostrar_direccion', true)}
                onChange={() => toggleSwitch('impresion_mostrar_direccion')}
              />
              <ToggleOption
                label="Mostrar teléfono"
                checked={isConfigEnabled(config, 'impresion_mostrar_telefono', true)}
                onChange={() => toggleSwitch('impresion_mostrar_telefono')}
              />
              {esHoja && (
                <ToggleOption
                  label="Mostrar datos fiscales"
                  checked={isConfigEnabled(config, 'impresion_mostrar_fiscales')}
                  onChange={() => toggleSwitch('impresion_mostrar_fiscales')}
                />
              )}
            </div>
          </SectionCard>

          {/* Información del pedido */}
          <SectionCard title="Información del Pedido" icon={FileText} tone="slate">
            <div className="space-y-2">
              <ToggleOption
                label="Mostrar número de pedido"
                checked={isConfigEnabled(config, 'impresion_mostrar_numero', true)}
                onChange={() => toggleSwitch('impresion_mostrar_numero')}
              />
              <ToggleOption
                label="Mostrar fecha y hora"
                checked={isConfigEnabled(config, 'impresion_mostrar_fecha', true)}
                onChange={() => toggleSwitch('impresion_mostrar_fecha')}
              />
              <ToggleOption
                label="Mostrar tipo de entrega"
                checked={isConfigEnabled(config, 'impresion_mostrar_tipo_entrega', true)}
                onChange={() => toggleSwitch('impresion_mostrar_tipo_entrega')}
              />
              <ToggleOption
                label="Mostrar datos del cliente"
                checked={isConfigEnabled(config, 'impresion_mostrar_cliente', true)}
                onChange={() => toggleSwitch('impresion_mostrar_cliente')}
              />
              <ToggleOption
                label="Mostrar método de pago"
                checked={isConfigEnabled(config, 'impresion_mostrar_metodo_pago')}
                onChange={() => toggleSwitch('impresion_mostrar_metodo_pago')}
              />
            </div>
          </SectionCard>

          {/* Configuración de estilo */}
          <SectionCard title="Tipografía" icon={Type} tone="violet">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tamaño de fuente
                </label>
                <select
                  value={config.impresion_tamano_fuente || 'normal'}
                  onChange={(e) => handleChange('impresion_tamano_fuente', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500"
                >
                  <option value="pequeno">Pequeño (Ahorrar papel)</option>
                  <option value="normal">Normal (Recomendado)</option>
                  <option value="grande">Grande (Accesible)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de letra
                </label>
                <select
                  value={config.impresion_tipo_letra || 'mono'}
                  onChange={(e) => handleChange('impresion_tipo_letra', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500"
                >
                  <option value="mono">Monoespaciada (Ticket)</option>
                  <option value="sans">Arial (Moderno)</option>
                  <option value="serif">Times (Formal)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Margen (mm)</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={config.impresion_margen_mm || 8}
                  onChange={(e) => handleChange('impresion_margen_mm', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escala de fuente
                </label>
                <input
                  type="number"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={config.impresion_escala_fuente || 1}
                  onChange={(e) => handleChange('impresion_escala_fuente', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </SectionCard>

          {/* Productos */}
          <SectionCard title="Detalle de Productos" icon={Receipt} tone="emerald">
            <div className="space-y-2">
              <ToggleOption
                label="Mostrar descripción"
                checked={isConfigEnabled(config, 'impresion_mostrar_descripcion')}
                onChange={() => toggleSwitch('impresion_mostrar_descripcion')}
              />
              <ToggleOption
                label="Mostrar modificadores/extras"
                checked={isConfigEnabled(config, 'impresion_mostrar_modificadores', true)}
                onChange={() => toggleSwitch('impresion_mostrar_modificadores')}
              />
              <ToggleOption
                label="Mostrar precios"
                checked={isConfigEnabled(config, 'impresion_mostrar_precios', true)}
                onChange={() => toggleSwitch('impresion_mostrar_precios')}
              />
              {esHoja && (
                <ToggleOption
                  label="Usar tabla para productos"
                  checked={isConfigEnabled(config, 'impresion_tabla_productos')}
                  onChange={() => toggleSwitch('impresion_tabla_productos')}
                />
              )}
            </div>
          </SectionCard>

          {/* Totales */}
          <SectionCard title="Totales y Pagos" icon={Settings} tone="amber">
            <div className="space-y-2">
              <ToggleOption
                label="Mostrar subtotal"
                checked={isConfigEnabled(config, 'impresion_mostrar_subtotal', true)}
                onChange={() => toggleSwitch('impresion_mostrar_subtotal')}
              />
              <ToggleOption
                label="Mostrar costo de envío"
                checked={isConfigEnabled(config, 'impresion_mostrar_envio')}
                onChange={() => toggleSwitch('impresion_mostrar_envio')}
              />
              <ToggleOption
                label="Mostrar descuentos"
                checked={isConfigEnabled(config, 'impresion_mostrar_descuentos')}
                onChange={() => toggleSwitch('impresion_mostrar_descuentos')}
              />
              <ToggleOption
                label="Sugerir propina"
                checked={isConfigEnabled(config, 'impresion_mostrar_propina')}
                onChange={() => toggleSwitch('impresion_mostrar_propina')}
              />
            </div>
          </SectionCard>

          {/* Footer */}
          <SectionCard title="Pie del Documento" icon={Info} tone="sky">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mensaje de agradecimiento
                </label>
                <textarea
                  value={config.impresion_mensaje_ticket || ''}
                  onChange={(e) => handleChange('impresion_mensaje_ticket', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm"
                  rows={2}
                  placeholder="¡Gracias por elegirnos!"
                />
              </div>
              <ToggleOption
                label="Mostrar código QR"
                checked={isConfigEnabled(config, 'impresion_mostrar_qr')}
                onChange={() => toggleSwitch('impresion_mostrar_qr')}
              />
              <ToggleOption
                label="Mostrar redes sociales"
                checked={isConfigEnabled(config, 'impresion_mostrar_redes')}
                onChange={() => toggleSwitch('impresion_mostrar_redes')}
              />
            </div>
          </SectionCard>

          {/* Copias */}
          <SectionCard title="Copias" icon={Printer} tone="gray">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copias comanda
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={config.impresion_copias_comanda || 1}
                  onChange={(e) => handleChange('impresion_copias_comanda', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copias ticket
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={config.impresion_copias_ticket || 1}
                  onChange={(e) => handleChange('impresion_copias_ticket', e.target.value)}
                  className="w-full rounded-xl border-gray-300 border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Vista Previa */}
        <div className="lg:sticky lg:top-6 h-fit">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Eye size={20} className="text-primary-600" />
                  Vista Previa
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {tamanioActual.nombre} ({tamanioActual.ancho} x {tamanioActual.alto})
                </p>
              </div>
              <button
                onClick={probarImpresion}
                disabled={printingTest}
                className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4A74EF]"
              >
                <Printer size={16} />
                Imprimir
              </button>
            </div>

            <div
              className="flex justify-center bg-gray-100 p-4 rounded-xl overflow-auto"
              style={{ maxHeight: '70vh' }}
            >
              <div
                style={{
                  width:
                    tamanioActual.tipo === 'rollo'
                      ? tamanioActual.pxAncho
                      : tamanioActual.pxAncho * escalaPreview,
                  minHeight:
                    tamanioActual.tipo === 'rollo' ? '400px' : tamanioActual.pxAlto * escalaPreview,
                  backgroundColor: 'white',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  transform: `scale(${escalaPreview})`,
                  transformOrigin: 'top center',
                  marginBottom:
                    tamanioActual.tipo === 'hoja'
                      ? `-${tamanioActual.pxAlto * (1 - escalaPreview)}px`
                      : '0',
                  overflow: 'hidden',
                }}
              >
                {renderTicketContent()}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 bg-primary-50 p-3 rounded-lg">
              <Ruler size={14} className="text-primary-600" />
              <span>
                Vista escalada al <strong>{Math.round(escalaPreview * 100)}%</strong>. Tamaño real:{' '}
                {tamanioActual.ancho} x {tamanioActual.alto}.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componentes auxiliares
function SectionCard({ title, icon: Icon, tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-50 text-gray-600',
    blue: 'bg-primary-100 text-primary-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    emerald: 'bg-success-100 text-success-600',
    amber: 'bg-warning-100 text-warning-600',
    violet: 'bg-violet-100 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
    sky: 'bg-sky-100 text-sky-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </div>
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ToggleOption({ label, checked, onChange, description }) {
  return (
    <label className="flex items-start justify-between cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-3 flex-shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}
