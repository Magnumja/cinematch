import { describe, expect, it } from 'vitest';
import { scheduledPushMessage } from './notify.ts';

const movie = { titlePt: 'A Viagem de Chihiro', titleEn: 'Spirited Away', year: 2001, tmdb: null };

describe('scheduledPushMessage', () => {
  it('usa o período do agendamento e o título no idioma do perfil', () => {
    expect(scheduledPushMessage(movie, 'pt', 'weekly')).toEqual({
      title: 'Seu filme da semana',
      body: 'A Viagem de Chihiro (2001). Toque para ver por que ele combina com você.',
      url: '/',
      tag: 'cineou-scheduled',
    });
    expect(scheduledPushMessage(movie, 'en', 'daily').title).toBe('Your film for today');
    expect(scheduledPushMessage(movie, 'en', 'monthly').body.startsWith('Spirited Away (2001).')).toBe(true);
  });

  it('sem ano não inventa ano; sem agendamento usa o texto semanal', () => {
    const m = scheduledPushMessage({ ...movie, year: null }, 'pt', null);
    expect(m.body.startsWith('A Viagem de Chihiro. ')).toBe(true);
    expect(m.title).toBe('Seu filme da semana');
  });
});
