import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Home,
  List,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Settings2,
  Users,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const NAV = [
  ['inicio', 'Estado', Home],
  ['nueva', 'Nueva campaña', Send],
  ['campanas', 'Campañas', List],
  ['audiencias', 'A quién le mando', Users],
  ['ritmo', 'Ritmo y seguridad', Settings2],
  ['automatico', 'Mandar solo', RefreshCw],
  ['respuestas', 'Respuestas', MessageCircle],
  ['resultados', 'Resultados', BarChart3],
  ['bajas', 'Bajas y bloqueados', XCircle],
  ['alertas', 'Avisos', Bell],
];
const TITULOS = {
  inicio: ['Estado', 'Qué está pasando ahora mismo'],
  nueva: ['Nueva campaña', 'Prepará, revisá y confirmá'],
  campanas: ['Campañas', 'Todo lo enviado desde este número'],
  audiencias: ['A quién le mando', 'Chats reales de WhatsApp'],
  ritmo: ['Ritmo y seguridad', 'Los frenos que cuidan tu número'],
  automatico: ['Mandar solo', 'Automatizaciones del número'],
  respuestas: ['Respuestas', 'Lo que contestó la gente'],
  resultados: ['Resultados', 'Datos reales de las campañas'],
  bajas: ['Bajas y bloqueados', 'No vuelven a entrar a una campaña'],
  alertas: ['Avisos', 'Lo que el sistema necesita contarte'],
};
const numero = (valor) => new Intl.NumberFormat('es-AR').format(Number(valor || 0));

function useEstilosDeClaude() {
  useEffect(() => {
    let style;
    let vivo = true;
    fetch('/whatsapp-masivo.html')
      .then((r) => r.text())
      .then((html) => {
        const css = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
        if (!vivo || !css) return;
        style = document.createElement('style');
        style.dataset.whatsappMasivoReact = 'true';
        style.textContent = `${css}
        [data-react-whatsapp-masivo] .kpi { min-height: 132px; position: relative; }
        [data-react-whatsapp-masivo] .kpi .baldosa { float: right; }
        [data-react-whatsapp-masivo] .bloque-barra { margin-top: 15px; }
        [data-react-whatsapp-masivo] .texto-suave { color: var(--tinta-media); line-height: 1.55; }
        [data-react-whatsapp-masivo] .fila-dato, [data-react-whatsapp-masivo] .fila-contacto { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:13px 0; border-bottom:1px solid var(--linea); }
        [data-react-whatsapp-masivo] .fila-dato small, [data-react-whatsapp-masivo] .fila-contacto small { display:block; color:var(--tinta-suave); margin-top:3px; }
        [data-react-whatsapp-masivo] .fila-dato > span { color:var(--tinta-media); font-weight:650; text-align:right; }
        [data-react-whatsapp-masivo] .fila-contacto label { display:flex; align-items:center; gap:11px; cursor:pointer; }
        [data-react-whatsapp-masivo] .estado-verde { color:var(--verde); font-weight:700; } [data-react-whatsapp-masivo] .estado-rojo { color:var(--marca); font-weight:700; }
        [data-react-whatsapp-masivo] .encabezado-lista { display:flex; align-items:start; justify-content:space-between; gap:14px; margin-bottom:12px; }
        [data-react-whatsapp-masivo] .qr-real { display:block; width:190px; height:190px; object-fit:contain; margin:14px auto 0; padding:8px; border-radius:14px; background:#fff; }
        [data-react-whatsapp-masivo] .perilla { display:block; margin:14px 0; color:var(--tinta-media); } [data-react-whatsapp-masivo] .perilla .campo { width:100%; margin-top:7px; }
        [data-react-whatsapp-masivo] .vacio { padding:18px 0; }
        @media (max-width: 760px) { [data-react-whatsapp-masivo].marco { grid-template-columns:1fr; } [data-react-whatsapp-masivo] .rail { display:none; } }
      `;
        document.head.appendChild(style);
      });
    return () => {
      vivo = false;
      style?.remove();
    };
  }, []);
}

