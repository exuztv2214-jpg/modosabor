import { useEffect, useMemo, useState } from 'react';
import { BellRing, Play, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { BRAND, STROKE } from '../../lib/theme.js';
import {
  buildDeliveredAnnouncementText,
  listSpanishSpeechVoices,
  speakOrderAnnouncement,
} from '../../lib/orderAlerts.js';

import {
  SectionCard,
  SelectField,
  TextareaField,
  ToggleSwitch,
  InputField,
  SECRET_PLACEHOLDER,
  limpiarSecretoAlEnfocar,
} from './ConfigComponents.jsx';

function readVoices() {
  return listSpanishSpeechVoices() || [];
}

export default function SeccionAlertas({ config, f, setConfig }) {
  const [voices, setVoices] = useState(readVoices);
  const [testName, setTestName] = useState('Hernán González');

  const hayVozEnElNavegador = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!hayVozEnElNavegador) return undefined;
    const refresh = () => setVoices(readVoices());
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    // Algunos navegadores cargan las voces con retraso: sin este reintento la
    // lista aparece vacía la primera vez que se abre la pestaña.
    const timer = window.setTimeout(refresh, 400);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener?.('voiceschanged', refresh);
    };
  }, [hayVozEnElNavegador]);

  const voiceOptions = useMemo(
    () => [
      { value: '', label: 'Automática (prioriza Argentina)' },
      ...voices.map((voice) => ({
        value: voice.name,
        label: `${voice.name} · ${voice.lang}${voice.localService ? '' : ' · online'}`,
      })),
    ],
    [voices]
  );

  const setToggle = (key, checked) => {
    setConfig((prev) => ({ ...prev, [key]: checked ? '1' : '0' }));
  };

  const vozActiva = String(config.alertas_pedido_voz ?? '1') === '1';
  const vozIaActiva = String(config.voz_ia_activa ?? '0') === '1';
  const claveGuardada =
    config.gemini_api_key_configured && config.gemini_api_key === SECRET_PLACEHOLDER;

  const probarVoz = () => {
    if (!hayVozEnElNavegador) {
      toast.error('Este navegador no tiene síntesis de voz');
      return;
    }
    const frase = buildDeliveredAnnouncementText(
      { numero: 142, cliente_nombre: testName, repartidor_nombre: 'Cristian Galván' },
      { scope: 'admin', config }
    );
    speakOrderAnnouncement(frase, {
      voiceName: config.alertas_voz_nombre,
      rate: config.alertas_voz_velocidad,
      pitch: config.alertas_voz_tono,
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={BellRing}
        title="Avisos del local"
        subtitle="Qué pasa en la computadora del mostrador cuando entra o se entrega un pedido"
      >
        <div className="space-y-1">
          <ToggleSwitch
            checked={String(config.alertas_pedido_sonido ?? '1') === '1'}
            onChange={(checked) => setToggle('alertas_pedido_sonido', checked)}
            label="Sonar una alarma"
            description="Tres tonos cortos. Se escucha aunque la pestaña esté de fondo."
          />
          <ToggleSwitch
            checked={vozActiva}
            onChange={(checked) => setToggle('alertas_pedido_voz', checked)}
            label="Anunciar en voz alta"
            description="Lee el número del pedido, el cliente y el rider."
          />

          {/*
            La voz del navegador es la del sistema operativo y en Android suena
            bastante robótica. Con esto activado, el servidor genera el audio con
            una voz de IA la primera vez que aparece cada frase y lo deja
            guardado, así a partir de ahí suena al instante y sin internet.

            Si la API no responde o falta la clave, el aviso igual se escucha con
            la voz de siempre: nunca se queda la cocina sin avisar.
          */}
          {vozActiva ? (
            <ToggleSwitch
              checked={vozIaActiva}
              onChange={(checked) => setToggle('voz_ia_activa', checked)}
              label="Usar voz de IA (más natural)"
              description="Necesita una clave de Gemini. Si falla, usa la voz del navegador."
            />
          ) : null}
        </div>

        {vozActiva && vozIaActiva ? (
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: STROKE }}>
            <InputField
              label="Clave de Gemini"
              type="password"
              value={config.gemini_api_key || ''}
              onChange={(evento) =>
                setConfig((prev) => ({ ...prev, gemini_api_key: evento.target.value }))
              }
              onFocus={limpiarSecretoAlEnfocar(setConfig, 'gemini_api_key')}
              placeholder="AIza..."
              hint={
                claveGuardada
                  ? 'Ya hay una clave guardada. Hacé clic en el campo y pegá la nueva si querés cambiarla.'
                  : 'La sacás gratis en aistudio.google.com/apikey.'
              }
            />
            <p className="mt-3 text-[12px] leading-relaxed text-gray-500">
              La primera vez que aparece una frase nueva suena con la voz del navegador mientras el
              audio se genera. De ahí en más queda guardado y suena al instante, aunque se corte
              internet.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
              El aviso que se manda a Google incluye el nombre del cliente. Con el plan gratuito,
              Google usa ese contenido para mejorar sus servicios.
            </p>
          </div>
        ) : null}

        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
          Los navegadores bloquean el sonido hasta que alguien hace clic en la página. Si abrís el
          panel y lo dejás sin tocar, el primer aviso puede no sonar.
        </p>
      </SectionCard>

      {/*
        La configuración de voz sólo aparece si el anuncio hablado está
        encendido. Antes estaba siempre visible, pidiendo elegir voz, velocidad
        y pronunciaciones aunque la voz estuviera apagada.
      */}
      {vozActiva ? (
        <SectionCard
          icon={Volume2}
          title="Cómo suena la voz"
          subtitle="Depende de las voces instaladas en esta computadora"
        >
          {!hayVozEnElNavegador ? (
            <p
              className="mb-3 rounded-xl px-4 py-3 text-[12px] font-medium leading-relaxed"
              style={{ background: '#FEF2F2', color: '#7A0F17' }}
            >
              Este navegador no tiene síntesis de voz. El anuncio hablado no va a funcionar acá,
              aunque esté activado.
            </p>
          ) : voices.length === 0 ? (
            <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-[12px] font-medium leading-relaxed text-amber-800">
              No hay voces en español instaladas en esta computadora. Se va a usar la voz por
              defecto del sistema, que puede leer los nombres con acento extranjero.
            </p>
          ) : null}

          {/*
            `items-end` alinea los campos por abajo. Sin esto, el que tiene
            descripción queda más abajo que el que no, y los dos desplegables
            aparecen a distinta altura aunque estén en la misma fila.
          */}
          <div className="grid items-end gap-3 lg:grid-cols-3">
            <SelectField
              label="Voz"
              description="Automática elige primero una de Argentina."
              {...f('alertas_voz_nombre')}
              options={voiceOptions}
            />
            <SelectField
              label="Velocidad"
              description="Qué tan rápido lee el aviso."
              {...f('alertas_voz_velocidad')}
              options={[
                { value: '0.82', label: 'Pausada' },
                // Antes esta opción se llamaba "Natural argentina", que no es
                // una velocidad sino un tipo de voz. Bajo el rótulo
                // "Velocidad" no significaba nada.
                { value: '0.92', label: 'Natural' },
                { value: '1', label: 'Normal' },
                { value: '1.08', label: 'Ágil' },
              ]}
            />
            <SelectField
              label="Tono"
              description="Más grave se entiende mejor con ruido."
              {...f('alertas_voz_tono')}
              options={[
                { value: '0.9', label: 'Grave' },
                { value: '1', label: 'Normal' },
                { value: '1.1', label: 'Agudo' },
              ]}
            />
          </div>

          {/* ── Banco de pruebas ── */}
          <div className="mt-3 rounded-xl bg-gray-50 p-4">
            <p className="text-[13px] font-medium text-gray-900">Probar cómo suena</p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Escribí un nombre difícil y escuchá cómo lo pronuncia antes de dejarlo así.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={testName}
                onChange={(event) => setTestName(event.target.value)}
                placeholder="Hernán González"
                className="h-11 min-w-[180px] flex-1 rounded-xl border border-gray-200 bg-white px-3.5 text-[14px] text-gray-900 outline-none transition focus:border-gray-400"
              />
              <button
                type="button"
                onClick={probarVoz}
                style={{ background: BRAND }}
                className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                <Play size={15} strokeWidth={STROKE} />
                Escuchar
              </button>
            </div>
          </div>

          <div className="mt-3">
            <TextareaField
              label="Corregir pronunciaciones"
              description="Una por línea, con el formato Palabra=ComoSuena. Ya vienen corregidos Hernán, Iván, Matías, Cristián, Galván y González."
              rows={4}
              {...f('alertas_voz_reemplazos')}
              placeholder={'Wolf=Uolf\nNahuel=Nauel'}
            />
          </div>
        </SectionCard>
      ) : null}

      {!vozActiva ? (
        <p className="rounded-2xl bg-white px-5 py-4 text-[13px] text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          Activá el anuncio hablado arriba para elegir la voz y ajustar cómo pronuncia los nombres.
        </p>
      ) : null}
    </div>
  );
}
