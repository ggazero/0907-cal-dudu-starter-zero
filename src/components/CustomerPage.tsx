import React, { useState, useEffect } from 'react';
import { SlotTable } from './SlotTable';
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

export const CustomerPage: React.FC<CustomerPageProps> = ({ db, mode }) => {
  const [customerId, setCustomerId] = useState<string>('C01');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [stage, setStage] = useState<'select' | 'confirm' | 'view' | 'reselect'>('select');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [customerRequests, setCustomerRequests] = useState<
    Array<{ request: Request; candidates: Candidate[]; decision: any }>
  >([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);

  const om = new OperationManager(db, mode);

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

  const loadData = async () => {
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

        const status = await om.getCustomerStatusSupabase(customerId);
        setCustomerRequests(status);

        if (status.length === 0) {
          setStage('select');
          setSelectedSlots([]);
        } else {
          const latest = status[status.length - 1];
          if (latest.request.status === 'needs_reselection') {
            setStage('reselect');
          } else if (latest.request.status === 'confirmed') {
            setStage('view');
          } else {
            setStage('view');
          }
        }
      } else {
        const state = db.getState();
        setSlots(state.slots);
        const status = om.getCustomerStatus(customerId);
        setCustomerRequests(status);

        if (status.length === 0) {
          setStage('select');
          setSelectedSlots([]);
        } else {
          const latest = status[status.length - 1];
          if (latest.request.status === 'needs_reselection') {
            setStage('reselect');
          } else if (latest.request.status === 'confirmed') {
            setStage('view');
          } else {
            setStage('view');
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

  // 슬롯 상태가 변경되었는지 확인
  const checkSlotAvailability = () => {
    if (stage === 'confirm' && customerRequests.length > 0) {
      const latest = customerRequests[customerRequests.length - 1];
      const currentState = db.getState();
      const decision = decideRequestStatus(latest.request, currentState.candidates, currentState.slots);

      if (decision.status !== 'ok') {
        setError('선택한 슬롯의 상태가 변경되었습니다. 다시 선택해주세요.');
        setStage('reselect');
        setSelectedSlots([]);
        return false;
      }
    }
    return true;
  };

  return (
    <div className="customer-page">
      {mode === 'local' && (
        <div className="form-group">
          <label>고객 코드</label>
          <input
            type="text"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            placeholder="C01"
            disabled={stage === 'confirm'}
          />
        </div>
      )}
      {mode === 'supabase' && (
        <div className="form-group">
          <label>로그인 사용자</label>
          <input
            type="text"
            value={customerEmail}
            disabled
            placeholder="자동 로드됨"
          />
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {stage === 'select' && (
        <div>
          <h3>슬롯 선택 (1~3개)</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>
            원하는 슬롯을 선택하고 제출하세요. 선택 순서가 희망 우선순위입니다.
          </p>
          <SlotTable
            slots={slots}
            selectedSlots={selectedSlots}
            onToggle={handleSlotToggle}
            mode="select"
            maxSelect={3}
          />

          <div style={{ marginBottom: '20px' }}>
            <h4>선택한 슬롯 ({selectedSlots.length}/3)</h4>
            <ul className="list">
              {selectedSlots.map((slotId, idx) => {
                const slot = slots[slotId];
                return (
                  <li key={slotId}>
                    <span>
                      {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                    </span>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSlotToggle(slotId)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      제거
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setStage('confirm')}
            disabled={selectedSlots.length === 0 || loading}
          >
            다음: 최종 확인
          </button>
        </div>
      )}

      {stage === 'confirm' && checkSlotAvailability() && (
        <div>
          <h3>최종 확인</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>
            다음과 같이 신청합니다. 제출하면 어드민이 확인 후 확정합니다.
          </p>
          <SlotTable slots={slots} selectedSlots={selectedSlots} onToggle={() => {}} mode="view" />

          <div style={{ marginBottom: '20px' }}>
            <h4>최종 선택 (우선순위 순)</h4>
            <ul className="list">
              {selectedSlots.map((slotId, idx) => {
                const slot = slots[slotId];
                return (
                  <li key={slotId}>
                    <span>
                      {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? '처리 중...' : '제출'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={loading}
            >
              돌아가기
            </button>
          </div>
        </div>
      )}

      {stage === 'view' && customerRequests.length > 0 && (
        <div>
          <h3>내 신청 현황</h3>
          {customerRequests.map((item, idx) => {
            const isLatest = idx === customerRequests.length - 1;

            return (
              <div
                key={item.request.id}
                style={{
                  marginBottom: '20px',
                  padding: '16px',
                  background: item.request.status === 'confirmed' ? '#f0fff4' : item.request.status === 'needs_reselection' ? '#fff5f5' : 'white',
                  borderRadius: '4px',
                  border: item.request.status === 'confirmed' ? '2px solid #28a745' : item.request.status === 'needs_reselection' ? '2px solid #d9534f' : '1px solid #ddd',
                }}
              >
                <h4 style={{ marginTop: 0 }}>신청 #{item.request.version} (접수일: {new Date(item.request.createdAt).toLocaleString()})</h4>

                <div className="form-group">
                  <label>상태</label>
                  <div style={{ padding: '12px', background: '#f0f0f0', borderRadius: '4px', marginBottom: isLatest ? '12px' : '0' }}>
                    {item.request.status === 'confirmed' && (
                      <span className="slot-status confirmed">✅ 확정됨</span>
                    )}
                    {item.request.status === 'received' && (
                      <span className="slot-status available">⏳ 접수됨 (검토 중)</span>
                    )}
                    {item.request.status === 'needs_reselection' && (
                      <span className="alert alert-warning">⚠️ 재선택 필요</span>
                    )}
                  </div>

                  {isLatest && item.request.status === 'confirmed' && (
                    <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '4px', borderLeft: '4px solid #28a745', marginBottom: '12px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold', color: '#1b5e20' }}>
                        ✅ 예약이 확정되었습니다
                      </p>
                      <p style={{ margin: '0', fontSize: '12px', color: '#2e7d32' }}>
                        아래에서 확정된 예약 정보를 확인하세요.
                      </p>
                    </div>
                  )}

                  {isLatest && item.request.status === 'needs_reselection' && (
                    <div style={{ background: '#ffebee', padding: '12px', borderRadius: '4px', borderLeft: '4px solid #d9534f', marginBottom: '12px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold', color: '#8b0000' }}>
                        ⚠️ 신청한 모든 일정이 마감되었습니다
                      </p>
                      <p style={{ margin: '0', fontSize: '12px', color: '#c62828' }}>
                        다른 일정을 다시 선택해주세요.
                      </p>
                    </div>
                  )}
                </div>

              <div className="form-group">
                <label>선택한 슬롯 (우선순위 순)</label>
                <ul className="list">
                  {item.candidates.map((c, cidx) => {
                    const slot = slots[c.slotId];
                    const isAvailable = slot?.status === 'available';
                    return (
                      <li key={c.id}>
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

              {item.request.status === 'confirmed' && (
                <div className="alert alert-success">
                  <strong>확정됨!</strong> {slots[item.request.confirmedSlotId!]?.date}{' '}
                  {TIME_SLOTS.find(t => t.label === slots[item.request.confirmedSlotId!]?.timeLabel)?.displayLabel}에
                  확정되었습니다.
                </div>
              )}

              {item.request.status === 'needs_reselection' && isLatest && (
                <button
                  className="btn btn-warning"
                  onClick={() => {
                    setStage('reselect');
                    setSelectedSlots([]);
                  }}
                  style={{ background: '#ffc107', marginTop: '10px' }}
                >
                  재선택하기
                </button>
              )}
              </div>
            );
          })}
        </div>
      )}

      {stage === 'reselect' && customerRequests.length > 0 && (
        <div>
          <h3>슬롯 재선택</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>
            이전 신청의 슬롯이 모두 마감되었습니다. 다시 선택해주세요.
          </p>
          <SlotTable
            slots={slots}
            selectedSlots={selectedSlots}
            onToggle={handleSlotToggle}
            mode="select"
            maxSelect={3}
          />

          <div style={{ marginBottom: '20px' }}>
            <h4>새로 선택한 슬롯 ({selectedSlots.length}/3)</h4>
            <ul className="list">
              {selectedSlots.map((slotId, idx) => {
                const slot = slots[slotId];
                return (
                  <li key={slotId}>
                    <span>
                      {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                    </span>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSlotToggle(slotId)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      제거
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={handleReselect}
              disabled={selectedSlots.length === 0 || loading}
            >
              {loading ? '처리 중...' : '재선택 제출'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStage('view');
                setSelectedSlots([]);
              }}
              disabled={loading}
            >
              돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
