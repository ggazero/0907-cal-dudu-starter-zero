import React, { useState, useEffect, useMemo } from 'react';
import type { Slot, Request, Candidate } from '../types';
import { OperationManager } from '../utils/operations';
import { DatabaseManager } from '../utils/database';
import { decideRequestStatus } from '../utils/decide';
import { TIME_SLOTS } from '../utils/constants';
import { getSupabase, getCurrentUserId, getCurrentUser } from '../utils/supabase';

interface CustomerPageProps {
  db: DatabaseManager;
  mode: 'local' | 'supabase';
}

// 최신 신청과 현재 버전의 후보를 조회 및 polling에서 동일하게 사용합니다.
const currentCustomerRequests = (items: Array<{ request: Request; candidates: Candidate[]; decision: any }>) =>
  [...items].sort((a, b) => new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime() || a.request.id.localeCompare(b.request.id))
    .map(item => ({ ...item, candidates: item.candidates.filter(candidate => candidate.version === item.request.version) }));

const CalendarDateSelector: React.FC<{
  slots: Record<string, Slot>;
  selectedDate: string | null;
  onDateSelect: (date: string) => void;
  excludeSlots?: string[]; // 직전 실패 슬롯 제외용
}> = ({ slots, selectedDate, onDateSelect, excludeSlots = [] }) => {
  const START_DATE = new Date('2026-09-09');
  const END_DATE = new Date('2026-09-22');

  // 달력에 표시할 첫 번째 날짜 (달의 첫 날)
  const firstDay = new Date('2026-09-01');
  const lastDay = new Date('2026-09-30');

  // 날짜별 가능한 슬롯 수 (excludeSlots 제외)
  const availableSlotsPerDate = Object.values(slots).reduce((acc, slot) => {
    if (slot.status === 'available' && !excludeSlots.includes(slot.id)) {
      acc[slot.date] = (acc[slot.date] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // 캘린더 그리드 생성
  const calendarDays: (string | null)[] = [];

  // 첫 주의 빈 칸 채우기
  for (let i = 0; i < firstDay.getDay(); i++) {
    calendarDays.push(null);
  }

  // 해당 월의 날짜들
  const current = new Date(firstDay);
  while (current <= lastDay) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    calendarDays.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{ marginBottom: '24px' }}>
      <h4 style={{ marginBottom: '16px' }}>1단계: 날짜 선택</h4>

      <div style={{ marginBottom: '16px', padding: '16px', background: '#f9f9f9', borderRadius: '6px' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center' }}>
          2026년 9월
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
          {weekDays.map(day => (
            <div
              key={day}
              style={{
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '12px',
                padding: '8px 0',
                color: '#666',
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 달력 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {calendarDays.map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} style={{}} />;
            }

            const dateObj = new Date(date);
            const isInRange = dateObj >= START_DATE && dateObj <= END_DATE;
            const availableSlots = availableSlotsPerDate[date] || 0;
            const isFullyBooked = isInRange && availableSlots === 0;
            const isSelected = selectedDate === date;
            const day = parseInt(date.split('-')[2], 10);

            return (
              <button
                key={date}
                onClick={() => isInRange && !isFullyBooked && onDateSelect(date)}
                disabled={!isInRange || isFullyBooked}
                style={{
                  padding: '12px 4px',
                  border: isSelected ? '3px solid #007bff' : '1px solid #ddd',
                  background: isSelected
                    ? '#e7f3ff'
                    : isInRange && !isFullyBooked
                    ? 'white'
                    : '#f5f5f5',
                  cursor: isInRange && !isFullyBooked ? 'pointer' : 'not-allowed',
                  borderRadius: '4px',
                  minHeight: '70px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: '12px',
                  color: isInRange ? '#333' : '#999',
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
              >
                <div style={{ fontSize: '14px', marginBottom: '4px' }}>{day}</div>
                {isInRange && !isFullyBooked && (
                  <div style={{ fontSize: '10px', color: isSelected ? '#007bff' : '#666' }}>
                    {availableSlots}개
                  </div>
                )}
                {isFullyBooked && (
                  <div style={{ fontSize: '10px', color: '#999' }}>예약마감</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TimeSlotSelectionUI: React.FC<{
  slots: Record<string, Slot>;
  selectedSlots: string[];
  onToggle: (slotId: string) => void;
  maxSelect: number;
  selectedDate: string | null;
  excludeSlots?: string[];
}> = ({ slots, selectedSlots, onToggle, maxSelect, selectedDate, excludeSlots = [] }) => {
  // 선택된 날짜의 슬롯들
  const timeSlotsForDate = selectedDate
    ? Object.entries(slots)
        .filter(([_, slot]) => slot.date === selectedDate)
        .sort((a, b) => {
          const timeOrder: Record<string, number> = { 'am': 0, 'pm': 1, 'evening': 2 };
          return (timeOrder[a[1].timeLabel] || 0) - (timeOrder[b[1].timeLabel] || 0);
        })
    : [];

  if (!selectedDate) {
    return (
      <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '6px', textAlign: 'center' }}>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          왼쪽 달력에서 날짜를 선택해주세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h4 style={{ marginBottom: '12px', fontSize: '13px', color: '#666' }}>선택한 날짜</h4>
      <div style={{ marginBottom: '20px', padding: '12px', background: '#e3f2fd', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', color: '#0d47a1' }}>
        {selectedDate}
      </div>

      <h4 style={{ marginBottom: '16px' }}>2단계: 시간 선택</h4>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {timeSlotsForDate.map(([slotId, slot]) => {
          const isSelected = selectedSlots.includes(slotId);
          const isAvailable = slot.status === 'available';
          const isExcluded = excludeSlots.includes(slotId);
          const canSelect = isAvailable && !isExcluded && (!isSelected && selectedSlots.length < maxSelect);

          return (
            <div key={slotId} style={{ position: 'relative' }}>
              <button
                onClick={() => onToggle(slotId)}
                disabled={!canSelect}
                title={isExcluded ? '이전 신청에서 선택한 일정은 제외됩니다' : ''}
                style={{
                  padding: '12px 16px',
                  border: isSelected ? '2px solid #28a745' : isExcluded ? '2px solid #dc3545' : '1px solid #ddd',
                  background: isSelected
                    ? '#d4edda'
                    : isExcluded
                    ? '#fff5f5'
                    : isAvailable
                    ? 'white'
                    : '#f5f5f5',
                  cursor: canSelect ? 'pointer' : 'not-allowed',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: isExcluded ? '#dc3545' : isAvailable ? '#333' : '#999',
                }}
              >
                {TIME_SLOTS.find(t => t.label === slot.timeLabel)?.displayLabel}
                {isSelected && ' ✓'}
              </button>
              {isExcluded && (
                <div style={{ fontSize: '10px', color: '#dc3545', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  선택 불가
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '12px' }}>선택한 슬롯 ({selectedSlots.length}/{maxSelect})</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {selectedSlots.map((slotId, idx) => {
            const slot = slots[slotId];
            return (
              <div
                key={slotId}
                style={{
                  padding: '8px 12px',
                  background: '#f0f0f0',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <span>
                  {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => onToggle(slotId)}
                  style={{ padding: '2px 6px', fontSize: '11px' }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CustomerPage: React.FC<CustomerPageProps> = ({ db, mode }) => {
  const [customerId, setCustomerId] = useState<string>('C01');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [stage, setStage] = useState<'select' | 'confirm' | 'view' | 'reselect' | 'inline_reselect'>('select');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [customerRequests, setCustomerRequests] = useState<
    Array<{ request: Request; candidates: Candidate[]; decision: any }>
  >([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [inlineReselectSlots, setInlineReselectSlots] = useState<string[]>([]);
  const [priorityNotifySlots, setPriorityNotifySlots] = useState<Set<string>>(new Set());
  const [expandNotify, setExpandNotify] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reselectDate, setReselectDate] = useState<string | null>(null);
  const [isCreatingNewReservation, setIsCreatingNewReservation] = useState(false);

  const om = useMemo(() => new OperationManager(db, mode), [db, mode]);

  // Supabase 모드 초기화
  useEffect(() => {
    if (mode === 'supabase') {
      initializeSupabase();
    }
  }, [mode]);

  const initializeSupabase = async () => {
    try {
      setError('');
      getSupabase();

      // 현재 사용자 ID 획득 (session 또는 user에서)
      const userId = await getCurrentUserId();
      if (userId) {
        setCustomerId(userId);

        // 이메일 주소 획득
        const user = await getCurrentUser();
        if (user?.email) {
          setCustomerEmail(user.email);
        }

        setSupabaseReady(true);
        setError('');
      } else {
        // 로그인되지 않음
        setSupabaseReady(false);
        setError('');
      }
    } catch (err) {
      setSupabaseReady(false);
      setError(`Supabase 초기화 오류: ${String(err)}`);
    }
  };

  // 초기 로드
  useEffect(() => {
    if (mode === 'supabase' && !supabaseReady) return;
    loadData();
  }, [customerId, mode, supabaseReady]);

  // view 단계에서 자동 갱신 (5초 간격, 신규 예약 중이 아닐 때만)
  useEffect(() => {
    if (stage !== 'view' || customerRequests.length === 0 || isCreatingNewReservation) return;

    const interval = setInterval(async () => {
      const previousLatest = customerRequests[customerRequests.length - 1];

      // loadData 호출하여 최신 상태 가져오기
      try {
        if (mode === 'supabase') {
          const status = currentCustomerRequests(await om.getCustomerStatusSupabase(customerId));
          if (status.length > 0) {
            const currentLatest = status[status.length - 1];

            // 상태 변경 감지
            if (previousLatest.request.status !== currentLatest.request.status) {
              setCustomerRequests(status);
              await loadData(true);

              if (currentLatest.request.status === 'confirmed') {
                setStatusNotification('예약이 확정되었습니다.');
                setTimeout(() => setStatusNotification(''), 5000);
              } else if (currentLatest.request.status === 'needs_reselection') {
                setStatusNotification('선택한 일정으로 예약이 어려워 다른 일정을 선택해주세요.');
                setTimeout(() => setStatusNotification(''), 5000);
              }
            }
          }
        } else {
          const status = currentCustomerRequests(om.getCustomerStatus(customerId));
          if (status.length > 0) {
            const currentLatest = status[status.length - 1];

            // 상태 변경 감지
            if (previousLatest.request.status !== currentLatest.request.status) {
              setCustomerRequests(status);
              await loadData(true);

              if (currentLatest.request.status === 'confirmed') {
                setStatusNotification('예약이 확정되었습니다.');
                setTimeout(() => setStatusNotification(''), 5000);
              } else if (currentLatest.request.status === 'needs_reselection') {
                setStatusNotification('선택한 일정으로 예약이 어려워 다른 일정을 선택해주세요.');
                setTimeout(() => setStatusNotification(''), 5000);
              }
            }
          }
        }
      } catch (err) {
        // 조용히 무시 (갱신 실패는 로깅하지 않음)
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [stage, customerRequests, customerId, mode, om, isCreatingNewReservation]);

  const loadData = async (skipStageUpdate = false) => {
    try {
      setError('');
      setSuccess('');

      if (mode === 'supabase') {
        const { data: slotsData, error: slotError } = await getSupabase()
          .from('slots')
          .select('*');

        if (slotError) throw slotError;

        const slotsRecord: Record<string, Slot> = {};
        (slotsData || []).forEach((s: any) => {
          slotsRecord[s.id] = {
            id: s.id,
            date: s.date,
            timeLabel: s.time_label,
            status: s.status,
            confirmedAt: s.confirmed_at,
            confirmedBy: s.confirmed_by,
          };
        });
        setSlots(slotsRecord);

        const status = currentCustomerRequests(await om.getCustomerStatusSupabase(customerId));
        setCustomerRequests(status);

        if (!skipStageUpdate) {
          if (status.length === 0) {
            setStage('select');
            setSelectedSlots([]);
          } else {
            const latest = status[status.length - 1];
            if (latest.request.status === 'needs_reselection') {
              setStage('view');
            } else if (latest.request.status === 'confirmed') {
              setStage('view');
            } else {
              setStage('view');
            }
          }
        }
      } else {
        const state = db.getState();
        setSlots(state.slots);
        const status = currentCustomerRequests(om.getCustomerStatus(customerId));
        setCustomerRequests(status);

        if (!skipStageUpdate) {
          if (status.length === 0) {
            setStage('select');
            setSelectedSlots([]);
          } else {
            const latest = status[status.length - 1];
            if (latest.request.status === 'needs_reselection') {
              setStage('view');
            } else if (latest.request.status === 'confirmed') {
              setStage('view');
            } else {
              setStage('view');
            }
          }
        }
      }
    } catch (err) {
      setError(`데이터 로드 오류: ${String(err)}`);
    }
  };

  const handleSlotToggle = (slotId: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(slotId)) {
        return prev.filter(s => s !== slotId);
      } else if (prev.length < 3) {
        // 중복 슬롯 체크: 동일 슬롯 없어야 함
        if (prev.includes(slotId)) {
          return prev;
        }
        return [...prev, slotId];
      }
      return prev;
    });
    setError('');
  };

  const handleSubmit = async () => {
    if (selectedSlots.length === 0) {
      setError('최소 1개 이상의 슬롯을 선택하세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const operationId = `submit-${customerId}-${Date.now()}`;
      const result = await om.submitRequest(customerId, selectedSlots, operationId);

      if (result.success) {
        setSuccess('신청이 완료되었습니다!');
        setSelectedSlots([]);
        setSelectedDate(null);
        setIsCreatingNewReservation(false);
        setStage('view');
        setTimeout(() => loadData(), 500);
      } else {
        setError(result.error || '신청 실패');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReselect = async () => {
    if (selectedSlots.length === 0) {
      setError('최소 1개 이상의 슬롯을 선택하세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const latest = customerRequests[customerRequests.length - 1];
      const operationId = `reselect-${latest.request.id}-${Date.now()}`;
      const result = await om.resubmitRequest(
        customerId,
        latest.request.id,
        selectedSlots,
        operationId
      );

      if (result.success) {
        setSuccess('재선택이 완료되었습니다!');
        setSelectedSlots([]);
        setStage('view');
        setTimeout(() => loadData(), 500);
      } else {
        setError(result.error || '재선택 실패');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedSlots([]);
    setStage('view');
    setError('');
  };

  const getSuggestedSlots = (): string[] => {
    const latest = customerRequests[customerRequests.length - 1];
    const excludeSlots = latest?.candidates.map(c => c.slotId) || [];

    const availableSlots = Object.values(slots)
      .filter(s => s.status === 'available' && !excludeSlots.includes(s.id))
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const timeOrder: Record<string, number> = { 'am': 0, 'pm': 1, 'evening': 2 };
        return (timeOrder[a.timeLabel] || 0) - (timeOrder[b.timeLabel] || 0);
      })
      .slice(0, 3)
      .map(s => s.id);
    return availableSlots;
  };

  const handleInlineReselectSubmit = async () => {
    if (inlineReselectSlots.length === 0) {
      setError('최소 1개 이상의 슬롯을 선택하세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const latest = customerRequests[customerRequests.length - 1];
      const operationId = `reselect-${latest.request.id}-${Date.now()}`;
      const result = await om.resubmitRequest(
        customerId,
        latest.request.id,
        inlineReselectSlots,
        operationId
      );

      if (result.success) {
        setSuccess('재선택이 완료되었습니다!');
        setInlineReselectSlots([]);
        setTimeout(() => loadData(), 500);
      } else {
        setError(result.error || '재선택 실패');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // 슬롯 상태가 변경되었는지 확인
  const checkSlotAvailability = () => {
    if (stage === 'confirm' && customerRequests.length > 0) {
      const latest = customerRequests[customerRequests.length - 1];
      const currentState = db.getState();
      const decision = decideRequestStatus(latest.request, currentState.candidates, currentState.slots);

      if (decision.status !== 'ok') {
        setError('선택한 슬롯의 상태가 변경되었습니다. 다시 선택해주세요.');
        setStage('view');
        setSelectedSlots([]);
        return false;
      }
    }
    return true;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: '#fafafa',
      overflow: 'hidden'
    }}>
      {/* 헤더 (고객 식별자 + 네비게이션) */}
      <div style={{ background: 'white', borderBottom: '1px solid #ddd', padding: '12px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* 왼쪽: 고객 식별자 */}
          <div style={{ fontWeight: '500', fontSize: '12px', color: '#333' }}>
            {mode === 'local' ? `C${customerId.slice(-2)}` : `${customerEmail?.split('@')[0]}`}
          </div>

          {/* 오른쪽: 네비게이션 버튼 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {mode === 'local' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlots([]);
                    setSelectedDate(null);
                    setReselectDate(null);
                    setInlineReselectSlots([]);
                    setStage('select');
                    setIsCreatingNewReservation(true);
                  }}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    display: 'inline-block',
                    cursor: 'pointer',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#333'
                  }}
                >
                  ＋ 신규 예약
                </button>

                <button
                  type="button"
                  onClick={() => window.location.href = '/admin'}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    display: 'inline-block',
                    cursor: 'pointer',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#333'
                  }}
                >
                  ⚙ 관리자
                </button>
              </>
            )}

            {mode === 'supabase' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlots([]);
                    setSelectedDate(null);
                    setReselectDate(null);
                    setInlineReselectSlots([]);
                    setStage('select');
                    setIsCreatingNewReservation(true);
                  }}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    display: 'inline-block',
                    cursor: 'pointer',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#333'
                  }}
                >
                  ＋ 신규 예약
                </button>

                <a
                  href="/"
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    display: 'inline-block',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#333'
                  }}
                >
                  ← 돌아가기
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <style>{`
          @media (max-width: 768px) {
            .customer-page [data-layout="2col"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            width: '100%',
          }}
          className="customer-page"
        >
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {stage === 'select' && (
          <div>
            {/* 진행 단계 (한 줄) */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center', fontSize: '11px' }}>
              <span style={{ color: '#007bff', fontWeight: 'bold' }}>1 날짜</span>
              <span style={{ color: '#ddd' }}>→</span>
              <span style={{ color: '#999', opacity: 0.5 }}>2 시간</span>
              <span style={{ color: '#ddd' }}>→</span>
              <span style={{ color: '#999', opacity: 0.5 }}>3 확인</span>
            </div>

            {/* 2열 레이아웃 */}
            <div data-layout="2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', minHeight: 0 }}>
              {/* 왼쪽: 달력만 */}
              <div style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
                <CalendarDateSelector
                  slots={slots}
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  excludeSlots={[]}
                />
              </div>

              {/* 오른쪽: 시간 선택 + 선택 슬롯 + CTA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <TimeSlotSelectionUI
                    slots={slots}
                    selectedSlots={selectedSlots}
                    onToggle={handleSlotToggle}
                    maxSelect={3}
                    selectedDate={selectedDate}
                    excludeSlots={[]}
                  />
                </div>

                {selectedDate && (
                  <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', flexShrink: 0 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => setStage('confirm')}
                      disabled={selectedSlots.length === 0 || loading}
                      style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                    >
                      {loading ? '처리 중...' : '다음'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {stage === 'confirm' && checkSlotAvailability() && (
          <div>
            {/* 진행 단계 (한 줄) */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center', fontSize: '11px' }}>
              <span style={{ color: '#999', opacity: 0.5 }}>1 날짜</span>
              <span style={{ color: '#ddd' }}>→</span>
              <span style={{ color: '#999', opacity: 0.5 }}>2 시간</span>
              <span style={{ color: '#ddd' }}>→</span>
              <span style={{ color: '#007bff', fontWeight: 'bold' }}>3 확인</span>
            </div>

            {/* 2열 레이아웃 */}
            <div data-layout="2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: 'calc(100% - 40px)' }}>
              {/* 왼쪽: 안내 */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px' }}>최종 확인</h3>
                <p style={{ color: '#666', fontSize: '13px' }}>
                  다음과 같이 신청합니다.
                </p>
              </div>

              {/* 오른쪽: 신청 일정 + CTA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '6px', border: '1px solid #ddd' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>신청 일정</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedSlots.map((slotId, idx) => {
                      const slot = slots[slotId];
                      return (
                        <div key={slotId} style={{ fontSize: '12px', padding: '6px 8px', background: 'white', borderRadius: '3px' }}>
                          <strong style={{ color: '#007bff' }}>{idx + 1}</strong> {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', paddingTop: '12px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                  >
                    {loading ? '처리 중...' : '신청 제출'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleCancel}
                    disabled={loading}
                    style={{ padding: '10px 16px', fontSize: '14px' }}
                  >
                    뒤로
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'view' && customerRequests.length > 0 && (
        <div>
          {statusNotification && (
            <div
              style={{
                marginBottom: '20px',
                padding: '14px',
                background:
                  statusNotification.includes('확정') ? '#e8f5e9' : '#fff3e0',
                border:
                  statusNotification.includes('확정')
                    ? '1px solid #28a745'
                    : '1px solid #ff9800',
                borderRadius: '6px',
                color: statusNotification.includes('확정') ? '#1b5e20' : '#e65100',
                fontSize: '14px',
              }}
            >
              {statusNotification.includes('확정') ? '✅ ' : '⚠️ '}
              {statusNotification}
            </div>
          )}

          {(() => {
            const latest = customerRequests[customerRequests.length - 1];
            const isConfirmed = latest.request.status === 'confirmed';
            const isNeedsReselection = latest.request.status === 'needs_reselection';
            const isReceived = latest.request.status === 'received';

            return (
              <div>
                <div style={{ marginBottom: '30px', padding: '24px', background: '#f9f9f9', borderRadius: '8px', border: '2px solid #ddd' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#333' }}>현재 예약 상태</h3>

                    {isConfirmed && (
                      <div style={{ padding: '16px', background: '#e8f5e9', borderRadius: '6px', borderLeft: '4px solid #28a745' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#1b5e20' }}>
                          ✅ 예약 확정
                        </p>
                        <p style={{ margin: '0', fontSize: '14px', color: '#2e7d32' }}>
                          {slots[latest.request.confirmedSlotId!]?.date} {TIME_SLOTS.find(t => t.label === slots[latest.request.confirmedSlotId!]?.timeLabel)?.displayLabel}
                        </p>
                      </div>
                    )}

                    {isReceived && (
                      <div style={{ padding: '16px', background: '#e3f2fd', borderRadius: '6px', borderLeft: '4px solid #2196f3' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#0d47a1' }}>
                          ⏳ 예약 확인 중
                        </p>
                        <p style={{ margin: '0', fontSize: '14px', color: '#1565c0' }}>
                          관리자가 선택한 일정을 검토하고 있습니다.
                        </p>
                      </div>
                    )}

                    {isNeedsReselection && (
                      <div style={{ padding: '16px', background: '#fff3e0', borderRadius: '6px', borderLeft: '4px solid #ff9800' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#e65100' }}>
                          ⚠️ 선택한 일정으로 예약이 어렵습니다
                        </p>
                        <p style={{ margin: '0', fontSize: '14px', color: '#e65100' }}>
                          신청한 일정이 모두 마감되었습니다. 다른 일정을 선택해주세요.
                        </p>
                      </div>
                    )}
                  </div>

                  {isConfirmed && latest.request.confirmedAt && (
                    <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#666' }}>
                      확정일: {new Date(latest.request.confirmedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {!isConfirmed && (
                  <div style={{ marginBottom: '20px', padding: '16px', background: 'white', borderRadius: '6px', border: '1px solid #ddd' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '12px' }}>신청한 일정 (우선순위 순)</h4>
                    <ul className="list">
                      {latest.candidates.map((c, cidx) => {
                        const slot = slots[c.slotId];
                        const isAvailable = slot?.status === 'available';
                        return (
                          <li key={c.id} style={{ opacity: isAvailable ? 1 : 0.6 }}>
                            <span>
                              {cidx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                              {' '}
                              <span style={{ marginLeft: '10px', fontSize: '12px', color: isAvailable ? '#28a745' : '#dc3545' }}>
                                {isAvailable ? '(가능)' : '(마감)'}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {isNeedsReselection && (
                  <div data-layout="2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* 왼쪽: 이전 신청 상태 */}
                    <div>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '13px' }}>이전 신청</h4>
                      <div style={{ padding: '12px', background: '#fff8e1', borderRadius: '4px', border: '1px solid #ffa500', marginBottom: '12px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#dc3545' }}>
                          신청했던 일정이 모두 마감되었습니다.
                        </p>
                      </div>
                      <ul className="list" style={{ fontSize: '12px' }}>
                        {latest.candidates.map((c, idx) => {
                          const slot = slots[c.slotId];
                          return (
                            <li key={c.id} style={{ opacity: 0.6, paddingLeft: '16px' }}>
                              {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* 오른쪽: 추천 일정 + 알림 + CTA */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(() => {
                        const suggested = getSuggestedSlots();
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>추천 일정</h4>
                              <div className="table-container" style={{ fontSize: '12px', marginBottom: '8px' }}>
                                <table className="slots-table">
                                  <tbody>
                                    {suggested.map(slotId => {
                                      const slot = slots[slotId];
                                      const isSelected = inlineReselectSlots.includes(slotId);
                                      return (
                                        <tr
                                          key={slotId}
                                          onClick={() => {
                                            setInlineReselectSlots(prev => {
                                              if (prev.includes(slotId)) {
                                                return prev.filter(s => s !== slotId);
                                              } else if (prev.length < 3) {
                                                return [...prev, slotId];
                                              }
                                              return prev;
                                            });
                                          }}
                                          style={{
                                            cursor: 'pointer',
                                            background: isSelected ? '#d4edda' : 'white',
                                            borderColor: isSelected ? '#28a745' : 'inherit',
                                          }}
                                        >
                                          <td style={{ textAlign: 'center', padding: '6px' }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => {}}
                                              style={{ cursor: 'pointer' }}
                                            />
                                          </td>
                                          <td style={{ padding: '6px' }}>{slot?.date}</td>
                                          <td style={{ padding: '6px' }}>{TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                                선택됨: {inlineReselectSlots.length}/3
                              </p>
                            </div>

                            {/* 알림 섹션 (접힘) */}
                            <div>
                              <button
                                onClick={() => setExpandNotify(!expandNotify)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  width: '100%',
                                  textAlign: 'left',
                                  marginBottom: '8px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <strong style={{ fontSize: '12px', color: '#666' }}>빈자리 알림</strong>
                                  <span style={{ fontSize: '11px', color: '#999' }}>{expandNotify ? '▼' : '▶'}</span>
                                </div>
                              </button>
                              {expandNotify && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {latest.candidates.map(c => {
                                    const slot = slots[c.slotId];
                                    const isPriorityNotified = priorityNotifySlots.has(c.slotId);
                                    return (
                                      <div
                                        key={c.slotId}
                                        style={{
                                          padding: '8px',
                                          background: isPriorityNotified ? '#fff8e1' : '#f9f9f9',
                                          borderRadius: '3px',
                                          border: isPriorityNotified ? '1px solid #ffa500' : '1px solid #ddd',
                                          fontSize: '11px',
                                        }}
                                      >
                                        {isPriorityNotified ? (
                                          <div>
                                            <div style={{ color: '#ffa500', fontWeight: 'bold', marginBottom: '2px' }}>🔔 우선 알림 대상</div>
                                            <div style={{ color: '#666' }}>{slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}</div>
                                          </div>
                                        ) : (
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ color: '#333' }}>
                                              {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                                            </span>
                                            <button
                                              className="btn btn-secondary"
                                              onClick={() => {
                                                setPriorityNotifySlots(prev => new Set([...prev, c.slotId]));
                                              }}
                                              style={{ padding: '2px 6px', fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}
                                            >
                                              🔔 신청
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* CTA */}
                            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', paddingTop: '8px' }}>
                              <button
                                className="btn btn-primary"
                                onClick={handleInlineReselectSubmit}
                                disabled={inlineReselectSlots.length === 0 || loading}
                                style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                              >
                                {loading ? '처리 중...' : '추천 일정으로 재신청'}
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  setInlineReselectSlots([]);
                                  setSelectedSlots([]);
                                  setReselectDate(null);
                                  setIsCreatingNewReservation(false);
                                  setStage('reselect');
                                }}
                                disabled={loading}
                                style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                              >
                                모든 일정 보기
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '30px' }}>
                  <button
                    onClick={() => setExpandNotify(!expandNotify)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      marginBottom: '12px',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, marginRight: '10px' }}>신청 이력</h4>
                      <span style={{ fontSize: '12px', color: '#999', flexShrink: 0 }}>{expandNotify ? '▼' : '▶'}</span>
                    </div>
                  </button>
                  {expandNotify && (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {customerRequests.map((item, idx) => (
                    <div
                      key={item.request.id}
                      style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: idx === customerRequests.length - 1 ? '#f5f5f5' : 'white',
                        borderRadius: '4px',
                        border: '1px solid #ddd',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ marginBottom: '6px' }}>
                        <strong>신청 #{item.request.version}</strong> ({new Date(item.request.createdAt).toLocaleString()})
                      </div>
                      <div style={{ color: '#666', fontSize: '12px' }}>
                        {item.request.status === 'confirmed' && '✅ 확정됨'}
                        {item.request.status === 'received' && '⏳ 접수됨'}
                        {item.request.status === 'needs_reselection' && '⚠️ 재선택 필요'}
                      </div>
                    </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

        {stage === 'reselect' && customerRequests.length > 0 && (
          <div>
            {(() => {
              const latest = customerRequests[customerRequests.length - 1];
              const previousCandidates = latest.candidates.map(c => c.slotId);

              return (
                <div>
                  {/* 진행 단계 (한 줄) */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center', fontSize: '11px' }}>
                    <span style={{ color: '#007bff', fontWeight: 'bold' }}>1 날짜</span>
                    <span style={{ color: '#ddd' }}>→</span>
                    <span style={{ color: '#999', opacity: 0.5 }}>2 시간</span>
                    <span style={{ color: '#ddd' }}>→</span>
                    <span style={{ color: '#999', opacity: 0.5 }}>3 확인</span>
                  </div>

                  {/* 2열 레이아웃 */}
                  <div data-layout="2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', minHeight: 0 }}>
                    {/* 왼쪽: 달력만 */}
                    <div style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
                      <CalendarDateSelector
                        slots={slots}
                        selectedDate={reselectDate}
                        onDateSelect={setReselectDate}
                        excludeSlots={previousCandidates}
                      />
                    </div>

                    {/* 오른쪽: 시간 선택 + 선택 슬롯 + CTA */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        <TimeSlotSelectionUI
                          slots={slots}
                          selectedSlots={selectedSlots}
                          onToggle={handleSlotToggle}
                          maxSelect={3}
                          selectedDate={reselectDate}
                          excludeSlots={previousCandidates}
                        />
                      </div>

                      {reselectDate && (
                        <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', flexShrink: 0 }}>
                          <button
                            className="btn btn-primary"
                            onClick={handleReselect}
                            disabled={selectedSlots.length === 0 || loading}
                            style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                          >
                            {loading ? '처리 중...' : '재신청'}
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setStage('view');
                              setSelectedSlots([]);
                              setReselectDate(null);
                            }}
                            disabled={loading}
                            style={{ padding: '10px 16px', fontSize: '14px' }}
                          >
                            뒤로
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