export default function WhatsAppMasivo() {
  useEstilosDeClaude();
  const [vista, setVista] = useState('inicio');
  const [paso, setPaso] = useState(1);
  const [estado, setEstado] = useState({});
  const [contactos, setContactos] = useState([]);
  const [campanas, setCampanas] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [bajas, setBajas] = useState([]);
  const [config, setConfig] = useState({});
  const [seleccion, setSeleccion] = useState([]);
  const [form, setForm] = useState({ nombre: '', mensaje: '', simulacro: true, segmento: 'todos' });
  const [preview, setPreview] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => {
    try {
      const [e, c, ca, r, b, cf] = await Promise.all([
        api.get('/whatsapp/estado'),
        api.get('/whatsapp/contactos?limite=200'),
        api.get('/whatsapp/campanas?limite=30'),
        api.get('/whatsapp/respuestas?limite=50'),
        api.get('/whatsapp/excluidos'),
        api.get('/whatsapp/config'),
      ]);
      setEstado(e || {});
      setContactos(c?.items || []);
      setCampanas(ca || []);
      setRespuestas(r || []);
      setBajas(b || []);
      setConfig(cf || {});
    } catch (error) {
      toast.error(error?.error || 'No se pudieron actualizar los datos de WhatsApp');
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const whatsapp = estado.whatsapp || {};
  const conectado = whatsapp.estado === 'conectado';
  const enviados = campanas.reduce((t, c) => t + Number(c.enviados || 0), 0);
  const fallidos = campanas.reduce((t, c) => t + Number(c.fallidos || 0), 0);
  const habilitados = contactos.filter((c) => !c.excluido);
  const cantidadDestino = seleccion.length || habilitados.length;
  const avisos = useMemo(
    () =>
      [
        !conectado && {
          titulo: 'Falta vincular WhatsApp',
          detalle: 'Generá el QR y escanealo desde el teléfono del local.',
        },
        estado?.gateway?.pausaTotal && {
          titulo: 'El gateway está pausado',
          detalle: 'No se enviará nada hasta reactivarlo en Configuración.',
        },
        !contactos.length && {
          titulo: 'Todavía no hay contactos',
          detalle: 'Importá el clientes.json del número para armar la agenda.',
        },
      ].filter(Boolean),
    [conectado, contactos.length, estado?.gateway?.pausaTotal]
  );
  const abrirVista = (id) => {
    setVista(id);
    if (id === 'nueva') setPaso(1);
  };
  const conectar = async () => {
    setOcupado(true);
    try {
      await api.post('/whatsapp/conectar');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear el QR');
    } finally {
      setOcupado(false);
    }
  };
  const importar = async (archivo) => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const contenido = JSON.parse(await archivo.text());
      const lista = Array.isArray(contenido) ? contenido : contenido?.clientes;
      if (!Array.isArray(lista))
        throw new Error('Elegí el archivo clientes.json del panel de WhatsApp');
      const resultado = await api.post('/whatsapp/contactos/importar', { contactos: lista });
      toast.success(`${resultado.importados} contactos sincronizados`);
      await cargar();
    } catch (error) {
      toast.error(error?.error || error.message || 'No se pudo importar la agenda');
    } finally {
      setOcupado(false);
    }
  };
  const preparar = async () => {
    if (!form.mensaje.trim()) return toast.error('Escribí el mensaje antes de continuar');
    setOcupado(true);
    try {
      setPreview(
        await api.post('/whatsapp/preparar', {
          ...form,
          clientesIds: seleccion.length ? seleccion : null,
        })
      );
      setPaso(3);
    } catch (error) {
      toast.error(error?.error || 'No se pudo preparar la campaña');
    } finally {
      setOcupado(false);
    }
  };
  const enviar = async () => {
    if (
      !preview?.campanaId ||
      !window.confirm(
        `¿Confirmás ${preview.simulacro ? 'el simulacro' : 'el envío'} a ${preview.total} contactos?`
      )
    )
      return;
    setOcupado(true);
    try {
      await api.post('/whatsapp/enviar', { campanaId: preview.campanaId });
      toast.success('Campaña iniciada');
      setPreview(null);
      abrirVista('inicio');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo iniciar la campaña');
    } finally {
      setOcupado(false);
    }
  };
  const guardarConfig = async (clave, valor) => {
    try {
      const resultado = await api.put('/whatsapp/config', { [clave]: valor });
      setConfig(resultado.config || {});
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    }
  };
  const alternarContacto = (id, activo) =>
    setSeleccion((actual) =>
      activo ? [...new Set([...actual, id])] : actual.filter((actualId) => actualId !== id)
    );
  return (
    <div className="marco" data-react-whatsapp-masivo>
      <nav className="rail">
        <div className="logo">
          <MessageCircle size={22} fill="currentColor" />
        </div>
        {NAV.slice(0, 9).map(([id, label, Icon]) => (
          <button
            key={id}
            className={`icono-rail ${vista === id ? 'activo' : ''}`}
            onClick={() => abrirVista(id)}
          >
            <Icon size={20} />
            {id === 'respuestas' && respuestas.length > 0 && (
              <span className="globo-rail">{Math.min(respuestas.length, 99)}</span>
            )}
            <span className="nombre">{label}</span>
          </button>
        ))}
        <div className="abajo" />
        {NAV.slice(9).map(([id, label, Icon]) => (
          <button
            key={id}
            className={`icono-rail ${vista === id ? 'activo' : ''}`}
            onClick={() => abrirVista(id)}
          >
            <Icon size={20} />
            {avisos.length > 0 && <span className="globo-rail">{avisos.length}</span>}
            <span className="nombre">{label}</span>
          </button>
        ))}
      </nav>
      <main className="contenido">
        <header className="barra">
          <div style={{ flex: 1 }}>
            <h1>{TITULOS[vista][0]}</h1>
            <div className="sub">{TITULOS[vista][1]}</div>
          </div>
          <div className="estado-linea">
            <span className="latido" />
            {conectado
              ? `Conectado${whatsapp.numero ? ` · ${whatsapp.numero}` : ''}`
              : 'Sin conexión'}
          </div>
          <button className="boton-principal" onClick={() => abrirVista('nueva')}>
            <Send size={17} />
            Nueva campaña
          </button>
        </header>
        <div className="cuerpo">
          {vista === 'inicio' && (
            <Inicio
              estado={estado}
              enviados={enviados}
              respuestas={respuestas}
              campanas={campanas}
              avisos={avisos}
              conectar={conectar}
              ocupado={ocupado}
              conectado={conectado}
              whatsapp={whatsapp}
            />
          )}{' '}
          {vista === 'nueva' && (
            <Nueva
              paso={paso}
              setPaso={setPaso}
              form={form}
              setForm={setForm}
              cantidadDestino={cantidadDestino}
              seleccion={seleccion}
              preparar={preparar}
              ocupado={ocupado}
              preview={preview}
              enviar={enviar}
              irContactos={() => abrirVista('audiencias')}
            />
          )}{' '}
          {vista === 'campanas' && <Campanas campanas={campanas} />}{' '}
          {vista === 'audiencias' && (
            <Audiencias
              contactos={contactos}
              seleccion={seleccion}
              alternarContacto={alternarContacto}
              importar={importar}
              ocupado={ocupado}
            />
          )}{' '}
          {vista === 'ritmo' && <Ritmo config={config} guardar={guardarConfig} />}{' '}
          {vista === 'automatico' && <Automatico />}{' '}
          {vista === 'respuestas' && <Respuestas respuestas={respuestas} />}{' '}
          {vista === 'resultados' && (
            <Resultados
              campanas={campanas}
              enviados={enviados}
              fallidos={fallidos}
              respuestas={respuestas}
            />
          )}{' '}
          {vista === 'bajas' && <Bajas bajas={bajas} />}{' '}
          {vista === 'alertas' && <Alertas avisos={avisos} />}
        </div>
      </main>
    </div>
  );
}

