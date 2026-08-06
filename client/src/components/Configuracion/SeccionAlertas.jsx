import { useEffect, useMemo, useState } from 'react';
import { BellRing, Play, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { BRAND, STROKE } from '../../lib/theme.js';
import {
  buildDeliveredAnnouncementText,
  listSpanishSpeechVoices,
  speakOrderAnnouncement,
} from '../../lib/orderAlerts.js';

import { SectionCard, SelectField, TextareaField, ToggleSwitch } from './ConfigComponents.jsx';

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
        </div>

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

          <div className="grid gap-3 lg:grid-cols-2">
            <SelectField
              label="Voz"
              description="Automática elige primero una de Argentina."
              {...f('alertas_voz_nombre')}
              options={voiceOptions}
            />
            <SelectField
              label="Velocidad"
              {...f('alertas_voz_velocidad')}
              options={[
                { value: '0.82', label: 'Pausada' },
                { value: '0.92', label: 'Natural argentina' },
                { value: '1', label: 'Normal' },
                { value: '1.08', label: 'Ágil' },
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

          {/*
            El tono se usaba al hablar pero no había ningún campo para
            ajustarlo: quedaba fijo en el valor que trajera la base, sin forma
            de cambiarlo desde ningún lado del sistema.
          */}
          <div className="mt-3">
            <SelectField
              label="Tono"
              {...f('alertas_voz_tono')}
              options={[
                { value: '0.9', label: 'Grave' },
                { value: '1', label: 'Normal' },
                { value: '1.1', label: 'Agudo' },
              ]}
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
