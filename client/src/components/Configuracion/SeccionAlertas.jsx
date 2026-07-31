import { useEffect, useMemo, useState } from 'react';
import { BellRing, Play, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  buildDeliveredAnnouncementText,
  listSpanishSpeechVoices,
  speakOrderAnnouncement,
} from '../../lib/orderAlerts.js';

import {
  InputField,
  SectionCard,
  SelectField,
  TextareaField,
  ToggleSwitch,
} from './ConfigComponents.jsx';

function readVoices() {
  return listSpanishSpeechVoices() || [];
}

export default function SeccionAlertas({ config, f, setConfig }) {
  const [voices, setVoices] = useState(readVoices);
  const [testName, setTestName] = useState('Hernan Gonzalez');

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const refresh = () => setVoices(readVoices());
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    const timer = window.setTimeout(refresh, 400);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener?.('voiceschanged', refresh);
    };
  }, []);

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

  const testVoice = () => {
    if (!('speechSynthesis' in window)) {
      toast.error('Este equipo no tiene síntesis de voz');
      return;
    }
    const phrase = buildDeliveredAnnouncementText(
      {
        numero: 142,
        cliente_nombre: testName,
        repartidor_nombre: 'Cristian Galvan',
      },
      {
        scope: 'admin',
        config,
      }
    );
    speakOrderAnnouncement(phrase, {
      voiceName: config.alertas_voz_nombre,
      rate: config.alertas_voz_velocidad,
      pitch: config.alertas_voz_tono,
    });
    toast.success('Reproduciendo voz de prueba');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
      <SectionCard
        icon={BellRing}
        tone="blue"
        title="Alarmas del local"
        subtitle="Sonido y anuncio hablado para pedidos nuevos y entregados"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ToggleSwitch
            checked={String(config.alertas_pedido_sonido ?? '1') === '1'}
            onChange={(checked) => setToggle('alertas_pedido_sonido', checked)}
            label="Sonido de alarma"
            description="Emite tres tonos para llamar la atención."
            color="blue"
          />
          <ToggleSwitch
            checked={String(config.alertas_pedido_voz ?? '1') === '1'}
            onChange={(checked) => setToggle('alertas_pedido_voz', checked)}
            label="Anuncio por voz"
            description="Lee el número, el cliente y el rider."
            color="blue"
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Volume2}
        tone="emerald"
        title="Voz argentina"
        subtitle="La lista depende de las voces instaladas en esta computadora"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SelectField
            label="Voz preferida"
            description="Automática elige primero es-AR; si instalás otra voz, aparecerá aquí."
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
          <InputField
            label="Nombre para la prueba"
            description="Probá acá cualquier nombre que suela leer mal."
            value={testName}
            onChange={(event) => setTestName(event.target.value)}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={testVoice}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-success-600 px-5 text-sm font-bold text-white transition hover:bg-success-700"
            >
              <Play size={18} />
              Probar anuncio de entrega
            </button>
          </div>
        </div>

        <div className="mt-6">
          <TextareaField
            label="Pronunciaciones personalizadas"
            description="Una por línea, por ejemplo: Wolf=Uolf. El sistema ya corrige Hernán, Iván, Matías, Cristián, Galván y González."
            rows={5}
            {...f('alertas_voz_reemplazos')}
            placeholder={'Wolf=Uolf\nNahuel=Nauel'}
          />
        </div>
      </SectionCard>
    </div>
  );
}