function Inicio({
  estado,
  enviados,
  respuestas,
  campanas,
  avisos,
  conectar,
  ocupado,
  conectado,
  whatsapp,
}) {
  const cupo = Number(estado?.hoy?.cupoTotal || 0);
  const usados = Number(estado?.hoy?.enviados || 0);
  const ventana = Number(estado?.hoy?.cupoUsado || 0);
  const pendientes = Number(estado?.pendientes || 0);
  const kpis = [
    ['Enviados', enviados, '📤', '#25d366', '#0f8a6a'],
    ['Respuestas', respuestas.length, '💬', '#a855f7', '#7c3aed'],
    ['En cola', pendientes, '🛵', '#34d399', '#059669'],
    ['Avisos', avisos.length, '🔔', '#ff5a5f', '#dc1f2d'],
  ];
  return (
    <section className="vista activa">
      <div className="rejilla cuatro" style={{ marginBottom: 16 }}>
        {kpis.map(([texto, valor, icono, d1, d2]) => (
          <div
            className="kpi tarjeta cinta"
            style={{ '--cinta': `linear-gradient(90deg,${d1},${d2})` }}
            key={texto}
          >
            <span className="baldosa">{icono}</span>
            <div className="numero-grande degradado num" style={{ '--d1': d1, '--d2': d2 }}>
              {numero(valor)}
            </div>
            <div className="etiqueta-chica">{texto}</div>
          </div>
        ))}
      </div>
      <div className="rejilla dos" style={{ marginBottom: 16 }}>
        <div
          className="tarjeta cinta"
          style={{ '--cinta': 'linear-gradient(90deg,#25d366,#0fb98b)' }}
        >
          <p className="titulo-tarjeta">
            <span className="baldosa">📊</span>Cupo de hoy
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div className="aro" style={{ '--a1': '#25d366', '--a2': '#0fb98b' }}>
              <div className="centro">
                <div
                  className="numero-grande num degradado"
                  style={{ '--d1': '#25d366', '--d2': '#0f8a6a' }}
                >
                  {numero(usados)}
                </div>
                <div className="etiqueta-chica">de {numero(cupo)} hoy</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 230 }}>
              <Barra etiqueta="En esta hora" actual={ventana} total={cupo} color="#25d366" />
              <Barra
                etiqueta="Le quedan por salir"
                actual={pendientes}
                total={Math.max(pendientes, 1)}
                color="#98a1b2"
              />
              <Barra
                etiqueta="Contestaron"
                actual={respuestas.length}
                total={Math.max(usados, 1)}
                color="#7c3aed"
              />
            </div>
          </div>
        </div>
        <div
          className="tarjeta cinta"
          style={{ '--cinta': 'linear-gradient(90deg,#ff5a5f,#dc1f2d)' }}
        >
          <p className="titulo-tarjeta">
            <span className="baldosa">🔔</span>Avisos
          </p>
          {avisos.length ? (
            avisos.map((a) => (
              <div className="alerta" key={a.titulo}>
                <b>{a.titulo}</b>
                <br />
                <span>{a.detalle}</span>
              </div>
            ))
          ) : (
            <div className="alerta verde">
              <b>Todo en orden</b>
              <br />
              <span>No hay nada urgente para revisar.</span>
            </div>
          )}
          {!conectado && (
            <button className="boton-verde" disabled={ocupado} onClick={conectar}>
              <QrCode size={16} />
              Generar QR
            </button>
          )}
          {whatsapp.qrImagen && !conectado && (
            <img className="qr-real" src={whatsapp.qrImagen} alt="Código QR de WhatsApp" />
          )}
        </div>
      </div>
      <div className="rejilla dos">
        <div className="tarjeta">
          <p className="titulo-tarjeta">
            <span>
              <span className="latido" /> Saliendo ahora
            </span>
          </p>
          {campanas.length ? (
            campanas
              .slice(0, 5)
              .map((campana) => (
                <Fila
                  key={campana.id}
                  principal={campana.nombre || `Campaña #${campana.id}`}
                  detalle={campana.estado}
                  derecha={`${campana.enviados}/${campana.total}`}
                />
              ))
          ) : (
            <Vacio>Cuando haya una campaña, el avance se muestra acá.</Vacio>
          )}
        </div>
        <div
          className="tarjeta cinta"
          style={{ '--cinta': 'linear-gradient(90deg,#a855f7,#7c3aed)' }}
        >
          <p className="titulo-tarjeta">💚 Cómo viene el número</p>
          <div className="termometro">
            <i className="on" />
            <i className="on" />
            <i className="on" />
            <i className="on" />
            <i />
          </div>
          <b style={{ color: 'var(--verde)', fontSize: 15 }}>Sano</b>
          <p className="texto-suave">
            Las respuestas y bajas se muestran con datos reales. El límite por turno protege de
            mensajes repetidos.
          </p>
        </div>
      </div>
    </section>
  );
}
function Nueva({
  paso,
  setPaso,
  form,
  setForm,
  cantidadDestino,
  seleccion,
  preparar,
  ocupado,
  preview,
  enviar,
  irContactos,
}) {
  return (
    <section className="vista activa">
      <div className="pasos">
        {['A quién', 'Mensaje', 'Revisión'].map((texto, indice) => (
          <button
            key={texto}
            className={paso === indice + 1 ? 'activo' : ''}
            onClick={() => setPaso(indice + 1)}
          >
            {indice + 1}. {texto}
          </button>
        ))}
      </div>
      {paso === 1 && (
        <div className="rejilla dos">
          <div>
            <p className="texto-suave">
              Elegí los chats desde la agenda o dejá la selección vacía para usar todos los
              habilitados.
            </p>
            <button className="boton-suave" onClick={irContactos}>
              Elegir contactos
            </button>
          </div>
          <div
            className="tarjeta cinta"
            style={{ '--cinta': 'linear-gradient(90deg,#25d366,#0fb98b)' }}
          >
            <p className="titulo-tarjeta">Le va a llegar a</p>
            <div
              className="numero-grande degradado num"
              style={{ '--d1': '#25d366', '--d2': '#0f8a6a', fontSize: 42 }}
            >
              {numero(cantidadDestino)}
            </div>
            <div className="etiqueta-chica">
              personas {seleccion.length ? 'seleccionadas' : 'habilitadas'}
            </div>
            <button className="boton-principal" onClick={() => setPaso(2)}>
              Continuar
            </button>
          </div>
        </div>
      )}
      {paso === 2 && (
        <div className="rejilla dos">
          <div>
            <div className="caja-texto">
              <input
                className="campo"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre interno de la campaña"
              />
              <textarea
                value={form.mensaje}
                onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
                placeholder="Escribí el mensaje. Podés usar {NOMBRE}."
              />
              <div className="herramientas">
                <label>
                  <input
                    type="checkbox"
                    checked={form.simulacro}
                    onChange={(e) => setForm({ ...form, simulacro: e.target.checked })}
                  />{' '}
                  Simulacro antes del envío
                </label>
              </div>
            </div>
            <button className="boton-principal" disabled={ocupado} onClick={preparar}>
              Preparar y revisar
            </button>
          </div>
          <div>
            <p className="texto-suave">Cómo le llega a un cliente</p>
            <div className="telefono">
              <div className="cabeza">
                <MessageCircle size={20} />
                <div>
                  <b>Modo Sabor</b>
                  <div>en línea</div>
                </div>
              </div>
              <div className="chats">
                <div className="burbuja">
                  {form.mensaje || 'Tu mensaje aparece acá antes de enviarlo.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {paso === 3 && (
        <div className="rejilla dos">
          <div className="tarjeta">
            <p className="titulo-tarjeta">Antes de mandar, repasemos</p>
            {preview ? (
              <>
                <Fila principal="Destinatarios" derecha={preview.total} />
                <Fila principal="Turno" derecha={preview.turnoClave} />
                <Fila principal="Modo" derecha={preview.simulacro ? 'Simulacro' : 'Envío real'} />
                <button className="boton-principal" disabled={ocupado} onClick={enviar}>
                  Arrancar la campaña
                </button>
              </>
            ) : (
              <Vacio>Volvé al mensaje y elegí “Preparar y revisar”.</Vacio>
            )}
          </div>
          <div
            className="tarjeta cinta"
            style={{ '--cinta': 'linear-gradient(90deg,#25d366,#0fb98b)' }}
          >
            <p className="titulo-tarjeta">Riesgo de esta campaña</p>
            <div className="termometro">
              <i className="on" />
              <i className="on" />
              <i />
              <i />
              <i />
            </div>
            <b style={{ color: 'var(--verde)' }}>Bajo</b>
            <p className="texto-suave">
              La confirmación es obligatoria y el motor impide repetir un contacto en el mismo
              turno.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
function Campanas({ campanas }) {
  return (
    <section className="vista activa">
      <div className="tarjeta">
        {campanas.length ? (
          campanas.map((c) => (
            <Fila
              key={c.id}
              principal={c.nombre || `Campaña #${c.id}`}
              detalle={`${c.estado}${Number(c.simulacro) ? ' · simulacro' : ''}`}
              derecha={`${c.enviados}/${c.total} · ${c.fallidos || 0} fallidos`}
            />
          ))
        ) : (
          <Vacio>No hay campañas todavía.</Vacio>
        )}
      </div>
    </section>
  );
}
function Audiencias({ contactos, seleccion, alternarContacto, importar, ocupado }) {
  return (
    <section className="vista activa">
      <div className="tarjeta">
        <div className="encabezado-lista">
          <div>
            <p className="titulo-tarjeta">Agenda de chats de WhatsApp</p>
            <p className="texto-suave">
              No son clientes del TPV: son los chats del número conectado.
            </p>
          </div>
          <label className="boton-principal">
            Importar clientes.json
            <input
              hidden
              type="file"
              accept="application/json"
              disabled={ocupado}
              onChange={(e) => importar(e.target.files?.[0])}
            />
          </label>
        </div>
        {contactos.length ? (
          contactos.map((c) => (
            <div className="fila-contacto" key={c.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={c.excluido}
                  checked={seleccion.includes(c.id)}
                  onChange={(e) => alternarContacto(c.id, e.target.checked)}
                />
                <span>
                  <b>{c.nombre || 'Sin nombre'}</b>
                  <small>{c.telefonoLegible || c.telefono}</small>
                </span>
              </label>
              <span className={c.excluido ? 'estado-rojo' : 'estado-verde'}>
                {c.excluido ? 'Excluido' : 'Habilitado'}
              </span>
            </div>
          ))
        ) : (
          <Vacio>Importá el clientes.json del número para crear esta agenda.</Vacio>
        )}
      </div>
    </section>
  );
}
function Ritmo({ config, guardar }) {
  const Campo = ({ texto, clave, minimo = 1 }) => (
    <label className="perilla">
      <span>{texto}</span>
      <input
        className="campo"
        min={minimo}
        type="number"
        value={config[clave] ?? ''}
        onChange={(e) => guardar(clave, Number(e.target.value))}
      />
    </label>
  );
  return (
    <section className="vista activa">
      <div
        className="tarjeta cinta"
        style={{ '--cinta': 'linear-gradient(90deg,#fbbf24,#d97706)', marginBottom: 18 }}
      >
        <b>Todo esto ya está funcionando hoy.</b>
        <p className="texto-suave">
          El ritmo se guarda en la base. Cambiarlo afecta los próximos envíos.
        </p>
      </div>
      <div className="rejilla dos">
        <div className="tarjeta">
          <p className="titulo-tarjeta">Frenos del envío</p>
          <Campo texto="Máximo por ventana" clave="maxPorVentana" />
          <Campo texto="Ventana en minutos" clave="ventanaMinutos" />
          <Campo texto="Pausa mínima (segundos)" clave="pausaMinSegundos" />
        </div>
        <div
          className="tarjeta cinta"
          style={{ '--cinta': 'linear-gradient(90deg,#25d366,#0fb98b)' }}
        >
          <p className="titulo-tarjeta">Con estos valores</p>
          <div className="termometro">
            <i className="on" />
            <i className="on" />
            <i className="on" />
            <i />
            <i />
          </div>
          <b style={{ color: 'var(--verde)' }}>Prudente</b>
          <p className="texto-suave">
            Además del cupo, el sistema descarta contactos que ya recibieron una campaña en el turno
            actual.
          </p>
        </div>
      </div>
    </section>
  );
}
function Automatico() {
  return (
    <section className="vista activa">
      <div className="tarjeta">
        <p className="titulo-tarjeta">Campañas automáticas</p>
        <Vacio>
          Esta función todavía no está habilitada: no se muestran interruptores falsos ni se envía
          nada automáticamente.
        </Vacio>
      </div>
    </section>
  );
}
function Respuestas({ respuestas }) {
  return (
    <section className="vista activa">
      <div className="tarjeta">
        {respuestas.length ? (
          respuestas.map((r) => (
            <Fila
              key={r.id}
              principal={r.telefonoLegible || r.telefono}
              detalle={r.texto || 'Sin texto'}
              derecha={Number(r.es_baja) ? 'Pidió baja' : ''}
            />
          ))
        ) : (
          <Vacio>Todavía no entraron respuestas.</Vacio>
        )}
      </div>
    </section>
  );
}
function Resultados({ campanas, enviados, fallidos, respuestas }) {
  return (
    <section className="vista activa">
      <div className="rejilla cuatro">
        <Resultado titulo="Campañas" valor={campanas.length} color="#25d366" />
        <Resultado titulo="Enviados" valor={enviados} color="#0f8a6a" />
        <Resultado titulo="Respuestas" valor={respuestas.length} color="#7c3aed" />
        <Resultado titulo="Fallidos" valor={fallidos} color="#dc1f2d" />
      </div>
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <p className="titulo-tarjeta">Cuál funcionó mejor</p>
        {campanas.length ? (
          campanas
            .slice(0, 5)
            .map((c) => (
              <Fila
                key={c.id}
                principal={c.nombre || `Campaña #${c.id}`}
                derecha={`${c.respuestas || 0} respuestas`}
              />
            ))
        ) : (
          <Vacio>Los resultados aparecen cuando existan campañas.</Vacio>
        )}
      </div>
    </section>
  );
}
function Bajas({ bajas }) {
  return (
    <section className="vista activa">
      <div className="rejilla dos">
        <div className="tarjeta">
          <p className="titulo-tarjeta">Los que no quieren recibir más</p>
          {bajas.length ? (
            bajas.map((b) => (
              <Fila
                key={b.telefono}
                principal={b.telefonoLegible || b.telefono}
                detalle={b.motivo || 'Baja solicitada'}
                derecha="Excluido"
              />
            ))
          ) : (
            <Vacio>No hay bajas registradas.</Vacio>
          )}
        </div>
        <div
          className="tarjeta cinta"
          style={{ '--cinta': 'linear-gradient(90deg,#ff5a5f,#dc1f2d)' }}
        >
          <p className="titulo-tarjeta">Qué palabras dan de baja</p>
          <p className="texto-suave">
            El motor analiza la respuesta y registra automáticamente las bajas. Un contacto excluido
            no vuelve a entrar a una campaña.
          </p>
        </div>
      </div>
    </section>
  );
}
function Alertas({ avisos }) {
  return (
    <section className="vista activa">
      <div className="tarjeta">
        <p className="titulo-tarjeta">Todo lo que el sistema sabe y hay que contarte</p>
        {avisos.length ? (
          avisos.map((a) => (
            <div className="alerta" key={a.titulo}>
              <b>{a.titulo}</b>
              <p>{a.detalle}</p>
            </div>
          ))
        ) : (
          <Vacio>No hay avisos activos.</Vacio>
        )}
      </div>
    </section>
  );
}
function Barra({ etiqueta, actual, total, color }) {
  const ancho = Math.min(
    100,
    Math.round((Number(actual || 0) / Math.max(Number(total || 0), 1)) * 100)
  );
  return (
    <div className="bloque-barra">
      <div className="fila-barra">
        <span>{etiqueta}</span>
        <b className="num">
          {numero(actual)} <small>/ {numero(total)}</small>
        </b>
      </div>
      <div className="barra-progreso">
        <span style={{ width: `${ancho}%`, '--b1': color, '--b2': color }} />
      </div>
    </div>
  );
}
function Fila({ principal, detalle, derecha }) {
  return (
    <div className="fila-dato">
      <div>
        <b>{principal}</b>
        {detalle && <small>{detalle}</small>}
      </div>
      <span>{derecha}</span>
    </div>
  );
}
function Resultado({ titulo, valor, color }) {
  return (
    <div
      className="kpi tarjeta cinta"
      style={{ '--cinta': `linear-gradient(90deg,${color},${color})` }}
    >
      <div className="numero-grande degradado num" style={{ '--d1': color, '--d2': color }}>
        {numero(valor)}
      </div>
      <div className="etiqueta-chica">{titulo}</div>
    </div>
  );
}
function Vacio({ children }) {
  return <p className="texto-suave vacio">{children}</p>;
}
