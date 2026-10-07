import {
  CircleDashed,
  Clapperboard,
  Facebook,
  FileText,
  GalleryHorizontal,
  Instagram,
} from 'lucide-react';

export const LIMITES_DE_RED = {
  facebook: { nombre: 'Facebook', tope: 60000, color: '#1877f2', icono: Facebook },
  instagram: { nombre: 'Instagram', tope: 2200, color: '#e1306c', icono: Instagram },
};

export const redDelDestino = (destino) =>
  String(destino?.tipo || '').startsWith('instagram') ? 'instagram' : 'facebook';

export const formatoDeCuenta = (draft, cuenta) =>
  cuenta
    ? draft.formatos?.[cuenta.clave] || draft.formatos?.[cuenta.red] || draft.formato || 'post'
    : draft.formato || 'post';

export function arranqueDeSemana(fecha) {
  const dia = new Date(fecha);
  const indice = dia.getDay();
  dia.setDate(dia.getDate() - (indice === 0 ? 6 : indice - 1));
  dia.setHours(0, 0, 0, 0);
  return dia;
}

export const FORMATOS_UI = [
  {
    clave: 'post',
    nombre: 'Post',
    icono: FileText,
    queEspera: 'Una imagen, o sólo texto',
    ayuda: 'Texto con o sin foto. Va al muro y al feed.',
    requisitos: [],
    destinos: ['facebook_page', 'facebook_profile', 'facebook_group', 'instagram_feed'],
  },
  {
    clave: 'reel',
    nombre: 'Reel',
    icono: Clapperboard,
    queEspera: 'Un video vertical',
    ayuda: 'Video vertical corto. Es lo que más alcance tiene hoy.',
    requisitos: [
      'Video vertical 9:16, mínimo 540×960',
      'Entre 4 y 60 segundos',
      'Hasta 30 reels por día en la Fan Page',
    ],
    destinos: ['facebook_page', 'facebook_profile', 'instagram_feed'],
  },
  {
    clave: 'historia',
    nombre: 'Historia',
    icono: CircleDashed,
    queEspera: 'Una foto o un video vertical',
    ayuda: 'Dura 24 horas. Sirve para el menú del día y las promos que vencen.',
    requisitos: [
      'Foto o video vertical 9:16',
      'El video no puede pasar de 60 segundos',
      'La foto o el video no pueden haberse usado antes en otra publicación',
      'Instagram descarta el texto en las historias',
    ],
    destinos: ['facebook_page', 'facebook_profile', 'instagram_feed'],
  },
  {
    clave: 'carrusel',
    nombre: 'Carrusel',
    icono: GalleryHorizontal,
    queEspera: 'Entre 2 y 10 imágenes',
    ayuda: 'Varias fotos que se pasan de costado. Ideal para mostrar la carta.',
    requisitos: [
      'Entre 2 y 10 piezas',
      'Todas se recortan con la forma de la primera',
      'Cuenta como una sola publicación para el límite diario',
    ],
    destinos: ['instagram_feed'],
  },
];

export function porQueNoEsteFormato(formato, destinosElegidos) {
  if (!destinosElegidos.length) return '';
  const rechazan = destinosElegidos.filter((destino) => !formato.destinos.includes(destino.tipo));
  if (!rechazan.length) return '';

  const nombres = rechazan
    .map((destino) => destino.nombre)
    .slice(0, 3)
    .join(', ');
  const resto = rechazan.length > 3 ? ` y ${rechazan.length - 3} más` : '';
  if (rechazan.some((destino) => destino.tipo === 'facebook_group')) {
    return `Los grupos no reciben ${formato.nombre.toLowerCase()}: Meta cerró la API de grupos en 2024. Sacá ${nombres}${resto} o elegí Publicación.`;
  }
  if (formato.clave === 'carrusel') {
    return `El carrusel existe sólo en Instagram. Sacá ${nombres}${resto}.`;
  }
  return `${nombres}${resto} no acepta ${formato.nombre.toLowerCase()}.`;
}
