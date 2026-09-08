import React, { useState } from 'react';
import type { Request, Slot } from '../types';
import { TIME_SLOTS } from '../utils/constants';

interface Props {
  slots: Record<string, Slot>;
  requests: Request[];
}

export const AdminReservationCalendar: React.FC<Props> = ({ slots, requests }) => {
  const [selectedDate, setSelectedDate] = useState('2026-09-09');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // UTC 요일과 날짜 문자열로 OS 시간대와 무관하게 9월을 표시합니다.
  const days: (string | null)[] = [
    ...Array<null>(new Date(Date.UTC(2026, 8, 1)).getUTCDay()).fill(null),
    ...Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
  ];
  const selectedSlot = selectedSlotId ? slots[selectedSlotId] : undefined;
  const confirmedRequest = requests.find(request =>
    request.status === 'confirmed' && request.confirmedSlotId === selectedSlotId
  );
  const confirmedAt = confirmedRequest?.confirmedAt || selectedSlot?.confirmedAt;

  return (
    <section aria-label="예약 현황" style={{ display: 'flex', gap: '12px', width: '100%', minHeight: 0, overflow: 'auto' }}>
      <div style={{ flex: '1 0 300px', minWidth: 300, overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>2026년 9월 예약 현황</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: '12px' }}>{day}</div>
          ))}
          {days.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;
            const daySlots = Object.values(slots).filter(slot => slot.date === date);
            const confirmed = daySlots.filter(slot => slot.status === 'confirmed').length;
            const available = daySlots.filter(slot => slot.status === 'available').length;
            return (
              <button
                key={date}
                type="button"
                disabled={daySlots.length === 0}
                aria-label={`${date}, 예약 ${confirmed}개, 가능 ${available}개`}
                aria-pressed={selectedDate === date}
                onClick={() => { setSelectedDate(date); setSelectedSlotId(null); }}
                style={{ padding: '6px 2px', minHeight: '54px', border: selectedDate === date ? '2px solid #007bff' : '1px solid #ddd', borderRadius: '4px', background: selectedDate === date ? '#e7f3ff' : 'white', color: daySlots.length ? '#333' : '#999', cursor: daySlots.length ? 'pointer' : 'default' }}
              >
                {Number(date.slice(-2))}
                {daySlots.length > 0 && <div style={{ fontSize: '10px', marginTop: '3px' }}>예약 {confirmed}<br />가능 {available}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: '1 0 220px', minWidth: 220, overflowY: 'auto', fontSize: '12px' }}>
        <h4 style={{ margin: '0 0 8px' }}>{selectedDate}</h4>
        {TIME_SLOTS.map(time => {
          const slot = Object.values(slots).find(item => item.date === selectedDate && item.timeLabel === time.label);
          const isConfirmed = slot?.status === 'confirmed';
          return (
            <button key={time.label} type="button" disabled={!isConfirmed}
              aria-pressed={!!slot && selectedSlotId === slot.id}
              onClick={() => slot && setSelectedSlotId(slot.id)}
              style={{ display: 'block', width: '100%', padding: '10px', marginBottom: '6px', textAlign: 'left', color: '#333', border: selectedSlotId === slot?.id ? '2px solid #007bff' : '1px solid #ddd', background: isConfirmed ? '#e8f5e9' : '#fafafa', borderRadius: '4px', cursor: isConfirmed ? 'pointer' : 'default' }}>
              {time.displayLabel} · {slot ? isConfirmed ? '예약 확정' : '가능' : '슬롯 없음'}
            </button>
          );
        })}
        {selectedSlot?.status === 'confirmed' && (
          <article aria-label="확정 예약 상세" style={{ padding: '12px', border: '1px solid #ddd', borderRadius: '4px', overflowWrap: 'anywhere' }}>
            <h4 style={{ margin: '0 0 8px' }}>확정 예약 상세</h4>
            <p>고객: {confirmedRequest?.customerId || selectedSlot.confirmedBy || '정보 없음'}</p>
            <p>Request ID: {confirmedRequest?.id || '확정 신청 정보 없음'}</p>
            <p>예약 일정: {selectedSlot.date} {TIME_SLOTS.find(time => time.label === selectedSlot.timeLabel)?.displayLabel}</p>
            <p>확정 처리 시각: {confirmedAt ? new Date(confirmedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' (KST)' : '정보 없음'}</p>
          </article>
        )}
      </div>
    </section>
  );
};
