import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminReservationCalendar } from '../src/components/AdminReservationCalendar';
import type { Slot } from '../src/types';

describe('관리자 예약 현황 렌더링', () => {
  it('예약이 모두 찬 날짜도 조회할 수 있고 세 시간대를 표시한다', () => {
    const slots = Object.fromEntries(['am', 'pm', 'evening'].map(timeLabel => {
      const id = `2026-09-09:${timeLabel}`;
      return [id, { id, date: '2026-09-09', timeLabel, status: 'confirmed' } as Slot];
    }));
    const html = renderToStaticMarkup(<AdminReservationCalendar slots={slots} requests={[]} />);
    expect(html).toContain('2026년 9월 예약 현황');
    const dateButton = html.match(/<button[^>]*aria-label="2026-09-09, 예약 3개, 가능 0개"[^>]*>/)?.[0];
    expect(dateButton).toBeDefined();
    expect(dateButton).not.toContain('disabled');
    expect(html).toContain('오전 09:00');
    expect(html).toContain('오후 13:00');
    expect(html).toContain('저녁 18:00');
    expect(html.match(/예약 확정/g)).toHaveLength(3);
  });

  it('접수는 점유로 표시하지 않고 슬롯의 확정 상태만 집계한다', () => {
    const slot: Slot = { id: '2026-09-09:am', date: '2026-09-09', timeLabel: 'am', status: 'available' };
    const html = renderToStaticMarkup(<AdminReservationCalendar slots={{ [slot.id]: slot }} requests={[
      { id: 'request-1', customerId: 'C01', version: 1, createdAt: '2026-09-08T00:00:00Z', status: 'received' },
    ]} />);
    expect(html).toContain('2026-09-09, 예약 0개, 가능 1개');
    expect(html).not.toContain('예약 확정');
    expect(html).not.toContain('확정 예약 상세');
  });
});
