import { useRef } from 'react';
import { shadeColor } from '../lib/colorUtils.js';

/**
 * TarjetaFidelidadFisica
 * Componente para imprimir una tarjeta de fidelización tipo tarjeta de crédito.
 * Dimensiones: 86mm x 54mm (ISO 7810 ID-1)
 */

const TarjetaFidelidadFisica = ({
  cliente = {},
  config = {},
  colorPrimario = '#FF6B00',
  clubUrl = '',
  sellosParaPremio = 8,
}) => {
  const printRef = useRef(null);

  const {
    nombre = '',
    telefono = '',
    codigo_tarjeta = '',
    nivel = 'Bronce',
    puntos = 0,
    sellos_actuales = 0,
  } = cliente;

  const { negocio_nombre = 'Modo Sabor', negocio_logo = null } = config;

  // Version corta del link para imprimir (sin protocolo). Si el cliente
  // pierde el celular puede tipearlo a mano en el navegador.
  const linkCorto = String(clubUrl || '')
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '');

  // Cantidad de sellos que muestra el frente. Se recibe por prop desde el
  // padre (viene del config real del negocio) para que siempre coincida
  // con lo que ve el cliente en la tarjeta virtual.
  const totalSellos = Math.max(1, Number(sellosParaPremio) || 8);
  const columnasSellos = Math.min(5, Math.max(3, Math.ceil(totalSellos / 2)));

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permite las ventanas emergentes para imprimir.');
      return;
    }

    const cardHTML = printRef.current.outerHTML;
    const styles = `
      <style>
        @page {
          size: 86mm 54mm;
          margin: 0;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          width: 86mm;
          height: 54mm;
          margin: 0;
          padding: 0;
          background: #fff;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .tarjeta-fisica {
          width: 86mm !important;
          height: 54mm !important;
          border-radius: 3.18mm !important;
          overflow: hidden !important;
          position: relative !important;
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
          box-shadow: none !important;
          page-break-after: avoid;
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Tarjeta de Fidelización - ${negocio_nombre}</title>
          ${styles}
        </head>
        <body>
          ${cardHTML}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ─── Estilos inline ───

  const cardStyle = {
    width: '86mm',
    height: '54mm',
    borderRadius: '3.18mm',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    color: '#fff',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    background: `linear-gradient(135deg, ${shadeColor(colorPrimario, 12)} 0%, ${colorPrimario} 40%, ${shadeColor(colorPrimario, -18)} 70%, ${shadeColor(colorPrimario, -38)} 100%)`,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  const overlayStyle = {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(ellipse at 30% 20%, rgba(255,200,100,0.25) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(200,50,50,0.3) 0%, transparent 60%)',
    pointerEvents: 'none',
    zIndex: 1,
  };

  const patternStyle = {
    position: 'absolute',
    inset: 0,
    opacity: 0.06,
    backgroundImage: `
      repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px),
      repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.1) 8px, rgba(255,255,255,0.1) 16px)
    `,
    pointerEvents: 'none',
    zIndex: 1,
  };

  const chipStyle = {
    position: 'absolute',
    top: '8mm',
    left: '5mm',
    width: '10mm',
    height: '7.5mm',
    borderRadius: '1.5mm',
    background: 'linear-gradient(135deg, #D4AF37 0%, #F4D03F 30%, #B8860B 60%, #DAA520 100%)',
    border: '0.5px solid rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  };

  const chipLineStyle = {
    width: '100%',
    height: '1px',
    background: 'rgba(0,0,0,0.2)',
    position: 'absolute',
  };

  const chipLineVStyle = {
    width: '1px',
    height: '100%',
    background: 'rgba(0,0,0,0.15)',
    position: 'absolute',
  };

  const headerStyle = {
    position: 'absolute',
    top: '3.5mm',
    left: 0,
    right: 0,
    textAlign: 'center',
    zIndex: 3,
  };

  const titleStyle = {
    fontSize: '7.5pt',
    fontWeight: 800,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
    marginBottom: '0.8mm',
  };

  const subtitleStyle = {
    fontSize: '5pt',
    fontWeight: 600,
    letterSpacing: '0.6px',
    color: 'rgba(255,255,255,0.92)',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  };

  const logoAreaStyle = {
    position: 'absolute',
    top: '7mm',
    right: '4mm',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    gap: '1.5mm',
  };

  const logoCircleStyle = {
    width: '7mm',
    height: '7mm',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8pt',
    fontWeight: 700,
    color: '#fff',
  };

  const logoTextStyle = {
    fontSize: '7pt',
    fontWeight: 700,
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    letterSpacing: '0.5px',
  };

  const stampsAreaStyle = {
    position: 'absolute',
    top: '17mm',
    left: '5mm',
    right: '5mm',
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2.5mm',
  };

  const stampsRowStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '4.5mm',
  };

  const stampStyle = (filled) => ({
    width: '8.5mm',
    height: '8.5mm',
    borderRadius: '50%',
    border: filled ? '2px solid rgba(255,255,255,0.85)' : '2px dashed rgba(255,255,255,0.55)',
    background: filled
      ? 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 100%)'
      : 'rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10pt',
    fontWeight: 700,
    color: '#fff',
    textShadow: filled ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
    transition: 'all 0.3s ease',
  });

  const stampNumberStyle = {
    fontSize: '5.5pt',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    position: 'absolute',
    bottom: '-2.2mm',
    left: '50%',
    transform: 'translateX(-50%)',
  };

  const dataAreaStyle = {
    position: 'absolute',
    bottom: '4.5mm',
    left: '5mm',
    right: '5mm',
    zIndex: 3,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  };

  const dataLeftStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2mm',
  };

  const dataRowStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3mm',
  };

  const dataLabelStyle = {
    fontSize: '4.5pt',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  };

  const dataValueStyle = {
    fontSize: '6pt',
    fontWeight: 600,
    color: '#fff',
    letterSpacing: '0.3px',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  };

  const dataRightStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1.5mm',
  };

  const nivelBadgeStyle = {
    padding: '1mm 2.5mm',
    borderRadius: '2mm',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.35)',
    fontSize: '5.5pt',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  };

  const puntosStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.3mm',
  };

  const puntosValueStyle = {
    fontSize: '11pt',
    fontWeight: 800,
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
    lineHeight: 1,
  };

  const puntosLabelStyle = {
    fontSize: '4.5pt',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  };

  const magStripeStyle = {
    position: 'absolute',
    bottom: '0',
    left: 0,
    right: 0,
    height: '5.5mm',
    background: 'linear-gradient(180deg, #1a1a1a 0%, #000 50%, #1a1a1a 100%)',
    zIndex: 2,
  };

  const holoStyle = {
    position: 'absolute',
    bottom: '7mm',
    right: '4mm',
    width: '6mm',
    height: '4.5mm',
    borderRadius: '1mm',
    background:
      'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(200,200,200,0.1) 50%, rgba(255,255,255,0.2) 100%)',
    border: '0.5px solid rgba(255,255,255,0.3)',
    zIndex: 3,
  };

  const printBtnStyle = {
    marginTop: '16px',
    padding: '10px 24px',
    borderRadius: '8px',
    border: 'none',
    background: `linear-gradient(135deg, ${colorPrimario}, ${shadeColor(colorPrimario, -25)})`,
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: `0 2px 8px ${colorPrimario}59`,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  };

  const wrapperStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px',
    background: '#f5f5f5',
    minHeight: '100vh',
  };

  const previewLabelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  };

  // ─── Render ───

  return (
    <div style={wrapperStyle}>
      <div style={previewLabelStyle}>Vista previa de impresión</div>

      {/* Tarjeta (se imprime exactamente este bloque) */}
      <div ref={printRef} className="tarjeta-fisica" style={cardStyle}>
        {/* Fondo decorativo */}
        <div style={overlayStyle} />
        <div style={patternStyle} />

        {/* Chip estilo tarjeta de crédito */}
        <div style={chipStyle}>
          <div style={{ ...chipLineStyle, top: '25%' }} />
          <div style={{ ...chipLineStyle, top: '50%' }} />
          <div style={{ ...chipLineStyle, top: '75%' }} />
          <div style={{ ...chipLineVStyle, left: '33%' }} />
          <div style={{ ...chipLineVStyle, left: '66%' }} />
        </div>

        {/* Logo / Nombre del negocio */}
        <div style={logoAreaStyle}>
          {negocio_logo ? (
            <img
              src={negocio_logo}
              alt={negocio_nombre}
              style={{ height: '7mm', width: 'auto', objectFit: 'contain' }}
            />
          ) : (
            <>
              <div style={logoCircleStyle}>{negocio_nombre?.[0]?.toUpperCase() || 'M'}</div>
              <span style={logoTextStyle}>{negocio_nombre}</span>
            </>
          )}
        </div>

        {/* Encabezado */}
        <div style={headerStyle}>
          <div style={titleStyle}>Tarjeta de Fidelización</div>
          <div style={subtitleStyle}>Completá {totalSellos} sellos y desbloqueá tu premio</div>
        </div>

        {/* Sellos */}
        <div style={stampsAreaStyle}>
          <div
            style={{
              ...stampsRowStyle,
              display: 'grid',
              gridTemplateColumns: `repeat(${columnasSellos}, 8.5mm)`,
              gap: '2.5mm 4mm',
            }}
          >
            {Array.from({ length: totalSellos }, (_, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <div style={stampStyle(i < sellos_actuales)}>{i < sellos_actuales ? '✓' : ''}</div>
                <span style={stampNumberStyle}>{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Datos del cliente */}
        <div style={dataAreaStyle}>
          <div style={dataLeftStyle}>
            <div style={dataRowStyle}>
              <span style={dataLabelStyle}>Titular</span>
              <span style={dataValueStyle}>{nombre || '—'}</span>
            </div>
            <div style={dataRowStyle}>
              <span style={dataLabelStyle}>Teléfono</span>
              <span style={dataValueStyle}>{telefono || '—'}</span>
            </div>
            <div style={dataRowStyle}>
              <span style={dataLabelStyle}>Nº Tarjeta</span>
              <span style={dataValueStyle}>{codigo_tarjeta || '—'}</span>
            </div>
            {linkCorto ? (
              <div style={dataRowStyle}>
                <span style={dataLabelStyle}>Ver online</span>
                <span
                  style={{
                    ...dataValueStyle,
                    fontFamily: 'monospace',
                    fontSize: '4.5pt',
                    letterSpacing: 0,
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {linkCorto}
                </span>
              </div>
            ) : null}
          </div>

          <div style={dataRightStyle}>
            <div style={nivelBadgeStyle}>{nivel}</div>
            <div style={puntosStyle}>
              <span style={puntosValueStyle}>{puntos}</span>
              <span style={puntosLabelStyle}>pts</span>
            </div>
          </div>
        </div>

        {/* Banda magnética (estética) */}
        <div style={magStripeStyle} />

        {/* Holograma (estética) */}
        <div style={holoStyle} />
      </div>

      {/* Botón de impresión (no se imprime) */}
      <button
        style={printBtnStyle}
        onClick={handlePrint}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = `0 4px 14px ${colorPrimario}73`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = `0 2px 8px ${colorPrimario}59`;
        }}
      >
        🖨️ Imprimir tarjeta
      </button>
    </div>
  );
};

export default TarjetaFidelidadFisica;
