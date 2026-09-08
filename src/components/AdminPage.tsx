import React, { useState, useEffect } from 'react';
import { SlotTable } from './SlotTable';
import { AdminReservationCalendar } from './AdminReservationCalendar';
import type { Slot, Request, Candidate, OperationLog } from '../types';
import { OperationManager } from '../utils/operations';
import { DatabaseManager } from '../utils/database';
import { TIME_SLOTS } from '../utils/constants';
import { getSupabase, getCurrentUserId } from '../utils/supabase';

interface AdminPageProps {
  db: DatabaseManager;
  mode: 'local' | 'supabase';
}

export const AdminPage: React.FC<AdminPageProps> = ({ db, mode }) => {
  const [adminId, setAdminId] = useState<string>('ADMIN001');
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [requests, setRequests] = useState<
    Array<{ request: Request; candidates: Candidate[]; decision: any }>
  >([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [selectedSlotForConfirm, setSelectedSlotForConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const om = new OperationManager(db, mode);

  // 초기 로드
  useEffect(() => {
    initializeAdmin();
  }, [mode]);

  const initializeAdmin = async () => {
    try {
      if (mode === 'supabase') {
        const userId = await getCurrentUserId();
        if (userId) {
          setAdminId(userId);
        } else {
          setError('Supabase 인증 필요: 로그인 페이지에서 로그인하세요');
          return;
        }
      }
      loadData();
    } catch (err) {
      setError(`어드민 초기화 오류: ${String(err)}`);
    }
  };

  const loadData = async () => {
    try {
      setError('');
      setSuccess('');

      if (mode === 'supabase') {
        const client = getSupabase();
        const { data: slotsData, error: slotError } = await client
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

        const adminRequests = await om.getAdminRequestsSupabase();
        setRequests(adminRequests);

        const { data: logsData, error: logsError } = await client
          .from('operation_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (logsError) throw logsError;

        const operationLogs: OperationLog[] = (logsData || []).map((log: any) => ({
          id: log.id,
          timestamp: log.created_at,
          action: log.action,
          requestId: log.request_id || '',
          adminId: log.admin_id,
          slotId: log.slot_id,
          status: log.status,
          error: log.error_message,
        }));
        setLogs(operationLogs);
      } else {
        const state = db.getState();
        setSlots(state.slots);
        setRequests(om.getAdminRequests());
        setLogs(state.logs || []);
      }
    } catch (err) {
      setError(`데이터 로드 오류: ${String(err)}`);
    }
  };

  const handleConfirm = async () => {
    if (!selectedRequest || !selectedSlotForConfirm) {
      setError('요청과 슬롯을 선택하세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const operationId = `confirm-${selectedRequest}-${selectedSlotForConfirm}-${Date.now()}`;
      const result = await om.confirmRequest(
        selectedRequest,
        selectedSlotForConfirm,
        adminId,
        operationId
      );

      if (result.success) {
        setSuccess(`확정되었습니다! 영향받은 요청: ${result.affectedRequests?.length || 0}건`);
        setSelectedRequest(null);
        setSelectedSlotForConfirm(null);
        setTimeout(() => loadData(), 500);
      } else {
        setError(result.error || '확정 실패');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReselection = async () => {
    if (!selectedRequest) {
      setError('요청을 선택하세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const operationId = `reselect-${selectedRequest}-${Date.now()}`;
      const result = await om.requestReselection(
        selectedRequest,
        adminId,
        operationId
      );

      if (result.success) {
        setSuccess('재선택을 요청했습니다. 고객이 다시 선택해주기를 기다립니다.');
        setSelectedRequest(null);
        setSelectedSlotForConfirm(null);
        setTimeout(() => loadData(), 500);
      } else {
        setError(result.error || '재선택 요청 실패');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // 두 모드 모두 created_at에 대응하는 createdAt 기준으로 최신 신청부터 표시합니다.
  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.request.createdAt).getTime() - new Date(a.request.createdAt).getTime()
  );
  const currentRequest = selectedRequest ? requests.find(r => r.request.id === selectedRequest) : null;

  return (
    <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#fafafa', overflow: 'hidden' }}>
      <style>{`
        .container:has(> .admin-page) { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
        .container > .admin-page { flex: 1; min-height: 0; height: auto !important; }
      `}</style>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'white', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>어드민 패널</h2>
        {mode === 'local' && (
          <a
            href="/local"
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '500', textDecoration: 'none', display: 'inline-block', border: '1px solid #ddd', borderRadius: '4px', background: 'white', color: '#333' }}
          >
            ← 고객 화면
          </a>
        )}
      </div>

      {error && <div style={{ padding: '12px 20px', background: '#ffebee', border: '1px solid #ef5350', borderRadius: '4px', color: '#c62828', margin: '8px 20px' }}>{error}</div>}
      {success && <div style={{ padding: '12px 20px', background: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: '4px', color: '#2e7d32', margin: '8px 20px' }}>{success}</div>}

      {/* 상단: 신청 관리 (45%) */}
      <div style={{ flex: '0 0 45%', display: 'flex', gap: '12px', padding: '12px', minHeight: 0, overflowY: 'auto' }}>
        {/* 왼쪽: 신청 목록 */}
        <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '6px', border: '1px solid #ddd', overflow: 'hidden' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #ddd', fontWeight: '500', fontSize: '13px' }}>
            신청 목록 ({requests.length}건)
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ul className="list" style={{ margin: 0 }}>
              {sortedRequests.map((item) => (
                <li
                  key={item.request.id}
                  onClick={() => {
                    setSelectedRequest(item.request.id);
                    setSelectedSlotForConfirm(null);
                  }}
                  style={{
                    cursor: 'pointer',
                    background: selectedRequest === item.request.id ? '#e7f3ff' : 'white',
                    borderColor: selectedRequest === item.request.id ? '#007bff' : '#ddd',
                    marginBottom: '0',
                    borderRadius: '0',
                    borderBottom: '1px solid #ddd',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: '12px' }}>
                    <strong>{item.request.customerId}</strong> v{item.request.version}
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                      {new Date(item.request.createdAt).toLocaleString()}
                    </div>
                    <span style={{ fontSize: '10px', marginTop: '4px', display: 'inline-block', padding: '2px 6px', borderRadius: '3px', background: item.request.status === 'confirmed' ? '#e8f5e9' : item.request.status === 'needs_reselection' ? '#fff3e0' : '#e3f2fd', color: item.request.status === 'confirmed' ? '#2e7d32' : item.request.status === 'needs_reselection' ? '#e65100' : '#0d47a1' }}>
                      {item.request.status === 'confirmed' ? '✓ 확정' : item.request.status === 'needs_reselection' ? '⚠ 재선택' : '⏳ 접수'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 오른쪽: 신청 상세 */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '6px', border: '1px solid #ddd', overflow: 'hidden' }}>
          {currentRequest ? (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                <div style={{ marginBottom: '16px', fontSize: '13px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>고객:</strong> {currentRequest.request.customerId}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>신청:</strong> {new Date(currentRequest.request.createdAt).toLocaleString()}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>상태:</strong>{' '}
                    <span style={{ padding: '2px 6px', borderRadius: '3px', background: currentRequest.request.status === 'confirmed' ? '#e8f5e9' : currentRequest.request.status === 'needs_reselection' ? '#fff3e0' : '#e3f2fd', color: currentRequest.request.status === 'confirmed' ? '#2e7d32' : currentRequest.request.status === 'needs_reselection' ? '#e65100' : '#0d47a1', fontSize: '11px' }}>
                      {currentRequest.request.status === 'confirmed' ? '✓ 확정' : currentRequest.request.status === 'needs_reselection' ? '⚠ 재선택' : '⏳ 접수'}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ fontSize: '12px' }}>희망 일정:</strong>
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {currentRequest.candidates.map((c, idx) => {
                      const slot = slots[c.slotId];
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (slot?.status === 'available' && currentRequest.request.status !== 'confirmed') {
                              setSelectedSlotForConfirm(c.slotId);
                            }
                          }}
                          style={{
                            padding: '6px 8px',
                            fontSize: '12px',
                            borderRadius: '3px',
                            cursor: slot?.status === 'available' && currentRequest.request.status !== 'confirmed' ? 'pointer' : 'default',
                            background: selectedSlotForConfirm === c.slotId ? '#d4edda' : slot?.status === 'available' ? 'white' : '#f8d7da',
                            border: selectedSlotForConfirm === c.slotId ? '1px solid #28a745' : '1px solid #ddd',
                          }}
                        >
                          {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                          <span style={{ marginLeft: '6px', fontSize: '10px', color: '#999' }}>
                            {currentRequest.request.status === 'received' && '검토 중'}
                            {currentRequest.request.status === 'needs_reselection' && '예약 불가'}
                            {currentRequest.request.status === 'confirmed' && currentRequest.request.confirmedSlotId === c.slotId && '예약 확정'}
                            {currentRequest.request.status === 'confirmed' && currentRequest.request.confirmedSlotId !== c.slotId && '미선택'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 버튼 */}
              <div style={{ padding: '12px', borderTop: '1px solid #ddd', display: 'flex', gap: '8px', flexShrink: 0 }}>
                {currentRequest.request.status === 'received' && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={handleConfirm}
                      disabled={!selectedSlotForConfirm || loading}
                      style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                    >
                      {loading ? '처리중' : '✓ 확정'}
                    </button>
                    <button
                      className="btn btn-warning"
                      onClick={handleRequestReselection}
                      disabled={loading}
                      style={{ flex: 1, padding: '8px', fontSize: '12px', background: '#ff9800', border: 'none', color: 'white' }}
                    >
                      {loading ? '처리중' : '⚠ 재선택'}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>선택한 신청이 없습니다</div>
          )}
        </div>
      </div>

      {/* 하단: 예약 현황 (55%) */}
      <div style={{ flex: '1 1 0', display: 'flex', padding: '12px', gap: '12px', minHeight: 0, overflowY: 'auto', background: 'white', margin: '0 12px 12px 12px', borderRadius: '6px', border: '1px solid #ddd' }}>
        <AdminReservationCalendar slots={slots} requests={requests.map(item => item.request)} />
      </div>

      {/* 기존 그리드 숨김 */}
      <div className="grid" style={{ display: 'none' }}>
        {/* 요청 목록 */}
        <div>
          <h3>신청 목록 (총 {requests.length}건)</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
            <ul className="list" style={{ margin: 0 }}>
              {sortedRequests.map((item, idx) => (
                <li
                  key={item.request.id}
                  onClick={() => {
                    setSelectedRequest(item.request.id);
                    setSelectedSlotForConfirm(null);
                  }}
                  style={{
                    cursor: 'pointer',
                    background: selectedRequest === item.request.id ? '#e7f3ff' : 'white',
                    borderColor: selectedRequest === item.request.id ? '#007bff' : '#ddd',
                    marginBottom: '0',
                    borderRadius: '0',
                    borderBottom: '1px solid #ddd',
                  }}
                >
                  <div>
                    <strong>#{idx + 1}</strong> {item.request.customerId} (v
                    {item.request.version})
                    <br />
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {new Date(item.request.createdAt).toLocaleString()}
                    </span>
                    <br />
                    <span className={`slot-status ${item.request.status === 'confirmed' ? 'confirmed' : 'available'}`}>
                      {item.request.status === 'confirmed'
                        ? '확정됨'
                        : item.request.status === 'needs_reselection'
                          ? '재선택필요'
                          : '접수됨'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 요청 상세 */}
        <div>
          <h3>요청 상세</h3>
          {currentRequest ? (
            <div style={{ padding: '16px', background: 'white', border: '1px solid #ddd', borderRadius: '4px' }}>
              <div className="form-group">
                <label>고객 코드</label>
                <input type="text" value={currentRequest.request.customerId} disabled />
              </div>

              <div className="form-group">
                <label>상태</label>
                <input
                  type="text"
                  value={
                    currentRequest.request.status === 'confirmed'
                      ? '확정됨'
                      : currentRequest.request.status === 'needs_reselection'
                        ? '재선택필요'
                        : '접수됨'
                  }
                  disabled
                />
              </div>

              <div className="form-group">
                <label>희망 슬롯 (우선순위 순)</label>
                <ul className="list">
                  {currentRequest.candidates.map((c, idx) => {
                    const slot = slots[c.slotId];
                    const isAvailable = slot?.status === 'available';
                    return (
                      <li
                        key={c.id}
                        onClick={() => {
                          if (isAvailable && currentRequest.request.status !== 'confirmed') {
                            setSelectedSlotForConfirm(c.slotId);
                          }
                        }}
                        style={{
                          cursor: isAvailable && currentRequest.request.status !== 'confirmed' ? 'pointer' : 'default',
                          background:
                            selectedSlotForConfirm === c.slotId
                              ? '#d4edda'
                              : isAvailable
                                ? 'white'
                                : '#f8d7da',
                          borderColor: selectedSlotForConfirm === c.slotId ? '#28a745' : '#ddd',
                        }}
                      >
                        <span>
                          {idx + 1}. {slot?.date} {TIME_SLOTS.find(t => t.label === slot?.timeLabel)?.displayLabel}
                          {' '}
                          <span style={{ marginLeft: '10px', fontSize: '12px' }}>
                            {isAvailable ? '(가능)' : '(마감)'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {currentRequest.request.status === 'confirmed' && currentRequest.request.confirmedSlotId && (
                <div className="alert alert-success">
                  <strong>확정 완료</strong>
                  <br />
                  {slots[currentRequest.request.confirmedSlotId]?.date}{' '}
                  {TIME_SLOTS.find(t => t.label === slots[currentRequest.request.confirmedSlotId!]?.timeLabel)?.displayLabel}
                  <br />
                  {new Date(currentRequest.request.confirmedAt!).toLocaleString()}
                </div>
              )}

              {currentRequest.request.status === 'received' && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                    <strong>관리자 처리:</strong> 아래 중 하나를 선택하세요
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleConfirm}
                    disabled={!selectedSlotForConfirm || loading}
                    style={{ width: '100%' }}
                  >
                    ✅ {loading ? '처리 중...' : '선택 슬롯으로 예약 확정'}
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={handleRequestReselection}
                    disabled={loading}
                    style={{ width: '100%', background: '#ff9800' }}
                  >
                    ⚠️ {loading ? '처리 중...' : '고객에게 재선택 요청'}
                  </button>
                </div>
              )}

              {currentRequest.request.status === 'needs_reselection' && (
                <div className="alert alert-warning" style={{ marginTop: '16px' }}>
                  고객이 재선택 중입니다. 새로운 신청을 기다리세요.
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#f0f0f0', borderRadius: '4px', color: '#666' }}>
              목록에서 요청을 선택하세요
            </div>
          )}
        </div>
      </div>

      {/* 기존 슬롯 현황 및 로그는 숨김: 하단 달력 안에서 조회 */}
      <div style={{ display: 'none' }}>
      <div style={{ marginTop: '40px' }}>
        <h3>슬롯 현황 (표시용)</h3>
        <SlotTable slots={slots} selectedSlots={[]} onToggle={() => {}} mode="view" />
      </div>

      {/* 실행 기록 */}
      <div style={{ marginTop: '40px' }}>
        <h3>실행 기록 (최근 20건)</h3>
        <div className="table-container">
          <table className="slots-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>행위</th>
                <th>요청ID</th>
                <th>슬롯</th>
                <th>결과</th>
                <th>오류</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .slice()
                .reverse()
                .slice(0, 20)
                .map(log => (
                  <tr key={log.id} style={{ fontSize: '12px' }}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.action}</td>
                    <td style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                      {log.requestId.substring(0, 8)}...
                    </td>
                    <td>{log.slotId ? log.slotId : '-'}</td>
                    <td>
                      <span style={{ color: log.status === 'success' ? '#28a745' : '#dc3545' }}>
                        {log.status === 'success' ? '성공' : '실패'}
                      </span>
                    </td>
                    <td style={{ color: '#dc3545' }}>{log.error ? log.error.substring(0, 30) : '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};
